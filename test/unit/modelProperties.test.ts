import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import { scoreIssuer, Signals, ALARM_THRESHOLD } from "../../agent/pdModel";

/**
 * ============================================================================
 *  Model PROPERTIES across MULTIPLE datasets (behaviour, not just line coverage)
 * ============================================================================
 *  100% line coverage of a deterministic scorecard says nothing about whether the
 *  MODEL behaves sensibly. These property tests exercise behaviour across BOTH
 *  shipped datasets: valid ranges, determinism, monotonicity, and — crucially —
 *  that the AI's lead is DATA-DEPENDENT (varies by dataset), not a hardcoded 3.
 * ============================================================================
 */
const load = (f: string) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "agent", "data", f), "utf8"));
const DATASETS = ["usdc_svb.json", "trade_finance_fraud.json"];

const toSig = (r: any): Signals => ({
  navPunctuality: r.navPunctuality, attestationConsistency: r.attestationConsistency,
  repaymentReliability: r.repaymentReliability, collateralRatioBps: r.collateralRatioBps,
  activityScore: r.activityScore, offChainSentiment: r.offChainSentiment, epoch: r.epoch,
});
// mirror of IRSOracle.computeStaticScore (integer floor) — the sentiment-blind static arm
const staticScore = (r: any) => {
  const f = Math.floor;
  return Math.min(
    f(r.navPunctuality * 250 / 1000) + f(r.attestationConsistency * 250 / 1000) +
    f(r.repaymentReliability * 300 / 1000) + f(Math.min(r.collateralRatioBps, 10000) * 150 / 10000) +
    f(r.activityScore * 50 / 1000), 1000);
};
const firstAlarm = (rows: any[], ev: number, scoreOf: (r: any) => number) => {
  for (const r of rows) if (r.epoch <= ev && scoreOf(r) < ALARM_THRESHOLD) return r.epoch;
  return -1;
};
const lead = (rows: any[], ev: number, scoreOf: (r: any) => number) => {
  const a = firstAlarm(rows, ev, scoreOf);
  return a < 0 ? -1 : ev - a;
};

describe("model properties (multi-dataset)", function () {
  DATASETS.forEach((file) => {
    describe(file, function () {
      const d = load(file);
      const rows: any[] = d.epochs;
      const ev: number = d.event.eventEpoch;

      it("score + PD stay in valid range every epoch", function () {
        for (const r of rows) {
          const pd = scoreIssuer(toSig(r));
          expect(pd.score, `epoch ${r.epoch} score`).to.be.within(0, 1000);
          expect(pd.pdBps, `epoch ${r.epoch} pd`).to.be.within(0, 10000);
        }
      });

      it("model is deterministic per epoch (same input → same output)", function () {
        for (const r of rows) expect(scoreIssuer(toSig(r)).score).to.equal(scoreIssuer(toSig(r)).score);
      });

      it("AI never alarms LATER than the rulebook (aiLead >= staticLead)", function () {
        expect(lead(rows, ev, (r) => scoreIssuer(toSig(r)).score))
          .to.be.at.least(lead(rows, ev, staticScore));
      });
    });
  });

  it("PROPERTY: the AI lead VARIES across datasets (data-dependent, not a constant 3)", function () {
    const leads = DATASETS.map((file) => {
      const d = load(file);
      return lead(d.epochs, d.event.eventEpoch, (r: any) => scoreIssuer(toSig(r)).score);
    });
    expect(new Set(leads).size, "leads should differ across datasets").to.be.greaterThan(1);
    expect(leads).to.include(3); // USDC-SVB (sentiment-led)
    expect(leads).to.include(0); // fundamentals-led boundary (AI ties)
  });

  it("PROPERTY: scoreIssuer is monotonic non-decreasing in collateral (calm sentiment)", function () {
    const base = {
      navPunctuality: 800, attestationConsistency: 800, repaymentReliability: 800,
      collateralRatioBps: 5000, activityScore: 500, offChainSentiment: 800, epoch: 0,
    };
    let prev = -1;
    for (let col = 5000; col <= 13000; col += 1000) {
      const s = scoreIssuer({ ...base, collateralRatioBps: col } as Signals).score;
      expect(s, `collateral ${col}`).to.be.at.least(prev);
      prev = s;
    }
  });
});
