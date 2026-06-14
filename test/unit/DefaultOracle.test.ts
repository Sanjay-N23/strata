import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { DefaultOracle } from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("DefaultOracle", function () {
  // DefaultEventType enum values
  const PAYMENT_DELAY = 0;
  const GHOST_ISSUER = 1;
  const COLLATERAL_SHORTFALL = 2;
  const MISAPPROPRIATION = 3;

  async function deployFixture() {
    const [owner, tir, irsOracle, insurancePool, payoutEngine, issuerRegistry, tokenAddr, tokenAddr2, unauthorized] =
      await ethers.getSigners();

    const Factory = await ethers.getContractFactory("DefaultOracle");
    const oracle = await Factory.deploy(tir.address);

    await oracle.setIRSOracle(irsOracle.address);
    await oracle.setInsurancePool(insurancePool.address);
    await oracle.setPayoutEngine(payoutEngine.address);
    await oracle.setIssuerRegistry(issuerRegistry.address);

    return { oracle, owner, tir, irsOracle, insurancePool, payoutEngine, issuerRegistry, tokenAddr, tokenAddr2, unauthorized };
  }

  async function deployWithFlaggedPaymentDelay() {
    const base = await deployFixture();
    const { oracle, tokenAddr } = base;
    await oracle.flagDefaultEvent(tokenAddr.address, PAYMENT_DELAY);
    return base;
  }

  // ────────────────────────────────────────────────────────────────────
  // 1. Default Event Initiation (4 types)
  // ────────────────────────────────────────────────────────────────────
  describe("Default Event Initiation", function () {
    it("should flag a PAYMENT_DELAY event", async function () {
      const { oracle, tokenAddr } = await loadFixture(deployFixture);
      await oracle.flagDefaultEvent(tokenAddr.address, PAYMENT_DELAY);

      const evt = await oracle.getActiveEvent(tokenAddr.address);
      expect(evt.eventType).to.equal(PAYMENT_DELAY);
      expect(evt.isActive).to.equal(true);
      expect(evt.isConfirmed).to.equal(false);
    });

    it("should flag a GHOST_ISSUER event", async function () {
      const { oracle, tokenAddr } = await loadFixture(deployFixture);
      await oracle.flagDefaultEvent(tokenAddr.address, GHOST_ISSUER);

      const evt = await oracle.getActiveEvent(tokenAddr.address);
      expect(evt.eventType).to.equal(GHOST_ISSUER);
      expect(evt.isActive).to.equal(true);
    });

    it("should flag a COLLATERAL_SHORTFALL event", async function () {
      const { oracle, tokenAddr } = await loadFixture(deployFixture);
      await oracle.flagDefaultEvent(tokenAddr.address, COLLATERAL_SHORTFALL);

      const evt = await oracle.getActiveEvent(tokenAddr.address);
      expect(evt.eventType).to.equal(COLLATERAL_SHORTFALL);
      expect(evt.isActive).to.equal(true);
    });

    it("should flag a MISAPPROPRIATION event", async function () {
      const { oracle, tokenAddr } = await loadFixture(deployFixture);
      await oracle.flagDefaultEvent(tokenAddr.address, MISAPPROPRIATION);

      const evt = await oracle.getActiveEvent(tokenAddr.address);
      expect(evt.eventType).to.equal(MISAPPROPRIATION);
      expect(evt.isActive).to.equal(true);
    });

    it("should set firstFlaggedBlock to current block", async function () {
      const { oracle, tokenAddr } = await loadFixture(deployFixture);
      await oracle.flagDefaultEvent(tokenAddr.address, PAYMENT_DELAY);

      const evt = await oracle.getActiveEvent(tokenAddr.address);
      expect(evt.firstFlaggedBlock).to.be.gt(0);
    });

    it("should activate monitoring with correct event type bitmask", async function () {
      const { oracle, tokenAddr } = await loadFixture(deployFixture);
      await oracle.flagDefaultEvent(tokenAddr.address, GHOST_ISSUER); // type 1 => bitmask 0b0010 = 2

      const monitoring = await oracle.getMonitoringState(tokenAddr.address);
      expect(monitoring.active).to.equal(true);
      expect(monitoring.eventTypeFlags).to.equal(1 << GHOST_ISSUER); // 2
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // 2. Grace Period Enforcement (48h, 72h, 7d)
  // ────────────────────────────────────────────────────────────────────
  describe("Grace Period Enforcement", function () {
    it("should set 48h grace for PAYMENT_DELAY (57600 blocks)", async function () {
      const { oracle, tokenAddr } = await loadFixture(deployFixture);
      const tx = await oracle.flagDefaultEvent(tokenAddr.address, PAYMENT_DELAY);
      const receipt = await tx.wait();
      const blockNum = receipt!.blockNumber;

      const evt = await oracle.getActiveEvent(tokenAddr.address);
      expect(evt.graceExpiryBlock).to.equal(blockNum + 57600);
    });

    it("should set 72h grace for GHOST_ISSUER (86400 blocks)", async function () {
      const { oracle, tokenAddr } = await loadFixture(deployFixture);
      const tx = await oracle.flagDefaultEvent(tokenAddr.address, GHOST_ISSUER);
      const receipt = await tx.wait();
      const blockNum = receipt!.blockNumber;

      const evt = await oracle.getActiveEvent(tokenAddr.address);
      expect(evt.graceExpiryBlock).to.equal(blockNum + 86400);
    });

    it("should set 7d grace for COLLATERAL_SHORTFALL (201600 blocks)", async function () {
      const { oracle, tokenAddr } = await loadFixture(deployFixture);
      const tx = await oracle.flagDefaultEvent(tokenAddr.address, COLLATERAL_SHORTFALL);
      const receipt = await tx.wait();
      const blockNum = receipt!.blockNumber;

      const evt = await oracle.getActiveEvent(tokenAddr.address);
      expect(evt.graceExpiryBlock).to.equal(blockNum + 201600);
    });

    it("should set no grace period for MISAPPROPRIATION (immediate)", async function () {
      const { oracle, tokenAddr } = await loadFixture(deployFixture);
      const tx = await oracle.flagDefaultEvent(tokenAddr.address, MISAPPROPRIATION);
      const receipt = await tx.wait();
      const blockNum = receipt!.blockNumber;

      const evt = await oracle.getActiveEvent(tokenAddr.address);
      // graceExpiryBlock == block.number (immediate)
      expect(evt.graceExpiryBlock).to.equal(blockNum);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // 3. TIR Confirmation Requirement
  // ────────────────────────────────────────────────────────────────────
  describe("TIR Confirmation", function () {
    it("should allow TIR to confirm a default event", async function () {
      const { oracle, tir, tokenAddr } = await loadFixture(deployWithFlaggedPaymentDelay);

      await oracle.connect(tir).processConfirmation(tokenAddr.address);
      expect(await oracle.isDefaultConfirmed(tokenAddr.address)).to.equal(true);
    });

    it("should allow owner to confirm a default event", async function () {
      const { oracle, tokenAddr } = await loadFixture(deployWithFlaggedPaymentDelay);

      await oracle.processConfirmation(tokenAddr.address);
      expect(await oracle.isDefaultConfirmed(tokenAddr.address)).to.equal(true);
    });

    it("should reject unauthorized confirmation", async function () {
      const { oracle, unauthorized, tokenAddr } = await loadFixture(deployWithFlaggedPaymentDelay);

      await expect(
        oracle.connect(unauthorized).processConfirmation(tokenAddr.address)
      ).to.be.revertedWith("DefaultOracle: unauthorized");
    });

    it("should reject double confirmation", async function () {
      const { oracle, tir, tokenAddr } = await loadFixture(deployWithFlaggedPaymentDelay);

      await oracle.connect(tir).processConfirmation(tokenAddr.address);
      await expect(
        oracle.connect(tir).processConfirmation(tokenAddr.address)
      ).to.be.revertedWith("DefaultOracle: already confirmed");
    });

    it("should set confirmation block on processConfirmation", async function () {
      const { oracle, tir, tokenAddr } = await loadFixture(deployWithFlaggedPaymentDelay);

      const tx = await oracle.connect(tir).processConfirmation(tokenAddr.address);
      const receipt = await tx.wait();

      const confirmBlock = await oracle.getDefaultConfirmationBlock(tokenAddr.address);
      expect(confirmBlock).to.equal(receipt!.blockNumber);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // 4. State Transitions During Default Process
  // ────────────────────────────────────────────────────────────────────
  describe("State Transitions", function () {
    it("should transition from unflagged to active (flagged)", async function () {
      const { oracle, tokenAddr } = await loadFixture(deployFixture);

      // Before flagging
      const evtBefore = await oracle.getActiveEvent(tokenAddr.address);
      expect(evtBefore.isActive).to.equal(false);

      // After flagging
      await oracle.flagDefaultEvent(tokenAddr.address, PAYMENT_DELAY);
      const evtAfter = await oracle.getActiveEvent(tokenAddr.address);
      expect(evtAfter.isActive).to.equal(true);
      expect(evtAfter.isConfirmed).to.equal(false);
    });

    it("should transition from active to confirmed", async function () {
      const { oracle, tir, tokenAddr } = await loadFixture(deployWithFlaggedPaymentDelay);

      await oracle.connect(tir).processConfirmation(tokenAddr.address);

      const evt = await oracle.getActiveEvent(tokenAddr.address);
      expect(evt.isActive).to.equal(true);
      expect(evt.isConfirmed).to.equal(true);
      expect(evt.confirmationBlock).to.be.gt(0);
    });

    it("should transition from active to cleared via clearMonitoring", async function () {
      const { oracle, tokenAddr } = await loadFixture(deployWithFlaggedPaymentDelay);

      await oracle.clearMonitoring(tokenAddr.address);

      const evt = await oracle.getActiveEvent(tokenAddr.address);
      expect(evt.isActive).to.equal(false);

      const monitoring = await oracle.getMonitoringState(tokenAddr.address);
      expect(monitoring.active).to.equal(false);
    });

    it("should track isInMonitoring correctly through lifecycle", async function () {
      const { oracle, tokenAddr } = await loadFixture(deployFixture);

      // Before flagging
      expect(await oracle.isInMonitoring(tokenAddr.address)).to.equal(false);

      // After flagging
      await oracle.flagDefaultEvent(tokenAddr.address, PAYMENT_DELAY);
      expect(await oracle.isInMonitoring(tokenAddr.address)).to.equal(true);

      // After clearing
      await oracle.clearMonitoring(tokenAddr.address);
      expect(await oracle.isInMonitoring(tokenAddr.address)).to.equal(false);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // 5. Multiple Simultaneous Default Events
  // ────────────────────────────────────────────────────────────────────
  describe("Multiple Simultaneous Default Events", function () {
    it("should handle different tokens with independent events", async function () {
      const { oracle, tokenAddr, tokenAddr2 } = await loadFixture(deployFixture);

      await oracle.flagDefaultEvent(tokenAddr.address, PAYMENT_DELAY);
      await oracle.flagDefaultEvent(tokenAddr2.address, GHOST_ISSUER);

      const evt1 = await oracle.getActiveEvent(tokenAddr.address);
      const evt2 = await oracle.getActiveEvent(tokenAddr2.address);

      expect(evt1.eventType).to.equal(PAYMENT_DELAY);
      expect(evt2.eventType).to.equal(GHOST_ISSUER);
      expect(evt1.isActive).to.equal(true);
      expect(evt2.isActive).to.equal(true);
    });

    it("should allow confirming one token without affecting another", async function () {
      const { oracle, tir, tokenAddr, tokenAddr2 } = await loadFixture(deployFixture);

      await oracle.flagDefaultEvent(tokenAddr.address, PAYMENT_DELAY);
      await oracle.flagDefaultEvent(tokenAddr2.address, COLLATERAL_SHORTFALL);

      await oracle.connect(tir).processConfirmation(tokenAddr.address);

      expect(await oracle.isDefaultConfirmed(tokenAddr.address)).to.equal(true);
      expect(await oracle.isDefaultConfirmed(tokenAddr2.address)).to.equal(false);
    });

    it("should allow clearing one token without affecting another", async function () {
      const { oracle, tokenAddr, tokenAddr2 } = await loadFixture(deployFixture);

      await oracle.flagDefaultEvent(tokenAddr.address, PAYMENT_DELAY);
      await oracle.flagDefaultEvent(tokenAddr2.address, GHOST_ISSUER);

      await oracle.clearMonitoring(tokenAddr.address);

      expect(await oracle.isInMonitoring(tokenAddr.address)).to.equal(false);
      expect(await oracle.isInMonitoring(tokenAddr2.address)).to.equal(true);
    });

    it("should allow ESCALATION but block softening of the active event type", async function () {
      const { oracle, tokenAddr } = await loadFixture(deployFixture);

      await oracle.flagDefaultEvent(tokenAddr.address, COLLATERAL_SHORTFALL); // 7d grace
      // escalate to a more urgent (shorter-grace) type — allowed
      await oracle.flagDefaultEvent(tokenAddr.address, PAYMENT_DELAY);        // 48h grace
      expect((await oracle.getActiveEvent(tokenAddr.address)).eventType).to.equal(PAYMENT_DELAY);
      // softening back to a longer window — blocked
      await expect(oracle.flagDefaultEvent(tokenAddr.address, COLLATERAL_SHORTFALL))
        .to.be.revertedWith("DefaultOracle: cannot soften active event");
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // 6. Unauthorized Default Trigger Rejection
  // ────────────────────────────────────────────────────────────────────
  describe("Unauthorized Default Trigger Rejection", function () {
    it("should reject non-owner from flagging events", async function () {
      const { oracle, unauthorized, tokenAddr } = await loadFixture(deployFixture);

      await expect(
        oracle.connect(unauthorized).flagDefaultEvent(tokenAddr.address, PAYMENT_DELAY)
      ).to.be.reverted;
    });

    it("should reject TIR from flagging events (TIR can only confirm)", async function () {
      const { oracle, tir, tokenAddr } = await loadFixture(deployFixture);

      await expect(
        oracle.connect(tir).flagDefaultEvent(tokenAddr.address, PAYMENT_DELAY)
      ).to.be.reverted;
    });

    it("should reject non-owner from clearing monitoring", async function () {
      const { oracle, unauthorized, tokenAddr } = await loadFixture(deployWithFlaggedPaymentDelay);

      await expect(
        oracle.connect(unauthorized).clearMonitoring(tokenAddr.address)
      ).to.be.reverted;
    });

    it("should reject flagging after confirmed default", async function () {
      const { oracle, tir, tokenAddr } = await loadFixture(deployWithFlaggedPaymentDelay);

      await oracle.connect(tir).processConfirmation(tokenAddr.address);

      await expect(
        oracle.flagDefaultEvent(tokenAddr.address, GHOST_ISSUER)
      ).to.be.revertedWith("DefaultOracle: already confirmed");
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // 7. PayoutEngine Notification on Confirmed Default
  // ────────────────────────────────────────────────────────────────────
  describe("PayoutEngine Notification", function () {
    it("should set defaultConfirmed flag accessible by PayoutEngine", async function () {
      const { oracle, tir, payoutEngine, tokenAddr } = await loadFixture(deployWithFlaggedPaymentDelay);

      await oracle.connect(tir).processConfirmation(tokenAddr.address);

      // PayoutEngine can query the confirmed status
      const confirmed = await oracle.connect(payoutEngine).isDefaultConfirmed(tokenAddr.address);
      expect(confirmed).to.equal(true);
    });

    it("should record confirmation block for PayoutEngine timing", async function () {
      const { oracle, tir, tokenAddr } = await loadFixture(deployWithFlaggedPaymentDelay);

      const tx = await oracle.connect(tir).processConfirmation(tokenAddr.address);
      const receipt = await tx.wait();

      const confirmationBlock = await oracle.getDefaultConfirmationBlock(tokenAddr.address);
      expect(confirmationBlock).to.equal(receipt!.blockNumber);
    });

    it("should store payoutEngine address correctly", async function () {
      const { oracle, payoutEngine } = await loadFixture(deployFixture);
      expect(await oracle.payoutEngine()).to.equal(payoutEngine.address);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // 8. IssuerRegistry Status Update Coordination
  // ────────────────────────────────────────────────────────────────────
  describe("IssuerRegistry Coordination", function () {
    it("should store issuerRegistry address", async function () {
      const { oracle, issuerRegistry } = await loadFixture(deployFixture);
      expect(await oracle.issuerRegistry()).to.equal(issuerRegistry.address);
    });

    it("should allow owner to update issuerRegistry", async function () {
      const { oracle, unauthorized } = await loadFixture(deployFixture);
      await oracle.setIssuerRegistry(unauthorized.address);
      expect(await oracle.issuerRegistry()).to.equal(unauthorized.address);
    });

    it("should reject non-owner setting issuerRegistry", async function () {
      const { oracle, unauthorized } = await loadFixture(deployFixture);
      await expect(
        oracle.connect(unauthorized).setIssuerRegistry(unauthorized.address)
      ).to.be.reverted;
    });

    it("should store all protocol addresses correctly", async function () {
      const { oracle, tir, irsOracle, insurancePool, payoutEngine, issuerRegistry } =
        await loadFixture(deployFixture);

      expect(await oracle.tir()).to.equal(tir.address);
      expect(await oracle.irsOracle()).to.equal(irsOracle.address);
      expect(await oracle.insurancePool()).to.equal(insurancePool.address);
      expect(await oracle.payoutEngine()).to.equal(payoutEngine.address);
      expect(await oracle.issuerRegistry()).to.equal(issuerRegistry.address);
    });

    it("should reject non-owner for all admin setters", async function () {
      const { oracle, unauthorized } = await loadFixture(deployFixture);

      await expect(oracle.connect(unauthorized).setIRSOracle(unauthorized.address)).to.be.reverted;
      await expect(oracle.connect(unauthorized).setInsurancePool(unauthorized.address)).to.be.reverted;
      await expect(oracle.connect(unauthorized).setPayoutEngine(unauthorized.address)).to.be.reverted;
      await expect(oracle.connect(unauthorized).setIssuerRegistry(unauthorized.address)).to.be.reverted;
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // 9. Event Emissions for Monitoring
  // ────────────────────────────────────────────────────────────────────
  describe("Event Emissions", function () {
    it("should emit DefaultEventFlagged on flagging", async function () {
      const { oracle, tokenAddr } = await loadFixture(deployFixture);

      await expect(oracle.flagDefaultEvent(tokenAddr.address, PAYMENT_DELAY))
        .to.emit(oracle, "DefaultEventFlagged");
    });

    it("should emit DefaultEventFlagged with correct grace expiry", async function () {
      const { oracle, tokenAddr } = await loadFixture(deployFixture);

      const tx = await oracle.flagDefaultEvent(tokenAddr.address, PAYMENT_DELAY);
      const receipt = await tx.wait();
      const blockNum = receipt!.blockNumber;

      // Verify event args
      await expect(tx)
        .to.emit(oracle, "DefaultEventFlagged")
        .withArgs(tokenAddr.address, PAYMENT_DELAY, blockNum + 57600);
    });

    it("should emit MonitoringActivated on flagging", async function () {
      const { oracle, tokenAddr } = await loadFixture(deployFixture);

      await expect(oracle.flagDefaultEvent(tokenAddr.address, COLLATERAL_SHORTFALL))
        .to.emit(oracle, "MonitoringActivated")
        .withArgs(tokenAddr.address, 1 << COLLATERAL_SHORTFALL); // bitmask 4
    });

    it("should emit DefaultEventConfirmed on confirmation", async function () {
      const { oracle, tir, tokenAddr } = await loadFixture(deployWithFlaggedPaymentDelay);

      await expect(oracle.connect(tir).processConfirmation(tokenAddr.address))
        .to.emit(oracle, "DefaultEventConfirmed");
    });

    it("should emit MonitoringCleared on clearing", async function () {
      const { oracle, tokenAddr } = await loadFixture(deployWithFlaggedPaymentDelay);

      await expect(oracle.clearMonitoring(tokenAddr.address))
        .to.emit(oracle, "MonitoringCleared")
        .withArgs(tokenAddr.address);
    });

    it("should emit correct event type in DefaultEventConfirmed", async function () {
      const { oracle, tir, tokenAddr } = await loadFixture(deployWithFlaggedPaymentDelay);

      const tx = await oracle.connect(tir).processConfirmation(tokenAddr.address);
      const receipt = await tx.wait();

      await expect(tx)
        .to.emit(oracle, "DefaultEventConfirmed")
        .withArgs(tokenAddr.address, PAYMENT_DELAY, receipt!.blockNumber);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // 10. Edge Cases (re-triggering after resolution)
  // ────────────────────────────────────────────────────────────────────
  describe("Edge Cases", function () {
    it("should allow re-flagging after clearMonitoring for unconfirmed events", async function () {
      const { oracle, tokenAddr } = await loadFixture(deployWithFlaggedPaymentDelay);

      await oracle.clearMonitoring(tokenAddr.address);

      // Re-flag should succeed since defaultConfirmed is still false
      await expect(oracle.flagDefaultEvent(tokenAddr.address, GHOST_ISSUER)).to.not.be.reverted;

      const evt = await oracle.getActiveEvent(tokenAddr.address);
      expect(evt.eventType).to.equal(GHOST_ISSUER);
      expect(evt.isActive).to.equal(true);
    });

    it("should not allow re-flagging after confirmed default", async function () {
      const { oracle, tir, tokenAddr } = await loadFixture(deployWithFlaggedPaymentDelay);

      await oracle.connect(tir).processConfirmation(tokenAddr.address);

      await expect(
        oracle.flagDefaultEvent(tokenAddr.address, GHOST_ISSUER)
      ).to.be.revertedWith("DefaultOracle: already confirmed");
    });

    it("should handle flagging for address with no prior events", async function () {
      const { oracle, unauthorized } = await loadFixture(deployFixture);
      // unauthorized is just a fresh address with no event history
      await expect(
        oracle.flagDefaultEvent(unauthorized.address, MISAPPROPRIATION)
      ).to.not.be.reverted;
    });

    it("should handle confirmation for unflagged address (edge case)", async function () {
      const { oracle, tir, tokenAddr } = await loadFixture(deployFixture);

      // processConfirmation on an address with no active event
      // Should succeed since there is no guard requiring isActive
      await oracle.connect(tir).processConfirmation(tokenAddr.address);
      expect(await oracle.isDefaultConfirmed(tokenAddr.address)).to.equal(true);
    });

    it("escalating the event type preserves the original flag time (no clock reset)", async function () {
      const { oracle, tokenAddr } = await loadFixture(deployFixture);

      // Flag PAYMENT_DELAY first (48h grace)
      await oracle.flagDefaultEvent(tokenAddr.address, PAYMENT_DELAY);
      const first = (await oracle.getActiveEvent(tokenAddr.address)).firstFlaggedBlock;

      // Escalate to MISAPPROPRIATION (0 grace) — allowed; original flag time is preserved
      await oracle.flagDefaultEvent(tokenAddr.address, MISAPPROPRIATION);

      const evt = await oracle.getActiveEvent(tokenAddr.address);
      expect(evt.eventType).to.equal(MISAPPROPRIATION);
      expect(evt.firstFlaggedBlock).to.equal(first); // grace clock NOT reset by the re-flag
      // MISAPPROPRIATION has 0 grace, so expiry is the (later) escalation block, not the original
      expect(evt.graceExpiryBlock).to.be.greaterThan(evt.firstFlaggedBlock);
    });

    it("should delete all event data on clearMonitoring", async function () {
      const { oracle, tokenAddr } = await loadFixture(deployWithFlaggedPaymentDelay);

      await oracle.clearMonitoring(tokenAddr.address);

      const evt = await oracle.getActiveEvent(tokenAddr.address);
      expect(evt.isActive).to.equal(false);
      expect(evt.isConfirmed).to.equal(false);
      expect(evt.firstFlaggedBlock).to.equal(0);
      expect(evt.graceExpiryBlock).to.equal(0);
      expect(evt.confirmationBlock).to.equal(0);
    });

    it("should return correct view function defaults for uninitialized token", async function () {
      const { oracle, tokenAddr } = await loadFixture(deployFixture);

      expect(await oracle.isInMonitoring(tokenAddr.address)).to.equal(false);
      expect(await oracle.isDefaultConfirmed(tokenAddr.address)).to.equal(false);
      expect(await oracle.getDefaultConfirmationBlock(tokenAddr.address)).to.equal(0);
    });

    it("constants should have correct values", async function () {
      const { oracle } = await loadFixture(deployFixture);

      expect(await oracle.BLOCKS_PER_HOUR()).to.equal(1200);
      expect(await oracle.GRACE_48H()).to.equal(57600);
      expect(await oracle.GRACE_72H()).to.equal(86400);
      expect(await oracle.GRACE_7D()).to.equal(201600);
    });
  });
});
