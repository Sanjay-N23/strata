import { expect } from "chai";
import { blendScore, pdFromScore } from "../../agent/index";

/**
 * ============================================================================
 *  blendScore — the LLM advisory is LOAD-BEARING (unit)
 * ============================================================================
 *  Pins the rule that turns the LLM from cosmetic into causal: GLM-4.6's bounded
 *  advisory (adjustment ∈ [-50,50], confidence ∈ [0,1]) shifts the on-chain score.
 *  A zero advisory (the deterministic offline / no-API-key path) is a strict no-op,
 *  so removing the LLM changes the on-chain decision ONLY when it actually spoke —
 *  and runs stay reproducible otherwise.
 * ============================================================================
 */
describe("blendScore — LLM advisory is load-bearing", function () {
  it("offline no-op: a zero advisory leaves the score unchanged (reproducible)", function () {
    expect(blendScore(800, 0, 0)).to.equal(800);
    expect(blendScore(250, 0, 0)).to.equal(250);
  });
  it("a negative advisory lowers the on-chain score (LLM causally affects the call)", function () {
    expect(blendScore(310, -40, 0.5)).to.equal(290); // -40 * 0.5 = -20
  });
  it("a positive advisory raises it", function () {
    expect(blendScore(280, 40, 1)).to.equal(320);
  });
  it("clamps adjustment to [-50,50] and confidence to [0,1]", function () {
    expect(blendScore(500, -999, 5)).to.equal(450); // adj→-50, conf→1
    expect(blendScore(500, 999, -5)).to.equal(500); // conf→0 → no change
  });
  it("clamps the blended result to 0..1000", function () {
    expect(blendScore(10, -50, 1)).to.equal(0);
    expect(blendScore(990, 50, 1)).to.equal(1000); // 1040 → 1000
  });
  it("pdFromScore is the monotone PD mapping used on-chain", function () {
    expect(pdFromScore(1000)).to.equal(0);
    expect(pdFromScore(0)).to.equal(10000);
    expect(pdFromScore(250)).to.equal(7500);
  });
});
