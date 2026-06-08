/**
 * Strata PD model — deterministic credit scorecard.
 *
 * This is the QUANT half of the hybrid AI underwriter: it produces the number
 * (score 0..1000 and probability-of-default in bps). The LLM half (zai.ts)
 * produces the human-readable credit memo. Keeping the score deterministic is
 * what makes the on-chain benchmark reproducible (rebuts "one lucky run").
 *
 * Weighting is a transparent scorecard calibrated to credit intuition:
 *   - a fundamentals blend (nav / attestation / repayment / collateral / sentiment)
 *   - PLUS a sentiment-driven distress override: when market confidence collapses,
 *     a real credit desk treats the name as distressed NOW rather than waiting for
 *     the lagging operational metrics to confirm. THIS is why the AI flags earlier
 *     than the static rulebook (which is blind to sentiment by construction).
 */

export interface Signals {
  navPunctuality: number;         // 0..1000
  attestationConsistency: number; // 0..1000
  repaymentReliability: number;   // 0..1000
  collateralRatioBps: number;     // 0..20000 (10000 = 100%)
  activityScore: number;          // 0..1000
  offChainSentiment: number;      // 0..1000
  epoch: number;
}

export interface PdResult {
  score: number;   // 0..1000
  pdBps: number;   // 0..10000
  rationale: string;
  driver: string;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const norm = (x: number) => clamp(x / 1000, 0, 1);

// Distress override thresholds (sentiment, normalised 0..1)
const ACUTE_FEAR = 0.35;   // below this -> confidence-collapse override
const ELEVATED_FEAR = 0.60; // below this -> caution haircut
const DISTRESS_CAP = 250;   // override score ceiling (below the 300 alarm line)

export function scoreIssuer(s: Signals): PdResult {
  const col = clamp(s.collateralRatioBps, 0, 10000) / 10000;
  const sent = norm(s.offChainSentiment);

  // Fundamentals blend (the "everything looks fine on paper" view).
  const base =
    1000 *
    (0.25 * norm(s.navPunctuality) +
      0.15 * norm(s.attestationConsistency) +
      0.15 * norm(s.repaymentReliability) +
      0.20 * col +
      0.25 * sent);

  let score: number;
  let driver: string;

  if (sent < ACUTE_FEAR) {
    // Market confidence has collapsed -> declare distress regardless of lagging metrics.
    score = Math.min(base, DISTRESS_CAP);
    driver = "acute confidence collapse (sentiment) → distress override";
  } else if (sent < ELEVATED_FEAR) {
    score = base * (0.5 + 0.5 * sent);
    driver = "elevated market fear → caution haircut";
  } else {
    score = base;
    driver = "fundamentals-driven (calm market)";
  }

  score = Math.round(clamp(score, 0, 1000));
  const pdBps = Math.round(10000 * (1 - score / 1000)); // monotone PD from score

  const rationale =
    `Strata score ${score}/1000, PD ${(pdBps / 100).toFixed(1)}%. ` +
    `Inputs: collateral ${(col * 100).toFixed(0)}%, sentiment ${s.offChainSentiment}/1000, ` +
    `nav ${s.navPunctuality}, attestation ${s.attestationConsistency}, repayment ${s.repaymentReliability}. ` +
    `Driver: ${driver}.`;

  return { score, pdBps, rationale, driver };
}

// Convenience for the benchmark/agent: thresholds shared with the contracts.
export const ALARM_THRESHOLD = 300;       // matches TuringBenchmark.ALARM_THRESHOLD
export const DEFAULT_PROPOSE_PD = 6000;   // pd>6000 bps -> proposeDefault
export const DEFAULT_PROPOSE_SCORE = 200; // score<200 -> proposeDefault
