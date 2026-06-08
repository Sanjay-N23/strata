import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

/**
 * ============================================================================
 *  IRSOracle.sol — Strata AI-arm additions (EXHAUSTIVE)
 * ============================================================================
 *  Covers ONLY the new Strata surface (original IRS scoring → IRSOracle.test.ts;
 *  computeStaticScore → StrataTypes.test.ts):
 *    • setStrataAgent / onlyAgent (incl. rotation + zero-disable)
 *    • staticPremiumBps(score)   — pure formula, BVA + clamps + monotonicity
 *    • setAIScore / getAIScore / aiScored  — AI arm (access, BVA, overwrite, isolation)
 *    • getEffectivePremiumBPS    — AI override matrix (EP)
 *    • getPremiumRateBPS vs getEffectivePremiumBPS — static-arm vs AI-arm distinction
 *
 *  Premium: 1600 · e^(-0.001386 · score), clamped to [400, 1600] bps.
 * ============================================================================
 */

const ZA = ethers.ZeroAddress;
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

describe("IRSOracle · Strata AI arm", function () {
  async function fx() {
    const [owner, agent, agent2, other, token, token2] = await ethers.getSigners();
    const oracle = await (await ethers.getContractFactory("IRSOracle")).deploy();
    await oracle.setStrataAgent(agent.address); // agent is an EOA for direct calls
    return { owner, agent, agent2, other, token, token2, oracle };
  }
  const num = async (p: Promise<bigint>) => Number(await p);

  // ── M0: setStrataAgent / onlyAgent ────────────────────────────────────
  describe("M0 · setStrataAgent & onlyAgent", function () {
    it("owner sets agent + emits StrataAgentUpdated", async function () {
      const { oracle, other } = await loadFixture(fx);
      await expect(oracle.setStrataAgent(other.address))
        .to.emit(oracle, "StrataAgentUpdated").withArgs(other.address);
      expect(await oracle.strataAgent()).to.equal(other.address);
    });
    it("owner-only", async function () {
      const { oracle, other } = await loadFixture(fx);
      await expect(oracle.connect(other).setStrataAgent(other.address))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });
    it("rotation: new agent gains access, old agent loses it", async function () {
      const { oracle, agent, agent2, token } = await loadFixture(fx);
      await oracle.setStrataAgent(agent2.address);
      await expect(oracle.connect(agent2).setAIScore(token.address, 500)).to.not.be.reverted;
      await expect(oracle.connect(agent).setAIScore(token.address, 500)).to.be.revertedWith("IRSOracle: not strata agent");
    });
    it("zero agent disables the AI arm", async function () {
      const { oracle, agent, token } = await loadFixture(fx);
      await oracle.setStrataAgent(ZA);
      await expect(oracle.connect(agent).setAIScore(token.address, 500)).to.be.revertedWith("IRSOracle: not strata agent");
    });
  });

  // ── M1: staticPremiumBps — BVA & known values ─────────────────────────
  describe("M1 · staticPremiumBps boundaries", function () {
    it("score 0 → 1600 (max, early return)", async () => expect(await num((await loadFixture(fx)).oracle.staticPremiumBps(0))).to.equal(1600));
    it("score 1000 → 400 (min, early return)", async () => expect(await num((await loadFixture(fx)).oracle.staticPremiumBps(1000))).to.equal(400));
    it("score 1 → ~1597", async () => expect(await num((await loadFixture(fx)).oracle.staticPremiumBps(1))).to.be.closeTo(1597, 3));
    it("score 999 → 400 (formula floors into the min)", async () => expect(await num((await loadFixture(fx)).oracle.staticPremiumBps(999))).to.equal(400));
    it("known curve points: 100/300/600/800", async function () {
      const { oracle } = await loadFixture(fx);
      expect(await num(oracle.staticPremiumBps(100))).to.be.closeTo(1393, 3);
      expect(await num(oracle.staticPremiumBps(300))).to.be.closeTo(1055, 3);
      expect(await num(oracle.staticPremiumBps(600))).to.be.closeTo(696, 3);
      expect(await num(oracle.staticPremiumBps(800))).to.be.closeTo(528, 3);
    });
    it("over-range score (>1000) → 400", async function () {
      const { oracle } = await loadFixture(fx);
      expect(await num(oracle.staticPremiumBps(2000))).to.equal(400);
      expect(await num(oracle.staticPremiumBps(5000))).to.equal(400);
    });
  });

  // ── M2: staticPremiumBps — properties ─────────────────────────────────
  describe("M2 · staticPremiumBps properties", function () {
    it("monotonically decreasing", async function () {
      const { oracle } = await loadFixture(fx);
      let prev = 1601;
      for (const s of [0, 100, 250, 500, 750, 900, 1000]) {
        const v = await num(oracle.staticPremiumBps(s));
        expect(v).to.be.lessThanOrEqual(prev);
        prev = v;
      }
    });
    it("always within [400, 1600]", async function () {
      const { oracle } = await loadFixture(fx);
      for (const s of [0, 1, 333, 667, 999, 1000, 9999]) {
        const v = await num(oracle.staticPremiumBps(s));
        expect(v).to.be.within(400, 1600);
      }
    });
  });

  // ── M3: setAIScore — access & BVA ─────────────────────────────────────
  describe("M3 · setAIScore", function () {
    it("agent sets score, flips aiScored, emits AIScoreSubmitted", async function () {
      const { oracle, agent, token } = await loadFixture(fx);
      await expect(oracle.connect(agent).setAIScore(token.address, 720))
        .to.emit(oracle, "AIScoreSubmitted").withArgs(token.address, 720);
      expect(await oracle.getAIScore(token.address)).to.equal(720);
      expect(await oracle.aiScored(token.address)).to.equal(true);
    });
    it("rejects non-agent (incl. owner)", async function () {
      const { oracle, owner, other, token } = await loadFixture(fx);
      await expect(oracle.connect(other).setAIScore(token.address, 500)).to.be.revertedWith("IRSOracle: not strata agent");
      await expect(oracle.connect(owner).setAIScore(token.address, 500)).to.be.revertedWith("IRSOracle: not strata agent");
    });
    it("BVA: 0 ok, 1000 ok, 1001 reverts", async function () {
      const { oracle, agent, token } = await loadFixture(fx);
      await expect(oracle.connect(agent).setAIScore(token.address, 0)).to.not.be.reverted;
      await expect(oracle.connect(agent).setAIScore(token.address, 1000)).to.not.be.reverted;
      await expect(oracle.connect(agent).setAIScore(token.address, 1001)).to.be.revertedWith("IRSOracle: score too high");
    });
  });

  // ── M4: setAIScore — state (overwrite, idempotent flag, isolation) ────
  describe("M4 · setAIScore state", function () {
    it("overwrites with the newest value and re-emits", async function () {
      const { oracle, agent, token } = await loadFixture(fx);
      await oracle.connect(agent).setAIScore(token.address, 700);
      await expect(oracle.connect(agent).setAIScore(token.address, 300))
        .to.emit(oracle, "AIScoreSubmitted").withArgs(token.address, 300);
      expect(await oracle.getAIScore(token.address)).to.equal(300);
    });
    it("aiScored stays true after re-setting", async function () {
      const { oracle, agent, token } = await loadFixture(fx);
      await oracle.connect(agent).setAIScore(token.address, 700);
      await oracle.connect(agent).setAIScore(token.address, 0);
      expect(await oracle.aiScored(token.address)).to.equal(true);
    });
    it("is per-token isolated", async function () {
      const { oracle, agent, token, token2 } = await loadFixture(fx);
      await oracle.connect(agent).setAIScore(token.address, 700);
      expect(await oracle.getAIScore(token2.address)).to.equal(0);
      expect(await oracle.aiScored(token2.address)).to.equal(false);
    });
  });

  // ── M5: getAIScore / aiScored defaults ────────────────────────────────
  describe("M5 · AI getter defaults", function () {
    it("default 0 / false before any AI score", async function () {
      const { oracle, token } = await loadFixture(fx);
      expect(await oracle.getAIScore(token.address)).to.equal(0);
      expect(await oracle.aiScored(token.address)).to.equal(false);
    });
  });

  // ── M6: getEffectivePremiumBPS — override matrix (EP) ─────────────────
  describe("M6 · getEffectivePremiumBPS", function () {
    it("uses the static score when no AI score is set", async function () {
      const { oracle, token } = await loadFixture(fx);
      await oracle.initializeScore(token.address, 600);
      expect(await num(oracle.getEffectivePremiumBPS(token.address))).to.equal(await num(oracle.staticPremiumBps(600)));
    });
    it("AI distress overrides a HEALTHY static (static 1000→400, AI 0→1600)", async function () {
      const { oracle, agent, token } = await loadFixture(fx);
      await oracle.initializeScore(token.address, 1000);
      expect(await num(oracle.getEffectivePremiumBPS(token.address))).to.equal(400);
      await oracle.connect(agent).setAIScore(token.address, 0);
      expect(await num(oracle.getEffectivePremiumBPS(token.address))).to.equal(1600);
    });
    it("AI rescue overrides a POOR static (static 0→1600, AI 1000→400)", async function () {
      const { oracle, agent, token } = await loadFixture(fx);
      // static score 0 → 1600
      expect(await num(oracle.getEffectivePremiumBPS(token.address))).to.equal(1600);
      await oracle.connect(agent).setAIScore(token.address, 1000);
      expect(await num(oracle.getEffectivePremiumBPS(token.address))).to.equal(400);
    });
  });

  // ── M7: static arm vs AI arm distinction ──────────────────────────────
  describe("M7 · getPremiumRateBPS (static) vs getEffectivePremiumBPS (AI)", function () {
    it("getPremiumRateBPS always reflects the STATIC score, ignoring the AI score", async function () {
      const { oracle, agent, token } = await loadFixture(fx);
      await oracle.setScoreForTest(token.address, 600);   // static 600
      await oracle.connect(agent).setAIScore(token.address, 1000); // AI 1000
      expect(await num(oracle.getPremiumRateBPS(token.address))).to.equal(await num(oracle.staticPremiumBps(600)));   // static arm
      expect(await num(oracle.getEffectivePremiumBPS(token.address))).to.equal(400);                                   // AI arm
      // they genuinely differ
      expect(await num(oracle.getPremiumRateBPS(token.address)))
        .to.not.equal(await num(oracle.getEffectivePremiumBPS(token.address)));
    });
    it("unscored issuer → getPremiumRateBPS = 1600", async function () {
      const { oracle, token } = await loadFixture(fx);
      expect(await num(oracle.getPremiumRateBPS(token.address))).to.equal(1600);
    });
  });

  // ── M8: computeStaticScore (static arm) ───────────────────────────────
  // Essential BVA/EP for the static-arm mapping. The full 57-test deep dive on
  // the IssuerSignals struct lives in StrataTypes.test.ts; this keeps the
  // IRSOracle suite self-contained for all of its Strata additions.
  describe("M8 · computeStaticScore", function () {
    const css = async (oracle: any, o: any) => Number(await oracle.computeStaticScore(SIG(o)));
    it("zero signals → 0", async function () {
      const { oracle } = await loadFixture(fx);
      expect(await css(oracle, {})).to.equal(0);
    });
    it("per-dimension max contributions (250/250/300/150/50)", async function () {
      const { oracle } = await loadFixture(fx);
      expect(await css(oracle, { nav: 1000 })).to.equal(250);
      expect(await css(oracle, { att: 1000 })).to.equal(250);
      expect(await css(oracle, { rep: 1000 })).to.equal(300);
      expect(await css(oracle, { col: 10000 })).to.equal(150);
      expect(await css(oracle, { act: 1000 })).to.equal(50);
    });
    it("truncation boundaries (integer floor)", async function () {
      const { oracle } = await loadFixture(fx);
      expect(await css(oracle, { nav: 3 })).to.equal(0);
      expect(await css(oracle, { nav: 4 })).to.equal(1);
      expect(await css(oracle, { act: 19 })).to.equal(0);
      expect(await css(oracle, { act: 20 })).to.equal(1);
      expect(await css(oracle, { col: 66 })).to.equal(0);
      expect(await css(oracle, { col: 67 })).to.equal(1);
    });
    it("collateral is bps-scaled: 10% (1000) → 15, 100% (10000) → 150", async function () {
      const { oracle } = await loadFixture(fx);
      expect(await css(oracle, { col: 1000 })).to.equal(15);
      expect(await css(oracle, { col: 10000 })).to.equal(150);
    });
    it("collateral cap: 10001 and 65535 → 150", async function () {
      const { oracle } = await loadFixture(fx);
      expect(await css(oracle, { col: 10001 })).to.equal(150);
      expect(await css(oracle, { col: 65535 })).to.equal(150);
    });
    it("offChainSentiment is IGNORED by the static arm", async function () {
      const { oracle } = await loadFixture(fx);
      expect(await css(oracle, { nav: 400, sent: 0 })).to.equal(await css(oracle, { nav: 400, sent: 1000 }));
    });
    it("total cap: all-max → 1000; inflated inputs → 1000", async function () {
      const { oracle } = await loadFixture(fx);
      expect(await css(oracle, { nav: 1000, att: 1000, rep: 1000, col: 10000, act: 1000 })).to.equal(1000);
      expect(await css(oracle, { nav: 5000, att: 5000, rep: 5000, col: 65535, act: 5000 })).to.equal(1000);
    });
    it("cross-check: USDC–SVB epoch-3 row → 926", async function () {
      const { oracle } = await loadFixture(fx);
      expect(await css(oracle, { nav: 935, att: 910, rep: 945, col: 9900, act: 700, sent: 330 })).to.equal(926);
    });
  });
});
