// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/**
 * @title IdentityRegistry — ERC-8004 Trustless Agent Identity (reference impl)
 * @notice Spec-compliant ERC-8004 Identity Registry for Mantle Sepolia.
 *
 *         The canonical ERC-8004 IdentityRegistry (0x8004A169FB4a3325136EB29fA0ceB6D2e539a432,
 *         the same CREATE2 address on every chain) is deployed on Mantle MAINNET but NOT on
 *         this testnet, so the Strata agent's identity is registered against this reference
 *         deployment for the Sepolia demo. The interface mirrors the standard:
 *
 *           - register(agentURI) mints the agent's ERC-721 identity; agentId == tokenId.
 *           - agentURI / setAgentURI point to the off-chain registration file (agent card:
 *             advertised services & endpoints — A2A, MCP, OASF, etc.).
 *           - getMetadata / setMetadata hold arbitrary on-chain key→value records.
 *           - ownership is plain ERC-721 ownerOf(agentId), which StrataAIAgent's identity
 *             gate (onlyAgent) already enforces — so wiring is setErc8004(registry, agentId).
 */
contract IdentityRegistry is ERC721 {
    uint256 public agentCount; // last minted agentId (agentId == tokenId, 1-indexed)

    mapping(uint256 => string) private _agentURI;                 // agentId => registration-file URI
    mapping(uint256 => mapping(bytes32 => bytes)) private _metadata;

    event Registered(uint256 indexed agentId, address indexed owner, string agentURI);
    event AgentURIUpdated(uint256 indexed agentId, string agentURI);
    event MetadataSet(uint256 indexed agentId, bytes32 indexed key, bytes value);

    constructor() ERC721("ERC-8004 Agent Identity", "AGENT") {}

    modifier onlyAgentOwner(uint256 agentId) {
        require(ownerOf(agentId) == msg.sender, "ERC8004: not agent owner");
        _;
    }

    /// @notice Mint a new agent identity to msg.sender. Returns the agentId (== tokenId).
    function register(string calldata agentURI_) external returns (uint256 agentId) {
        agentId = ++agentCount;
        _safeMint(msg.sender, agentId);
        _agentURI[agentId] = agentURI_;
        emit Registered(agentId, msg.sender, agentURI_);
    }

    function setAgentURI(uint256 agentId, string calldata agentURI_) external onlyAgentOwner(agentId) {
        _agentURI[agentId] = agentURI_;
        emit AgentURIUpdated(agentId, agentURI_);
    }

    function agentURI(uint256 agentId) public view returns (string memory) {
        _requireMinted(agentId);
        return _agentURI[agentId];
    }

    /// @dev tokenURI resolves to the agent's registration file (ERC-8004 agent card).
    function tokenURI(uint256 agentId) public view override returns (string memory) {
        return agentURI(agentId);
    }

    function setMetadata(uint256 agentId, bytes32 key, bytes calldata value) external onlyAgentOwner(agentId) {
        _metadata[agentId][key] = value;
        emit MetadataSet(agentId, key, value);
    }

    function getMetadata(uint256 agentId, bytes32 key) external view returns (bytes memory) {
        return _metadata[agentId][key];
    }
}
