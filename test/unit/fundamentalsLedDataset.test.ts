import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import { scoreIssuer, Signals } from "../../agent/pdModel";

/**
 * ============================================================================
 *  agent/data/trade_finance_fraud.json — BOUNDARY fixture (the AI does NOT win)
 * ============================================================================
 *  The Turing benchmark is only meaningful if the AI arm can FAIL to lead. This
 *  control dataset is a fundamentals-led shock where off-chain sentiment never
 *  moves ahead of the fundamentals, so the sentiment-aware AI arm has no edge and
 *  TIES the rules-based baseline (both first alarm at the event epoch; lead delta
 *  0). Asserting the tie — not a win — is what turns the suite from confirmation
 *  into evaluation, and backs the "edge is the signal, not magic" claim.
 *
 *  Mirrors the helpers in usdcSvbDataset.test.ts so the two datasets are scored
 *  by the identical AI (pdModel.scoreIssuer) and static (computeStaticScore) arms.
 * ============================================================================
 */

const data = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "..", "agent", "data", "trade_finance_fraud.json"), "utf8")
);
const rows: any[] = data.epochs;
const ALARM = 300;

const toSig = (r: any): Signals => ({
  navPunctuality: r.navPunctuality, attestationConsistency: r.attestationConsistency,
  repaymentReliability: r.repaymentReliability, collateralRatioBps: r.collateralRatioBps,
  activityScore: r.activityScore, offChainSentiment: r.offChainSentiment, epoch: r.epoch,
});
// mirror of IRSOracle.computeStaticScore (integer floor) — identical to usdcSvbDataset.test.ts
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

describe("trade_finance_fraud.json dataset (boundary / control)", function () {
  describe("M0 · structure & event block", function () {
    it("has the required top-level keys", function () {
      expect(data).to.include.keys(["issuerLabel", "source", "event", "epochs"]);
    });
    it("epochs are 0..N-1, contiguous, ascending, unique", function () {
      const eps = rows.map(r => r.epoch);
      expect(new Set(eps).size).to.equal(eps.length);
      for (let i = 0; i < eps.length; i++) expect(eps[i]).to.equal(i);
    });
    it("event is a real default within range", function () {
      expect(data.event.type).to.be.within(0, 3);
      expect(data.event.defaulted).to.equal(true);
      expect(data.event.eventEpoch).to.be.within(0, rows.length - 1);
    });
  });

  describe("M1 · the AI does NOT lead (fundamentals-led shock → tie)", function () {
    it("both arms first alarm at the SAME epoch (the event epoch)", function () {
      const ev = data.event.eventEpoch;
      const aiFirst = firstAlarm(r => scoreIssuer(toSig(r)).score);
      const staticFirst = firstAlarm(r => staticScore(r));
      expect(aiFirst).to.equal(ev);
      expect(staticFirst).to.equal(ev);
    });
    it("lead delta is 0 — no AI advantage when sentiment doesn't lead", function () {
      const ev = data.event.eventEpoch;
      const aiLead = ev - firstAlarm(r => scoreIssuer(toSig(r)).score);
      const staticLead = ev - firstAlarm(r => staticScore(r));
      expect(aiLead).to.equal(0);
      expect(staticLead).to.equal(0);
      expect(aiLead - staticLead).to.equal(0); // TIE
    });
    it("neither arm alarms before the event (calm until the shock)", function () {
      for (const r of rows) {
        if (r.epoch < data.event.eventEpoch) {
          expect(scoreIssuer(toSig(r)).score, `AI epoch ${r.epoch}`).to.be.greaterThanOrEqual(ALARM);
          expect(staticScore(r), `static epoch ${r.epoch}`).to.be.greaterThanOrEqual(ALARM);
        }
      }
    });
  });

  describe("M2 · narrative invariant (sentiment does NOT lead)", function () {
    it("sentiment stays calm (>=600) until the fundamentals break", function () {
      for (const r of rows) {
        if (r.epoch < data.event.eventEpoch) {
          expect(r.offChainSentiment, `epoch ${r.epoch} sentiment`).to.be.greaterThanOrEqual(600);
        }
      }
    });
  });
});
