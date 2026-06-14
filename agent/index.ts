/**
 * Strata AI Underwriter — autonomous agent loop.
 *
 * Continuously re-underwrites an issuer over the replay timeline:
 *   perceive (signals) -> reason (Z.AI memo) -> score (pdModel) -> ACT on-chain
 *   (submitScore = causal reprice; benchmark.record; proposeDefault on distress).
 *
 * Run (local demo):  NETWORK=localhost ISSUER_ADDRESS=0x... npx ts-node agent/index.ts
 * Run (testnet):     NETWORK=mantleSepolia ISSUER_ADDRESS=0x... npx ts-node agent/index.ts
 *
 * Env: DEPLOYER_PRIVATE_KEY (operator), ISSUER_ADDRESS, optional ZAI_API_KEY,
 *      RPC_URL, NETWORK, ZAI_MODEL.
 */
import * as dotenv from "dotenv";
dotenv.config();

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { getContracts } from "./chain";
import {
  scoreIssuer,
  DEFAULT_PROPOSE_PD,
  DEFAULT_PROPOSE_SCORE,
  type Signals,
} from "./pdModel";
import { creditMemo, scoreAdvisory } from "./zai";

/**
 * Per-epoch decision logic (pure, unit-testable).
 *   earlyWarning: AI score dropped >= 50 vs the previous epoch
 *   propose:      distress trigger (pd > PD threshold OR score < score threshold)
 * The loop owns the once-only `proposed` guard; this returns the raw conditions.
 */
export function decideActions(
  prevScore: number | null,
  pd: { score: number; pdBps: number }
): { earlyWarning: boolean; propose: boolean } {
  const earlyWarning = prevScore !== null && prevScore - pd.score >= 50;
  const propose = pd.pdBps > DEFAULT_PROPOSE_PD || pd.score < DEFAULT_PROPOSE_SCORE;
  return { earlyWarning, propose };
}

/**
 * Blend the LLM's bounded advisory into the deterministic PD score (pure, tested).
 * The LLM is load-bearing: a non-zero advisory changes the on-chain score. Offline
 * (adjustment 0 / confidence 0) it returns pdScore unchanged, so runs stay reproducible.
 */
export function blendScore(pdScore: number, adjustment: number, confidence: number): number {
  const adj = Math.max(-50, Math.min(50, Math.round(adjustment)));
  const conf = Math.max(0, Math.min(1, confidence));
  return Math.max(0, Math.min(1000, Math.round(pdScore + adj * conf)));
}

/** Monotone PD (bps) from a 0..1000 score — same mapping as pdModel. */
export const pdFromScore = (score: number): number => Math.round(10000 * (1 - score / 1000));

/** Retry an on-chain action with exponential backoff (flaky public RPC resilience). */
async function withRetry<T>(label: string, fn: () => Promise<T>, tries = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const ms = 500 * 2 ** i;
      console.log(`   ⏳ ${label} failed (try ${i + 1}/${tries}) — backoff ${ms}ms`);
      await new Promise((r) => setTimeout(r, ms));
    }
  }
  throw lastErr;
}

export async function main() {
  const issuer = process.env.ISSUER_ADDRESS;
  if (!issuer) throw new Error("Set ISSUER_ADDRESS (the RWA token / issuer key).");

  const { agent, oracle, replay, bench, signer, network } = getContracts();
  console.log(`Strata agent operator ${await signer.getAddress()} on ${network}`);

  const dataset = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", "usdc_svb.json"), "utf8")
  );
  console.log(`Replaying: ${dataset.issuerLabel}\n`);

  let prevScore: number | null = null;
  let proposed = false;

  for (const r of dataset.epochs) {
    // Perceive — respect the human guard: a guardian pause halts the agent mid-run.
    if (await agent.paused()) {
      console.log(`⏸  guardian paused the agent — halting before epoch ${r.epoch}`);
      break;
    }

    const sig = {
      navPunctuality: r.navPunctuality,
      attestationConsistency: r.attestationConsistency,
      repaymentReliability: r.repaymentReliability,
      collateralRatioBps: r.collateralRatioBps,
      activityScore: r.activityScore,
      offChainSentiment: r.offChainSentiment,
      epoch: r.epoch,
      sourceHash: ethers.id(`usdc-svb-${r.epoch}`),
    };

    // Perceive — feed identical signals on-chain (both arms read these)
    await withRetry("pushSignals", async () => (await replay.pushSignals(issuer, sig)).wait());
    const staticScore = Number(await oracle.computeStaticScore(sig));

    // Score (deterministic quant) + Reason (LLM memo) + LLM advisory (load-bearing)
    const pd = scoreIssuer(sig as unknown as Signals);
    const memo = await creditMemo(sig as unknown as Signals, pd);
    const adv = await scoreAdvisory(sig as unknown as Signals, pd); // {0,0} offline → no-op
    const aiScore = blendScore(pd.score, adv.adjustment, adv.confidence);
    const aiPdBps = pdFromScore(aiScore);
    const rationaleHash = ethers.id(memo);

    // Act — GREEN: causal reprice + benchmark record. recordFromReplay re-derives the
    // static arm ON-CHAIN from the signals just pushed (computeStaticScore over
    // signalsAt), so the rules-based baseline is contract-computed, not hand-fed.
    await withRetry("submitScore", async () => (await agent.submitScore(issuer, aiScore, aiPdBps, rationaleHash, r.epoch)).wait());
    await withRetry("recordFromReplay", async () => (await bench.recordFromReplay(issuer, r.epoch, aiScore, aiPdBps)).wait());

    // Perceive — read back the on-chain effect of our own action (verify the write landed).
    const observed = await agent.latestScore(issuer);
    if (Number(observed.score) !== aiScore) {
      console.log(`   ⚠️ on-chain score ${observed.score} != submitted ${aiScore}`);
    }

    const { earlyWarning, propose } = decideActions(prevScore, { score: aiScore, pdBps: aiPdBps });

    // GREEN: early warning on a sharp drop
    if (earlyWarning) {
      await withRetry("flagEarlyWarning", async () => (await agent.flagEarlyWarning(issuer, 1, rationaleHash, r.epoch)).wait());
    }

    // RED: propose default once on distress (humans confirm via TIR 2-of-3)
    if (!proposed && propose) {
      await withRetry("proposeDefault", async () => (await agent.proposeDefault(issuer, dataset.event.type, rationaleHash)).wait());
      proposed = true;
      console.log(`   🔴 proposed default (awaiting 2-of-3 human attestation)`);
    }

    await withRetry("setCursor", async () => (await replay.setCursor(issuer, r.epoch)).wait());
    prevScore = aiScore;

    const lead = aiScore < 300 && staticScore >= 300 ? "  ⚠️ AI alarms, rulebook calm" : "";
    const advNote = adv.confidence > 0 ? ` | LLM adj ${adv.adjustment >= 0 ? "+" : ""}${adv.adjustment}@${adv.confidence}` : "";
    console.log(`epoch ${r.epoch} (${r.date}): AI ${aiScore} | static ${staticScore} | PD ${(aiPdBps / 100).toFixed(1)}%${lead}${advNote}`);
    console.log(`   memo: ${memo}`);
  }

  console.log(
    `\nReplay complete. Settle the benchmark with the owner wallet:` +
      `\n  bench.resolve(${issuer}, ${dataset.event.defaulted}, ${dataset.event.eventEpoch})`
  );
}

// Self-execute only when run directly (so the module is importable for tests).
if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
