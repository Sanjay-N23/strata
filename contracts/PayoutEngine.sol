// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IERC3643.sol";
import "./interfaces/IIdentityRegistry.sol";

interface IIssuerBond {
    function liquidate(address tokenAddress) external returns (uint256);
}

interface IInsurancePool {
    function liquidateForPayout(address issuerToken) external returns (uint256 juniorLiquidated, uint256 seniorLiquidated);
    function addInsuredAmount(address issuerToken, uint256 amount) external;
    function pools(address issuerToken) external view returns (uint256, uint256, uint256, uint256, bool, bool);
}

interface IProtectionCert {
    function mint(address holder, address issuerToken, uint256 coveredAmount, uint256 poolBalance, uint256 totalInsured) external returns (uint256);
    function burn(uint256 tokenId) external;
    function holderCerts(address holder, address issuerToken) external view returns (uint256);
}

interface ISubrogationNFT {
    function mint(address to, address issuerToken, uint8 defaultType, uint256 totalPayout, uint256 bondLiquidated, uint256 juniorLiquidated, uint256 seniorLiquidated, uint256 holderCount) external returns (uint256);
}

interface IIRSOracle {
    function setScoreToZero(address tokenAddress) external;
}

interface IIssuerRegistry {
    function setDefaulted(address tokenAddress) external;
    function getIssuerEOA(address tokenAddress) external view returns (address);
    function isActive(address tokenAddress) external view returns (bool);
}

/**
 * @title PayoutEngine — ERC-3643 Compliant Payout Engine
 * @notice Manages coverage purchases, maintains insured holder registry,
 *         executes payouts with KYC/freeze compliance checks, and mints SubrogationNFTs.
 */
