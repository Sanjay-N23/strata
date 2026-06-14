// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IsrCVR {
    function mint(address depositor, uint256 usdtAmount, address issuerToken) external returns (uint256);
    function redeem(address holder, uint256 amount, address issuerToken) external returns (uint256);
    function accrueYield(uint256 amount, address issuerToken) external;
    function liquidate(address issuerToken) external returns (uint256);
}

interface IjrCVR {
    function mint(address depositor, uint256 usdtAmount, address issuerToken) external returns (uint256);
    function redeem(address holder, uint256 amount, address issuerToken) external returns (uint256);
    function accrueYield(uint256 amount, address issuerToken) external;
    function liquidate(address issuerToken) external returns (uint256);
}

/**
 * @title InsurancePool — Dual-Tranche Risk Pool
 * @notice Manages senior (70%) and junior (30%) tranches with redemption gate,
 *         premium distribution, and liquidation waterfall.
 */
contract InsurancePool is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ─── Structs ─────────────────────────────────────────────────────
    struct PoolState {
        uint256 seniorTVL;
        uint256 juniorTVL;
        uint256 totalInsuredAmount;
        uint256 coverageRatioBPS;
        bool redemptionGateActive;
        bool isActive;
    }

    struct WithdrawalRequest {
        address depositor;
        uint256 tokenAmount;     // srCVR or jrCVR amount
        uint256 requestBlock;
        bool isSenior;
        bool frozen;
        bool executed;
    }

    // ─── Constants ───────────────────────────────────────────────────
    uint256 public constant MIN_JUNIOR_RATIO_PCT = 25;
    uint256 public constant SENIOR_LOCK_BLOCKS = 864000;  // 30 days at 3s/block
    uint256 public constant JUNIOR_LOCK_BLOCKS = 403200;  // 14 days at 3s/block
    uint256 public constant PROTOCOL_FEE_BPS = 500;       // 5%
    uint256 public constant SENIOR_SHARE_BPS = 7000;      // 70% of net premium
    uint256 public constant JUNIOR_SHARE_BPS = 3000;      // 30% of net premium

    // ─── State ───────────────────────────────────────────────────────
    IERC20 public immutable usdt;
    mapping(address => PoolState) public pools; // issuerToken => PoolState

    mapping(uint256 => WithdrawalRequest) public withdrawalRequests;
    uint256 public nextRequestId = 1;

    address public srCVRToken;
    address public jrCVRToken;
    address public issuerRegistry;
    address public irsOracle;
    address public defaultOracle;
    address public payoutEngine;
    address public protocolTreasury;

    // ─── Events ──────────────────────────────────────────────────────
    event SeniorDeposited(address indexed depositor, address indexed token, uint256 usdt, uint256 srCVR);
    event JuniorDeposited(address indexed depositor, address indexed token, uint256 usdt, uint256 jrCVR);
    event PremiumPaid(address indexed token, uint256 amount, uint256 protocolFee, uint256 distributed);
    event RedemptionGateActivated(address indexed token, uint256 activationBlock);
    event RedemptionGateLifted(address indexed token, uint256 liftBlock);
    event PoolLiquidated(address indexed token, uint256 juniorLiquidated, uint256 seniorLiquidated);
    event WithdrawalInitiated(uint256 indexed requestId, address depositor, bool isSenior, uint256 amount);
    event WithdrawalExecuted(uint256 indexed requestId, uint256 usdtReturned);
    event PoolActivated(address indexed token);

    // ─── Constructor ─────────────────────────────────────────────────
    constructor(address _usdt, address _protocolTreasury) {
        usdt = IERC20(_usdt);
        protocolTreasury = _protocolTreasury;
    }

    // ─── Admin Setters ───────────────────────────────────────────────
    function setSrCVR(address _srCVR) external onlyOwner { srCVRToken = _srCVR; }
    function setJrCVR(address _jrCVR) external onlyOwner { jrCVRToken = _jrCVR; }
    function setIssuerRegistry(address _reg) external onlyOwner { issuerRegistry = _reg; }
    function setIRSOracle(address _oracle) external onlyOwner { irsOracle = _oracle; }
    function setDefaultOracle(address _oracle) external onlyOwner { defaultOracle = _oracle; }
    function setPayoutEngine(address _engine) external onlyOwner { payoutEngine = _engine; }

    // ─── Emergency Stop ──────────────────────────────────────────────
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ─── Pool Activation ─────────────────────────────────────────────

    function activatePool(address issuerToken) external onlyOwner {
        pools[issuerToken].isActive = true;
        emit PoolActivated(issuerToken);
    }

    // ─── Deposits ────────────────────────────────────────────────────

    /**
     * @notice Deposit USDT into senior tranche. Mints srCVR tokens.
     */
    function depositSenior(address issuerToken, uint256 usdtAmount) external nonReentrant whenNotPaused returns (uint256 srCVRMinted) {
        PoolState storage pool = pools[issuerToken];
        require(pool.isActive, "InsurancePool: pool not active");
        require(!pool.redemptionGateActive, "InsurancePool: gate active");

        // Check junior ratio stays >= 25% after deposit
        uint256 newSenior = pool.seniorTVL + usdtAmount;
        uint256 totalAfter = newSenior + pool.juniorTVL;
        if (totalAfter > 0) {
            uint256 juniorRatio = (pool.juniorTVL * 100) / totalAfter;
            require(
                juniorRatio >= MIN_JUNIOR_RATIO_PCT || pool.juniorTVL == 0 && pool.seniorTVL == 0,
                "InsurancePool: junior ratio too low"
            );
        }

        usdt.safeTransferFrom(msg.sender, srCVRToken, usdtAmount);
        srCVRMinted = IsrCVR(srCVRToken).mint(msg.sender, usdtAmount, issuerToken);

        pool.seniorTVL += usdtAmount;
        _updateCoverageRatio(issuerToken);

        emit SeniorDeposited(msg.sender, issuerToken, usdtAmount, srCVRMinted);
    }

    /**
     * @notice Deposit USDT into junior tranche. Mints jrCVR tokens.
     */
    function depositJunior(address issuerToken, uint256 usdtAmount) external nonReentrant whenNotPaused returns (uint256 jrCVRMinted) {
        PoolState storage pool = pools[issuerToken];
        require(pool.isActive, "InsurancePool: pool not active");
        require(!pool.redemptionGateActive, "InsurancePool: gate active");

        usdt.safeTransferFrom(msg.sender, jrCVRToken, usdtAmount);
        jrCVRMinted = IjrCVR(jrCVRToken).mint(msg.sender, usdtAmount, issuerToken);

        pool.juniorTVL += usdtAmount;
        _updateCoverageRatio(issuerToken);

        emit JuniorDeposited(msg.sender, issuerToken, usdtAmount, jrCVRMinted);
    }

    // ─── Withdrawals ─────────────────────────────────────────────────

    function initiateWithdrawalSenior(address issuerToken, uint256 srCVRAmount) external returns (uint256 requestId) {
        require(!pools[issuerToken].redemptionGateActive, "InsurancePool: gate active");

        requestId = nextRequestId++;
        withdrawalRequests[requestId] = WithdrawalRequest({
            depositor: msg.sender,
            tokenAmount: srCVRAmount,
            requestBlock: block.number,
            isSenior: true,
            frozen: false,
            executed: false
        });

        emit WithdrawalInitiated(requestId, msg.sender, true, srCVRAmount);
    }

    function initiateWithdrawalJunior(address issuerToken, uint256 jrCVRAmount) external returns (uint256 requestId) {
        require(!pools[issuerToken].redemptionGateActive, "InsurancePool: gate active");

        requestId = nextRequestId++;
        withdrawalRequests[requestId] = WithdrawalRequest({
            depositor: msg.sender,
            tokenAmount: jrCVRAmount,
            requestBlock: block.number,
            isSenior: false,
            frozen: false,
            executed: false
        });

        emit WithdrawalInitiated(requestId, msg.sender, false, jrCVRAmount);
    }

    function executeWithdrawal(uint256 requestId, address issuerToken) external nonReentrant {
        WithdrawalRequest storage req = withdrawalRequests[requestId];
        require(req.depositor == msg.sender, "InsurancePool: not your request");
        require(!req.executed, "InsurancePool: already executed");
        require(!req.frozen, "InsurancePool: request frozen");

        uint256 lockBlocks = req.isSenior ? SENIOR_LOCK_BLOCKS : JUNIOR_LOCK_BLOCKS;
        require(block.number >= req.requestBlock + lockBlocks, "InsurancePool: lock period active");

        req.executed = true;
        uint256 usdtOut;

        if (req.isSenior) {
            usdtOut = IsrCVR(srCVRToken).redeem(msg.sender, req.tokenAmount, issuerToken);
            pools[issuerToken].seniorTVL -= usdtOut;
        } else {
            usdtOut = IjrCVR(jrCVRToken).redeem(msg.sender, req.tokenAmount, issuerToken);
            pools[issuerToken].juniorTVL -= usdtOut;
            // Preserve the senior-protection buffer: a junior withdrawal must not push the
            // junior tranche below MIN_JUNIOR_RATIO_PCT while senior capital still remains.
            // (Default-time liquidation uses liquidateForPayout, not this path.)
            PoolState storage p = pools[issuerToken];
            uint256 totalAfter = p.seniorTVL + p.juniorTVL;
            if (p.seniorTVL > 0 && totalAfter > 0) {
                require(
                    (p.juniorTVL * 100) / totalAfter >= MIN_JUNIOR_RATIO_PCT,
                    "InsurancePool: junior ratio too low"
                );
            }
        }

        _updateCoverageRatio(issuerToken);

        emit WithdrawalExecuted(requestId, usdtOut);
    }

    // ─── Premium Payment ─────────────────────────────────────────────

    /**
     * @notice Process premium payment from issuer.
     *         5% protocol fee, 95% split 70/30 to senior/junior.
     */
    function payPremium(address issuerToken, uint256 usdtAmount) external nonReentrant {
        require(pools[issuerToken].isActive, "InsurancePool: pool not active");

        usdt.safeTransferFrom(msg.sender, address(this), usdtAmount);

        uint256 protocolFee = (usdtAmount * PROTOCOL_FEE_BPS) / 10000;
        uint256 netPremium = usdtAmount - protocolFee;
        uint256 seniorShare = (netPremium * SENIOR_SHARE_BPS) / 10000;
        uint256 juniorShare = netPremium - seniorShare;

        // Send protocol fee
        if (protocolFee > 0) {
            usdt.safeTransfer(protocolTreasury, protocolFee);
        }

        // Accrue yield to tranches
        if (seniorShare > 0) {
            usdt.safeTransfer(srCVRToken, seniorShare);
            IsrCVR(srCVRToken).accrueYield(seniorShare, issuerToken);
            pools[issuerToken].seniorTVL += seniorShare;
        }
        if (juniorShare > 0) {
            usdt.safeTransfer(jrCVRToken, juniorShare);
            IjrCVR(jrCVRToken).accrueYield(juniorShare, issuerToken);
            pools[issuerToken].juniorTVL += juniorShare;
        }

        _updateCoverageRatio(issuerToken);

        emit PremiumPaid(issuerToken, usdtAmount, protocolFee, netPremium);
    }

    // ─── Redemption Gate ─────────────────────────────────────────────

    function activateRedemptionGate(address issuerToken) external {
        require(msg.sender == defaultOracle || msg.sender == owner(), "InsurancePool: unauthorized");
        pools[issuerToken].redemptionGateActive = true;
        emit RedemptionGateActivated(issuerToken, block.number);
    }

    function deactivateRedemptionGate(address issuerToken) external {
        require(msg.sender == defaultOracle || msg.sender == owner(), "InsurancePool: unauthorized");
        pools[issuerToken].redemptionGateActive = false;
        emit RedemptionGateLifted(issuerToken, block.number);
    }

    // ─── Liquidation ─────────────────────────────────────────────────

    /**
     * @notice Liquidate pool for payout. Junior first, then senior.
     *         Called by PayoutEngine on confirmed default.
     */
    function liquidateForPayout(address issuerToken) external nonReentrant returns (uint256 juniorLiquidated, uint256 seniorLiquidated) {
        require(msg.sender == payoutEngine, "InsurancePool: only PayoutEngine");

        // Liquidate junior first (first loss after bond)
        juniorLiquidated = IjrCVR(jrCVRToken).liquidate(issuerToken);
        // Then senior
        seniorLiquidated = IsrCVR(srCVRToken).liquidate(issuerToken);

        // Forward liquidated USDT to PayoutEngine
        uint256 total = juniorLiquidated + seniorLiquidated;
        if (total > 0) {
            usdt.safeTransfer(payoutEngine, total);
        }

        pools[issuerToken].juniorTVL = 0;
        pools[issuerToken].seniorTVL = 0;
        pools[issuerToken].isActive = false;

        emit PoolLiquidated(issuerToken, juniorLiquidated, seniorLiquidated);
    }

    // ─── View Functions ──────────────────────────────────────────────

    function getPoolState(address issuerToken) external view returns (PoolState memory) {
        return pools[issuerToken];
    }

    function getJuniorRatio(address issuerToken) external view returns (uint256) {
        PoolState storage pool = pools[issuerToken];
        uint256 total = pool.seniorTVL + pool.juniorTVL;
        if (total == 0) return 0;
        return (pool.juniorTVL * 100) / total;
    }

    // ─── Internal ────────────────────────────────────────────────────

    function _updateCoverageRatio(address issuerToken) internal {
        PoolState storage pool = pools[issuerToken];
        if (pool.totalInsuredAmount == 0) {
            pool.coverageRatioBPS = 0;
        } else {
            pool.coverageRatioBPS = ((pool.seniorTVL + pool.juniorTVL) * 10000) / pool.totalInsuredAmount;
        }
    }

    /**
     * @notice Update total insured amount (called by PayoutEngine)
     */
    function addInsuredAmount(address issuerToken, uint256 amount) external {
        require(msg.sender == payoutEngine || msg.sender == owner(), "InsurancePool: unauthorized");
        pools[issuerToken].totalInsuredAmount += amount;
        _updateCoverageRatio(issuerToken);
    }
}
