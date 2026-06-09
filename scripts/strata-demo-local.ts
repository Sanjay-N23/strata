import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { scoreIssuer } from "../agent/pdModel";

/**
 * Live local demo: replays the USDC–SVB depeg on the running node, then settles
 * the Turing benchmark. Uses the Hardhat signer (= deployer/owner/operator) so
 * nonces are managed correctly. Run: npx hardhat run scripts/strata-demo-local.ts --network localhost
 */
async function main() {
  const [owner] = await ethers.getSigners();
  const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", "localhost.json"), "utf8")).contracts;
  const dataset = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "agent", "data", "usdc_svb.json"), "utf8"));
  const issuer = process.env.ISSUER_ADDRESS || "0x90F79bf6EB2c4f870365E785982E1f101E93b906"; // fresh issuer key

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
    await (await replay.pushSignals(issuer, sig)).wait();
    const staticScore = Number(await oracle.computeStaticScore(sig));
    const pd = scoreIssuer(sig as any);
    const hash = ethers.id(pd.rationale);
    await (await agent.submitScore(issuer, pd.score, pd.pdBps, hash, r.epoch)).wait();
    await (await bench.record(issuer, r.epoch, pd.score, staticScore, pd.pdBps)).wait();
    if (!proposed && (pd.pdBps > 6000 || pd.score < 200)) {
      await (await agent.proposeDefault(issuer, dataset.event.type, hash)).wait();
      proposed = true;
    }
    const flag = pd.score < 300 && staticScore >= 300 ? "   <-- AI ALARMS, rulebook still calm" : "";
    console.log(`epoch ${r.epoch} (${r.date}): AI ${String(pd.score).padStart(4)} | static ${String(staticScore).padStart(4)} | PD ${(pd.pdBps / 100).toFixed(1)}%${flag}`);
  }

  console.log("\nSettling benchmark vs ground truth...");
  await (await bench.resolve(issuer, dataset.event.defaulted, dataset.event.eventEpoch)).wait();
  const res = await bench.resolutions(issuer);
  const [ai, st, avg] = await bench.tally();
  const [correct, total] = await agent.reputation();
  const effPrem = await oracle.getEffectivePremiumBPS(issuer);

  console.log("\n================= RESULT =================");
  console.log(`AI lead:      ${res.aiLeadEpochs} epochs`);
  console.log(`Static lead:  ${res.staticLeadEpochs} epochs`);
  console.log(`Winner:       ${res.winner === 1n ? "AI" : res.winner === 2n ? "STATIC" : "tie"}`);
  console.log(`Tally:        AI wins ${ai} | static wins ${st} | avg lead ${avg}`);
  console.log(`Agent rep:    ${correct}/${total} correct (ERC-8004 reputation)`);
  console.log(`Eff premium:  ${effPrem} bps (AI-driven)`);
  console.log(`Default:      proposed by AI, ${await bench.isResolved(issuer) ? "" : ""}awaiting 2-of-3 human attestation (confirmed=${await (await ethers.getContractAt("DefaultOracle", dep.DefaultOracle)).isDefaultConfirmed(issuer)})`);
  console.log("==========================================");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