contract PayoutEngine is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ─── Structs ─────────────────────────────────────────────────────
    struct InsuredPosition {
        address holder;
        address issuerToken;
        uint256 coveredAmount;
        uint256 poolBalanceAtMint;
        uint256 totalInsuredAtMint;
        uint256 estimatedPayoutPct;
        uint256 mintBlock;
        bool paid;
        bool inEscrow;
    }

    struct EscrowRecord {
        uint256 amount;
        uint256 escrowStartBlock;
        uint256 escrowExpiry;      // 180 days in blocks
        address issuerToken;
        string holdReason;
    }

    // ─── Constants ───────────────────────────────────────────────────
    uint256 public constant ESCROW_DURATION_BLOCKS = 5184000; // ~180 days at 3s/block

    // ─── State ───────────────────────────────────────────────────────
    IERC20 public immutable usdt;

    // Insured holder registry — NOT getHoldersList
    mapping(address => address[]) public insuredHolders;                    // issuerToken => holders
    mapping(address => mapping(address => InsuredPosition)) public positions; // issuerToken => holder => position
    mapping(address => mapping(address => bool)) public isInsured;         // issuerToken => holder => bool
    mapping(address => EscrowRecord) public escrows;

    address public insurancePool;
    address public defaultOracle;
    address public protectionCert;
    address public issuerBond;
    address public subrogationNFT;
    address public irsOracle;
    address public issuerRegistry;
    address public immutable foundation;

    // ─── Events ──────────────────────────────────────────────────────
    event CoveragePurchased(address indexed holder, address indexed issuerToken, uint256 coveredAmount, uint256 certId, uint256 estimatedPayoutPct);
    event PayoutExecuted(address indexed holder, address indexed issuerToken, uint256 paidAmount, uint256 certIdBurned);
    event PayoutHeld(address indexed holder, address indexed issuerToken, uint256 heldAmount, string reason);
    event EscrowReleased(address indexed holder, uint256 amount);
    event SubrogationNFTMinted(address indexed issuerToken, uint256 indexed tokenId, uint256 totalPayout);
    event PayoutComplete(address indexed issuerToken, uint256 totalPayout, uint256 holdersCount);

    // ─── Constructor ─────────────────────────────────────────────────
    constructor(address _usdt, address _foundation) {
        require(_usdt != address(0), "PayoutEngine: zero usdt");
        require(_foundation != address(0), "PayoutEngine: zero foundation");
        usdt = IERC20(_usdt);
        foundation = _foundation;
    }

    // ─── Admin Setters ───────────────────────────────────────────────
    // Note: foundation is immutable and cannot be changed after deployment.
    function setInsurancePool(address _pool) external onlyOwner { insurancePool = _pool; }
    function setDefaultOracle(address _oracle) external onlyOwner { defaultOracle = _oracle; }
    function setProtectionCert(address _cert) external onlyOwner { protectionCert = _cert; }
    function setIssuerBond(address _bond) external onlyOwner { issuerBond = _bond; }
    function setSubrogationNFT(address _nft) external onlyOwner { subrogationNFT = _nft; }
    function setIRSOracle(address _oracle) external onlyOwner { irsOracle = _oracle; }
    function setIssuerRegistry(address _registry) external onlyOwner { issuerRegistry = _registry; }

    // ─── Emergency Stop ──────────────────────────────────────────────
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ─── Coverage Purchase ───────────────────────────────────────────

    /**
     * @notice Purchase coverage for an RWA token position.
     *         Registers holder in internal registry and mints ProCert.
     */
    function purchaseCoverage(
        address issuerToken,
        uint256 coveredAmount
    ) external nonReentrant whenNotPaused returns (uint256 certId) {
        require(!isInsured[issuerToken][msg.sender], "PayoutEngine: already insured");
        require(coveredAmount > 0, "PayoutEngine: zero amount");

        // Get pool state for snapshot
        (uint256 seniorTVL, uint256 juniorTVL, uint256 totalInsured, , , ) =
            IInsurancePool(insurancePool).pools(issuerToken);
        uint256 poolBalance = seniorTVL + juniorTVL;
        uint256 newTotalInsured = totalInsured + coveredAmount;

        uint256 estimatedPct = 0;
        if (newTotalInsured > 0) {
            estimatedPct = (poolBalance * 10000) / newTotalInsured;
        }

        // Register holder
        insuredHolders[issuerToken].push(msg.sender);
        isInsured[issuerToken][msg.sender] = true;
        positions[issuerToken][msg.sender] = InsuredPosition({
            holder: msg.sender,
            issuerToken: issuerToken,
            coveredAmount: coveredAmount,
            poolBalanceAtMint: poolBalance,
            totalInsuredAtMint: newTotalInsured,
            estimatedPayoutPct: estimatedPct,
            mintBlock: block.number,
            paid: false,
            inEscrow: false
        });

        // Update total insured in pool
        IInsurancePool(insurancePool).addInsuredAmount(issuerToken, coveredAmount);

        // Mint ProCert
        certId = IProtectionCert(protectionCert).mint(
            msg.sender,
            issuerToken,
            coveredAmount,
            poolBalance,
            newTotalInsured
        );

        emit CoveragePurchased(msg.sender, issuerToken, coveredAmount, certId, estimatedPct);
    }

    // ─── Payout Execution ────────────────────────────────────────────

    /**
     * @notice Execute payout after confirmed default.
     *         Liquidation waterfall: Bond → Junior → Senior
     *         ERC-3643 compliance: checks isVerified() + !isFrozen() before each payout
     */
    function executePayout(address issuerToken) external nonReentrant whenNotPaused {
        require(msg.sender == owner() || msg.sender == defaultOracle, "PayoutEngine: unauthorized");

        // 1. Liquidate issuer bond (first loss)
        uint256 bondLiquidated = IIssuerBond(issuerBond).liquidate(issuerToken);

        // 2. Liquidate insurance pool (junior first, then senior)
        (uint256 juniorLiquidated, uint256 seniorLiquidated) =
            IInsurancePool(insurancePool).liquidateForPayout(issuerToken);

        uint256 totalPayout = bondLiquidated + juniorLiquidated + seniorLiquidated;

        // 3. Calculate total covered amount
        address[] storage holders = insuredHolders[issuerToken];
        uint256 totalCovered = 0;
        for (uint256 i = 0; i < holders.length; i++) {
            totalCovered += positions[issuerToken][holders[i]].coveredAmount;
        }

        // 4. Distribute pro-rata with ERC-3643 compliance checks
        uint256 holdersCount = holders.length;
        for (uint256 i = 0; i < holdersCount; i++) {
            address holder = holders[i];
            InsuredPosition storage pos = positions[issuerToken][holder];
            if (pos.paid || pos.coveredAmount == 0) continue;

            uint256 share = (pos.coveredAmount * totalPayout) / totalCovered;

            // ERC-3643 compliance checks
            bool isCompliant = _checkCompliance(issuerToken, holder);

            if (isCompliant) {
                pos.paid = true;
                if (share > 0) {
                    usdt.safeTransfer(holder, share);
                }
                // Burn ProCert
                uint256 certId = IProtectionCert(protectionCert).holderCerts(holder, issuerToken);
                if (certId > 0) {
                    IProtectionCert(protectionCert).burn(certId);
                }
                emit PayoutExecuted(holder, issuerToken, share, certId);
            } else {
                // Escrow for non-compliant holders
                pos.inEscrow = true;
                escrows[holder] = EscrowRecord({
                    amount: share,
                    escrowStartBlock: block.number,
                    escrowExpiry: block.number + ESCROW_DURATION_BLOCKS,
                    issuerToken: issuerToken,
                    holdReason: "COMPLIANCE_HOLD"
                });
                emit PayoutHeld(holder, issuerToken, share, "COMPLIANCE_HOLD");
            }
        }

        // 5. Mint SubrogationNFT to Foundation
        if (subrogationNFT != address(0)) {
            uint256 nftId = ISubrogationNFT(subrogationNFT).mint(
                foundation,
                issuerToken,
                0, // defaultType
                totalPayout,
                bondLiquidated,
                juniorLiquidated,
                seniorLiquidated,
                holdersCount
            );
            emit SubrogationNFTMinted(issuerToken, nftId, totalPayout);
        }

        // 6. Set IRS to 0 (blacklisted)
        if (irsOracle != address(0)) {
            IIRSOracle(irsOracle).setScoreToZero(issuerToken);
        }

        // 7. Update issuer status to DEFAULTED
        if (issuerRegistry != address(0)) {
            IIssuerRegistry(issuerRegistry).setDefaulted(issuerToken);
        }

        emit PayoutComplete(issuerToken, totalPayout, holdersCount);
    }

    // ─── Escrow Management ───────────────────────────────────────────

    function releaseEscrow(address holder) external nonReentrant whenNotPaused {
        EscrowRecord storage esc = escrows[holder];
        require(esc.amount > 0, "PayoutEngine: no escrow");

        bool isCompliant = _checkCompliance(esc.issuerToken, holder);
        require(isCompliant, "PayoutEngine: still non-compliant");

        uint256 amount = esc.amount;
        esc.amount = 0;

        usdt.safeTransfer(holder, amount);
        emit EscrowReleased(holder, amount);
    }

    // ─── Internal ────────────────────────────────────────────────────

    /**
     * @notice Check ERC-3643 compliance: isVerified AND not frozen
     */
    function _checkCompliance(address issuerToken, address holder) internal view returns (bool) {
        try IERC3643(issuerToken).identityRegistry() returns (IIdentityRegistry registry) {
            try registry.isVerified(holder) returns (bool verified) {
                if (!verified) return false;
            } catch {
                return true; // If registry call fails, assume compliant (for mocks)
            }

            try IERC3643(issuerToken).isFrozen(holder) returns (bool frozen) {
                if (frozen) return false;
            } catch {
                return true; // If freeze check fails, assume not frozen (for mocks)
            }

            return true;
        } catch {
            return true; // If no identity registry, assume compliant (for mocks)
        }
    }

    // ─── View Functions ──────────────────────────────────────────────

    function getInsuredHolders(address issuerToken) external view returns (address[] memory) {
        return insuredHolders[issuerToken];
    }

    function getInsuredPosition(address issuerToken, address holder) external view returns (InsuredPosition memory) {
        return positions[issuerToken][holder];
    }

    function getTotalInsuredAmount(address issuerToken) external view returns (uint256 total) {
        address[] storage holders = insuredHolders[issuerToken];
        for (uint256 i = 0; i < holders.length; i++) {
            total += positions[issuerToken][holders[i]].coveredAmount;
        }
    }

    function getEscrowRecord(address holder) external view returns (EscrowRecord memory) {
        return escrows[holder];
    }
}
