import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { scoreIssuer } from "../agent/pdModel";
import { deploymentFilename } from "./deployHelpers";

/**
 * Run the live agent replay loop on-chain WITHOUT resolving (keeps the benchmark
 * tally unchanged; settle separately with strata-resolve.ts). Uses the Hardhat
 * signer (= deployer/owner/operator) so nonces are managed correctly and the
 * provider is resilient to the flaky public RPC.
 *   ISSUER_ADDRESS=0x... npx hardhat run scripts/strata-run-live.ts --network mantleSepolia
 *
 * Optional DATASET env selects the replay timeline (default usdc_svb). To underwrite the
 * USDY testnet-mock issuer on the boundary case where the AI ties the rulebook:
 *   DATASET=trade_finance_fraud ISSUER_ADDRESS=<MockUSDY> npx hardhat run scripts/strata-run-live.ts --network mantleSepolia
 */
async function withRetry<T>(label: string, fn: () => Promise<T>, tries = 5): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      last = e;
      const ms = 800 * 2 ** i;
      console.log(`  retry ${label} (${i + 1}/${tries}) in ${ms}ms — ${String(e).slice(0, 80)}`);
      await new Promise((r) => setTimeout(r, ms));
    }
  }
  throw last;
}

async function main() {
  const [owner] = await ethers.getSigners();
  const fname = deploymentFilename((await ethers.provider.getNetwork()).chainId);
  const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", fname), "utf8")).contracts;
  const datasetFile = process.env.DATASET || "usdc_svb";
  const dataset = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "agent", "data", `${datasetFile}.json`), "utf8"));
  const issuer = process.env.ISSUER_ADDRESS;
  if (!issuer) throw new Error("Set ISSUER_ADDRESS");

  const agent = await ethers.getContractAt("StrataAIAgent", dep.StrataAIAgent);
  const oracle = await ethers.getContractAt("IRSOracle", dep.IRSOracle);
  const replay = await ethers.getContractAt("ReplayOracle", dep.ReplayOracle);
  const bench = await ethers.getContractAt("TuringBenchmark", dep.TuringBenchmark);

  console.log(`Operator ${owner.address}  |  issuer ${issuer}`);
  console.log(`Replaying: ${dataset.issuerLabel}\n`);

  let proposed = false;
  for (const r of dataset.epochs) {
    const sig = {
      navPunctuality: r.navPunctuality, attestationConsistency: r.attestationConsistency,
      repaymentReliability: r.repaymentReliability, collateralRatioBps: r.collateralRatioBps,
      activityScore: r.activityScore, offChainSentiment: r.offChainSentiment,
      epoch: r.epoch, sourceHash: ethers.id(`usdc-svb-${r.epoch}`),
    };
    await withRetry("pushSignals", async () => (await replay.pushSignals(issuer, sig)).wait());
    const staticScore = Number(await oracle.computeStaticScore(sig));
    const pd = scoreIssuer(sig as any);
    const hash = ethers.id(pd.rationale);
    await withRetry("submitScore", async () => (await agent.submitScore(issuer, pd.score, pd.pdBps, hash, r.epoch)).wait());
    await withRetry("recordFromReplay", async () => (await bench.recordFromReplay(issuer, r.epoch, pd.score, pd.pdBps)).wait());
    if (!proposed && (pd.pdBps > 6000 || pd.score < 200)) {
      await withRetry("proposeDefault", async () => (await agent.proposeDefault(issuer, dataset.event.type, hash)).wait());
      proposed = true;
    }
    const flag = pd.score < 300 && staticScore >= 300 ? "   <-- AI ALARMS, rulebook still calm" : "";
    console.log(`epoch ${r.epoch} (${r.date}): AI ${String(pd.score).padStart(4)} | static ${String(staticScore).padStart(4)} | PD ${(pd.pdBps / 100).toFixed(1)}%${flag}`);
  }

  const eff = await oracle.getEffectivePremiumBPS(issuer);
  console.log(`\nLive run complete (NOT resolved — tally unchanged).`);
  console.log(`  scoresSubmitted (global): ${await agent.scoresSubmitted()}`);
  console.log(`  recordCount(issuer):      ${await bench.recordCount(issuer)}`);
  console.log(`  effective premium:        ${eff} bps (AI-driven)`);
  console.log(`  default proposed:         ${proposed} (awaiting 2-of-3 human gate)`);
  console.log(`\nTo settle (bumps tally → AI 2/0/+3):`);
  console.log(`  ISSUER_ADDRESS=${issuer} npx hardhat run scripts/strata-resolve.ts --network mantleSepolia`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
