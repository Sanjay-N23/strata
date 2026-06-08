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
import { creditMemo } from "./zai";

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
    await (await replay.pushSignals(issuer, sig)).wait();
    const staticScore = Number(await oracle.computeStaticScore(sig));

    // Score (deterministic) + Reason (LLM memo)
    const pd = scoreIssuer(sig as unknown as Signals);
    const memo = await creditMemo(sig as unknown as Signals, pd);
    const rationaleHash = ethers.id(memo);

    // Act — GREEN: causal reprice + benchmark record
    await (await agent.submitScore(issuer, pd.score, pd.pdBps, rationaleHash, r.epoch)).wait();
    await (await bench.record(issuer, r.epoch, pd.score, staticScore, pd.pdBps)).wait();

    const { earlyWarning, propose } = decideActions(prevScore, pd);

    // GREEN: early warning on a sharp drop
    if (earlyWarning) {
      await (await agent.flagEarlyWarning(issuer, 1, rationaleHash, r.epoch)).wait();
    }

    // RED: propose default once on distress (humans confirm via TIR 2-of-3)
    if (!proposed && propose) {
      await (await agent.proposeDefault(issuer, dataset.event.type, rationaleHash)).wait();
      proposed = true;
      console.log(`   🔴 proposed default (awaiting 2-of-3 human attestation)`);
    }

    await (await replay.setCursor(issuer, r.epoch)).wait();
    prevScore = pd.score;

    const lead = pd.score < 300 && staticScore >= 300 ? "  ⚠️ AI alarms, rulebook calm" : "";
    console.log(`epoch ${r.epoch} (${r.date}): AI ${pd.score} | static ${staticScore} | PD ${(pd.pdBps / 100).toFixed(1)}%${lead}`);
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
