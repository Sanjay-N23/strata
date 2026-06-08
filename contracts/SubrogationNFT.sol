// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title SubrogationNFT — Post-Default Evidence Container
 * @notice ERC-721 minted to CoverFi Foundation after payout execution.
 *         Contains full default evidence package for legal recovery.
 *         Non-transferable except by Foundation.
 */
contract SubrogationNFT is ERC721, Ownable2Step {
    // ─── Structs ─────────────────────────────────────────────────────
    struct SubrogationClaimData {
        address issuerToken;
        uint8 defaultType;         // 0=PAYMENT_DELAY, 1=GHOST_ISSUER, 2=COLLATERAL_SHORTFALL, 3=MISAPPROPRIATION
        uint256 totalPayoutAmount;
        uint256 bondLiquidated;
        uint256 juniorLiquidated;
        uint256 seniorLiquidated;
        uint256 insuredHolderCount;
        uint256 payoutBlock;
    }

    // ─── State ───────────────────────────────────────────────────────
    uint256 public nextTokenId = 1;
    address public payoutEngine;
    address public foundation;

    mapping(uint256 => SubrogationClaimData) public claims;
    mapping(address => uint256) public claimByIssuer; // issuerToken => tokenId

    // ─── Events ──────────────────────────────────────────────────────
    event SubrogationClaimed(uint256 indexed tokenId, address indexed issuerToken, uint256 totalPayout, uint256 payoutBlock);

    // ─── Constructor ─────────────────────────────────────────────────
    constructor(address _payoutEngine, address _foundation) ERC721("CoverFi Subrogation Claim", "SubClaim") {
        payoutEngine = _payoutEngine;
        foundation = _foundation;
    }

    // ─── Transfer Restriction ────────────────────────────────────────

    /**
     * @dev Only allow mint (from=0) and transfers FROM foundation
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal override {
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
        require(
            from == address(0) || from == foundation,
            "SubrogationNFT: only foundation can transfer"
        );
    }

    // ─── Core Functions ──────────────────────────────────────────────

    /**
     * @notice Mint a SubrogationNFT containing full default evidence.
     */
    function mint(
        address to,
        address issuerToken,
        uint8 defaultType,
        uint256 totalPayout,
        uint256 bondLiquidated,
        uint256 juniorLiquidated,
        uint256 seniorLiquidated,
        uint256 holderCount
    ) external returns (uint256 tokenId) {
        require(msg.sender == payoutEngine || msg.sender == owner(), "SubrogationNFT: unauthorized");

        tokenId = nextTokenId++;

        claims[tokenId] = SubrogationClaimData({
            issuerToken: issuerToken,
            defaultType: defaultType,
            totalPayoutAmount: totalPayout,
            bondLiquidated: bondLiquidated,
            juniorLiquidated: juniorLiquidated,
            seniorLiquidated: seniorLiquidated,
            insuredHolderCount: holderCount,
            payoutBlock: block.number
        });

        claimByIssuer[issuerToken] = tokenId;

        _safeMint(to, tokenId);

        emit SubrogationClaimed(tokenId, issuerToken, totalPayout, block.number);
    }

    // ─── View Functions ──────────────────────────────────────────────

    function getClaimData(uint256 tokenId) external view returns (SubrogationClaimData memory) {
        return claims[tokenId];
    }

    function getClaimByIssuer(address issuerToken) external view returns (uint256) {
        return claimByIssuer[issuerToken];
    }
}
