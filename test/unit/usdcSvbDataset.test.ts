import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import { scoreIssuer, Signals } from "../../agent/pdModel";

/**
 * ============================================================================
 *  agent/data/usdc_svb.json — ground-truth dataset (validation)
 * ============================================================================
 *  A data fixture has no runtime logic, so the meaningful checks are:
 *    • structural validity & schema conformance
 *    • field-range BVA/EP (uint16/uint64 + semantic 0..1000 / 0..20000)
 *    • sequence invariants (contiguous, ascending, unique epochs; event in range)
 *    • FIT-FOR-PURPOSE: the dataset must actually be a valid Turing fixture —
 *      the AI arm must flag distress earlier than the static rulebook, with the
 *      mechanistic cause (sentiment degrades before collateral collapses).
 * ============================================================================
 */

const data = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "..", "agent", "data", "usdc_svb.json"), "utf8")
);
const rows: any[] = data.epochs;

const SIGNAL_FIELDS = [
  "navPunctuality", "attestationConsistency", "repaymentReliability",
  "collateralRatioBps", "activityScore", "offChainSentiment",
];
const U16_MAX = 65535;
const ALARM = 300;

const toSig = (r: any): Signals => ({
  navPunctuality: r.navPunctuality, attestationConsistency: r.attestationConsistency,
  repaymentReliability: r.repaymentReliability, collateralRatioBps: r.collateralRatioBps,
  activityScore: r.activityScore, offChainSentiment: r.offChainSentiment, epoch: r.epoch,
});
// mirror of IRSOracle.computeStaticScore (integer floor)
const staticScore = (r: any) => {
  const f = Math.floor;
  return Math.min(
    f(r.navPunctuality * 250 / 1000) + f(r.attestationConsistency * 250 / 1000) +
    f(r.repaymentReliability * 300 / 1000) + f(Math.min(r.collateralRatioBps, 10000) * 150 / 10000) +
    f(r.activityScore * 50 / 1000), 1000);
};
const firstAlarm = (scoreOf: (r: any) => number) => {
  for (const r of rows) { if (r.epoch <= data.event.eventEpoch && scoreOf(r) < ALARM) return r.epoch; }
  return -1;
};

