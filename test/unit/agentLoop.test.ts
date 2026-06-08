import { expect } from "chai";
import { decideActions, main } from "../../agent/index";

/**
 * ============================================================================
 *  agent/index.ts — autonomous loop (testable surface)
 * ============================================================================
 *  index.ts is a self-executing, live-chain orchestration script. Its per-step
 *  on-chain sequence (pushSignals → submitScore → record → propose → setCursor)
 *  is exercised end-to-end by test/integration/StrataWiring.test.ts, which calls
 *  exactly that sequence on the wired stack.
 *
 *  The NEW logic unique to index.ts — the per-epoch decision branching — was
 *  extracted into the pure `decideActions()` and is covered here exhaustively
 *  (BVA on the 50-pt drop and the propose thresholds, EP on first-epoch). Plus
 *  the ISSUER_ADDRESS guard on main().
 *
 *  Thresholds: earlyWarning when prevScore - score >= 50; propose when
 *  pdBps > 6000 (strict) OR score < 200 (strict).
 * ============================================================================
 */

const pd = (score: number, pdBps: number) => ({ score, pdBps });

describe("agent/index · loop logic", function () {
  // ── M0: earlyWarning (BVA on the 50-pt drop) ──────────────────────────
  describe("M0 · decideActions.earlyWarning", function () {
    it("first epoch (prevScore null) → no warning", function () {
      expect(decideActions(null, pd(100, 9000)).earlyWarning).to.equal(false);
    });
    it("drop of exactly 50 → warning (boundary)", function () {
      expect(decideActions(500, pd(450, 0)).earlyWarning).to.equal(true);
    });
    it("drop of 49 → no warning", function () {
      expect(decideActions(500, pd(451, 0)).earlyWarning).to.equal(false);
    });
    it("drop of 51 → warning", function () {
      expect(decideActions(500, pd(449, 0)).earlyWarning).to.equal(true);
    });
    it("no change → no warning", function () {
      expect(decideActions(500, pd(500, 0)).earlyWarning).to.equal(false);
    });
    it("score increase → no warning", function () {
      expect(decideActions(450, pd(500, 0)).earlyWarning).to.equal(false);
    });
  });

  // ── M1: propose via PD (BVA on 6000, strict >) ────────────────────────
  describe("M1 · decideActions.propose via PD", function () {
    it("pdBps 6000 (== threshold) → no propose (strict >)", function () {
      expect(decideActions(null, pd(500, 6000)).propose).to.equal(false);
    });
    it("pdBps 6001 → propose", function () {
      expect(decideActions(null, pd(500, 6001)).propose).to.equal(true);
    });
    it("pdBps 5999 → no propose", function () {
      expect(decideActions(null, pd(500, 5999)).propose).to.equal(false);
    });
  });

  // ── M2: propose via score (BVA on 200, strict <) ──────────────────────
  describe("M2 · decideActions.propose via score", function () {
    it("score 200 (== threshold) → no propose (strict <)", function () {
      expect(decideActions(null, pd(200, 0)).propose).to.equal(false);
    });
    it("score 199 → propose", function () {
      expect(decideActions(null, pd(199, 0)).propose).to.equal(true);
    });
    it("score 201 → no propose", function () {
      expect(decideActions(null, pd(201, 0)).propose).to.equal(false);
    });
  });

  // ── M3: propose combined (EP) ─────────────────────────────────────────
  describe("M3 · decideActions.propose combined", function () {
    it("both triggers → propose", function () {
      expect(decideActions(null, pd(100, 9000)).propose).to.equal(true);
    });
    it("neither trigger → no propose", function () {
      expect(decideActions(null, pd(1000, 0)).propose).to.equal(false);
    });
    it("earlyWarning and propose are independent flags", function () {
      // big drop but healthy PD/score → warning yes, propose no
      const r = decideActions(800, pd(700, 3000));
      expect(r.earlyWarning).to.equal(true);
      expect(r.propose).to.equal(false);
    });
  });

  // ── M4: main() ISSUER_ADDRESS guard ───────────────────────────────────
  describe("M4 · main guard", function () {
    let saved: string | undefined;
    beforeEach(() => { saved = process.env.ISSUER_ADDRESS; delete process.env.ISSUER_ADDRESS; });
    afterEach(() => { if (saved === undefined) delete process.env.ISSUER_ADDRESS; else process.env.ISSUER_ADDRESS = saved; });

    it("throws when ISSUER_ADDRESS is unset (before any chain call)", async function () {
      let err: any;
      try { await main(); } catch (e) { err = e; }
      expect(err).to.be.an("Error");
      expect(err.message).to.contain("ISSUER_ADDRESS");
    });
  });
});
