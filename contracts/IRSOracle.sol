// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "./libraries/ABDKMath64x64.sol";
import "./strata/StrataTypes.sol";

/**
 * @title IRSOracle — Issuer Reputation Score Oracle
 * @notice Behavioral credit scoring (0-1000) for RWA issuers with 5 dimensions,
 *         exponential premium formula, TWAS cache, and Early Warning System.
 *
 *         Premium formula: premium_bps = 1600 × e^(-0.001386 × IRS)
 */
contract IRSOracle is Ownable2Step {
    // ─── Structs ─────────────────────────────────────────────────────
    struct ScoreComponents {
        uint256 navPunctuality;       // max 250
        uint256 attestationAccuracy;  // max 250
        uint256 repaymentHistory;     // max 300
        uint256 collateralHealth;     // max 150
        uint256 governanceActivity;   // max 50
        uint256 totalScore;           // max 1000
        uint256 lastUpdatedBlock;
    }

    struct TWASCache {
        uint256 cachedScore;
        uint256 lastUpdated;
        bool isStale;
    }

    struct EarlyWarningStat {
        uint256 lastDropAmount;
        uint256 lastDropBlock;
        bool ewsFired;
        uint256 ewsActivationBlock;
        uint256 score24hAgo;
        uint256 snapshot24hBlock;
    }

    // ─── Constants ───────────────────────────────────────────────────
    uint256 public constant MAX_SCORE = 1000;
    uint256 public constant MAX_NAV = 250;
    uint256 public constant MAX_ATTESTATION = 250;
    uint256 public constant MAX_REPAYMENT = 300;
    uint256 public constant MAX_COLLATERAL = 150;
    uint256 public constant MAX_ACTIVITY = 50;

    // EWS threshold: 50 points drop in 24h
    uint256 public constant EWS_DROP_THRESHOLD = 50;
    uint256 public constant BLOCKS_PER_24H = 28800; // ~3s per block on BSC

    // Premium formula constants (basis points)
    uint256 public constant MAX_PREMIUM_BPS = 1600; // 16% APR
    uint256 public constant MIN_PREMIUM_BPS = 400;  // 4% APR

    // Lambda for premium formula: 0.001386 (stored as fixed-point components)
    // lambda = ln(4) / 1000 ≈ 0.0013862944

    // ─── State ───────────────────────────────────────────────────────
    mapping(address => ScoreComponents) public scores;
    mapping(address => TWASCache) public twasCache;
    mapping(address => EarlyWarningStat) public ewsStats;
    mapping(address => uint256) public coverageRatios; // basis points

    address public insurancePool;
    address public payoutEngine;
    address public keeper;

    // ─── Strata AI arm ───────────────────────────────────────────────
    address public strataAgent;                 // StrataAIAgent, the only AI-score writer
    mapping(address => uint16) public aiScore;  // AI underwriter's score per issuer
    mapping(address => bool) public aiScored;   // whether an AI score has been set

    // ─── Events ──────────────────────────────────────────────────────
    event ScoreUpdated(address indexed tokenAddress, uint256 oldScore, uint256 newScore, string dimension);
    event EarlyWarningFired(address indexed tokenAddress, uint256 newScore, uint256 dropAmount, uint256 blockNumber);
    event EarlyWarningCleared(address indexed tokenAddress, uint256 restoredScore);
    event TWASCacheUpdated(address indexed tokenAddress, uint256 newTWAS, uint256 timestamp);
    event CoverageRatioUpdated(address indexed tokenAddress, uint256 newRatioBPS);
    event ScoreInitialized(address indexed tokenAddress, uint256 initialScore);
    event AIScoreSubmitted(address indexed tokenAddress, uint16 score);
    event StrataAgentUpdated(address indexed agent);

    // ─── Modifiers ───────────────────────────────────────────────────
    modifier onlyKeeper() {
        require(msg.sender == keeper || msg.sender == owner(), "IRSOracle: not keeper");
        _;
    }

    modifier onlyAgent() {
        require(msg.sender == strataAgent, "IRSOracle: not strata agent");
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────
    constructor() {}

    // ─── Admin Setters ───────────────────────────────────────────────
    function setInsurancePool(address _pool) external onlyOwner {
        insurancePool = _pool;
    }

    function setPayoutEngine(address _engine) external onlyOwner {
        payoutEngine = _engine;
    }

    function setKeeper(address _keeper) external onlyOwner {
        keeper = _keeper;
    }

    function setStrataAgent(address _agent) external onlyOwner {
        strataAgent = _agent;
        emit StrataAgentUpdated(_agent);
    }

    // ─── Score Initialization ────────────────────────────────────────

    /**
     * @notice Initialize IRS score for a newly activated issuer.
     * @param tokenAddress The RWA token
     * @param initialScore 600 for standard track, 650 for fast track
     */
    function initializeScore(address tokenAddress, uint256 initialScore) external onlyOwner {
        require(initialScore <= MAX_SCORE, "IRSOracle: score too high");
        require(scores[tokenAddress].lastUpdatedBlock == 0, "IRSOracle: already initialized");

        // Distribute initial score proportionally across dimensions
        scores[tokenAddress] = ScoreComponents({
            navPunctuality: (initialScore * MAX_NAV) / MAX_SCORE,
            attestationAccuracy: (initialScore * MAX_ATTESTATION) / MAX_SCORE,
            repaymentHistory: (initialScore * MAX_REPAYMENT) / MAX_SCORE,
            collateralHealth: (initialScore * MAX_COLLATERAL) / MAX_SCORE,
            governanceActivity: (initialScore * MAX_ACTIVITY) / MAX_SCORE,
            totalScore: initialScore,
            lastUpdatedBlock: block.number
        });

        // Initialize EWS snapshot
        ewsStats[tokenAddress] = EarlyWarningStat({
            lastDropAmount: 0,
            lastDropBlock: 0,
            ewsFired: false,
            ewsActivationBlock: 0,
            score24hAgo: initialScore,
            snapshot24hBlock: block.number
        });

        emit ScoreInitialized(tokenAddress, initialScore);
    }

    // ─── Score Update Functions ──────────────────────────────────────

    function recordNAVUpdate(address tokenAddress, bool isOnTime, uint256 daysLate) external onlyKeeper {
        ScoreComponents storage sc = scores[tokenAddress];
        uint256 oldScore = sc.totalScore;

        if (isOnTime) {
            sc.navPunctuality = _min(sc.navPunctuality + 5, MAX_NAV);
        } else if (daysLate <= 3) {
            sc.navPunctuality = _safeSub(sc.navPunctuality, 8);
        } else if (daysLate <= 7) {
            sc.navPunctuality = _safeSub(sc.navPunctuality, 15);
        } else {
            sc.navPunctuality = _safeSub(sc.navPunctuality, 25);
        }

        _recalcTotal(tokenAddress);
        _checkEWS(tokenAddress, oldScore);
        emit ScoreUpdated(tokenAddress, oldScore, sc.totalScore, "NAV");
    }

    function recordRepaymentEvent(address tokenAddress, bool isOnTime, uint256 daysLate) external onlyKeeper {
        ScoreComponents storage sc = scores[tokenAddress];
        uint256 oldScore = sc.totalScore;

        if (isOnTime) {
            sc.repaymentHistory = _min(sc.repaymentHistory + 15, MAX_REPAYMENT);
        } else if (daysLate <= 14) {
            sc.repaymentHistory = _safeSub(sc.repaymentHistory, 20);
        } else if (daysLate <= 30) {
            sc.repaymentHistory = _safeSub(sc.repaymentHistory, 40);
        } else {
            sc.repaymentHistory = _safeSub(sc.repaymentHistory, 80);
        }

        _recalcTotal(tokenAddress);
        _checkEWS(tokenAddress, oldScore);
        emit ScoreUpdated(tokenAddress, oldScore, sc.totalScore, "REPAYMENT");
    }

    function recordCollateralHealth(address tokenAddress, uint256 collateralRatioBPS) external onlyKeeper {
        ScoreComponents storage sc = scores[tokenAddress];
        uint256 oldScore = sc.totalScore;

        if (collateralRatioBPS > 10000) {
            sc.collateralHealth = _min(sc.collateralHealth + 2, MAX_COLLATERAL);
        } else if (collateralRatioBPS >= 9000) {
            // 90-100%: no change
        } else if (collateralRatioBPS >= 8000) {
            sc.collateralHealth = _safeSub(sc.collateralHealth, 5);
        } else if (collateralRatioBPS >= 7000) {
            sc.collateralHealth = _safeSub(sc.collateralHealth, 15);
        } else {
            sc.collateralHealth = _safeSub(sc.collateralHealth, 30);
        }

        _recalcTotal(tokenAddress);
        _checkEWS(tokenAddress, oldScore);
        emit ScoreUpdated(tokenAddress, oldScore, sc.totalScore, "COLLATERAL");
    }

    function recordAttestationDispute(address tokenAddress, bool resolvedAgainstIssuer) external onlyKeeper {
        ScoreComponents storage sc = scores[tokenAddress];
        uint256 oldScore = sc.totalScore;

        if (resolvedAgainstIssuer) {
            sc.attestationAccuracy = _safeSub(sc.attestationAccuracy, 30);
        } else {
            sc.attestationAccuracy = _safeSub(sc.attestationAccuracy, 10);
        }

        _recalcTotal(tokenAddress);
        _checkEWS(tokenAddress, oldScore);
        emit ScoreUpdated(tokenAddress, oldScore, sc.totalScore, "ATTESTATION");
    }

    function recordActivity(address tokenAddress) external onlyKeeper {
        ScoreComponents storage sc = scores[tokenAddress];
        uint256 oldScore = sc.totalScore;
        sc.governanceActivity = _min(sc.governanceActivity + 2, MAX_ACTIVITY);

        _recalcTotal(tokenAddress);
        emit ScoreUpdated(tokenAddress, oldScore, sc.totalScore, "ACTIVITY");
    }

    // ─── Premium Formula ─────────────────────────────────────────────

    /**
     * @notice Calculate premium rate in basis points using exponential formula.
     *         premium_bps = 1600 × e^(-0.001386 × IRS)
     * @return premiumBPS Premium rate in basis points (400-1600)
     */
    function getPremiumRateBPS(address tokenAddress) external view returns (uint256 premiumBPS) {
        return staticPremiumBps(scores[tokenAddress].totalScore);
    }

    /**
     * @notice Pure premium formula: premium_bps = 1600 × e^(-0.001386 × score),
     *         clamped to [400, 1600]. This is the STATIC ("human rulebook") arm
     *         of the Strata Turing benchmark.
     */
    function staticPremiumBps(uint256 score) public pure returns (uint256 premiumBPS) {
        if (score == 0) return MAX_PREMIUM_BPS;
        if (score >= MAX_SCORE) return MIN_PREMIUM_BPS;

        // -lambda × score = -(ln(4)/1000) × score = -1386 × score / 1000000 (fixed point)
        int128 negLambdaIRS = ABDKMath64x64.mul(
            ABDKMath64x64.fromInt(-1386),
            ABDKMath64x64.divu(score, 1000000)
        );
        int128 expResult = ABDKMath64x64.exp(negLambdaIRS);
        premiumBPS = ABDKMath64x64.mulu(expResult, MAX_PREMIUM_BPS);

        if (premiumBPS < MIN_PREMIUM_BPS) premiumBPS = MIN_PREMIUM_BPS;
        if (premiumBPS > MAX_PREMIUM_BPS) premiumBPS = MAX_PREMIUM_BPS;
    }

    // ─── Strata: Static Arm (pure score from raw signals) ────────────

    /**
     * @notice Deterministic on-chain "human rulebook" score from raw issuer signals.
     *         Maps 5 signals to weighted dimensions (250/250/300/150/50), capped 1000.
     *         Intentionally IGNORES offChainSentiment — the static rulebook is blind to
     *         soft signals; the AI agent uses them, which is why the AI flags earlier.
     */
    function computeStaticScore(IssuerSignals memory s) public pure returns (uint16) {
        uint256 nav = (uint256(s.navPunctuality) * MAX_NAV) / 1000;
        uint256 att = (uint256(s.attestationConsistency) * MAX_ATTESTATION) / 1000;
        uint256 rep = (uint256(s.repaymentReliability) * MAX_REPAYMENT) / 1000;
        uint256 colRatio = s.collateralRatioBps > 10000 ? 10000 : uint256(s.collateralRatioBps);
        uint256 col = (colRatio * MAX_COLLATERAL) / 10000;
        uint256 act = (uint256(s.activityScore) * MAX_ACTIVITY) / 1000;
        uint256 total = nav + att + rep + col + act;
        if (total > MAX_SCORE) total = MAX_SCORE;
        return uint16(total);
    }

    // ─── Strata: AI Arm (agent-submitted score) ──────────────────────

    /**
     * @notice AI underwriter writes its score. Causally drives the effective premium.
     *         Restricted to the StrataAIAgent contract.
     */
    function setAIScore(address tokenAddress, uint16 score) external onlyAgent {
        require(score <= MAX_SCORE, "IRSOracle: score too high");
        aiScore[tokenAddress] = score;
        aiScored[tokenAddress] = true;
        emit AIScoreSubmitted(tokenAddress, score);
    }

    function getAIScore(address tokenAddress) external view returns (uint16) {
        return aiScore[tokenAddress];
    }

    /**
     * @notice Effective premium charged: uses the AI score when present, else static.
     */
    function getEffectivePremiumBPS(address tokenAddress) external view returns (uint256) {
        if (aiScored[tokenAddress]) {
            return staticPremiumBps(aiScore[tokenAddress]);
        }
        return staticPremiumBps(scores[tokenAddress].totalScore);
    }

    // ─── Oracle Getters ──────────────────────────────────────────────

    function getScore(address tokenAddress) external view returns (uint256) {
        return scores[tokenAddress].totalScore;
    }

    function getTWAS(address tokenAddress) external view returns (uint256) {
        TWASCache storage cache = twasCache[tokenAddress];
        if (cache.lastUpdated == 0 || block.timestamp - cache.lastUpdated > 2 hours) {
            return scores[tokenAddress].totalScore; // fallback to real-time
        }
        return cache.cachedScore;
    }

    function getCoverageRatio(address tokenAddress) external view returns (uint256) {
        return coverageRatios[tokenAddress];
    }

    function getComponents(address tokenAddress) external view returns (ScoreComponents memory) {
        return scores[tokenAddress];
    }

    // ─── TWAS + Coverage Updates ─────────────────────────────────────

    function updateTWASCache(address tokenAddress, uint256 computedTWAS) external onlyKeeper {
        twasCache[tokenAddress] = TWASCache({
            cachedScore: computedTWAS,
            lastUpdated: block.timestamp,
            isStale: false
        });
        emit TWASCacheUpdated(tokenAddress, computedTWAS, block.timestamp);
    }

    function updateCoverageRatio(address tokenAddress, uint256 newRatioBPS) external {
        require(msg.sender == insurancePool || msg.sender == owner(), "IRSOracle: unauthorized");
        coverageRatios[tokenAddress] = newRatioBPS;
        emit CoverageRatioUpdated(tokenAddress, newRatioBPS);
    }

    // ─── Demo Helpers ────────────────────────────────────────────────

    function setScoreForTest(address tokenAddress, uint256 score) external onlyOwner {
        require(score <= MAX_SCORE, "IRSOracle: score too high");
        scores[tokenAddress].totalScore = score;
        scores[tokenAddress].lastUpdatedBlock = block.number;
    }

    function setScoreToZero(address tokenAddress) external {
        require(msg.sender == owner() || msg.sender == insurancePool || msg.sender == payoutEngine, "IRSOracle: unauthorized");
        scores[tokenAddress].totalScore = 0;
        scores[tokenAddress].navPunctuality = 0;
        scores[tokenAddress].attestationAccuracy = 0;
        scores[tokenAddress].repaymentHistory = 0;
        scores[tokenAddress].collateralHealth = 0;
        scores[tokenAddress].governanceActivity = 0;
        scores[tokenAddress].lastUpdatedBlock = block.number;
    }

    // ─── Internal ────────────────────────────────────────────────────

    function _recalcTotal(address tokenAddress) internal {
        ScoreComponents storage sc = scores[tokenAddress];
        sc.totalScore = sc.navPunctuality + sc.attestationAccuracy +
                       sc.repaymentHistory + sc.collateralHealth +
                       sc.governanceActivity;
        if (sc.totalScore > MAX_SCORE) sc.totalScore = MAX_SCORE;
        sc.lastUpdatedBlock = block.number;
    }

    function _checkEWS(address tokenAddress, uint256 oldScore) internal {
        ScoreComponents storage sc = scores[tokenAddress];
        EarlyWarningStat storage ews = ewsStats[tokenAddress];

        // Update 24h snapshot if stale
        if (block.number - ews.snapshot24hBlock >= BLOCKS_PER_24H) {
            ews.score24hAgo = oldScore;
            ews.snapshot24hBlock = block.number;
        }

        // Check drop from 24h ago
        if (ews.score24hAgo > sc.totalScore) {
            uint256 drop = ews.score24hAgo - sc.totalScore;
            if (drop >= EWS_DROP_THRESHOLD && !ews.ewsFired) {
                ews.ewsFired = true;
                ews.ewsActivationBlock = block.number;
                ews.lastDropAmount = drop;
                ews.lastDropBlock = block.number;
                emit EarlyWarningFired(tokenAddress, sc.totalScore, drop, block.number);
            }
        }
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    function _safeSub(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a - b : 0;
    }
}
