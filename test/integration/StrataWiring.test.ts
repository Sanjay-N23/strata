import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

/**
 * ============================================================================
 *  Strata deployment wiring — integration test
 * ============================================================================
 *  scripts/deploy.ts STEP 3.5 wires the Strata AI layer. The dry-run only PRINTS
 *  addresses; this test ASSERTS every cross-contract link is correct, and then
 *  smoke-tests the wired stack end-to-end (the bench must be able to call back
 *  into the agent for reputation, which only works if the links are right).
 *
 *  Links under test (mirroring deploy.ts):
 *    IRSOracle.strataAgent      == agent
 *    DefaultOracle.aiProposer   == agent
 *    StrataAIAgent.benchmark    == bench
 *    TuringBenchmark.strataAgent== agent
 *    TuringBenchmark.recorder   == deployer
 *    ReplayOracle.replayKeeper  == deployer
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

describe("Strata deployment wiring (integration)", function () {
  async function deployed() {
    const [deployer, issuer] = await ethers.getSigners();
    const oracle = await (await ethers.getContractFactory("IRSOracle")).deploy();
    const defaultOracle = await (await ethers.getContractFactory("DefaultOracle")).deploy(deployer.address);
    const agent = await (await ethers.getContractFactory("StrataAIAgent")).deploy(
      await oracle.getAddress(), await defaultOracle.getAddress()
    );
    const replay = await (await ethers.getContractFactory("ReplayOracle")).deploy();
    const bench = await (await ethers.getContractFactory("TuringBenchmark")).deploy();

    // --- mirror deploy.ts STEP 3.5 wiring ---
    await oracle.setStrataAgent(await agent.getAddress());
    await defaultOracle.setAIProposer(await agent.getAddress());
    await agent.setBenchmark(await bench.getAddress());
    await bench.setStrataAgent(await agent.getAddress());
    await bench.setRecorder(deployer.address);
    await bench.setOracles(await replay.getAddress(), await oracle.getAddress());
    await replay.setReplayKeeper(deployer.address);

    return { deployer, issuer, oracle, defaultOracle, agent, replay, bench };
  }

  // ── M0: every wiring link is correct ──────────────────────────────────
  describe("M0 · wiring assertions", function () {
    it("all cross-contract links match deploy.ts", async function () {
      const { deployer, oracle, defaultOracle, agent, replay, bench } = await loadFixture(deployed);
      const agentAddr = await agent.getAddress();
      const benchAddr = await bench.getAddress();
      expect(await oracle.strataAgent()).to.equal(agentAddr);
      expect(await defaultOracle.aiProposer()).to.equal(agentAddr);
      expect(await agent.benchmark()).to.equal(benchAddr);
      expect(await bench.strataAgent()).to.equal(agentAddr);
      expect(await bench.recorder()).to.equal(deployer.address);
      expect(await replay.replayKeeper()).to.equal(deployer.address);
      expect(await bench.replayOracle()).to.equal(await replay.getAddress());
      expect(await bench.irsOracle()).to.equal(await oracle.getAddress());
    });
  });

  // ── M1: end-to-end smoke through the WIRED stack ──────────────────────
  describe("M1 · end-to-end smoke", function () {
    it("perceive → score → propose → benchmark → resolve → reputation", async function () {
      const { issuer, oracle, defaultOracle, agent, replay, bench } = await loadFixture(deployed);
      const i = issuer.address;

      // epoch 3: AI distress, rulebook calm
      const s3 = SIG({ nav: 935, att: 910, rep: 945, col: 9900, act: 700, sent: 330, epoch: 3 });
      await replay.pushSignals(i, s3);
      const static3 = Number(await oracle.computeStaticScore(s3));
      await agent.submitScore(i, 250, 7500, ethers.id("memo-e3"), 3);  // causal reprice
      await bench.record(i, 3, 250, static3, 7500);
      await agent.proposeDefault(i, 2, ethers.id("svb"));               // RED: flag only

      // epoch 6: shortfall event; rulebook finally alarms
      const s6 = SIG({ nav: 150, att: 150, rep: 150, col: 8700, act: 200, sent: 110, epoch: 6 });
      await replay.pushSignals(i, s6);
      const static6 = Number(await oracle.computeStaticScore(s6));
      await agent.submitScore(i, 250, 7500, ethers.id("memo-e6"), 6);
      await bench.record(i, 6, 250, static6, 7500);

      // causal reprice landed on-chain
      expect(await oracle.getAIScore(i)).to.equal(250);
      expect(await oracle.getEffectivePremiumBPS(i)).to.equal(await oracle.staticPremiumBps(250));
      // AI proposed but humans have NOT confirmed
      expect((await defaultOracle.getActiveEvent(i)).isActive).to.equal(true);
      expect(await defaultOracle.isDefaultConfirmed(i)).to.equal(false);

      // resolve the benchmark — bench calls back into agent.recordOutcome (only works if wired)
      await bench.resolve(i, true, 6);
      const r = await bench.resolutions(i);
      expect(r.aiLeadEpochs).to.equal(3);
      expect(r.staticLeadEpochs).to.equal(0);
      expect(r.winner).to.equal(1);
      const [correct, total] = await agent.reputation();
      expect(correct).to.equal(1);
      expect(total).to.equal(1);
    });
  });

  // ── M2: wiring is NECESSARY (negative controls) ───────────────────────
  describe("M2 · unwired stack fails closed", function () {
    it("without oracle wiring, submitScore reverts", async function () {
      const [deployer, issuer] = await ethers.getSigners();
      const oracle = await (await ethers.getContractFactory("IRSOracle")).deploy();
      const dOracle = await (await ethers.getContractFactory("DefaultOracle")).deploy(deployer.address);
      const agent = await (await ethers.getContractFactory("StrataAIAgent")).deploy(
        await oracle.getAddress(), await dOracle.getAddress()
      );
      // no oracle.setStrataAgent(agent)
      await expect(agent.submitScore(issuer.address, 500, 0, ethers.ZeroHash, 0))
        .to.be.revertedWith("IRSOracle: not strata agent");
    });
    it("without proposer wiring, proposeDefault reverts", async function () {
      const [deployer, issuer] = await ethers.getSigners();
      const oracle = await (await ethers.getContractFactory("IRSOracle")).deploy();
      const dOracle = await (await ethers.getContractFactory("DefaultOracle")).deploy(deployer.address);
      const agent = await (await ethers.getContractFactory("StrataAIAgent")).deploy(
        await oracle.getAddress(), await dOracle.getAddress()
      );
      await oracle.setStrataAgent(await agent.getAddress());
      // no dOracle.setAIProposer(agent)
      await expect(agent.proposeDefault(issuer.address, 0, ethers.ZeroHash))
        .to.be.revertedWith("DefaultOracle: not authorized to flag");
    });
  });
});
