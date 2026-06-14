import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

/**
 * ============================================================================
 *  DefaultOracle.sol — Strata AI-proposer hook (EXHAUSTIVE)
 * ============================================================================
 *  Covers ONLY the new access path (rest of DefaultOracle → DefaultOracle.test.ts):
 *    • setAIProposer (owner-only, rotation, zero-disable)
 *    • flagDefaultEvent authorisation EP {owner✓, proposer✓, other✗, owner-retains}
 *    • the proposer path produces correct monitoring state + grace periods (BVA over
 *      the 4 event types)
 *    • the human gate: a confirmed default cannot be re-flagged
 *
 *  Grace (blocks): PAYMENT_DELAY 57600 · GHOST_ISSUER 86400 · COLLATERAL_SHORTFALL
 *  201600 · MISAPPROPRIATION 0.
 * ============================================================================
 */

const PAYMENT_DELAY = 0, GHOST_ISSUER = 1, COLLATERAL_SHORTFALL = 2, MISAPPROPRIATION = 3;
const ZA = ethers.ZeroAddress;
const rnd = () => ethers.Wallet.createRandom().address;

describe("DefaultOracle · Strata AI-proposer hook", function () {
  async function fx() {
    const [owner, tir, proposer, proposer2, other] = await ethers.getSigners();
    const oracle = await (await ethers.getContractFactory("DefaultOracle")).deploy(tir.address);
    return { owner, tir, proposer, proposer2, other, oracle };
  }

  // ── M0: setAIProposer ─────────────────────────────────────────────────
  describe("M0 · setAIProposer", function () {
    it("owner sets the proposer", async function () {
      const { oracle, proposer } = await loadFixture(fx);
      await oracle.setAIProposer(proposer.address);
      expect(await oracle.aiProposer()).to.equal(proposer.address);
    });
    it("owner-only", async function () {
      const { oracle, other, proposer } = await loadFixture(fx);
      await expect(oracle.connect(other).setAIProposer(proposer.address))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });
    it("can be unset to address(0)", async function () {
      const { oracle, proposer } = await loadFixture(fx);
      await oracle.setAIProposer(proposer.address);
      await oracle.setAIProposer(ZA);
      expect(await oracle.aiProposer()).to.equal(ZA);
    });
  });

  // ── M1: flag authorization (EP over caller classes) ───────────────────
  describe("M1 · flag authorization", function () {
    it("owner can flag", async function () {
      const { oracle } = await loadFixture(fx);
      await expect(oracle.flagDefaultEvent(rnd(), PAYMENT_DELAY)).to.not.be.reverted;
    });
    it("the AI proposer can flag once set", async function () {
      const { oracle, proposer } = await loadFixture(fx);
      await oracle.setAIProposer(proposer.address);
      await expect(oracle.connect(proposer).flagDefaultEvent(rnd(), GHOST_ISSUER)).to.not.be.reverted;
    });
    it("a random address cannot flag", async function () {
      const { oracle, other } = await loadFixture(fx);
      await expect(oracle.connect(other).flagDefaultEvent(rnd(), PAYMENT_DELAY))
        .to.be.revertedWith("DefaultOracle: not authorized to flag");
    });
    it("an unset proposer address is rejected (no address(0) bypass)", async function () {
      const { oracle, proposer } = await loadFixture(fx);
      await expect(oracle.connect(proposer).flagDefaultEvent(rnd(), PAYMENT_DELAY))
        .to.be.revertedWith("DefaultOracle: not authorized to flag");
    });
    it("owner RETAINS the ability to flag after a proposer is set", async function () {
      const { oracle, proposer } = await loadFixture(fx);
      await oracle.setAIProposer(proposer.address);
      await expect(oracle.flagDefaultEvent(rnd(), PAYMENT_DELAY)).to.not.be.reverted;
    });
  });

  // ── M2: proposer rotation & disable ───────────────────────────────────
  describe("M2 · proposer rotation", function () {
    it("rotating the proposer revokes the old one", async function () {
      const { oracle, proposer, proposer2 } = await loadFixture(fx);
      await oracle.setAIProposer(proposer.address);
      await oracle.setAIProposer(proposer2.address);
      await expect(oracle.connect(proposer2).flagDefaultEvent(rnd(), PAYMENT_DELAY)).to.not.be.reverted;
      await expect(oracle.connect(proposer).flagDefaultEvent(rnd(), PAYMENT_DELAY))
        .to.be.revertedWith("DefaultOracle: not authorized to flag");
    });
    it("unsetting the proposer (zero) disables the proposer path; owner still flags", async function () {
      const { oracle, proposer } = await loadFixture(fx);
      await oracle.setAIProposer(proposer.address);
      await oracle.setAIProposer(ZA);
      await expect(oracle.connect(proposer).flagDefaultEvent(rnd(), PAYMENT_DELAY))
        .to.be.revertedWith("DefaultOracle: not authorized to flag");
      await expect(oracle.flagDefaultEvent(rnd(), PAYMENT_DELAY)).to.not.be.reverted; // owner ok
    });
  });

  // ── M3: proposer flag → monitoring state ──────────────────────────────
  describe("M3 · proposer flag state", function () {
    it("activates monitoring with the right type, unconfirmed, emits event", async function () {
      const { oracle, proposer } = await loadFixture(fx);
      await oracle.setAIProposer(proposer.address);
      const token = rnd();
      await expect(oracle.connect(proposer).flagDefaultEvent(token, COLLATERAL_SHORTFALL))
        .to.emit(oracle, "DefaultEventFlagged");
      const e = await oracle.getActiveEvent(token);
      expect(e.isActive).to.equal(true);
      expect(e.eventType).to.equal(COLLATERAL_SHORTFALL);
      expect(await oracle.isInMonitoring(token)).to.equal(true);
      expect(await oracle.isDefaultConfirmed(token)).to.equal(false);
    });
  });

  // ── M4: grace periods per event type (BVA over the 4 types) ───────────
  describe("M4 · grace periods via proposer path", function () {
    const cases: [string, number, number][] = [
      ["PAYMENT_DELAY → 48h", PAYMENT_DELAY, 57600],
      ["GHOST_ISSUER → 72h", GHOST_ISSUER, 86400],
      ["COLLATERAL_SHORTFALL → 7d", COLLATERAL_SHORTFALL, 201600],
      ["MISAPPROPRIATION → 0", MISAPPROPRIATION, 0],
    ];
    cases.forEach(([name, type, grace]) =>
      it(name, async function () {
        const { oracle, proposer } = await loadFixture(fx);
        await oracle.setAIProposer(proposer.address);
        const token = rnd();
        await oracle.connect(proposer).flagDefaultEvent(token, type);
        const e = await oracle.getActiveEvent(token);
        expect(e.graceExpiryBlock - e.firstFlaggedBlock).to.equal(grace);
      })
    );
  });

  // ── M5: re-flag & human-gate guard ────────────────────────────────────
  describe("M5 · re-flag & confirmed-default guard", function () {
    it("re-flagging an UNCONFIRMED issuer may ESCALATE but not soften/reset the grace window", async function () {
      const { oracle, proposer } = await loadFixture(fx);
      await oracle.setAIProposer(proposer.address);
      const token = rnd();
      // escalation: start lenient (7d) → escalate to urgent (0 grace) — allowed, flag time preserved
      await oracle.connect(proposer).flagDefaultEvent(token, COLLATERAL_SHORTFALL);
      const first = (await oracle.getActiveEvent(token)).firstFlaggedBlock;
      await oracle.connect(proposer).flagDefaultEvent(token, MISAPPROPRIATION);
      const e = await oracle.getActiveEvent(token);
      expect(e.eventType).to.equal(MISAPPROPRIATION);
      expect(e.firstFlaggedBlock).to.equal(first); // grace clock NOT reset
      // softening: relaxing back to a longer window is blocked
      await expect(oracle.connect(proposer).flagDefaultEvent(token, PAYMENT_DELAY))
        .to.be.revertedWith("DefaultOracle: cannot soften active event");
    });
    it("HUMAN GATE: a CONFIRMED default cannot be re-flagged (even by an authorized caller)", async function () {
      const { oracle, proposer } = await loadFixture(fx);
      await oracle.setAIProposer(proposer.address);
      const token = rnd();
      await oracle.connect(proposer).flagDefaultEvent(token, PAYMENT_DELAY);
      await oracle.processConfirmation(token); // owner stands in for TIR 2-of-3
      await expect(oracle.connect(proposer).flagDefaultEvent(token, MISAPPROPRIATION))
        .to.be.revertedWith("DefaultOracle: already confirmed");
    });
  });

  // ── M6: additional edges (bitmask, events, parity, isolation) ─────────
  describe("M6 · additional edges", function () {
    it("monitoring bitmask = 1<<eventType for each type", async function () {
      const { oracle, proposer } = await loadFixture(fx);
      await oracle.setAIProposer(proposer.address);
      const masks = [1, 2, 4, 8];
      for (let t = 0; t < 4; t++) {
        const token = rnd();
        await oracle.connect(proposer).flagDefaultEvent(token, t);
        expect((await oracle.monitoringStates(token)).eventTypeFlags).to.equal(masks[t]);
      }
    });
    it("emits MonitoringActivated with the bitmask", async function () {
      const { oracle, proposer } = await loadFixture(fx);
      await oracle.setAIProposer(proposer.address);
      const token = rnd();
      await expect(oracle.connect(proposer).flagDefaultEvent(token, GHOST_ISSUER))
        .to.emit(oracle, "MonitoringActivated").withArgs(token, 2); // 1<<1
    });
    it("owner-path and proposer-path produce identical state (parity)", async function () {
      const { oracle, proposer } = await loadFixture(fx);
      await oracle.setAIProposer(proposer.address);
      const a = rnd(), b = rnd();
      await oracle.flagDefaultEvent(a, COLLATERAL_SHORTFALL);                    // owner
      await oracle.connect(proposer).flagDefaultEvent(b, COLLATERAL_SHORTFALL);  // proposer
      const ea = await oracle.getActiveEvent(a);
      const eb = await oracle.getActiveEvent(b);
      expect(ea.eventType).to.equal(eb.eventType);
      expect(ea.graceExpiryBlock - ea.firstFlaggedBlock).to.equal(eb.graceExpiryBlock - eb.firstFlaggedBlock);
    });
    it("flags multiple issuers independently (isolation)", async function () {
      const { oracle, proposer } = await loadFixture(fx);
      await oracle.setAIProposer(proposer.address);
      const a = rnd(), b = rnd();
      await oracle.connect(proposer).flagDefaultEvent(a, PAYMENT_DELAY);
      expect(await oracle.isInMonitoring(a)).to.equal(true);
      expect(await oracle.isInMonitoring(b)).to.equal(false); // untouched
    });
    it("zero-address token is accepted (trusted input)", async function () {
      const { oracle, proposer } = await loadFixture(fx);
      await oracle.setAIProposer(proposer.address);
      await expect(oracle.connect(proposer).flagDefaultEvent(ZA, PAYMENT_DELAY)).to.not.be.reverted;
      expect((await oracle.getActiveEvent(ZA)).isActive).to.equal(true);
    });
  });
});
