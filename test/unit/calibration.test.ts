import { expect } from "chai";
import {
  calibrateAlarmThreshold,
  ALARM_THRESHOLD,
  CALIBRATION_STEP,
  ALARM_MIN,
  ALARM_MAX,
} from "../../agent/pdModel";

/**
 * ============================================================================
 *  calibrateAlarmThreshold — the agent "learns calibration" from resolved outcomes
 * ============================================================================
 *  A minimal, deterministic, bounded online update: each RESOLVED benchmark outcome
 *  nudges the alarm threshold. A miss (false negative) makes the agent more sensitive;
 *  a cry-wolf (false positive) makes it less. This backs an HONEST "learns calibration"
 *  claim (not opaque ML) — the agent genuinely adapts its sensitivity to its track record.
 * ============================================================================
 */
describe("calibrateAlarmThreshold — adaptive calibration", function () {
  it("no change when the call was correct (no FP/FN)", function () {
    expect(calibrateAlarmThreshold(ALARM_THRESHOLD, {})).to.equal(ALARM_THRESHOLD);
    expect(calibrateAlarmThreshold(ALARM_THRESHOLD, { falseNegative: false, falsePositive: false }))
      .to.equal(ALARM_THRESHOLD);
  });

  it("false NEGATIVE raises the threshold (become MORE sensitive)", function () {
    expect(calibrateAlarmThreshold(ALARM_THRESHOLD, { falseNegative: true }))
      .to.equal(ALARM_THRESHOLD + CALIBRATION_STEP);
  });

  it("false POSITIVE lowers the threshold (become LESS sensitive)", function () {
    expect(calibrateAlarmThreshold(ALARM_THRESHOLD, { falsePositive: true }))
      .to.equal(ALARM_THRESHOLD - CALIBRATION_STEP);
  });

  it("clamps to [ALARM_MIN, ALARM_MAX]", function () {
    let hi = ALARM_MAX;
    for (let i = 0; i < 20; i++) hi = calibrateAlarmThreshold(hi, { falseNegative: true });
    expect(hi).to.equal(ALARM_MAX);
    let lo = ALARM_MIN;
    for (let i = 0; i < 20; i++) lo = calibrateAlarmThreshold(lo, { falsePositive: true });
    expect(lo).to.equal(ALARM_MIN);
  });

  it("converges over a sequence of outcomes (learns from its record)", function () {
    let t = ALARM_THRESHOLD;
    t = calibrateAlarmThreshold(t, { falseNegative: true });
    t = calibrateAlarmThreshold(t, { falseNegative: true });
    t = calibrateAlarmThreshold(t, { falseNegative: true });
    expect(t).to.equal(ALARM_THRESHOLD + 3 * CALIBRATION_STEP);
    t = calibrateAlarmThreshold(t, { falsePositive: true }); // one cry-wolf walks it back a step
    expect(t).to.equal(ALARM_THRESHOLD + 2 * CALIBRATION_STEP);
  });

  it("is deterministic (same input → same output)", function () {
    const a = calibrateAlarmThreshold(330, { falsePositive: true });
    const b = calibrateAlarmThreshold(330, { falsePositive: true });
    expect(a).to.equal(b);
  });
});
