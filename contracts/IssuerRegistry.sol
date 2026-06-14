// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface ITIREligibility {
    function isFastTrackEligible(address custodian) external view returns (bool);
}

/**
 * @title IssuerRegistry — Issuer Lifecycle State Machine
 * @notice Central registry for RWA token issuers. Manages lifecycle:
 *         OBSERVATION → ACTIVE → MONITORING → DEFAULTED → WIND_DOWN → CLOSED
 *         Supports two-tier onboarding: Standard (60d) and Fast Track (14d).
 */
contract IssuerRegistry is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Enums ───────────────────────────────────────────────────────
    enum IssuerStatus { OBSERVATION, ACTIVE, MONITORING, DEFAULTED, WIND_DOWN, CLOSED }

    // ─── Structs ─────────────────────────────────────────────────────
    struct IssuerProfile {
        address tokenAddress;
        IssuerStatus status;
        uint256 registrationBlock;
        uint256 observationEndBlock;
        uint256 attestationCount;
        bool fastTrack;
        address issuerEOA;
        address custodianAttestor;
        address legalAttestor;
        address auditorAttestor;
        uint256 marketCapAtRegistration;
        bytes32 legalEntityHash;
    }

    struct WindDownRecord {
        uint256 deadline;
        uint64 custodianAttestUID;
        uint64 legalAttestUID;
        bool challenged;
        address challenger;
        uint256 challengeBond;
    }

    // ─── Constants & Configurables ──────────────────────────────────
    /// @notice Blocks-per-day estimate. Settable by owner because L2 block
    ///         times can change. Defaults to ~3s/block on HashKey Chain.
    uint256 public blocksPerDay = 28800;
    uint256 public constant STANDARD_OBSERVATION = 60;  // days
    uint256 public constant FAST_OBSERVATION = 14;      // days
    uint256 public constant STANDARD_ATTESTATIONS = 3;
    uint256 public constant FAST_ATTESTATIONS = 2;
    uint256 public constant STANDARD_INITIAL_IRS = 600;
    uint256 public constant FAST_INITIAL_IRS = 650;
    uint256 public constant WIND_DOWN_PERIOD = 30 days;
    uint256 public constant CHALLENGE_BOND_BPS = 200;   // 2%

    // ─── State ───────────────────────────────────────────────────────
    mapping(address => IssuerProfile) public issuers;       // tokenAddress => profile
    event TIRUpdated(address indexed tir);
    event IssuerReassigned(address indexed tokenAddress, address indexed newIssuerEOA);
    /// @notice Opt-in fast-track eligibility gate (default OFF so existing flows are unaffected).
    bool public fastTrackGate;
    event FastTrackGateSet(bool enabled);
    mapping(address => WindDownRecord) public windDowns;
    mapping(address => address) public issuerOfToken;       // tokenAddress => issuerEOA

    address public tir;
    address public issuerBond;
    address public irsOracle;
    address public defaultOracle;
    address public insurancePool;
    address public payoutEngine;

    // ─── Events ──────────────────────────────────────────────────────
    event IssuerRegistered(address indexed tokenAddress, address indexed issuerEOA, bool fastTrack, uint256 observationEndBlock);
    event CoverageActivated(address indexed tokenAddress, uint256 initialIRS, uint256 activationBlock);
    event StatusChanged(address indexed tokenAddress, IssuerStatus newStatus);
    event WindDownInitiated(address indexed tokenAddress, uint256 deadline);
    event WindDownChallenged(address indexed tokenAddress, address indexed challenger, uint256 challengeBond);
    event WindDownComplete(address indexed tokenAddress, uint256 bondReturned, uint256 protocolFee);
    event AttestationRecorded(address indexed tokenAddress, uint256 newAttestationCount);

    // ─── Constructor ─────────────────────────────────────────────────
    constructor(
        address _tir,
        address _issuerBond,
        address _irsOracle,
        address _defaultOracle
    ) {
        tir = _tir;
        issuerBond = _issuerBond;
        irsOracle = _irsOracle;
        defaultOracle = _defaultOracle;
    }

    // ─── Admin Setters ───────────────────────────────────────────────
    function setInsurancePool(address _pool) external onlyOwner {
        insurancePool = _pool;
    }

    function setPayoutEngine(address _engine) external onlyOwner {
        payoutEngine = _engine;
    }

    /// @notice Update the blocks-per-day estimate. Required if HashKey Chain
    ///         changes its block time. Affects observation/wind-down timing
    ///         only for issuers registered AFTER the change.
    function setBlocksPerDay(uint256 _blocksPerDay) external onlyOwner {
        require(_blocksPerDay > 0, "IssuerRegistry: zero bpd");
        blocksPerDay = _blocksPerDay;
    }

    // ─── Registration ────────────────────────────────────────────────

    /**
     * @notice Register a new RWA token issuer. Starts observation period.
     */
    /// @notice Update the TIR used for fast-track eligibility checks (owner-only).
    function setTIR(address _tir) external onlyOwner {
        tir = _tir;
        emit TIRUpdated(_tir);
    }

    /// @notice Enable/disable the fast-track eligibility gate (owner-only; default OFF).
    function setFastTrackGate(bool enabled) external onlyOwner {
        fastTrackGate = enabled;
        emit FastTrackGateSet(enabled);
    }

    function register(
        address tokenAddress,
        uint64 basLegalAttestUID,
        address custodian,
        address legalRep,
        address auditor,
        uint256 marketCap,
        bool useFastTrack
    ) external {
        require(issuers[tokenAddress].registrationBlock == 0, "IssuerRegistry: already registered");
        require(tokenAddress != address(0), "IssuerRegistry: zero token");

        uint256 observationDays = STANDARD_OBSERVATION;
        if (useFastTrack) {
            // Fast-track eligibility gate (opt-in via setFastTrackGate; implements the check
            // the original code only promised in a comment). Default OFF so existing flows
            // are unaffected; production enables it once a real TIR is wired.
            if (fastTrackGate) {
                require(
                    tir != address(0) && ITIREligibility(tir).isFastTrackEligible(custodian),
                    "IssuerRegistry: custodian not fast-track eligible"
                );
            }
            observationDays = FAST_OBSERVATION;
        }

        uint256 observationEndBlock = block.number + (observationDays * blocksPerDay);

        issuers[tokenAddress] = IssuerProfile({
            tokenAddress: tokenAddress,
            status: IssuerStatus.OBSERVATION,
            registrationBlock: block.number,
            observationEndBlock: observationEndBlock,
            attestationCount: 0,
            fastTrack: useFastTrack,
            issuerEOA: msg.sender,
            custodianAttestor: custodian,
            legalAttestor: legalRep,
            auditorAttestor: auditor,
            marketCapAtRegistration: marketCap,
            legalEntityHash: keccak256(abi.encodePacked(basLegalAttestUID))
        });

        issuerOfToken[tokenAddress] = msg.sender;

        emit IssuerRegistered(tokenAddress, msg.sender, useFastTrack, observationEndBlock);
    }

    /// @notice Anti-squat remediation: the owner reassigns a registration's issuer EOA, e.g.
    ///         if a token address was front-run/squatted by a non-issuer before the real
    ///         issuer could register (register() reverts on an already-registered token).
    function reassignIssuer(address tokenAddress, address newIssuerEOA) external onlyOwner {
        require(issuers[tokenAddress].registrationBlock != 0, "IssuerRegistry: not registered");
        require(newIssuerEOA != address(0), "IssuerRegistry: zero EOA");
        issuers[tokenAddress].issuerEOA = newIssuerEOA;
        issuerOfToken[tokenAddress] = newIssuerEOA;
        emit IssuerReassigned(tokenAddress, newIssuerEOA);
    }

    /**
     * @notice Record an attestation during observation period.
     */
    function recordAttestation(address tokenAddress) external onlyOwner {
        IssuerProfile storage profile = issuers[tokenAddress];
        require(profile.status == IssuerStatus.OBSERVATION, "IssuerRegistry: not in observation");
        profile.attestationCount++;
        emit AttestationRecorded(tokenAddress, profile.attestationCount);
    }

    /**
     * @notice Activate coverage after observation requirements are met.
     */
    function tryActivateCoverage(address tokenAddress) external {
        IssuerProfile storage profile = issuers[tokenAddress];
        require(profile.status == IssuerStatus.OBSERVATION, "IssuerRegistry: not in observation");
        require(block.number >= profile.observationEndBlock, "IssuerRegistry: observation not ended");

        uint256 requiredAttestations = profile.fastTrack ? FAST_ATTESTATIONS : STANDARD_ATTESTATIONS;
        require(profile.attestationCount >= requiredAttestations, "IssuerRegistry: insufficient attestations");

        profile.status = IssuerStatus.ACTIVE;
        uint256 initialIRS = profile.fastTrack ? FAST_INITIAL_IRS : STANDARD_INITIAL_IRS;

        emit CoverageActivated(tokenAddress, initialIRS, block.number);
        emit StatusChanged(tokenAddress, IssuerStatus.ACTIVE);
    }

    // ─── Wind-Down ───────────────────────────────────────────────────

    function initiateWindDown(
        address tokenAddress,
        uint64 custodianAttestUID,
        uint64 legalAttestUID
    ) external {
        IssuerProfile storage profile = issuers[tokenAddress];
        require(msg.sender == profile.issuerEOA, "IssuerRegistry: not issuer");
        require(profile.status == IssuerStatus.ACTIVE, "IssuerRegistry: not active");

        profile.status = IssuerStatus.WIND_DOWN;
        windDowns[tokenAddress] = WindDownRecord({
            deadline: block.timestamp + WIND_DOWN_PERIOD,
            custodianAttestUID: custodianAttestUID,
            legalAttestUID: legalAttestUID,
            challenged: false,
            challenger: address(0),
            challengeBond: 0
        });

        emit WindDownInitiated(tokenAddress, block.timestamp + WIND_DOWN_PERIOD);
        emit StatusChanged(tokenAddress, IssuerStatus.WIND_DOWN);
    }

    function finalizeWindDown(address tokenAddress) external nonReentrant {
        IssuerProfile storage profile = issuers[tokenAddress];
        require(profile.status == IssuerStatus.WIND_DOWN, "IssuerRegistry: not winding down");

        WindDownRecord storage wd = windDowns[tokenAddress];
        require(block.timestamp >= wd.deadline, "IssuerRegistry: challenge window open");
        require(!wd.challenged, "IssuerRegistry: challenged");

        profile.status = IssuerStatus.CLOSED;

        // Interface to release bond
        // IssuerBond(issuerBond).release(tokenAddress, profile.issuerEOA);

        emit StatusChanged(tokenAddress, IssuerStatus.CLOSED);
    }

    // ─── Status Updates ──────────────────────────────────────────────

    function setMonitoring(address tokenAddress) external {
        require(msg.sender == defaultOracle || msg.sender == owner(), "IssuerRegistry: unauthorized");
        IssuerProfile storage profile = issuers[tokenAddress];
        require(profile.status == IssuerStatus.ACTIVE, "IssuerRegistry: not active");
        profile.status = IssuerStatus.MONITORING;
        emit StatusChanged(tokenAddress, IssuerStatus.MONITORING);
    }

    function setDefaulted(address tokenAddress) external {
        require(msg.sender == defaultOracle || msg.sender == payoutEngine || msg.sender == owner(), "IssuerRegistry: unauthorized");
        issuers[tokenAddress].status = IssuerStatus.DEFAULTED;
        emit StatusChanged(tokenAddress, IssuerStatus.DEFAULTED);
    }

    // ─── Demo Helpers ────────────────────────────────────────────────

    /**
     * @notice DEMO ONLY — Force activate coverage skipping time/attestation checks
     */
    function forceActivateForDemo(address tokenAddress) external onlyOwner {
        IssuerProfile storage profile = issuers[tokenAddress];
        require(profile.registrationBlock > 0, "IssuerRegistry: not registered");
        profile.status = IssuerStatus.ACTIVE;
        emit CoverageActivated(tokenAddress, STANDARD_INITIAL_IRS, block.number);
        emit StatusChanged(tokenAddress, IssuerStatus.ACTIVE);
    }

    // ─── View Functions ──────────────────────────────────────────────

    function getProfile(address tokenAddress) external view returns (IssuerProfile memory) {
        return issuers[tokenAddress];
    }

    function isActive(address tokenAddress) external view returns (bool) {
        return issuers[tokenAddress].status == IssuerStatus.ACTIVE;
    }

    function isDefaulted(address tokenAddress) external view returns (bool) {
        return issuers[tokenAddress].status == IssuerStatus.DEFAULTED;
    }

    function getStatus(address tokenAddress) external view returns (IssuerStatus) {
        return issuers[tokenAddress].status;
    }

    function getIssuerEOA(address tokenAddress) external view returns (address) {
        return issuers[tokenAddress].issuerEOA;
    }
}
