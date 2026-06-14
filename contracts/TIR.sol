// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title TIR — Trusted Issuer Registry
 * @notice Manages bonded attestors (Custodian, Legal Rep, Auditor) and 2-of-3
 *         default confirmation logic for Strata Protocol.
 */
contract TIR is Ownable2Step, ReentrancyGuard {
    // ─── Enums ───────────────────────────────────────────────────────
    enum AttestorType { CUSTODIAN, LEGAL_REP, AUDITOR }
    enum AttestorStatus { UNREGISTERED, ACTIVE, SLASHED, BLACKLISTED, INACTIVE }

    // ─── Structs ─────────────────────────────────────────────────────
    struct Attestor {
        address wallet;
        AttestorType attestorType;
        uint256 bondMNT;
        uint256 registrationTimestamp;
        AttestorStatus status;
        uint256 successfulAttestations;
        uint256 disputedAttestations;
        uint256 slashCount;
    }

    struct DefaultVote {
        address attestorWallet;
        AttestorType attestorType;
        uint64 basAttestationUID;
        bytes32 evidenceHash;
        uint256 voteBlock;
    }

    struct DefaultConfirmationState {
        bool custodianVoted;
        bool legalVoted;
        bool auditorVoted;
        DefaultVote custodianVote;
        DefaultVote legalVote;
        DefaultVote auditorVote;
        bool isConfirmed;
        uint256 confirmationBlock;
    }

    // ─── Constants ───────────────────────────────────────────────────
    uint256 public constant MIN_BOND_MNT = 5 ether;

    // ─── State ───────────────────────────────────────────────────────
    mapping(address => Attestor) public attestors;
    mapping(address => DefaultConfirmationState) public defaultConfirmations;
    mapping(address => bool) public monitoringActive;

    // ─── Events ──────────────────────────────────────────────────────
    event AttestorRegistered(address indexed wallet, AttestorType attestorType, uint256 bondMNT);
    event DefaultAttestationSubmitted(address indexed tokenAddress, address indexed attestor, AttestorType attestorType, uint64 basUID);
    event DefaultConfirmed(address indexed tokenAddress, uint256 confirmationBlock);
    event AttestorSlashed(address indexed wallet, uint256 bondLost, string reason);
    event MonitoringVoteSubmitted(address indexed tokenAddress, uint8 voteCount);

    // ─── Registration ────────────────────────────────────────────────

    /**
     * @notice Register as a TIR attestor. Requires minimum bond of 5 MNT (native gas token).
     * @param attestorType The category: CUSTODIAN, LEGAL_REP, or AUDITOR
     */
    function registerAttestor(AttestorType attestorType) external payable nonReentrant {
        require(attestors[msg.sender].status == AttestorStatus.UNREGISTERED, "TIR: already registered");
        require(msg.value >= MIN_BOND_MNT, "TIR: bond below minimum");

        attestors[msg.sender] = Attestor({
            wallet: msg.sender,
            attestorType: attestorType,
            bondMNT: msg.value,
            registrationTimestamp: block.timestamp,
            status: AttestorStatus.ACTIVE,
            successfulAttestations: 0,
            disputedAttestations: 0,
            slashCount: 0
        });

        emit AttestorRegistered(msg.sender, attestorType, msg.value);
    }

    // ─── Default Attestation ─────────────────────────────────────────

    /**
     * @notice Submit a default attestation for an issuer token.
     *         2-of-3 distinct categories required for confirmation.
     */
    function submitDefaultAttestation(
        address tokenAddress,
        uint64 basAttestUID,
        bytes32 evidenceHash
    ) external {
        Attestor storage att = attestors[msg.sender];
        require(att.status == AttestorStatus.ACTIVE, "TIR: not active attestor");

        DefaultConfirmationState storage state = defaultConfirmations[tokenAddress];
        require(!state.isConfirmed, "TIR: already confirmed");

        DefaultVote memory vote = DefaultVote({
            attestorWallet: msg.sender,
            attestorType: att.attestorType,
            basAttestationUID: basAttestUID,
            evidenceHash: evidenceHash,
            voteBlock: block.number
        });

        // Record vote by category — only one vote per category
        if (att.attestorType == AttestorType.CUSTODIAN) {
            require(!state.custodianVoted, "TIR: custodian already voted");
            state.custodianVoted = true;
            state.custodianVote = vote;
        } else if (att.attestorType == AttestorType.LEGAL_REP) {
            require(!state.legalVoted, "TIR: legal rep already voted");
            state.legalVoted = true;
            state.legalVote = vote;
        } else if (att.attestorType == AttestorType.AUDITOR) {
            require(!state.auditorVoted, "TIR: auditor already voted");
            state.auditorVoted = true;
            state.auditorVote = vote;
        }

        emit DefaultAttestationSubmitted(tokenAddress, msg.sender, att.attestorType, basAttestUID);

        // Check 2-of-3 confirmation
        uint8 voteCount = 0;
        if (state.custodianVoted) voteCount++;
        if (state.legalVoted) voteCount++;
        if (state.auditorVoted) voteCount++;

        if (voteCount >= 2) {
            state.isConfirmed = true;
            state.confirmationBlock = block.number;
            emit DefaultConfirmed(tokenAddress, block.number);
        }
    }

    // ─── Slashing ────────────────────────────────────────────────────

    /// @notice Destination for slashed attestor bonds. Defaults to owner() when unset;
    /// set to a treasury / insurance multisig so slashing isn't an owner-EOA windfall.
    address public treasury;
    event TreasuryUpdated(address indexed treasury);

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    /**
     * @notice Slash a fraudulent attestor — 100% bond confiscation, routed to the treasury.
     * @dev Bonds are denominated in the chain's native gas token (MNT on Mantle Sepolia).
     */
    function slashAttestor(address fraudulentAttestor, string calldata reason) external onlyOwner {
        Attestor storage att = attestors[fraudulentAttestor];
        require(att.status == AttestorStatus.ACTIVE, "TIR: not active");

        uint256 bondLost = att.bondMNT;
        att.bondMNT = 0;
        att.status = AttestorStatus.SLASHED;
        att.slashCount++;

        // Route the confiscated bond to the treasury (falls back to owner if unset).
        address dest = treasury == address(0) ? owner() : treasury;
        (bool sent, ) = dest.call{value: bondLost}("");
        require(sent, "TIR: slash transfer failed");

        emit AttestorSlashed(fraudulentAttestor, bondLost, reason);
    }

    // ─── Demo Helpers ────────────────────────────────────────────────

    /**
     * @notice DEMO ONLY — Force confirm default without waiting for 2-of-3
     */
    function forceConfirmDefault(address tokenAddress) external onlyOwner {
        DefaultConfirmationState storage state = defaultConfirmations[tokenAddress];
        state.isConfirmed = true;
        state.confirmationBlock = block.number;
        emit DefaultConfirmed(tokenAddress, block.number);
    }

    /**
     * @notice Reset default confirmation state for a token (demo/testing)
     */
    function resetDefaultConfirmation(address tokenAddress) external onlyOwner {
        delete defaultConfirmations[tokenAddress];
    }

    // ─── View Functions ──────────────────────────────────────────────

    function isDefaultConfirmed(address tokenAddress) external view returns (bool) {
        return defaultConfirmations[tokenAddress].isConfirmed;
    }

    function getAttestor(address wallet) external view returns (Attestor memory) {
        return attestors[wallet];
    }

    function isActiveAttestor(address wallet) external view returns (bool) {
        return attestors[wallet].status == AttestorStatus.ACTIVE;
    }

    function preRegistrationAge(address wallet) external view returns (uint256) {
        if (attestors[wallet].registrationTimestamp == 0) return 0;
        return (block.timestamp - attestors[wallet].registrationTimestamp) / 1 days;
    }

    function isFastTrackEligible(address custodian) external view returns (bool) {
        Attestor storage att = attestors[custodian];
        if (att.status != AttestorStatus.ACTIVE) return false;
        if (att.attestorType != AttestorType.CUSTODIAN) return false;
        return (block.timestamp - att.registrationTimestamp) >= 30 days;
    }

    function getDefaultConfirmation(address tokenAddress) external view returns (DefaultConfirmationState memory) {
        return defaultConfirmations[tokenAddress];
    }

    function getVoteCount(address tokenAddress) external view returns (uint8 custodian, uint8 legal, uint8 auditor) {
        DefaultConfirmationState storage s = defaultConfirmations[tokenAddress];
        custodian = s.custodianVoted ? 1 : 0;
        legal = s.legalVoted ? 1 : 0;
        auditor = s.auditorVoted ? 1 : 0;
    }

    /**
     * @notice Max pool TVL = 4 x sum of all 3 attestor bonds
     */
    function getMaxPoolTVL(
        address custodian,
        address legalRep,
        address auditor
    ) external view returns (uint256) {
        uint256 totalBonds = attestors[custodian].bondMNT +
                            attestors[legalRep].bondMNT +
                            attestors[auditor].bondMNT;
        return totalBonds * 4;
    }
}
