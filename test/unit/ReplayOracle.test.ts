import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

/**
 * ============================================================================
 *  ReplayOracle.sol — EXHAUSTIVE test suite
 * ============================================================================
 *  Streams timestamped IssuerSignals into the protocol for the Turing replay.
 *  Modules: storage fidelity & type boundaries (BVA on uint16/uint64/bytes32),
 *  access EP (owner / keeper / other, owner-retains), latestEpoch = MAX tracking
 *  (incl. equal/zero/uint64-max boundaries), overwrite semantics, per-issuer
 *  isolation, default/gap reads, and the cursor (independent of latestEpoch).
 * ============================================================================
 */

const ZA = ethers.ZeroAddress;
const U16 = 65535;
const U64_MAX = 18446744073709551615n;
const rnd = () => ethers.Wallet.createRandom().address;

const SIG = (o: any = {}) => ({
  navPunctuality: o.nav ?? 0,
  attestationConsistency: o.att ?? 0,
  repaymentReliability: o.rep ?? 0,
  collateralRatioBps: o.col ?? 0,
  activityScore: o.act ?? 0,
  offChainSentiment: o.sent ?? 0,
  epoch: o.epoch ?? 0,
  sourceHash: o.sourceHash ?? ethers.ZeroHash,
});

describe("ReplayOracle", function () {
  async function fx() {
    const [owner, keeper, other, issuer, issuer2] = await ethers.getSigners();
    const replay = await (await ethers.getContractFactory("ReplayOracle")).deploy();
    return { owner, keeper, other, issuer, issuer2, replay };
  }

  // ── M0: deployment ────────────────────────────────────────────────────
  describe("M0 · deployment", function () {
    it("no keeper; zero epoch & cursor", async function () {
      const { replay, issuer } = await loadFixture(fx);
      expect(await replay.replayKeeper()).to.equal(ZA);
      expect(await replay.latestEpoch(issuer.address)).to.equal(0);
      expect(await replay.cursor(issuer.address)).to.equal(0);
    });
  });

  // ── M1: setReplayKeeper ───────────────────────────────────────────────
  describe("M1 · setReplayKeeper", function () {
    it("owner sets keeper + emits ReplayKeeperUpdated", async function () {
      const { replay, keeper } = await loadFixture(fx);
      await expect(replay.setReplayKeeper(keeper.address))
        .to.emit(replay, "ReplayKeeperUpdated").withArgs(keeper.address);
      expect(await replay.replayKeeper()).to.equal(keeper.address);
    });
    it("is owner-only", async function () {
      const { replay, other } = await loadFixture(fx);
      await expect(replay.connect(other).setReplayKeeper(other.address))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });
    it("can be unset to address(0) (owner path still works)", async function () {
      const { replay, keeper, other, issuer } = await loadFixture(fx);
      await replay.setReplayKeeper(keeper.address);
      await replay.setReplayKeeper(ZA);
      expect(await replay.replayKeeper()).to.equal(ZA);
      await expect(replay.connect(other).pushSignals(issuer.address, SIG({}))).to.be.revertedWith("Replay: not keeper");
      await expect(replay.pushSignals(issuer.address, SIG({}))).to.not.be.reverted; // owner ok
    });
  });

  // ── M2: pushSignals — full field fidelity ─────────────────────────────
  describe("M2 · pushSignals fidelity", function () {
    it("round-trips all 8 fields; epoch key matches", async function () {
      const { replay, issuer } = await loadFixture(fx);
      const hash = ethers.id("row");
      const s = SIG({ nav: 910, att: 820, rep: 730, col: 9100, act: 640, sent: 150, epoch: 3, sourceHash: hash });
      await replay.pushSignals(issuer.address, s);
      const r = await replay.signalsAt(issuer.address, 3);
      expect(r.navPunctuality).to.equal(910);
      expect(r.attestationConsistency).to.equal(820);
      expect(r.repaymentReliability).to.equal(730);
      expect(r.collateralRatioBps).to.equal(9100);
      expect(r.activityScore).to.equal(640);
      expect(r.offChainSentiment).to.equal(150);
      expect(r.epoch).to.equal(3);
      expect(r.sourceHash).to.equal(hash);
    });
  });

  // ── M3: pushSignals — event (BVA on sourceHash) ───────────────────────
  describe("M3 · SignalsPushed event", function () {
    it("emits with epoch + zero sourceHash", async function () {
      const { replay, issuer } = await loadFixture(fx);
      await expect(replay.pushSignals(issuer.address, SIG({ epoch: 1 })))
        .to.emit(replay, "SignalsPushed").withArgs(issuer.address, 1, ethers.ZeroHash);
    });
    it("emits with max bytes32 sourceHash", async function () {
      const { replay, issuer } = await loadFixture(fx);
      const hash = "0x" + "ff".repeat(32);
      await expect(replay.pushSignals(issuer.address, SIG({ epoch: 2, sourceHash: hash })))
        .to.emit(replay, "SignalsPushed").withArgs(issuer.address, 2, hash);
    });
  });

  // ── M4: pushSignals — access (EP + owner-retains) ─────────────────────
  describe("M4 · pushSignals access", function () {
    it("owner ✓ (no keeper set), random ✗, set keeper ✓", async function () {
      const { replay, other, keeper, issuer } = await loadFixture(fx);
      await expect(replay.connect(other).pushSignals(issuer.address, SIG({}))).to.be.revertedWith("Replay: not keeper");
      await replay.setReplayKeeper(keeper.address);
      await expect(replay.connect(keeper).pushSignals(issuer.address, SIG({}))).to.not.be.reverted;
    });
    it("owner RETAINS access after a keeper is set", async function () {
      const { replay, keeper, issuer } = await loadFixture(fx);
      await replay.setReplayKeeper(keeper.address);
      await expect(replay.pushSignals(issuer.address, SIG({ epoch: 1 }))).to.not.be.reverted; // owner || keeper
    });
  });

  // ── M5: latestEpoch = MAX (BVA) ───────────────────────────────────────
  describe("M5 · latestEpoch tracking", function () {
    it("keeps the maximum, ignores lower pushes", async function () {
      const { replay, issuer } = await loadFixture(fx);
      await replay.pushSignals(issuer.address, SIG({ epoch: 0 }));
      expect(await replay.latestEpoch(issuer.address)).to.equal(0);
      await replay.pushSignals(issuer.address, SIG({ epoch: 5 }));
      await replay.pushSignals(issuer.address, SIG({ epoch: 3 })); // lower
      expect(await replay.latestEpoch(issuer.address)).to.equal(5);
    });
    it("re-pushing the current max epoch keeps it (>=)", async function () {
      const { replay, issuer } = await loadFixture(fx);
      await replay.pushSignals(issuer.address, SIG({ epoch: 5 }));
      await replay.pushSignals(issuer.address, SIG({ epoch: 5 }));
      expect(await replay.latestEpoch(issuer.address)).to.equal(5);
    });
    it("uint64-max epoch is tracked", async function () {
      const { replay, issuer } = await loadFixture(fx);
      await replay.pushSignals(issuer.address, SIG({ epoch: U64_MAX }));
      expect(await replay.latestEpoch(issuer.address)).to.equal(U64_MAX);
    });
  });

  // ── M6: overwrite ─────────────────────────────────────────────────────
  describe("M6 · overwrite", function () {
    it("re-pushing (issuer, epoch) overwrites with latest data", async function () {
      const { replay, issuer } = await loadFixture(fx);
      await replay.pushSignals(issuer.address, SIG({ nav: 100, epoch: 3 }));
      await replay.pushSignals(issuer.address, SIG({ nav: 950, epoch: 3 }));
      expect((await replay.signalsAt(issuer.address, 3)).navPunctuality).to.equal(950);
    });
    it("overwriting an OLD epoch does not lower latestEpoch", async function () {
      const { replay, issuer } = await loadFixture(fx);
      await replay.pushSignals(issuer.address, SIG({ epoch: 5 }));
      await replay.pushSignals(issuer.address, SIG({ nav: 1, epoch: 2 })); // overwrite older
      expect(await replay.latestEpoch(issuer.address)).to.equal(5);
    });
  });

  // ── M7: per-issuer isolation ──────────────────────────────────────────
  describe("M7 · isolation", function () {
    it("signals, latestEpoch and cursor are independent per issuer", async function () {
      const { replay, issuer, issuer2 } = await loadFixture(fx);
      await replay.pushSignals(issuer.address, SIG({ nav: 500, epoch: 1 }));
      await replay.pushSignals(issuer2.address, SIG({ nav: 900, epoch: 4 }));
      await replay.setCursor(issuer.address, 1);
      expect((await replay.signalsAt(issuer.address, 1)).navPunctuality).to.equal(500);
      expect((await replay.signalsAt(issuer2.address, 1)).navPunctuality).to.equal(0);
      expect(await replay.latestEpoch(issuer.address)).to.equal(1);
      expect(await replay.latestEpoch(issuer2.address)).to.equal(4);
      expect(await replay.cursor(issuer.address)).to.equal(1);
      expect(await replay.cursor(issuer2.address)).to.equal(0);
    });
  });

  // ── M8: default & gap reads ───────────────────────────────────────────
  describe("M8 · default reads", function () {
    it("never-pushed (issuer, epoch) → zero struct", async function () {
      const { replay, issuer } = await loadFixture(fx);
      const r = await replay.signalsAt(issuer.address, 42);
      expect(r.navPunctuality).to.equal(0);
      expect(r.collateralRatioBps).to.equal(0);
      expect(r.epoch).to.equal(0);
      expect(r.sourceHash).to.equal(ethers.ZeroHash);
    });
    it("a gap epoch between pushes reads zero", async function () {
      const { replay, issuer } = await loadFixture(fx);
      await replay.pushSignals(issuer.address, SIG({ nav: 5, epoch: 5 }));
      expect((await replay.signalsAt(issuer.address, 4)).navPunctuality).to.equal(0); // gap
    });
  });

  // ── M9: cursor ────────────────────────────────────────────────────────
  describe("M9 · cursor", function () {
    it("setCursor updates + emits CursorMoved", async function () {
      const { replay, issuer } = await loadFixture(fx);
      await expect(replay.setCursor(issuer.address, 4)).to.emit(replay, "CursorMoved").withArgs(issuer.address, 4);
      expect(await replay.cursor(issuer.address)).to.equal(4);
    });
    it("owner ✓, keeper ✓, random ✗", async function () {
      const { replay, keeper, other, issuer } = await loadFixture(fx);
      await expect(replay.connect(other).setCursor(issuer.address, 1)).to.be.revertedWith("Replay: not keeper");
      await replay.setReplayKeeper(keeper.address);
      await expect(replay.connect(keeper).setCursor(issuer.address, 2)).to.not.be.reverted;
    });
    it("uint64-max cursor; independent of latestEpoch & signals", async function () {
      const { replay, issuer } = await loadFixture(fx);
      await replay.pushSignals(issuer.address, SIG({ nav: 7, epoch: 5 }));
      await replay.setCursor(issuer.address, U64_MAX);
      expect(await replay.cursor(issuer.address)).to.equal(U64_MAX);
      expect(await replay.latestEpoch(issuer.address)).to.equal(5);            // unchanged
      expect((await replay.signalsAt(issuer.address, 5)).navPunctuality).to.equal(7); // unchanged
    });
  });

  // ── M10: type boundaries ──────────────────────────────────────────────
  describe("M10 · type boundaries", function () {
    it("round-trips uint16/uint64/bytes32 extremes", async function () {
      const { replay, issuer } = await loadFixture(fx);
      const hash = "0x" + "ff".repeat(32);
      const s = SIG({ nav: U16, col: U16, sent: U16, epoch: U64_MAX, sourceHash: hash });
      await replay.pushSignals(issuer.address, s);
      const r = await replay.signalsAt(issuer.address, U64_MAX);
      expect(r.navPunctuality).to.equal(U16);
      expect(r.collateralRatioBps).to.equal(U16);
      expect(r.offChainSentiment).to.equal(U16);
      expect(r.epoch).to.equal(U64_MAX);
      expect(r.sourceHash).to.equal(hash);
      expect(await replay.latestEpoch(issuer.address)).to.equal(U64_MAX);
    });
  });

  // ── M11: additional edge cases ────────────────────────────────────────
  describe("M11 · additional edges", function () {
    it("epoch 0 is a valid key (readable; latestEpoch 0)", async function () {
      const { replay, issuer } = await loadFixture(fx);
      await replay.pushSignals(issuer.address, SIG({ nav: 42, epoch: 0 }));
      expect((await replay.signalsAt(issuer.address, 0)).navPunctuality).to.equal(42);
      expect(await replay.latestEpoch(issuer.address)).to.equal(0);
    });
    it("multiple epochs for one issuer are stored independently (no cross-overwrite)", async function () {
      const { replay, issuer } = await loadFixture(fx);
      await replay.pushSignals(issuer.address, SIG({ nav: 1, epoch: 1 }));
      await replay.pushSignals(issuer.address, SIG({ nav: 2, epoch: 2 }));
      await replay.pushSignals(issuer.address, SIG({ nav: 3, epoch: 3 }));
      expect((await replay.signalsAt(issuer.address, 1)).navPunctuality).to.equal(1);
      expect((await replay.signalsAt(issuer.address, 2)).navPunctuality).to.equal(2);
      expect((await replay.signalsAt(issuer.address, 3)).navPunctuality).to.equal(3);
    });
    it("zero-address issuer key is accepted (trusted input)", async function () {
      const { replay } = await loadFixture(fx);
      await expect(replay.pushSignals(ZA, SIG({ nav: 9, epoch: 1 }))).to.not.be.reverted;
      expect((await replay.signalsAt(ZA, 1)).navPunctuality).to.equal(9);
    });
    it("keeper rotation + idempotent re-set", async function () {
      const { replay, keeper, other, issuer } = await loadFixture(fx);
      await replay.setReplayKeeper(keeper.address);
      await replay.setReplayKeeper(keeper.address); // idempotent
      await replay.setReplayKeeper(other.address);  // rotate
      await expect(replay.connect(other).pushSignals(issuer.address, SIG({}))).to.not.be.reverted;
      await expect(replay.connect(keeper).pushSignals(issuer.address, SIG({}))).to.be.revertedWith("Replay: not keeper");
    });
    it("cursor can move backward (unconstrained)", async function () {
      const { replay, issuer } = await loadFixture(fx);
      await replay.setCursor(issuer.address, 5);
      await replay.setCursor(issuer.address, 2);
      expect(await replay.cursor(issuer.address)).to.equal(2);
    });
  });
});
