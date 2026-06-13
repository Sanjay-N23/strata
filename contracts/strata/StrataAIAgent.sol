// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable2Step.sol";

interface IStrataScore {
    function setAIScore(address token, uint16 score) external;
}

interface IDefaultProposer {
    function flagDefaultEvent(address token, uint8 eventType) external;
}

interface IAgentIdentity {
    function ownerOf(uint256 tokenId) external view returns (address);
}

/**
 * @title StrataAIAgent — on-chain decision layer for the Strata AI underwriter
 * @notice Codifies the agent's AUTONOMY BOUNDARY on-chain:
 *           🟢 GREEN (reversible, autonomous): submitScore, flagEarlyWarning
 *           🔴 RED   (irreversible/legal): proposeDefault only FLAGS; humans dispose
 *                    via TIR 2-of-3 -> DefaultOracle.processConfirmation (unchanged).
 *                    The AI can never confirm a default.
 *           🛑 GUARD: a human guardian can pause the agent at any time.
 *
 *         submitScore() is the AI-powered function callable on-chain that CAUSALLY
 *         drives protocol state — it reprices the issuer's effective premium in the
 *         same transaction via scoreOracle.setAIScore().
 */
contract StrataAIAgent is Ownable2Step {
    // ─── Structs ─────────────────────────────────────────────────────
    struct AIScore {
        uint16 score;          // 0..1000
        uint16 pdBps;          // probability of default, 0..10000
        bytes32 rationaleHash; // keccak of the off-chain credit memo (reproducible)
        uint64 epoch;
        uint64 timestamp;
    }

    struct DefaultProposal {
        address issuer;
        uint8 eventType;       // matches DefaultOracle.DefaultEventType (0..3)
        bytes32 evidenceHash;
        uint64 timestamp;
    }

    // ─── Config ──────────────────────────────────────────────────────
    address public agentOperator;   // wallet running the off-chain agent
    address public guardian;        // human circuit-breaker
    bool public paused;

    IStrataScore public scoreOracle;
    IDefaultProposer public defaultOracle;
    address public benchmark;       // TuringBenchmark (Phase B), settable

    // ERC-8004-style agent-identity gate: minimal ERC-721 ownerOf check,
    // optional (unset on testnet), enforced on every onlyAgent call when set.
    address public erc8004Registry;
    uint256 public erc8004TokenId;

    // ─── State ───────────────────────────────────────────────────────
    mapping(address => AIScore) public latestScore;
    DefaultProposal[] public proposals;

    uint256 public scoresSubmitted;
    uint256 public correctCalls;
    uint256 public totalResolved;

    // ─── Events ──────────────────────────────────────────────────────
    event ScoreSubmitted(address indexed issuer, uint16 score, uint16 pdBps, bytes32 rationaleHash, uint64 epoch);
    event EarlyWarning(address indexed issuer, uint8 level, bytes32 evidenceHash, uint64 epoch);
    event DefaultProposed(uint256 indexed proposalId, address indexed issuer, uint8 eventType, bytes32 evidenceHash);
    event AgentPausedSet(bool paused);
    event ReputationUpdated(uint256 correct, uint256 total);
    event ConfigUpdated(string what, address value);

    // ─── Modifiers ───────────────────────────────────────────────────
    modifier onlyAgent() {
        require(msg.sender == agentOperator, "Strata: not agent");
        require(!paused, "Strata: paused");
        if (erc8004Registry != address(0)) {
            require(
                IAgentIdentity(erc8004Registry).ownerOf(erc8004TokenId) == agentOperator,
                "Strata: agent lacks ERC-8004 identity"
            );
        }
        _;
    }

    modifier onlyGuardian() {
        require(msg.sender == guardian || msg.sender == owner(), "Strata: not guardian");
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────
    constructor(address _scoreOracle, address _defaultOracle) {
        scoreOracle = IStrataScore(_scoreOracle);
        defaultOracle = IDefaultProposer(_defaultOracle);
        agentOperator = msg.sender;
        guardian = msg.sender;
    }

    // ════════════════════════════════════════════════════════════════
    // 🟢 GREEN ZONE — reversible, fully autonomous
    // ════════════════════════════════════════════════════════════════

    /**
     * @notice AI underwriter posts a score + default probability with a rationale hash.
     *         Causally reprices the issuer (scoreOracle.setAIScore) in the same tx.
     */
    function submitScore(
        address issuer,
        uint16 score,
        uint16 pdBps,
        bytes32 rationaleHash,
        uint64 epoch
    ) external onlyAgent {
        require(score <= 1000, "Strata: score>1000");
        require(pdBps <= 10000, "Strata: pd>10000");

        latestScore[issuer] = AIScore({
            score: score,
            pdBps: pdBps,
            rationaleHash: rationaleHash,
            epoch: epoch,
            timestamp: uint64(block.timestamp)
        });
        scoresSubmitted++;

        scoreOracle.setAIScore(issuer, score); // 🟢 causal on-chain effect

        emit ScoreSubmitted(issuer, score, pdBps, rationaleHash, epoch);
    }

    function flagEarlyWarning(
        address issuer,
        uint8 level,
        bytes32 evidenceHash,
        uint64 epoch
    ) external onlyAgent {
        emit EarlyWarning(issuer, level, evidenceHash, epoch);
    }

    // ════════════════════════════════════════════════════════════════
    // 🔴 RED ZONE — AI may only PROPOSE; humans dispose (TIR 2-of-3)
    // ════════════════════════════════════════════════════════════════

    /**
     * @notice AI flags a potential default. This ONLY starts the grace/monitoring
     *         window via DefaultOracle. Confirmation REQUIRES 2-of-3 human attestors
     *         through TIR.submitDefaultAttestation -> DefaultOracle.processConfirmation.
     *         The AI cannot confirm a default.
     */
    function proposeDefault(
        address issuer,
        uint8 eventType,
        bytes32 evidenceHash
    ) external onlyAgent returns (uint256 proposalId) {
        require(eventType <= 3, "Strata: bad eventType");

        defaultOracle.flagDefaultEvent(issuer, eventType); // flag only — no confirmation

        proposalId = proposals.length;
        proposals.push(DefaultProposal({
            issuer: issuer,
            eventType: eventType,
            evidenceHash: evidenceHash,
            timestamp: uint64(block.timestamp)
        }));

        emit DefaultProposed(proposalId, issuer, eventType, evidenceHash);
    }

    // ════════════════════════════════════════════════════════════════
    // Reputation — updated by the benchmark when outcomes resolve
    // ════════════════════════════════════════════════════════════════

    function recordOutcome(bool wasCorrect) external {
        require(msg.sender == benchmark || msg.sender == owner(), "Strata: not benchmark");
        totalResolved++;
        if (wasCorrect) correctCalls++;
        emit ReputationUpdated(correctCalls, totalResolved);
    }

    function reputation() external view returns (uint256 correct, uint256 total) {
        return (correctCalls, totalResolved);
    }

    function proposalsCount() external view returns (uint256) {
        return proposals.length;
    }

    // ════════════════════════════════════════════════════════════════
    // 🛑 GUARD ZONE — human controls
    // ════════════════════════════════════════════════════════════════

    function pauseAgent() external onlyGuardian {
        paused = true;
        emit AgentPausedSet(true);
    }

    function unpauseAgent() external onlyGuardian {
        paused = false;
        emit AgentPausedSet(false);
    }

    function setAgentOperator(address _operator) external onlyGuardian {
        agentOperator = _operator;
        emit ConfigUpdated("agentOperator", _operator);
    }

    function setGuardian(address _guardian) external onlyGuardian {
        guardian = _guardian;
        emit ConfigUpdated("guardian", _guardian);
    }

    function setBenchmark(address _benchmark) external onlyOwner {
        benchmark = _benchmark;
        emit ConfigUpdated("benchmark", _benchmark);
    }

    function setScoreOracle(address _oracle) external onlyOwner {
        scoreOracle = IStrataScore(_oracle);
        emit ConfigUpdated("scoreOracle", _oracle);
    }

    function setDefaultOracle(address _oracle) external onlyOwner {
        defaultOracle = IDefaultProposer(_oracle);
        emit ConfigUpdated("defaultOracle", _oracle);
    }

    function setErc8004(address _registry, uint256 _tokenId) external onlyOwner {
        erc8004Registry = _registry;
        erc8004TokenId = _tokenId;
        emit ConfigUpdated("erc8004Registry", _registry);
    }
}
