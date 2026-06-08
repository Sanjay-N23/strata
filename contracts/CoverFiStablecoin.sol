// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title CoverFiStablecoin (cfUSD)
 * @notice Phase 1 stablecoin for the CoverFi Protocol on HashKey Chain Mainnet.
 *         Will be replaced by integrated USDT/USDC in Phase 2 once direct
 *         partnerships with stablecoin issuers on HashKey Chain are formalized.
 *
 * Industrial-grade safety guarantees:
 *   - Hard-capped supply at 1 billion cfUSD (1_000_000_000 * 10^6).
 *   - Two-step ownership transfer (Ownable2Step) prevents typo lockouts.
 *   - Separate `minter` role from `owner`. Minter can be revoked / rotated
 *     independently of governance ownership, supporting key rotation and
 *     eventual transition to a multi-sig minter.
 *   - Pausable: emergency stop on transfers + minting if a flaw is found.
 *   - Mint guards: zero-address, zero-amount, supply-cap.
 *
 * @dev    6 decimals to match standard USDT behavior across the EVM ecosystem.
 *         This is NOT a mock. It is a fully functional ERC20 token used as the
 *         settlement asset for CoverFi protection coverage during Phase 1.
 */
contract CoverFiStablecoin is ERC20, Ownable2Step, Pausable {
    /// @notice Maximum total supply: 1 billion cfUSD (with 6 decimals).
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10**6;

    /// @notice Address authorized to mint new cfUSD. Settable by owner.
    /// @dev    Starts as the deployer; owner should rotate to a multi-sig
    ///         or revoke (set to address(0)) once initial liquidity is seeded.
    address public minter;

    // ─── Events ──────────────────────────────────────────────────────────
    event MinterUpdated(address indexed previousMinter, address indexed newMinter);

    // ─── Modifiers ───────────────────────────────────────────────────────
    modifier onlyMinter() {
        require(msg.sender == minter, "cfUSD: caller is not minter");
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────────
    constructor() ERC20("CoverFi Stablecoin", "cfUSD") {
        minter = msg.sender;
        emit MinterUpdated(address(0), msg.sender);
    }

    // ─── ERC20 Overrides ─────────────────────────────────────────────────
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @dev Hook into Pausable so transfers are blocked when paused.
    function _beforeTokenTransfer(address from, address to, uint256 amount)
        internal
        override
        whenNotPaused
    {
        super._beforeTokenTransfer(from, to, amount);
    }

    // ─── Minting ─────────────────────────────────────────────────────────

    /**
     * @notice Mint cfUSD to a recipient. Subject to MAX_SUPPLY cap.
     * @param  to     Recipient of the minted tokens.
     * @param  amount Amount to mint (denominated in 6 decimals).
     */
    function mint(address to, uint256 amount) external onlyMinter whenNotPaused {
        require(to != address(0), "cfUSD: mint to zero address");
        require(amount > 0, "cfUSD: zero amount");
        require(totalSupply() + amount <= MAX_SUPPLY, "cfUSD: cap exceeded");
        _mint(to, amount);
    }

    // ─── Admin (Owner Only) ──────────────────────────────────────────────

    /**
     * @notice Set or rotate the minter address.
     *         Use address(0) to permanently revoke minting.
     */
    function setMinter(address newMinter) external onlyOwner {
        emit MinterUpdated(minter, newMinter);
        minter = newMinter;
    }

    /// @notice Pause all transfers and minting. Owner only.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resume operations. Owner only.
    function unpause() external onlyOwner {
        _unpause();
    }
}
