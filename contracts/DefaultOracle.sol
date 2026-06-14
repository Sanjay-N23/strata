// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title DefaultOracle — Default Event State Machine
 * @notice Manages 4 default event types with grace periods and triggers.
 *         Coordinates with TIR for 2-of-3 confirmation and PayoutEngine for execution.
 */
contract DefaultOracle is Ownable2Step {
    // ─── Enums ───────────────────────────────────────────────────────
    enum DefaultEventType { PAYMENT_DELAY, GHOST_ISSUER, COLLATERAL_SHORTFALL, MISAPPROPRIATION }

    // ─── Structs ─────────────────────────────────────────────────────
    struct DefaultEvent {
        DefaultEventType eventType;
        uint256 firstFlaggedBlock;
        uint256 graceExpiryBlock;
        bool isActive;
        bool isConfirmed;
        uint256 confirmationBlock;
    }

    struct MonitoringState {
        bool active;
        uint256 activationBlock;
        uint8 eventTypeFlags; // bitmask
    }

    // ─── Constants ───────────────────────────────────────────────────
    uint256 public constant BLOCKS_PER_HOUR = 1200;    // ~3s per block
    uint256 public constant GRACE_48H = 57600;          // 48 hours in blocks
    uint256 public constant GRACE_72H = 86400;          // 72 hours in blocks
    uint256 public constant GRACE_7D = 201600;          // 7 days in blocks

    // ─── State ───────────────────────────────────────────────────────
    mapping(address => DefaultEvent) public activeEvents;
    mapping(address => MonitoringState) public monitoringStates;
    mapping(address => bool) public defaultConfirmed;
    mapping(address => uint256) public defaultConfirmationBlock;

    address public tir;
    address public irsOracle;
    address public insurancePool;
    address public payoutEngine;
    address public issuerRegistry;
    address public aiProposer; // StrataAIAgent — may FLAG defaults; cannot confirm them

    // ─── Events ──────────────────────────────────────────────────────
    event DefaultEventFlagged(address indexed tokenAddress, DefaultEventType eventType, uint256 graceExpiryBlock);
    event DefaultEventConfirmed(address indexed tokenAddress, DefaultEventType eventType, uint256 confirmationBlock);
    event MonitoringActivated(address indexed tokenAddress, uint8 eventTypeMask);
    event MonitoringCleared(address indexed tokenAddress);

    // ─── Constructor ─────────────────────────────────────────────────
    constructor(address _tir) {
        tir = _tir;
    }

    // ─── Admin Setters ───────────────────────────────────────────────
    function setIRSOracle(address _irsOracle) external onlyOwner { irsOracle = _irsOracle; }
    function setInsurancePool(address _pool) external onlyOwner { insurancePool = _pool; }
    function setPayoutEngine(address _engine) external onlyOwner { payoutEngine = _engine; }
    function setIssuerRegistry(address _registry) external onlyOwner { issuerRegistry = _registry; }
    function setAIProposer(address _proposer) external onlyOwner { aiProposer = _proposer; }

    // ─── Core Functions ──────────────────────────────────────────────

    /**
     * @notice Flag a default event with appropriate grace period.
     */
    function flagDefaultEvent(
        address tokenAddress,
        DefaultEventType eventType
    ) external {
        // AI agent (aiProposer) or owner may FLAG. Flagging only starts the grace/
        // monitoring window — confirmation still requires 2-of-3 human attestors
        // via TIR -> processConfirmation. The human-in-the-loop gate is preserved.
        require(msg.sender == owner() || msg.sender == aiProposer, "DefaultOracle: not authorized to flag");
        require(!defaultConfirmed[tokenAddress], "DefaultOracle: already confirmed");

        uint256 graceExpiry;
        if (eventType == DefaultEventType.PAYMENT_DELAY) {
            graceExpiry = block.number + GRACE_48H;
        } else if (eventType == DefaultEventType.GHOST_ISSUER) {
            graceExpiry = block.number + GRACE_72H;
        } else if (eventType == DefaultEventType.COLLATERAL_SHORTFALL) {
            graceExpiry = block.number + GRACE_7D;
        } else {
            // MISAPPROPRIATION: no grace period
            graceExpiry = block.number;
        }

        // Re-flag guard: if an unconfirmed event is already open, only allow ESCALATION
        // (an equal/earlier grace expiry) and preserve the original flag time — the operator
        // cannot soften the severity or restart the grace clock on a distressed issuer.
        DefaultEvent storage existing = activeEvents[tokenAddress];
        uint256 firstFlagged = block.number;
        if (existing.isActive) {
            require(graceExpiry <= existing.graceExpiryBlock, "DefaultOracle: cannot soften active event");
            firstFlagged = existing.firstFlaggedBlock;
        }

        activeEvents[tokenAddress] = DefaultEvent({
            eventType: eventType,
            firstFlaggedBlock: firstFlagged,
            graceExpiryBlock: graceExpiry,
            isActive: true,
            isConfirmed: false,
            confirmationBlock: 0
        });

        // Activate monitoring
        monitoringStates[tokenAddress] = MonitoringState({
            active: true,
            activationBlock: block.number,
            eventTypeFlags: uint8(1 << uint8(eventType))
        });

        emit DefaultEventFlagged(tokenAddress, eventType, graceExpiry);
        emit MonitoringActivated(tokenAddress, uint8(1 << uint8(eventType)));
    }

    /**
     * @notice Process default confirmation after TIR 2-of-3 vote.
     */
    function processConfirmation(address tokenAddress) external {
        require(msg.sender == owner() || msg.sender == tir, "DefaultOracle: unauthorized");
        require(!defaultConfirmed[tokenAddress], "DefaultOracle: already confirmed");

        defaultConfirmed[tokenAddress] = true;
        defaultConfirmationBlock[tokenAddress] = block.number;

        DefaultEvent storage evt = activeEvents[tokenAddress];
        evt.isConfirmed = true;
        evt.confirmationBlock = block.number;

        emit DefaultEventConfirmed(tokenAddress, evt.eventType, block.number);
    }

    /**
     * @notice Clear monitoring state if issue is resolved.
     */
    function clearMonitoring(address tokenAddress) external onlyOwner {
        delete monitoringStates[tokenAddress];
        delete activeEvents[tokenAddress];
        emit MonitoringCleared(tokenAddress);
    }

    // ─── View Functions ──────────────────────────────────────────────

    function isInMonitoring(address tokenAddress) external view returns (bool) {
        return monitoringStates[tokenAddress].active;
    }

    function isDefaultConfirmed(address tokenAddress) external view returns (bool) {
        return defaultConfirmed[tokenAddress];
    }

    function getDefaultConfirmationBlock(address tokenAddress) external view returns (uint256) {
        return defaultConfirmationBlock[tokenAddress];
    }

    function getActiveEvent(address tokenAddress) external view returns (DefaultEvent memory) {
        return activeEvents[tokenAddress];
    }

    function getMonitoringState(address tokenAddress) external view returns (MonitoringState memory) {
        return monitoringStates[tokenAddress];
    }
}