describe("usdc_svb.json dataset", function () {
  // ── M0: structure ─────────────────────────────────────────────────────
  describe("M0 · structure", function () {
    it("has the required top-level keys", function () {
      expect(data).to.include.keys(["issuerLabel", "source", "event", "epochs"]);
      expect(data.issuerLabel).to.be.a("string").and.not.empty;
      expect(data.source).to.be.a("string").and.not.empty;
    });
    it("epochs is a non-empty array", function () {
      expect(rows).to.be.an("array").with.length.greaterThan(0);
    });
  });

  // ── M1: event block ───────────────────────────────────────────────────
  describe("M1 · event block", function () {
    it("type is a valid DefaultEventType (0..3) and matches typeName", function () {
      expect(data.event.type).to.be.within(0, 3);
      expect(data.event.type).to.equal(2);               // COLLATERAL_SHORTFALL
      expect(data.event.typeName).to.equal("COLLATERAL_SHORTFALL");
    });
    it("defaulted is boolean true; eventEpoch is a non-negative integer", function () {
      expect(data.event.defaulted).to.equal(true);
      expect(Number.isInteger(data.event.eventEpoch)).to.equal(true);
      expect(data.event.eventEpoch).to.be.at.least(0);
    });
    it("carries an honest note (USDC repegged → shortfall event, not failure)", function () {
      expect(data.event.note).to.be.a("string").and.match(/repeg|shortfall/i);
    });
  });

  // ── M2: epoch sequence invariants ─────────────────────────────────────
  describe("M2 · epoch sequence", function () {
    it("epochs are 0..N-1, contiguous, ascending, unique", function () {
      const eps = rows.map(r => r.epoch);
      expect(new Set(eps).size).to.equal(eps.length);                // unique
      for (let i = 0; i < eps.length; i++) expect(eps[i]).to.equal(i); // contiguous & ascending
    });
    it("eventEpoch is within the dataset range", function () {
      expect(data.event.eventEpoch).to.be.within(0, rows.length - 1);
    });
  });

  // ── M3: per-row schema ────────────────────────────────────────────────
  describe("M3 · row schema", function () {
    rows.forEach((r, i) =>
      it(`row ${i} has all signal fields as integers (+ date)`, function () {
        for (const f of SIGNAL_FIELDS) {
          expect(r, `row ${i} missing ${f}`).to.have.property(f);
          expect(Number.isInteger(r[f]), `${f} not int`).to.equal(true);
        }
        expect(Number.isInteger(r.epoch)).to.equal(true);
        expect(r.date).to.be.a("string");
      })
    );
  });

  // ── M4: field-range BVA/EP ────────────────────────────────────────────
  describe("M4 · field ranges", function () {
    it("0..1000 signals stay in range", function () {
      for (const r of rows) {
        for (const f of ["navPunctuality", "attestationConsistency", "repaymentReliability", "activityScore", "offChainSentiment"]) {
          expect(r[f], `epoch ${r.epoch} ${f}`).to.be.within(0, 1000);
        }
      }
    });
    it("collateralRatioBps stays within 0..20000", function () {
      for (const r of rows) expect(r.collateralRatioBps, `epoch ${r.epoch}`).to.be.within(0, 20000);
    });
    it("every signal field is uint16-representable (<= 65535)", function () {
      for (const r of rows) for (const f of SIGNAL_FIELDS) expect(r[f]).to.be.at.most(U16_MAX);
    });
    it("epoch is a non-negative safe integer (uint64-representable)", function () {
      for (const r of rows) { expect(r.epoch).to.be.at.least(0); expect(Number.isSafeInteger(r.epoch)).to.equal(true); }
    });
  });

  // ── M5: fit-for-purpose (valid Turing fixture) ────────────────────────
  describe("M5 · fit for purpose", function () {
    it("the AI arm alarms strictly EARLIER than the static rulebook", function () {
      const aiFirst = firstAlarm(r => scoreIssuer(toSig(r)).score);
      const staticFirst = firstAlarm(r => staticScore(r));
      expect(aiFirst).to.be.greaterThanOrEqual(0);           // AI does alarm
      expect(aiFirst).to.be.lessThan(staticFirst === -1 ? Infinity : staticFirst); // earlier than static
    });
    it("matches the documented 3-vs-0 lead (AI epoch 3, rulebook epoch 6)", function () {
      const ev = data.event.eventEpoch;
      const aiFirst = firstAlarm(r => scoreIssuer(toSig(r)).score);
      const staticFirst = firstAlarm(r => staticScore(r));
      expect(ev - aiFirst).to.equal(3);     // AI lead
      expect(ev - staticFirst).to.equal(0); // static lead
    });
    it("the AI has alarmed by the event epoch", function () {
      const evRow = rows.find(r => r.epoch === data.event.eventEpoch);
      expect(scoreIssuer(toSig(evRow)).score).to.be.lessThan(ALARM);
    });
  });

  // ── M6: narrative / honesty invariants ────────────────────────────────
  describe("M6 · narrative invariants", function () {
    it("sentiment collapses BEFORE collateral (the AI's leading edge)", function () {
      // at the first epoch sentiment enters acute fear (<350), collateral is still healthy (>=90%)
      const firstFear = rows.find(r => r.offChainSentiment < 350);
      expect(firstFear, "expected a sentiment-collapse epoch").to.exist;
      expect(firstFear.collateralRatioBps).to.be.at.least(9000); // collateral still ~healthy
    });
    it("recovery: final epoch is healthier than the trough (USDC repegged)", function () {
      const last = rows[rows.length - 1];
      const trough = rows.find(r => r.epoch === data.event.eventEpoch);
      expect(last.collateralRatioBps).to.be.greaterThan(trough.collateralRatioBps);
      expect(last.offChainSentiment).to.be.greaterThan(trough.offChainSentiment);
    });
  });
});
