// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./IIdentityRegistry.sol";

/**
 * @title IERC3643 — Minimal interface for ERC-3643 (T-REX) security tokens
 * @notice Only the functions Strata needs for compliance-native payout
 */
interface IERC3643 {
    function identityRegistry() external view returns (IIdentityRegistry);
    function isFrozen(address _userAddress) external view returns (bool);
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}
