import { expect } from "chai";
import {
  scoreIssuer, ALARM_THRESHOLD, DEFAULT_PROPOSE_PD, DEFAULT_PROPOSE_SCORE, Signals,
} from "../../agent/pdModel";

/**
 * ============================================================================
 *  agent/pdModel.ts — deterministic PD scorecard (EXHAUSTIVE)
 * ============================================================================
 *  Pure function → unit-testable directly. Modules cover EP over the three
 *  sentiment branches, BVA at both thresholds (349/350 and 599/600), the
 *  override-caps-not-floors edge, weight ordering, PD↔score mapping, and
 *  determinism/monotonicity.
 *
 *  base = 1000·(0.25·nav + 0.15·att + 0.15·rep + 0.20·col + 0.25·sent)   (norm 0..1)
 *  sent<0.35 → min(base,250) | 0.35≤sent<0.60 → base·(0.5+0.5·sent) | sent≥0.60 → base
 *  pdBps = round(10000·(1 − score/1000))
 * ============================================================================
 */

const S = (o: any = {}): Signals => ({
  navPunctuality: o.nav ?? 0,
  attestationConsistency: o.att ?? 0,
  repaymentReliability: o.rep ?? 0,
  collateralRatioBps: o.col ?? 0,
  activityScore: o.act ?? 0,
  offChainSentiment: o.sent ?? 0,
  epoch: o.epoch ?? 0,
});
const STRONG = { nav: 1000, att: 1000, rep: 1000, col: 10000, act: 1000 };

