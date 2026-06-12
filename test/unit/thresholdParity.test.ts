import { expect } from "chai";
import { ethers } from "hardhat";
import {
  ALARM_THRESHOLD,
  DEFAULT_PROPOSE_PD,
  DEFAULT_PROPOSE_SCORE,
} from "../../agent/pdModel";

/**
 * ============================================================================
 *  White-box parity guard — off-chain agent thresholds MUST equal the on-chain
 *  contract constants. (Gap-fill #2: nothing previously cross-checked the JS
 *  `pdModel` thresholds against the Solidity `TuringBenchmark.ALARM_THRESHOLD`.)
 *
 *  Why it matters: the AI "alarms" off-chain when its score < ALARM_THRESHOLD,
 *  and the benchmark scores the lead-time on-chain using the SAME constant. A
 *  one-sided edit (change one, forget the other) would silently break the whole
 *  Turing proof — the AI could "alarm" at a score the chain still treats as calm.
 * ============================================================================
 */
describe("threshold parity (off-chain pdModel ↔ on-chain TuringBenchmark)", function () {
  it("pdModel.ALARM_THRESHOLD === TuringBenchmark.ALARM_THRESHOLD (== 300)", async function () {
    const bench = await (await ethers.getContractFactory("TuringBenchmark")).deploy();
    const onChain = Number(await bench.ALARM_THRESHOLD());
    expect(ALARM_THRESHOLD, "off-chain alarm line").to.equal(onChain);
    expect(onChain, "documented alarm line").to.equal(300);
  });

  it("a score-driven default proposal only fires inside the distress zone (≤ alarm)", function () {
    // DEFAULT_PROPOSE_SCORE must sit at/below the alarm line so a purely
    // score-triggered proposeDefault never fires on a name the chain calls calm.
    expect(DEFAULT_PROPOSE_SCORE).to.be.at.most(ALARM_THRESHOLD);
  });

  it("documented agent constants are unchanged (drift tripwire)", function () {
    // If any of these legitimately change, update this test AND the contract in
    // the same commit — that's the point of the tripwire.
    expect(ALARM_THRESHOLD, "ALARM_THRESHOLD").to.equal(300);
    expect(DEFAULT_PROPOSE_PD, "DEFAULT_PROPOSE_PD").to.equal(6000);
    expect(DEFAULT_PROPOSE_SCORE, "DEFAULT_PROPOSE_SCORE").to.equal(200);
  });
});
