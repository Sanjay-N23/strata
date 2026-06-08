import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

/**
 * ============================================================================
 *  TuringBenchmark.sol — EXHAUSTIVE test suite
 * ============================================================================
 *  Records AI vs static (rulebook) scores per epoch; on resolve() computes each
 *  arm's lead-time (epochs before the event it first crossed the alarm) and
 *  tallies the winner + (optionally) bumps the agent's reputation.
 *
 *  Methods: EP (caller classes, defaulted/undefaulted, winner classes), BVA
 *  (alarm 299/300, lead -1/0/1, eventEpoch=0, type maxima), state guards,
 *  aggregation arithmetic (incl. integer truncation & negative averages), and
 *  the reputation-callback decision table.
 *
 *  ALARM_THRESHOLD = 300 (score STRICTLY below 300 == alarm).
 *  aiCorrect (reputation) := defaulted && aiLead >= 0 && aiLead >= staticLead
 * ============================================================================
 */

const Z = ethers.ZeroHash;
const rnd = () => ethers.Wallet.createRandom().address;
const U16 = 65535;
const U64_MAX = 18446744073709551615n;

describe("TuringBenchmark", function () {
  async function fx() {
    const [owner, recorder, other, benchSigner] = await ethers.getSigners();
    const bench = await (await ethers.getContractFactory("TuringBenchmark")).deploy();
    // agent stack for reputation-callback module
    const oracle = await (await ethers.getContractFactory("IRSOracle")).deploy();
    const dOracle = await (await ethers.getContractFactory("DefaultOracle")).deploy(owner.address);
    const agent = await (await ethers.getContractFactory("StrataAIAgent")).deploy(
      await oracle.getAddress(), await dOracle.getAddress()
    );
    // rows: [epoch, aiScore, staticScore]
    const rec = async (issuer: string, rows: (number | bigint)[][], signer = owner) => {
      for (const [e, ai, st] of rows) await bench.connect(signer).record(issuer, e, ai, st, 0);
    };
    const wireAgent = async () => {
      await agent.setBenchmark(await bench.getAddress());
      await bench.setStrataAgent(await agent.getAddress());
    };
    return { owner, recorder, other, benchSigner, bench, oracle, dOracle, agent, rec, wireAgent };
  }

  // ── M0: deployment & constants ────────────────────────────────────────
  describe("M0 · deployment & constants", function () {
    it("ALARM_THRESHOLD = 300; counters zero; recorder/agent unset", async function () {
      const { bench } = await loadFixture(fx);
      expect(await bench.ALARM_THRESHOLD()).to.equal(300);
      const [ai, st, avg] = await bench.tally();
      expect(ai).to.equal(0); expect(st).to.equal(0); expect(avg).to.equal(0);
      expect(await bench.resolvedCount()).to.equal(0);
      expect(await bench.recorder()).to.equal(ethers.ZeroAddress);
      expect(await bench.strataAgent()).to.equal(ethers.ZeroAddress);
    });
    it("tally avg is 0 (no divide-by-zero) before any resolve", async function () {
      const { bench } = await loadFixture(fx);
      const [, , avg] = await bench.tally();
      expect(avg).to.equal(0);
    });
  });

  // ── M1: admin setters ─────────────────────────────────────────────────
  describe("M1 · setRecorder / setStrataAgent", function () {
    it("owner sets recorder + emits RecorderUpdated", async function () {
      const { bench, recorder } = await loadFixture(fx);
      await expect(bench.setRecorder(recorder.address)).to.emit(bench, "RecorderUpdated").withArgs(recorder.address);
      expect(await bench.recorder()).to.equal(recorder.address);
    });
    it("owner sets strataAgent + emits StrataAgentUpdated", async function () {
      const { bench, other } = await loadFixture(fx);
      await expect(bench.setStrataAgent(other.address)).to.emit(bench, "StrataAgentUpdated").withArgs(other.address);
    });
    it("both setters are owner-only", async function () {
      const { bench, other } = await loadFixture(fx);
      await expect(bench.connect(other).setRecorder(other.address)).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(bench.connect(other).setStrataAgent(other.address)).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  // ── M2: record — fidelity + boundaries ────────────────────────────────
  describe("M2 · record fidelity (BVA)", function () {
    it("appends & emits ArmsRecorded; recordAt returns fields", async function () {
      const { bench } = await loadFixture(fx);
      const i = rnd();
      await expect(bench.record(i, 2, 400, 900, 6000)).to.emit(bench, "ArmsRecorded").withArgs(i, 2, 400, 900, 6000);
      const r = await bench.recordAt(i, 0);
      expect(r.epoch).to.equal(2); expect(r.aiScore).to.equal(400);
      expect(r.staticScore).to.equal(900); expect(r.aiPdBps).to.equal(6000);
      expect(await bench.recordCount(i)).to.equal(1);
    });
    it("stores uint16/uint64 maxima", async function () {
      const { bench } = await loadFixture(fx);
      const i = rnd();
      await bench.record(i, U64_MAX, U16, U16, U16);
      const r = await bench.recordAt(i, 0);
      expect(r.epoch).to.equal(U64_MAX);
      expect(r.aiScore).to.equal(U16);
      expect(r.aiPdBps).to.equal(U16);
    });
    it("recordAt out-of-bounds reverts", async function () {
      const { bench } = await loadFixture(fx);
      const i = rnd();
      await bench.record(i, 0, 1, 1, 0);
      await expect(bench.recordAt(i, 5)).to.be.reverted;
    });
  });

  // ── M3: record — access (EP) ──────────────────────────────────────────
  describe("M3 · record access", function () {
    it("owner ✓, random ✗, set recorder ✓", async function () {
      const { bench, other, recorder } = await loadFixture(fx);
      const i = rnd();
      await expect(bench.connect(other).record(i, 0, 1, 1, 0)).to.be.revertedWith("Bench: not recorder");
      await bench.setRecorder(recorder.address);
      await expect(bench.connect(recorder).record(i, 0, 1, 1, 0)).to.not.be.reverted;
    });
  });

  // ── M4: record — isolation & duplicates ───────────────────────────────
  describe("M4 · record isolation", function () {
    it("recordCount is per-issuer", async function () {
      const { bench, rec } = await loadFixture(fx);
      const a = rnd(), b = rnd();
      await rec(a, [[0, 1, 1], [1, 1, 1]]);
      await rec(b, [[0, 1, 1]]);
      expect(await bench.recordCount(a)).to.equal(2);
      expect(await bench.recordCount(b)).to.equal(1);
    });
    it("duplicate epochs are allowed (append-only log)", async function () {
      const { bench, rec } = await loadFixture(fx);
      const i = rnd();
      await rec(i, [[3, 250, 900], [3, 280, 900]]);
      expect(await bench.recordCount(i)).to.equal(2);
    });
  });

  // ── M5: record blocked after resolve ──────────────────────────────────
  describe("M5 · record after resolve", function () {
    it("reverts once resolved", async function () {
      const { bench, rec } = await loadFixture(fx);
      const i = rnd();
      await rec(i, [[0, 250, 900]]);
      await bench.resolve(i, true, 0);
      await expect(bench.record(i, 1, 1, 1, 0)).to.be.revertedWith("Bench: already resolved");
    });
  });

  // ── M6: resolve guards ────────────────────────────────────────────────
  describe("M6 · resolve guards", function () {
    it("no records → revert", async function () {
      const { bench } = await loadFixture(fx);
      await expect(bench.resolve(rnd(), true, 5)).to.be.revertedWith("Bench: no records");
    });
    it("double resolve → revert", async function () {
      const { bench, rec } = await loadFixture(fx);
      const i = rnd();
      await rec(i, [[0, 250, 900]]);
      await bench.resolve(i, true, 0);
      await expect(bench.resolve(i, true, 0)).to.be.revertedWith("Bench: already resolved");
    });
    it("owner-only", async function () {
      const { bench, other, rec } = await loadFixture(fx);
      const i = rnd();
      await rec(i, [[0, 250, 900]]);
      await expect(bench.connect(other).resolve(i, true, 0)).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  // ── M7: lead-time single-arm BVA ──────────────────────────────────────
  describe("M7 · lead-time (single-arm BVA)", function () {
    async function aiLeadFor(rows: number[][], event: number) {
      const { bench, rec } = await loadFixture(fx);
      const i = rnd();
      await rec(i, rows);
      await bench.resolve(i, false, event);
      return (await bench.resolutions(i)).aiLeadEpochs;
    }
    it("alarm AT event epoch → lead 0", async () => expect(await aiLeadFor([[6, 250, 900]], 6)).to.equal(0));
    it("alarm 1 epoch before → lead 1", async () => expect(await aiLeadFor([[5, 250, 900]], 6)).to.equal(1));
    it("never alarms → lead -1", async () => expect(await aiLeadFor([[0, 900, 900]], 6)).to.equal(-1));
    it("alarm only AFTER event → ignored, lead -1", async () => expect(await aiLeadFor([[7, 250, 900]], 6)).to.equal(-1));
    it("eventEpoch 0 with alarm at 0 → lead 0", async () => expect(await aiLeadFor([[0, 250, 900]], 0)).to.equal(0));
  });

  // ── M8: lead-time core (both arms) ────────────────────────────────────
  describe("M8 · lead-time core", function () {
    it("AI alarms e3, rulebook e6, event e6 → 3 vs 0, winner AI", async function () {
      const { bench, rec } = await loadFixture(fx);
      const i = rnd();
      await rec(i, [[0, 900, 900], [3, 250, 900], [6, 250, 260]]);
      await expect(bench.resolve(i, true, 6)).to.emit(bench, "Resolved").withArgs(i, true, 3, 0, 1);
      const r = await bench.resolutions(i);
      expect(r.aiLeadEpochs).to.equal(3);
      expect(r.staticLeadEpochs).to.equal(0);
      expect(r.winner).to.equal(1);
    });
  });

  // ── M9: alarm-threshold BVA & earliest selection ──────────────────────
  describe("M9 · threshold BVA & earliest alarm", function () {
    it("299 alarms, 300 does NOT (strict <)", async function () {
      const { bench, rec } = await loadFixture(fx);
      const i = rnd();
      await rec(i, [[0, 300, 900], [1, 299, 900]]);
      await bench.resolve(i, true, 2);
      expect((await bench.resolutions(i)).aiLeadEpochs).to.equal(1);
    });
    it("earliest alarming epoch wins regardless of insertion order", async function () {
      const { bench, rec } = await loadFixture(fx);
      const i = rnd();
      await rec(i, [[5, 250, 900], [3, 250, 900], [4, 250, 900]]);
      await bench.resolve(i, true, 6);
      expect((await bench.resolutions(i)).aiLeadEpochs).to.equal(3);
    });
  });

  // ── M10: winner determination (EP over outcome classes) ───────────────
  describe("M10 · winner", function () {
    async function winnerFor(rows: number[][], event: number) {
      const { bench, rec } = await loadFixture(fx);
      const i = rnd();
      await rec(i, rows);
      await bench.resolve(i, true, event);
      return (await bench.resolutions(i)).winner;
    }
    it("AI earlier → 1", async () => expect(await winnerFor([[3, 250, 900], [6, 250, 260]], 6)).to.equal(1));
    it("static earlier → 2", async () => expect(await winnerFor([[0, 900, 250], [3, 250, 250]], 4)).to.equal(2));
    it("equal positive leads → tie 0", async () => expect(await winnerFor([[2, 250, 250]], 4)).to.equal(0));
    it("both never alarm → tie 0 (both -1)", async () => expect(await winnerFor([[0, 900, 900]], 1)).to.equal(0));
  });

  // ── M11: tally aggregation (arithmetic) ───────────────────────────────
  describe("M11 · tally aggregation", function () {
    it("counts wins; averages lead delta with integer truncation", async function () {
      const { bench, rec } = await loadFixture(fx);
      const a = rnd(), b = rnd();
      await rec(a, [[3, 250, 900], [6, 250, 260]]); await bench.resolve(a, true, 6); // delta +3
      await rec(b, [[4, 250, 900], [6, 250, 260]]); await bench.resolve(b, true, 6); // delta +2
      const [aiWins, staticWins, avg] = await bench.tally();
      expect(aiWins).to.equal(2); expect(staticWins).to.equal(0);
      expect(avg).to.equal(2); // (3 + 2) / 2 = 2 (trunc)
    });
    it("supports a negative average (rulebook ahead overall)", async function () {
      const { bench, rec } = await loadFixture(fx);
      const a = rnd();
      await rec(a, [[0, 900, 250], [3, 250, 250]]); await bench.resolve(a, true, 4); // aiLead1 staticLead4 → -3
      const [, , avg] = await bench.tally();
      expect(avg).to.equal(-3);
    });
  });

  // ── M12: reputation callback decision table ───────────────────────────
  describe("M12 · reputation callback", function () {
    async function rep(rows: number[][], event: number, defaulted: boolean, wire = true) {
      const { bench, agent, rec, wireAgent } = await loadFixture(fx);
      if (wire) await wireAgent();
      const i = rnd();
      await rec(i, rows);
      await bench.resolve(i, defaulted, event);
      return await agent.reputation();
    }
    it("AI earlier + defaulted → correct (1,1)", async function () {
      const [c, t] = await rep([[3, 250, 900], [6, 250, 260]], 6, true);
      expect(c).to.equal(1); expect(t).to.equal(1);
    });
    it("tie (equal positive leads) → counts as correct", async function () {
      const [c, t] = await rep([[2, 250, 250]], 4, true);
      expect(c).to.equal(1); expect(t).to.equal(1);
    });
    it("static earlier → incorrect (0,1)", async function () {
      const [c, t] = await rep([[0, 900, 250], [3, 250, 250]], 4, true);
      expect(c).to.equal(0); expect(t).to.equal(1);
    });
    it("both never alarm → incorrect (0,1)", async function () {
      const [c, t] = await rep([[0, 900, 900]], 1, true);
      expect(c).to.equal(0); expect(t).to.equal(1);
    });
    it("defaulted = false → NO callback (0,0)", async function () {
      const [c, t] = await rep([[3, 250, 900]], 6, false);
      expect(c).to.equal(0); expect(t).to.equal(0);
    });
    it("no agent wired → resolve does not revert", async function () {
      const { bench, rec } = await loadFixture(fx);
      const i = rnd();
      await rec(i, [[3, 250, 900]]);
      await expect(bench.resolve(i, true, 6)).to.not.be.reverted;
    });
  });
});
