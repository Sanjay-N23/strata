// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title StrataTypes — shared data schema for the Strata AI underwriting layer
 * @notice Single source of truth for the issuer signal vector consumed identically
 *         by BOTH arms of the Turing benchmark:
 *           - the STATIC arm (IRSOracle.computeStaticScore, on-chain, pure)
 *           - the AI arm (off-chain agent -> StrataAIAgent.submitScore)
 *
 *         Score range 0..1000. Signals normalised 0..1000 unless noted.
 *
 *         DESIGN NOTE: the static arm intentionally IGNORES `offChainSentiment`.
 *         The rules-based "human" baseline is blind to soft signals; the AI agent
 *         uses them. That asymmetry is the mechanistic reason the AI flags distress
 *         earlier — and it is honest, auditable, and reproducible.
 */
struct IssuerSignals {
    uint16 navPunctuality;         // 0..1000  -> NAV dimension (max 250)
    uint16 attestationConsistency; // 0..1000  -> attestation dimension (max 250)
    uint16 repaymentReliability;   // 0..1000  -> repayment dimension (max 300)
    uint16 collateralRatioBps;     // 0..20000 -> collateral dimension (max 150)
    uint16 activityScore;          // 0..1000  -> activity dimension (max 50)
    uint16 offChainSentiment;      // 0..1000  -> AI-only (static arm ignores this)
    uint64 epoch;                  // replay/real epoch index
    bytes32 sourceHash;            // ties signal to the real dataset row (audit)
}
