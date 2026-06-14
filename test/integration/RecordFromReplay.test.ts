import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

/**
 * ============================================================================
 *  TuringBenchmark.recordFromReplay — trust-minimised static arm (integration)
 * ============================================================================
 *  De-rig of the "AI beats the rulebook" record: recordFromReplay derives the
 *  rules-based baseline score ON-CHAIN from the IssuerSignals already pushed to
 *  ReplayOracle (IRSOracle.computeStaticScore over signalsAt), so the recorder
 *  CANNOT hand-feed a deliberately-late static score. Both arms read identical
 *  on-chain signals — which is exactly what ReplayOracle's NatSpec promises.
 * ============================================================================
 */

const SIG = (o: any = {}) => ({
  navPunctuality: o.nav ?? 0,
  attestationConsistency: o.att ?? 0,
  repaymentReliability: o.rep ?? 0,
  collateralRatioBps: o.col ?? 0,
  activityScore: o.act ?? 0,
  offChainSentiment: o.sent ?? 0,
  epoch: o.epoch ?? 0,
  sourceHash: o.sourceHash ?? ethers.ZeroHash,
});

describe("TuringBenchmark.recordFromReplay (integration)", function () {
  async function deployed() {
    const [deployer, recorder, other, issuer] = await ethers.getSigners();
    const oracle = await (await ethers.getContractFactory("IRSOracle")).deploy();
    const replay = await (await ethers.getContractFactory("ReplayOracle")).deploy();
    const bench = await (await ethers.getContractFactory("TuringBenchmark")).deploy();
    await bench.setRecorder(recorder.address);
    await bench.setOracles(await replay.getAddress(), await oracle.getAddress());
    await replay.setReplayKeeper(deployer.address);
    return { deployer, recorder, other, issuer, oracle, replay, bench };
  }

  it("derives staticScore on-chain == computeStaticScore(signalsAt)", async function () {
    const { recorder, issuer, oracle, replay, bench } = await loadFixture(deployed);
    const i = issuer.address;
    const s = SIG({ nav: 935, att: 910, rep: 945, col: 9900, act: 700, sent: 330, epoch: 3 });
    await replay.pushSignals(i, s);
    const expected = await oracle.computeStaticScore(s);
    await bench.connect(recorder).recordFromReplay(i, 3, 250, 7500);
    const rec = await bench.recordAt(i, 0);
    expect(rec.staticScore).to.equal(expected);
    expect(rec.aiScore).to.equal(250);
    expect(rec.epoch).to.equal(3);
  });

  it("recorder cannot hand-feed a late static score — it is recomputed from signals", async function () {
    // Sentiment cratered but fundamentals healthy → the sentiment-blind static arm
    // stays CALM (high score), no matter what the recorder might have wanted to write.
    const { recorder, issuer, oracle, replay, bench } = await loadFixture(deployed);
    const i = issuer.address;
    const s = SIG({ nav: 950, att: 950, rep: 950, col: 12000, act: 900, sent: 50, epoch: 1 });
    await replay.pushSignals(i, s);
    const onchainStatic = await oracle.computeStaticScore(s);
    await bench.connect(recorder).recordFromReplay(i, 1, 250, 7500);
    const rec = await bench.recordAt(i, 0);
    expect(rec.staticScore).to.equal(onchainStatic);
    expect(Number(onchainStatic)).to.be.greaterThan(300); // rulebook does not alarm on sentiment alone
  });

  it("reverts when oracles are unset", async function () {
    const [, recorder, , issuer] = await ethers.getSigners();
    const bench = await (await ethers.getContractFactory("TuringBenchmark")).deploy();
    await bench.setRecorder(recorder.address);
    await expect(
      bench.connect(recorder).recordFromReplay(issuer.address, 0, 250, 7500)
    ).to.be.revertedWith("Bench: oracles unset");
  });

  it("onlyRecorder gates recordFromReplay", async function () {
    const { other, issuer, replay, bench } = await loadFixture(deployed);
    await replay.pushSignals(issuer.address, SIG({ nav: 900, epoch: 0 }));
    await expect(
      bench.connect(other).recordFromReplay(issuer.address, 0, 250, 7500)
    ).to.be.revertedWith("Bench: not recorder");
  });
});
