// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title ProtectionCert — Soulbound Protection Certificate
 * @notice ERC-721 + ERC-5192 (Soulbound). Non-transferable coverage proof.
 *         Minted on coverage purchase, burned on payout.
 */
contract ProtectionCert is ERC721Enumerable, Ownable2Step {
    // ─── Structs ─────────────────────────────────────────────────────
    struct CertMetadata {
        address issuerToken;
        address holder;
        uint256 coveredAmount;
        uint256 poolBalanceAtMint;
        uint256 totalInsuredAtMint;
        uint256 estimatedPayoutPct; // basis points
        uint256 mintBlock;
    }

    // ─── State ───────────────────────────────────────────────────────
    uint256 public nextTokenId = 1;
    address public payoutEngine;

    mapping(uint256 => CertMetadata) public certData;
    mapping(address => mapping(address => uint256)) public holderCerts; // holder => issuerToken => tokenId

    // ─── Events (ERC-5192) ───────────────────────────────────────────
    event Locked(uint256 tokenId);
    event CertMinted(uint256 indexed tokenId, address indexed holder, address indexed issuerToken, uint256 coveredAmount, uint256 estimatedPayoutPct);
    event CertBurned(uint256 indexed tokenId, address indexed holder);

    // ─── Constructor ─────────────────────────────────────────────────
    constructor() ERC721("CoverFi Protection Certificate", "ProCert") {}

    // ─── Admin ───────────────────────────────────────────────────────
    function setPayoutEngine(address _engine) external onlyOwner {
        payoutEngine = _engine;
    }

    // ─── ERC-5192: Soulbound ─────────────────────────────────────────

    /**
     * @notice ERC-5192 interface — always returns true (non-transferable)
     */
    function locked(uint256 /* tokenId */) external pure returns (bool) {
        return true;
    }

    /**
     * @dev Block all transfers except mint and burn
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal override {
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
        // Allow mint (from == 0) and burn (to == 0)
        require(from == address(0) || to == address(0), "ProCert: soulbound, non-transferable");
    }

    // ─── Core Functions ──────────────────────────────────────────────

    /**
     * @notice Mint a ProCert for an insured holder.
     */
    function mint(
        address holder,
        address issuerToken,
        uint256 coveredAmount,
        uint256 poolBalanceAtMint,
        uint256 totalInsuredAtMint
    ) external returns (uint256 tokenId) {
        require(msg.sender == payoutEngine || msg.sender == owner(), "ProCert: unauthorized");

        tokenId = nextTokenId++;

        uint256 estimatedPct = 0;
        if (totalInsuredAtMint > 0) {
            estimatedPct = (poolBalanceAtMint * 10000) / totalInsuredAtMint;
        }

        certData[tokenId] = CertMetadata({
            issuerToken: issuerToken,
            holder: holder,
            coveredAmount: coveredAmount,
            poolBalanceAtMint: poolBalanceAtMint,
            totalInsuredAtMint: totalInsuredAtMint,
            estimatedPayoutPct: estimatedPct,
            mintBlock: block.number
        });

        holderCerts[holder][issuerToken] = tokenId;

        _safeMint(holder, tokenId);
        emit Locked(tokenId);
        emit CertMinted(tokenId, holder, issuerToken, coveredAmount, estimatedPct);
    }

    /**
     * @notice Burn a ProCert on payout execution.
     */
    function burn(uint256 tokenId) external {
        require(msg.sender == payoutEngine || msg.sender == owner(), "ProCert: unauthorized");
        address holder = ownerOf(tokenId);
        delete holderCerts[holder][certData[tokenId].issuerToken];
        _burn(tokenId);
        emit CertBurned(tokenId, holder);
    }

    /**
     * @notice Holder can voluntarily burn their ProCert.
     */
    function burnByHolder(uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "ProCert: not owner");
        delete holderCerts[msg.sender][certData[tokenId].issuerToken];
        _burn(tokenId);
        emit CertBurned(tokenId, msg.sender);
    }

    // ─── View Functions ──────────────────────────────────────────────

    function getCertMetadata(uint256 tokenId) external view returns (CertMetadata memory) {
        return certData[tokenId];
    }

    function getCertByHolder(address holder, address issuerToken) external view returns (uint256) {
        return holderCerts[holder][issuerToken];
    }

    function holderHasCoverage(address holder, address issuerToken) external view returns (bool) {
        uint256 tokenId = holderCerts[holder][issuerToken];
        return tokenId != 0 && _exists(tokenId);
    }
}