describe("pdModel.scoreIssuer", function () {
  // ── M0: exported constants ────────────────────────────────────────────
  describe("M0 · exports", function () {
    it("threshold constants are as documented", function () {
      expect(ALARM_THRESHOLD).to.equal(300);
      expect(DEFAULT_PROPOSE_PD).to.equal(6000);
      expect(DEFAULT_PROPOSE_SCORE).to.equal(200);
    });
  });

  // ── M1: bounds ────────────────────────────────────────────────────────
  describe("M1 · bounds", function () {
    it("all-zero → score 0, PD 100%", function () {
      const r = scoreIssuer(S({}));
      expect(r.score).to.equal(0);
      expect(r.pdBps).to.equal(10000);
    });
    it("all-max + full sentiment → score 1000, PD 0%", function () {
      const r = scoreIssuer(S({ ...STRONG, sent: 1000 }));
      expect(r.score).to.equal(1000);
      expect(r.pdBps).to.equal(0);
    });
    it("score ∈ [0,1000], pd ∈ [0,10000] across a sweep", function () {
      for (const sent of [0, 200, 349, 350, 500, 599, 600, 800, 1000]) {
        const r = scoreIssuer(S({ ...STRONG, sent }));
        expect(r.score).to.be.within(0, 1000);
        expect(r.pdBps).to.be.within(0, 10000);
      }
    });
  });

  // ── M2: distress-override branch (BVA 349/350 + caps-not-floors) ──────
  describe("M2 · distress override", function () {
    it("sent 0 → override (distress)", function () {
      expect(scoreIssuer(S({ ...STRONG, sent: 0 })).driver).to.contain("distress override");
    });
    it("BVA: sent 349 → override caps at 250", function () {
      const r = scoreIssuer(S({ ...STRONG, sent: 349 }));
      expect(r.score).to.equal(250);
      expect(r.score).to.be.lessThan(ALARM_THRESHOLD);
      expect(r.driver).to.contain("distress override");
    });
    it("BVA: sent 350 → haircut branch, score > 250", function () {
      const r = scoreIssuer(S({ ...STRONG, sent: 350 }));
      expect(r.score).to.be.greaterThan(250);
      expect(r.driver).to.contain("caution haircut");
    });
    it("override CAPS but does not FLOOR (low base stays below 250)", function () {
      const r = scoreIssuer(S({ nav: 100, sent: 100 })); // base ≈ 50
      expect(r.score).to.equal(50);
      expect(r.driver).to.contain("distress override");
    });
  });

  // ── M3: elevated-fear branch (BVA 599/600) ────────────────────────────
  describe("M3 · elevated-fear boundary", function () {
    it("sent 599 → haircut (below full base)", function () {
      const r = scoreIssuer(S({ ...STRONG, sent: 599 }));
      expect(r.driver).to.contain("caution haircut");
    });
    it("sent 600 → fundamentals (full base), strictly higher than 599", function () {
      const lo = scoreIssuer(S({ ...STRONG, sent: 599 })).score;
      const hi = scoreIssuer(S({ ...STRONG, sent: 600 }));
      expect(hi.driver).to.contain("fundamentals");
      expect(hi.score).to.be.greaterThan(lo);
    });
  });

  // ── M4: driver partitions (EP + boundary drivers) ─────────────────────
  describe("M4 · driver classification", function () {
    const cases: [number, string][] = [
      [100, "distress override"], [349, "distress override"],
      [350, "caution haircut"], [450, "caution haircut"], [599, "caution haircut"],
      [600, "fundamentals"], [900, "fundamentals"],
    ];
    cases.forEach(([sent, label]) =>
      it(`sent ${sent} → "${label}"`, function () {
        expect(scoreIssuer(S({ ...STRONG, sent })).driver).to.contain(label);
      })
    );
  });

  // ── M5: weight ordering (fundamentals branch, sent fixed @600) ────────
  describe("M5 · weights", function () {
    it("nav(0.25) > col(0.20) > att(0.15) == rep(0.15)", function () {
      const sent = 600;
      const nav = scoreIssuer(S({ nav: 1000, sent })).score;  // 400
      const col = scoreIssuer(S({ col: 10000, sent })).score; // 350
      const att = scoreIssuer(S({ att: 1000, sent })).score;  // 300
      const rep = scoreIssuer(S({ rep: 1000, sent })).score;  // 300
      expect(nav).to.be.greaterThan(col);
      expect(col).to.be.greaterThan(att);
      expect(att).to.equal(rep);
    });
  });

  // ── M6: PD ↔ score mapping ────────────────────────────────────────────
  describe("M6 · PD mapping", function () {
    it("score 250 → PD 7500 (> propose threshold)", function () {
      const r = scoreIssuer(S({ ...STRONG, sent: 349 }));
      expect(r.score).to.equal(250);
      expect(r.pdBps).to.equal(7500);
      expect(r.pdBps).to.be.greaterThan(DEFAULT_PROPOSE_PD);
    });
    it("score 500 → PD 5000", function () {
      const r = scoreIssuer(S({ nav: 1000, sent: 1000 })); // base 500, fundamentals
      expect(r.score).to.equal(500);
      expect(r.pdBps).to.equal(5000);
    });
  });

  // ── M7: monotonicity & determinism ────────────────────────────────────
  describe("M7 · monotonicity & determinism", function () {
    it("higher collateral → higher score (fundamentals branch)", function () {
      const lo = scoreIssuer(S({ ...STRONG, col: 5000, sent: 800 })).score;
      const hi = scoreIssuer(S({ ...STRONG, col: 10000, sent: 800 })).score;
      expect(hi).to.be.greaterThan(lo);
    });
    it("identical input → identical output", function () {
      const o = { nav: 321, att: 654, rep: 222, col: 8765, act: 543, sent: 480 };
      const a = scoreIssuer(S(o)), b = scoreIssuer(S(o));
      expect(a.score).to.equal(b.score);
      expect(a.pdBps).to.equal(b.pdBps);
      expect(a.driver).to.equal(b.driver);
    });
  });

  // ── M8: collateral bps scale ──────────────────────────────────────────
  describe("M8 · collateral bps scale", function () {
    it("col 10000 (100%) contributes more than col 1000 (10%)", function () {
      const full = scoreIssuer(S({ col: 10000, sent: 1000 })).score;
      const tenth = scoreIssuer(S({ col: 1000, sent: 1000 })).score;
      expect(full).to.be.greaterThan(tenth);
    });
  });
});
