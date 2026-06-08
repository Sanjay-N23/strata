import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import * as fs from "fs";
import * as path from "path";
import { scoreIssuer, Signals } from "../../agent/pdModel";

/**
 * ============================================================================
 *  scripts/strata-resolve.ts — settlement vs ground truth (integration)
 * ============================================================================
 *  The script's job: load the REAL usdc_svb.json dataset and call
 *    bench.resolve(issuer, dataset.event.defaulted, dataset.event.eventEpoch)
 *  then read resolutions + tally. (Its chainId→filename map now reuses the
 *  tested deploymentFilename.)
 *
 *  This test mirrors that exactly: it records the agent's USDC–SVB series, then
 *  settles using the dataset's own ground-truth values — verifying the script
 *  produces the correct on-chain outcome.
 * ============================================================================
 */

const dataset = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "..", "agent", "data", "usdc_svb.json"), "utf8")
);
const SIG = (r: any) => ({
  navPunctuality: r.navPunctuality, attestationConsistency: r.attestationConsistency,
  repaymentReliability: r.repaymentReliability, collateralRatioBps: r.collateralRatioBps,
  activityScore: r.activityScore, offChainSentiment: r.offChainSentiment,
  epoch: r.epoch, sourceHash: ethers.id(`usdc-svb-${r.epoch}`),
});

describe("strata-resolve · settlement vs ground truth (integration)", function () {
  async function wiredAndRecorded() {
    const [owner, issuer] = await ethers.getSigners();
    const oracle = await (await ethers.getContractFactory("IRSOracle")).deploy();
    const dOracle = await (await ethers.getContractFactory("DefaultOracle")).deploy(owner.address);
    const agent = await (await ethers.getContractFactory("StrataAIAgent")).deploy(
      await oracle.getAddress(), await dOracle.getAddress()
    );
    const bench = await (await ethers.getContractFactory("TuringBenchmark")).deploy();
    await oracle.setStrataAgent(await agent.getAddress());
    await agent.setBenchmark(await bench.getAddress());
    await bench.setStrataAgent(await agent.getAddress());
    await bench.setRecorder(owner.address);

    // agent records the full USDC–SVB series (AI via pdModel, static on-chain)
    for (const r of dataset.epochs) {
      const sig = SIG(r);
      const ai = scoreIssuer(sig as unknown as Signals);
      const stat = Number(await oracle.computeStaticScore(sig));
      await agent.submitScore(issuer.address, ai.score, ai.pdBps, ethers.id(ai.rationale), r.epoch);
      await bench.record(issuer.address, r.epoch, ai.score, stat, ai.pdBps);
    }
    return { owner, issuer, oracle, dOracle, agent, bench };
  }

  // ── M0: dataset ground-truth sanity (the file the script reads) ───────
  describe("M0 · dataset ground truth", function () {
    it("usdc_svb.json declares a COLLATERAL_SHORTFALL default at epoch 6 with 9 epochs", function () {
      expect(dataset.event.defaulted).to.equal(true);
      expect(dataset.event.eventEpoch).to.equal(6);
      expect(dataset.event.type).to.equal(2); // COLLATERAL_SHORTFALL
      expect(dataset.epochs).to.have.lengthOf(9);
      expect(dataset.source).to.be.a("string").and.not.empty;
    });
  });

  // ── M1: settle using the dataset's own values (the script's core) ─────
  describe("M1 · settle vs ground truth", function () {
    it("resolve(dataset.defaulted, dataset.eventEpoch) → AI lead 3, static 0, winner AI", async function () {
      const { bench, agent, issuer } = await loadFixture(wiredAndRecorded);
      await bench.resolve(issuer.address, dataset.event.defaulted, dataset.event.eventEpoch);

      const res = await bench.resolutions(issuer.address);
      expect(res.aiLeadEpochs).to.equal(3);
      expect(res.staticLeadEpochs).to.equal(0);
      expect(res.winner).to.equal(1); // AI

      const [aiWins, staticWins, avg] = await bench.tally();
      expect(aiWins).to.equal(1);
      expect(staticWins).to.equal(0);
      expect(avg).to.equal(3);

      const [correct, total] = await agent.reputation();
      expect(correct).to.equal(1);
      expect(total).to.equal(1);
    });
    it("marks the issuer resolved (script output reads back consistently)", async function () {
      const { bench, issuer } = await loadFixture(wiredAndRecorded);
      await bench.resolve(issuer.address, dataset.event.defaulted, dataset.event.eventEpoch);
      expect(await bench.isResolved(issuer.address)).to.equal(true);
    });
  });

  // ── M2: settlement guards ─────────────────────────────────────────────
  describe("M2 · guards", function () {
    it("resolving an issuer with NO records reverts", async function () {
      const { bench } = await loadFixture(wiredAndRecorded);
      const fresh = ethers.Wallet.createRandom().address;
      await expect(bench.resolve(fresh, dataset.event.defaulted, dataset.event.eventEpoch))
        .to.be.revertedWith("Bench: no records");
    });
    it("double settlement reverts", async function () {
      const { bench, issuer } = await loadFixture(wiredAndRecorded);
      await bench.resolve(issuer.address, dataset.event.defaulted, dataset.event.eventEpoch);
      await expect(bench.resolve(issuer.address, dataset.event.defaulted, dataset.event.eventEpoch))
        .to.be.revertedWith("Bench: already resolved");
    });
    it("settlement is owner-only (matches the script's owner-run requirement)", async function () {
      const { bench, issuer, agent } = await loadFixture(wiredAndRecorded);
      const [, , stranger] = await ethers.getSigners();
      await expect(bench.connect(stranger).resolve(issuer.address, dataset.event.defaulted, dataset.event.eventEpoch))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
});
