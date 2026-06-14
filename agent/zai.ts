/**
 * Z.AI GLM-4.6 client — the REASONING half of the hybrid underwriter.
 *
 * The SCORE is produced deterministically by pdModel.ts. The LLM's job is to write
 * the human-readable credit memo that justifies the call (this is what a judge sees
 * in the console). Determinism for reproducibility: temperature 0, fixed seed, pinned
 * model id. If no API key is present, we fall back to the deterministic pdModel
 * rationale so the agent still runs offline.
 *
 * Z.AI exposes an OpenAI-compatible Chat Completions endpoint.
 */
import type { PdResult, Signals } from "./pdModel";

const SEED = 42;

const SYSTEM_PROMPT =
  "You are a senior RWA credit underwriter at Strata. Given an issuer's on-chain " +
  "signals and a model score, write a concise 2-3 sentence credit memo that justifies " +
  "the risk call. Name the dominant driver explicitly (e.g. collateral, market " +
  "sentiment, repayment). Be decisive and specific. Do not restate every number.";

export async function creditMemo(signals: Signals, pd: PdResult): Promise<string> {
  const key = process.env.ZAI_API_KEY;
  if (!key) return pd.rationale; // deterministic offline fallback

  // Read endpoint config at call time so .env overrides (loaded by dotenv.config()
  // in index.ts) reliably apply.
  const base = process.env.ZAI_BASE_URL || "https://api.z.ai/api/paas/v4";
  const model = process.env.ZAI_MODEL || "glm-4.6";

  const user = JSON.stringify({
    signals,
    modelScore: pd.score,
    pdBps: pd.pdBps,
    driver: pd.driver,
  });

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        top_p: 1,
        seed: SEED,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) return pd.rationale;
    const j: any = await res.json();
    const text: string | undefined = j?.choices?.[0]?.message?.content;
    return text ? text.trim() : pd.rationale;
  } catch {
    return pd.rationale; // network/API failure -> deterministic fallback
  }
}

/**
 * LLM as a LOAD-BEARING input (not just prose): GLM-4.6 returns a SMALL bounded
 * adjustment to the deterministic model score based on soft/qualitative factors.
 * index.ts blends this into the on-chain score, so removing the LLM changes the
 * on-chain decision. Determinism is preserved (temp 0 / seed 42 / pinned model);
 * with no API key the advisory is a strict no-op {0,0} so offline runs, tests, and
 * the benchmark stay reproducible.
 */
export interface ScoreAdvisory {
  adjustment: number; // integer, -50..50 (negative = riskier)
  confidence: number; // 0..1
}

const ADVISORY_SYSTEM =
  "You are a senior RWA credit underwriter at Strata. Given an issuer's on-chain signals " +
  "and a deterministic model score (0..1000, higher = safer), decide whether soft/qualitative " +
  "factors justify a SMALL adjustment to that score. Respond ONLY with strict JSON: " +
  '{"adjustment": <integer between -50 and 50, negative = riskier>, "confidence": <number 0..1>}. ' +
  "Keep |adjustment| small — the model already captures the fundamentals.";

export async function scoreAdvisory(signals: Signals, pd: PdResult): Promise<ScoreAdvisory> {
  const key = process.env.ZAI_API_KEY;
  if (!key) return { adjustment: 0, confidence: 0 }; // deterministic offline no-op

  const base = process.env.ZAI_BASE_URL || "https://api.z.ai/api/paas/v4";
  const model = process.env.ZAI_MODEL || "glm-4.6";
  const user = JSON.stringify({ signals, modelScore: pd.score, pdBps: pd.pdBps, driver: pd.driver });

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        top_p: 1,
        seed: SEED,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: ADVISORY_SYSTEM },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) return { adjustment: 0, confidence: 0 };
    const j: any = await res.json();
    const text: string | undefined = j?.choices?.[0]?.message?.content;
    if (!text) return { adjustment: 0, confidence: 0 };
    const parsed = JSON.parse(text);
    return {
      adjustment: Math.round(Number(parsed.adjustment) || 0),
      confidence: Number(parsed.confidence) || 0,
    };
  } catch {
    return { adjustment: 0, confidence: 0 }; // any failure -> deterministic no-op
  }
}
