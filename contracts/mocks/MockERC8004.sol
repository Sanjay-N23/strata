// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title MockERC8004 — minimal agent-identity NFT for tests
 * @notice Just enough of the ERC-721 surface (ownerOf) for StrataAIAgent's
 *         optional ERC-8004 identity gate. Test infrastructure only.
 */
contract MockERC8004 {
    mapping(uint256 => address) private _owners;

    function mint(address to, uint256 tokenId) external {
        _owners[tokenId] = to;
    }

    function burn(uint256 tokenId) external {
        _owners[tokenId] = address(0);
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        return _owners[tokenId];
    }
}
