// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title IssuerBond — First-loss capital for RWA issuers
 * @notice Holds 5% of token market cap in USDT. First liquidated on default.
 *         Earns zero yield. Returned on clean wind-down minus 0.5% fee.
 */
contract IssuerBond is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ─── Structs ─────────────────────────────────────────────────────
    struct BondRecord {
        uint256 bondAmount;
        uint256 marketCapAtDeposit;
        uint256 depositBlock;
        bool liquidated;
        bool released;
    }

    // ─── State ───────────────────────────────────────────────────────
    IERC20 public immutable usdt;
    mapping(address => BondRecord) public bonds; // tokenAddress => BondRecord

    address public payoutEngine;
    address public issuerRegistry;
    address public immutable protocolTreasury;

    uint256 public constant WIND_DOWN_FEE_BPS = 50; // 0.5%

    // ─── Events ──────────────────────────────────────────────────────
    event BondDeposited(address indexed tokenAddress, uint256 amount, uint256 marketCap);
    event BondLiquidated(address indexed tokenAddress, uint256 amount);
    event BondReleased(address indexed tokenAddress, uint256 returned, uint256 fee);

    // ─── Constructor ─────────────────────────────────────────────────
    constructor(address _usdt, address _protocolTreasury) {
        require(_usdt != address(0), "IssuerBond: zero USDT");
        require(_protocolTreasury != address(0), "IssuerBond: zero treasury");
        usdt = IERC20(_usdt);
        protocolTreasury = _protocolTreasury;
    }

    // ─── Admin Setters ───────────────────────────────────────────────
    // Note: protocolTreasury is immutable and cannot be changed after deployment.
    function setPayoutEngine(address _payoutEngine) external onlyOwner {
        payoutEngine = _payoutEngine;
    }

    function setIssuerRegistry(address _issuerRegistry) external onlyOwner {
        issuerRegistry = _issuerRegistry;
    }

    // ─── Emergency Stop ──────────────────────────────────────────────
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ─── Core Functions ──────────────────────────────────────────────

    /**
     * @notice Deposit issuer bond. Must pre-approve USDT.
     * @param tokenAddress The RWA token being covered
     * @param usdtAmount Amount of USDT to deposit as bond
     * @param marketCap Market cap at registration time (for record keeping)
     */
    function deposit(
        address tokenAddress,
        uint256 usdtAmount,
        uint256 marketCap
    ) external nonReentrant whenNotPaused {
        require(bonds[tokenAddress].bondAmount == 0, "IssuerBond: bond exists");
        require(usdtAmount > 0, "IssuerBond: zero amount");

        usdt.safeTransferFrom(msg.sender, address(this), usdtAmount);

        bonds[tokenAddress] = BondRecord({
            bondAmount: usdtAmount,
            marketCapAtDeposit: marketCap,
            depositBlock: block.number,
            liquidated: false,
            released: false
        });

        emit BondDeposited(tokenAddress, usdtAmount, marketCap);
    }

    /**
     * @notice Liquidate bond on confirmed default. Called by PayoutEngine only.
     * @return liquidatedAmount The full bond amount transferred to PayoutEngine
     */
    function liquidate(address tokenAddress) external nonReentrant returns (uint256 liquidatedAmount) {
        require(msg.sender == payoutEngine, "IssuerBond: only PayoutEngine");

        BondRecord storage bond = bonds[tokenAddress];
        require(bond.bondAmount > 0, "IssuerBond: no bond");
        require(!bond.liquidated, "IssuerBond: already liquidated");
        require(!bond.released, "IssuerBond: already released");

        liquidatedAmount = bond.bondAmount;
        bond.liquidated = true;
        bond.bondAmount = 0;

        usdt.safeTransfer(payoutEngine, liquidatedAmount);

        emit BondLiquidated(tokenAddress, liquidatedAmount);
    }

    /**
     * @notice Release bond on clean wind-down. Called by IssuerRegistry.
     * @return returnedToIssuer Amount returned after 0.5% protocol fee
     */
    function release(
        address tokenAddress,
        address issuerEOA
    ) external nonReentrant returns (uint256 returnedToIssuer) {
        require(msg.sender == issuerRegistry, "IssuerBond: only IssuerRegistry");

        BondRecord storage bond = bonds[tokenAddress];
        require(bond.bondAmount > 0, "IssuerBond: no bond");
        require(!bond.liquidated, "IssuerBond: was liquidated");
        require(!bond.released, "IssuerBond: already released");

        uint256 fee = (bond.bondAmount * WIND_DOWN_FEE_BPS) / 10000;
        returnedToIssuer = bond.bondAmount - fee;
        bond.released = true;
        bond.bondAmount = 0;

        usdt.safeTransfer(issuerEOA, returnedToIssuer);
        if (fee > 0) {
            usdt.safeTransfer(protocolTreasury, fee);
        }

        emit BondReleased(tokenAddress, returnedToIssuer, fee);
    }

    // ─── View Functions ──────────────────────────────────────────────

    function getBond(address tokenAddress) external view returns (uint256) {
        return bonds[tokenAddress].bondAmount;
    }

    function getBondRecord(address tokenAddress) external view returns (BondRecord memory) {
        return bonds[tokenAddress];
    }

    function isBondSufficient(address tokenAddress, uint256 requiredAmount) external view returns (bool) {
        return bonds[tokenAddress].bondAmount >= requiredAmount;
    }
}
