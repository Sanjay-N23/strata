import { ethers } from "hardhat";
import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import { scoreIssuer, ALARM_THRESHOLD, Signals } from "../../agent/pdModel";

// Phase B — the Turing Test, proven on-chain against REAL ground truth.
// Replays the USDC–SVB depeg (Mar 2023). Both arms read identical signals:
//   - static arm (rulebook): IRSOracle.computeStaticScore — blind to sentiment
//   - AI arm: pdModel.scoreIssuer — uses sentiment -> flags the shortfall earlier
// Asserts the AI's lead-time beats the rulebook, recorded permanently on-chain.

interface Row {
  epoch: number; date: string;
  navPunctuality: number; attestationConsistency: number; repaymentReliability: number;
  collateralRatioBps: number; activityScore: number; offChainSentiment: number;
}
const dataset = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../agent/data/usdc_svb.json"), "utf8")
);

function toSig(r: Row) {
  return {
    navPunctuality: r.navPunctuality,
    attestationConsistency: r.attestationConsistency,
    repaymentReliability: r.repaymentReliability,
    collateralRatioBps: r.collateralRatioBps,
    activityScore: r.activityScore,
    offChainSentiment: r.offChainSentiment,
    epoch: r.epoch,
    sourceHash: ethers.id(`usdc-svb-${r.epoch}`),
  };
}

describe("Turing Benchmark — USDC–SVB replay (Phase B)", function () {
  async function deployFixture() {
    const [owner, issuer, tir] = await ethers.getSigners();

    const oracle = await (await ethers.getContractFactory("IRSOracle")).deploy();
    const defaultOracle = await (await ethers.getContractFactory("DefaultOracle")).deploy(tir.address);
    const agent = await (await ethers.getContractFactory("StrataAIAgent")).deploy(
      await oracle.getAddress(), await defaultOracle.getAddress()
    );
    const replay = await (await ethers.getContractFactory("ReplayOracle")).deploy();
    const bench = await (await ethers.getContractFactory("TuringBenchmark")).deploy();

    // Wire
    await oracle.setStrataAgent(await agent.getAddress());
    await defaultOracle.setAIProposer(await agent.getAddress());
    await agent.setBenchmark(await bench.getAddress());
    await bench.setStrataAgent(await agent.getAddress());
    await bench.setRecorder(owner.address);       // off-chain operator records
    await replay.setReplayKeeper(owner.address);

    return { oracle, defaultOracle, agent, replay, bench, owner, issuer };
  }

  it("replays the depeg: AI flags the shortfall earlier than the rulebook", async function () {
    const { oracle, agent, replay, bench, issuer } = await deployFixture();
    const issuerAddr = issuer.address;
    const rows: Row[] = dataset.epochs;

    let lastAiScore = 0;
    for (const r of rows) {
      const sig = toSig(r);

      // 1. feed the same signals on-chain (both arms see identical inputs)
      await replay.pushSignals(issuerAddr, sig);

      // 2. static arm — authoritative on-chain pure function
      const staticScore = Number(await oracle.computeStaticScore(sig));

      // 3. AI arm — deterministic scorecard (uses sentiment)
      const ai = scoreIssuer(sig as unknown as Signals);
      lastAiScore = ai.score;
      const rationaleHash = ethers.id(ai.rationale);

      // 4. AI acts on-chain (causal reprice) + record both arms for the benchmark
      await agent.submitScore(issuerAddr, ai.score, ai.pdBps, rationaleHash, r.epoch);
      await bench.record(issuerAddr, r.epoch, ai.score, staticScore, ai.pdBps);
    }

    expect(await bench.recordCount(issuerAddr)).to.equal(rows.length);

    // ── The crux: at epoch 3 the AI alarms, the rulebook does not ──
    const ep3 = toSig(rows[3]);
    const aiEp3 = scoreIssuer(ep3 as unknown as Signals).score;
    const staticEp3 = Number(await oracle.computeStaticScore(ep3));
    expect(aiEp3).to.be.lessThan(ALARM_THRESHOLD);     // AI: distress at epoch 3
    expect(staticEp3).to.be.greaterThan(ALARM_THRESHOLD); // rulebook: still calm

    // ── Resolve against ground truth (shortfall event at epoch 6) ──
    const ev = dataset.event;
    await bench.resolve(issuerAddr, ev.defaulted, ev.eventEpoch);

    const res = await bench.resolutions(issuerAddr);
    expect(res.aiLeadEpochs).to.equal(3n);     // AI warned 3 epochs early
    expect(res.staticLeadEpochs).to.equal(0n); // rulebook only at the event
    expect(res.winner).to.equal(1);            // 1 = AI

    const [aiWins, staticWins, avgDelta] = await bench.tally();
    expect(aiWins).to.equal(1n);
    expect(staticWins).to.equal(0n);
    expect(avgDelta).to.equal(3n);

    // ── AI earned reputation (warned early + correct), never self-asserted ──
    const [correct, total] = await agent.reputation();
    expect(correct).to.equal(1n);
    expect(total).to.equal(1n);

    // ── Causal reprice: effective premium now reflects the AI's final score ──
    expect(await oracle.getAIScore(issuerAddr)).to.equal(lastAiScore);
    expect(await oracle.getEffectivePremiumBPS(issuerAddr)).to.equal(
      await oracle.staticPremiumBps(lastAiScore)
    );
  });

  it("AI proposes a default during the crisis but cannot confirm it (human gate)", async function () {
    const { agent, defaultOracle, issuer } = await deployFixture();
    const rows: Row[] = dataset.epochs;

    // Drive to the acute-fear epoch where pd > propose threshold
    const crisis = toSig(rows[4]); // sentiment 200 -> distress override
    const ai = scoreIssuer(crisis as unknown as Signals);
    await agent.submitScore(issuer.address, ai.score, ai.pdBps, ethers.id(ai.rationale), 4);

    // pd should be high enough to propose
    expect(ai.pdBps).to.be.greaterThan(6000);
    await agent.proposeDefault(issuer.address, dataset.event.type, ethers.id("svb-exposure"));

    const evt = await defaultOracle.getActiveEvent(issuer.address);
    expect(evt.isActive).to.equal(true);  // grace/monitoring started
    expect(await defaultOracle.isDefaultConfirmed(issuer.address)).to.equal(false); // humans must confirm
  });
});
