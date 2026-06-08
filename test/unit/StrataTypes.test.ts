import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

/**
 * ============================================================================
 *  StrataTypes.IssuerSignals — exhaustive test suite
 * ============================================================================
 *  StrataTypes.sol defines a pure struct (no behaviour of its own), so we test
 *  its semantics through the two contracts that consume it:
 *    - IRSOracle.computeStaticScore(IssuerSignals)  → the pure score mapping
 *    - ReplayOracle.pushSignals / signalsAt         → storage round-trip fidelity
 *
 *  Methods applied (called out per module):
 *    • Equivalence Partitioning (EP)   — valid / over-range / irrelevant classes
 *    • Boundary Value Analysis (BVA)   — min, min+1, max-1, max, max+1 per field
 *    • Truncation analysis             — integer floor() boundary per weighted dim
 *    • Metamorphic testing             — monotonicity & purity (same in → same out)
 *    • Combinatorial cross-check       — vs an independent JS mirror of the formula
 *
 *  Field map (see contracts/strata/StrataTypes.sol & IRSOracle.computeStaticScore):
 *    navPunctuality         0..1000  → dim max 250   (×0.25)
 *    attestationConsistency 0..1000  → dim max 250   (×0.25)
 *    repaymentReliability   0..1000  → dim max 300   (×0.30)
 *    collateralRatioBps     0..20000 → dim max 150   (×150/10000, capped @10000)
 *    activityScore          0..1000  → dim max 50    (×0.05)
 *    offChainSentiment      0..1000  → IGNORED (AI-only signal)
 *    epoch  uint64 · sourceHash bytes32 → carried, not scored
 *  total is capped at 1000.
 * ============================================================================
 */

type Sig = Partial<{
  nav: number; att: number; rep: number; col: number; act: number;
  sent: number; epoch: bigint | number; sourceHash: string;
}>;

const SIG = (o: Sig = {}) => ({
  navPunctuality: o.nav ?? 0,
  attestationConsistency: o.att ?? 0,
  repaymentReliability: o.rep ?? 0,
  collateralRatioBps: o.col ?? 0,
  activityScore: o.act ?? 0,
  offChainSentiment: o.sent ?? 0,
  epoch: o.epoch ?? 0,
  sourceHash: o.sourceHash ?? ethers.ZeroHash,
});

// Independent mirror of IRSOracle.computeStaticScore (integer floor math).
const mirror = (o: Sig = {}) => {
  const f = Math.floor;
  const nav = f((o.nav ?? 0) * 250 / 1000);
  const att = f((o.att ?? 0) * 250 / 1000);
  const rep = f((o.rep ?? 0) * 300 / 1000);
  const colR = Math.min(o.col ?? 0, 10000);
  const col = f(colR * 150 / 10000);
  const act = f((o.act ?? 0) * 50 / 1000);
  return Math.min(nav + att + rep + col + act, 1000);
};

describe("StrataTypes.IssuerSignals", function () {
  async function fx() {
    const [owner, issuer] = await ethers.getSigners();
    const oracle = await (await ethers.getContractFactory("IRSOracle")).deploy();
    const replay = await (await ethers.getContractFactory("ReplayOracle")).deploy();
    const ss = async (o: Sig = {}) => Number(await oracle.computeStaticScore(SIG(o)));
    return { owner, issuer, oracle, replay, ss };
  }

  // ── Module 0: struct integrity & zero-value ───────────────────────────
  describe("M0 · struct integrity & zero defaults", function () {
    it("accepts a fully-zero struct and scores 0", async function () {
      const { ss } = await loadFixture(fx);
      expect(await ss({})).to.equal(0);
    });
    it("is a pure function (no state, callable as view)", async function () {
      const { oracle } = await loadFixture(fx);
      expect(await oracle.computeStaticScore(SIG({ nav: 1000 }))).to.equal(250);
    });
  });

  // ── Module 1: navPunctuality (EP + BVA + truncation) ──────────────────
  describe("M1 · navPunctuality  [×0.25 → max 250]", function () {
    it("BVA: min 0 → 0", async () => expect(await (await loadFixture(fx)).ss({ nav: 0 })).to.equal(0));
    it("BVA: max 1000 → 250", async () => expect(await (await loadFixture(fx)).ss({ nav: 1000 })).to.equal(250));
    it("BVA: max-1 (999) → 249", async () => expect(await (await loadFixture(fx)).ss({ nav: 999 })).to.equal(249));
    it("truncation boundary: 3 → 0, 4 → 1 (floor of ×0.25)", async function () {
      const { ss } = await loadFixture(fx);
      expect(await ss({ nav: 3 })).to.equal(0);
      expect(await ss({ nav: 4 })).to.equal(1);
    });
    it("EP valid mid-partition: 600 → 150", async () => expect(await (await loadFixture(fx)).ss({ nav: 600 })).to.equal(150));
  });

  // ── Module 2: attestationConsistency (EP + BVA + truncation) ──────────
  describe("M2 · attestationConsistency  [×0.25 → max 250]", function () {
    it("BVA: 0 → 0", async () => expect(await (await loadFixture(fx)).ss({ att: 0 })).to.equal(0));
    it("BVA: 1000 → 250", async () => expect(await (await loadFixture(fx)).ss({ att: 1000 })).to.equal(250));
    it("BVA: 999 → 249", async () => expect(await (await loadFixture(fx)).ss({ att: 999 })).to.equal(249));
    it("truncation boundary: 3 → 0, 4 → 1", async function () {
      const { ss } = await loadFixture(fx);
      expect(await ss({ att: 3 })).to.equal(0);
      expect(await ss({ att: 4 })).to.equal(1);
    });
  });

  // ── Module 3: repaymentReliability (heaviest weight 0.30) ─────────────
  describe("M3 · repaymentReliability  [×0.30 → max 300]", function () {
    it("BVA: 0 → 0", async () => expect(await (await loadFixture(fx)).ss({ rep: 0 })).to.equal(0));
    it("BVA: 1000 → 300", async () => expect(await (await loadFixture(fx)).ss({ rep: 1000 })).to.equal(300));
    it("BVA: 999 → 299", async () => expect(await (await loadFixture(fx)).ss({ rep: 999 })).to.equal(299));
    it("truncation boundary: 3 → 0, 4 → 1 (floor of ×0.30)", async function () {
      const { ss } = await loadFixture(fx);
      expect(await ss({ rep: 3 })).to.equal(0);
      expect(await ss({ rep: 4 })).to.equal(1);
    });
    it("carries the most weight: rep 1000 (300) > nav 1000 (250)", async function () {
      const { ss } = await loadFixture(fx);
      expect(await ss({ rep: 1000 })).to.be.greaterThan(await ss({ nav: 1000 }));
    });
  });

  // ── Module 4: activityScore (lightest weight 0.05) ────────────────────
  describe("M4 · activityScore  [×0.05 → max 50]", function () {
    it("BVA: 0 → 0", async () => expect(await (await loadFixture(fx)).ss({ act: 0 })).to.equal(0));
    it("BVA: 1000 → 50", async () => expect(await (await loadFixture(fx)).ss({ act: 1000 })).to.equal(50));
    it("BVA: 999 → 49", async () => expect(await (await loadFixture(fx)).ss({ act: 999 })).to.equal(49));
    it("truncation boundary: 19 → 0, 20 → 1 (floor of ×0.05)", async function () {
      const { ss } = await loadFixture(fx);
      expect(await ss({ act: 19 })).to.equal(0);
      expect(await ss({ act: 20 })).to.equal(1);
    });
  });

  // ── Module 5: collateralRatioBps (bps scale + cap + truncation) ───────
  describe("M5 · collateralRatioBps  [×150/10000 → max 150, capped @10000]", function () {
    it("BVA: 0 → 0", async () => expect(await (await loadFixture(fx)).ss({ col: 0 })).to.equal(0));
    it("bps scale: 100% (10000 bps) → full 150", async () => expect(await (await loadFixture(fx)).ss({ col: 10000 })).to.equal(150));
    it("bps confusion guard: 1000 bps (10%) → 15, NOT full", async () => expect(await (await loadFixture(fx)).ss({ col: 1000 })).to.equal(15));
    it("BVA cap point: 9999 → 149, 10000 → 150", async function () {
      const { ss } = await loadFixture(fx);
      expect(await ss({ col: 9999 })).to.equal(149);
      expect(await ss({ col: 10000 })).to.equal(150);
    });
    it("BVA over-cap: 10001 → still 150 (clamped)", async () => expect(await (await loadFixture(fx)).ss({ col: 10001 })).to.equal(150));
    it("EP over-range: 20000 → 150 (clamped)", async () => expect(await (await loadFixture(fx)).ss({ col: 20000 })).to.equal(150));
    it("truncation boundary: 66 → 0, 67 → 1 (floor of ×150/10000)", async function () {
      const { ss } = await loadFixture(fx);
      expect(await ss({ col: 66 })).to.equal(0);
      expect(await ss({ col: 67 })).to.equal(1);
    });
    it("BVA uint16 max: 65535 bps → 150 (clamped, no overflow)", async () => expect(await (await loadFixture(fx)).ss({ col: 65535 })).to.equal(150));
  });

  // ── Module 6: offChainSentiment is IGNORED (EP: irrelevant partition) ──
  describe("M6 · offChainSentiment  [AI-only — must NOT affect static score]", function () {
    it("score is identical for sentiment 0, 500, 1000", async function () {
      const { ss } = await loadFixture(fx);
      const a = await ss({ nav: 400, sent: 0 });
      const b = await ss({ nav: 400, sent: 500 });
      const c = await ss({ nav: 400, sent: 1000 });
      expect(a).to.equal(b);
      expect(b).to.equal(c);
    });
    it("sentiment at uint16 max also has zero effect", async function () {
      const { ss } = await loadFixture(fx);
      expect(await ss({ rep: 700, sent: 65535 })).to.equal(await ss({ rep: 700, sent: 0 }));
    });
  });

  // ── Module 7: epoch & sourceHash are carried, not scored ──────────────
  describe("M7 · epoch & sourceHash  [metadata — must NOT affect score]", function () {
    it("epoch (incl. uint64 max) does not change the score", async function () {
      const { ss } = await loadFixture(fx);
      const base = await ss({ nav: 500 });
      expect(await ss({ nav: 500, epoch: 0 })).to.equal(base);
      expect(await ss({ nav: 500, epoch: 18446744073709551615n })).to.equal(base);
    });
    it("sourceHash (incl. bytes32 max) does not change the score", async function () {
      const { ss } = await loadFixture(fx);
      const base = await ss({ nav: 500 });
      expect(await ss({ nav: 500, sourceHash: "0x" + "ff".repeat(32) })).to.equal(base);
    });
  });

  // ── Module 8: total cap at 1000 ───────────────────────────────────────
  describe("M8 · total cap [1000]", function () {
    it("all dimensions max → exactly 1000 (250+250+300+150+50)", async function () {
      const { ss } = await loadFixture(fx);
      expect(await ss({ nav: 1000, att: 1000, rep: 1000, col: 10000, act: 1000 })).to.equal(1000);
    });
    it("inflated inputs are capped at 1000, never exceed", async function () {
      const { ss } = await loadFixture(fx);
      expect(await ss({ nav: 5000, att: 5000, rep: 5000, col: 65535, act: 5000 })).to.equal(1000);
    });
  });

  // ── Module 9: per-field over-range is NOT clamped (documented behaviour) ─
  describe("M9 · per-field over-range  [EP: >1000 is unvalidated except collateral]", function () {
    it("nav=2000 → 500 (single field can exceed its 250 'dim max')", async function () {
      const { ss } = await loadFixture(fx);
      expect(await ss({ nav: 2000 })).to.equal(500);
    });
    it("nav=4000 alone → 1000 (bounded only by the total cap)", async function () {
      const { ss } = await loadFixture(fx);
      expect(await ss({ nav: 4000 })).to.equal(1000);
    });
    it("documents that inputs are trusted (ReplayOracle / dataset), not range-checked here", async function () {
      const { ss } = await loadFixture(fx);
      // contrast: collateral IS clamped, the 0..1000 fields are not
      // (collateralRatioBps is uint16, so its representable max is 65535; all
      //  values >10000 clamp to the full 150 — see M5 for the cap boundary)
      expect(await ss({ col: 65535 })).to.equal(150);   // clamped (uint16 max)
      expect(await ss({ att: 2000 })).to.equal(500);     // NOT clamped
    });
  });

  // ── Module 10: per-dimension maximum contribution (weights) ───────────
  describe("M10 · weight verification (max contribution per dimension)", function () {
    const cases: [string, Sig, number][] = [
      ["nav", { nav: 1000 }, 250],
      ["att", { att: 1000 }, 250],
      ["rep", { rep: 1000 }, 300],
      ["col", { col: 10000 }, 150],
      ["act", { act: 1000 }, 50],
    ];
    cases.forEach(([name, sig, want]) => {
      it(`${name} contributes max ${want}`, async function () {
        const { ss } = await loadFixture(fx);
        expect(await ss(sig)).to.equal(want);
      });
    });
  });

  // ── Module 11: metamorphic — monotonicity & purity ────────────────────
  describe("M11 · metamorphic properties", function () {
    it("monotonic: raising navPunctuality never lowers the score", async function () {
      const { ss } = await loadFixture(fx);
      let prev = -1;
      for (const v of [0, 100, 250, 500, 750, 1000]) {
        const cur = await ss({ nav: v, rep: 200 });
        expect(cur).to.be.greaterThanOrEqual(prev);
        prev = cur;
      }
    });
    it("monotonic: raising collateral never lowers the score", async function () {
      const { ss } = await loadFixture(fx);
      let prev = -1;
      for (const v of [0, 2500, 5000, 7500, 10000, 20000]) {
        const cur = await ss({ col: v });
        expect(cur).to.be.greaterThanOrEqual(prev);
        prev = cur;
      }
    });
    it("purity: identical input → identical output across repeated calls", async function () {
      const { ss } = await loadFixture(fx);
      const o = { nav: 321, att: 654, rep: 222, col: 8765, act: 543, sent: 111 };
      const a = await ss(o), b = await ss(o), c = await ss(o);
      expect(a).to.equal(b);
      expect(b).to.equal(c);
    });
  });

  // ── Module 12: struct storage round-trip (ReplayOracle fidelity) ──────
  describe("M12 · struct storage round-trip via ReplayOracle", function () {
    it("preserves every field on push → signalsAt (incl. type boundaries)", async function () {
      const { replay, issuer } = await loadFixture(fx);
      const hash = "0x" + "ab".repeat(32);
      const s = {
        navPunctuality: 65535,                 // uint16 max
        attestationConsistency: 0,             // min
        repaymentReliability: 777,
        collateralRatioBps: 20000,             // over-range stored verbatim
        activityScore: 1000,
        offChainSentiment: 333,
        epoch: 18446744073709551615n,          // uint64 max
        sourceHash: hash,
      };
      await replay.pushSignals(issuer.address, s);
      const r = await replay.signalsAt(issuer.address, s.epoch);
      expect(r.navPunctuality).to.equal(65535);
      expect(r.attestationConsistency).to.equal(0);
      expect(r.repaymentReliability).to.equal(777);
      expect(r.collateralRatioBps).to.equal(20000);
      expect(r.activityScore).to.equal(1000);
      expect(r.offChainSentiment).to.equal(333);
      expect(r.epoch).to.equal(18446744073709551615n);
      expect(r.sourceHash).to.equal(hash);
    });
    it("stored signals feed computeStaticScore identically to a direct call", async function () {
      const { replay, oracle, issuer } = await loadFixture(fx);
      const s = SIG({ nav: 900, att: 800, rep: 700, col: 9000, act: 600, sent: 120, epoch: 5 });
      await replay.pushSignals(issuer.address, s);
      const stored = await replay.signalsAt(issuer.address, 5);
      // ethers v6 returns a frozen Result; rebuild a fresh struct before re-encoding
      const reInput = {
        navPunctuality: stored.navPunctuality,
        attestationConsistency: stored.attestationConsistency,
        repaymentReliability: stored.repaymentReliability,
        collateralRatioBps: stored.collateralRatioBps,
        activityScore: stored.activityScore,
        offChainSentiment: stored.offChainSentiment,
        epoch: stored.epoch,
        sourceHash: stored.sourceHash,
      };
      expect(await oracle.computeStaticScore(reInput)).to.equal(await oracle.computeStaticScore(s));
    });
    it("unset epoch returns a zero struct (default-value read)", async function () {
      const { replay, issuer } = await loadFixture(fx);
      const r = await replay.signalsAt(issuer.address, 999);
      expect(r.navPunctuality).to.equal(0);
      expect(r.sourceHash).to.equal(ethers.ZeroHash);
    });
  });

  // ── Module 13: combinatorial cross-check vs independent mirror ────────
  describe("M13 · combinatorial cross-check (contract vs JS mirror)", function () {
    const matrix: Sig[] = [
      {}, { nav: 1000, att: 1000, rep: 1000, col: 10000, act: 1000 },
      { nav: 250, att: 250, rep: 250, col: 5000, act: 250 },
      { nav: 1, att: 2, rep: 3, col: 67, act: 20 },
      { nav: 999, att: 999, rep: 999, col: 9999, act: 999 },
      { rep: 333, col: 8800, sent: 130 },
      { nav: 7, col: 12345 }, { att: 4, act: 19 },
      { nav: 935, att: 910, rep: 945, col: 9900, act: 700, sent: 330 }, // USDC-SVB epoch 3
    ];
    matrix.forEach((o, i) => {
      it(`row ${i}: matches mirror = ${mirror(o)}`, async function () {
        const { ss } = await loadFixture(fx);
        expect(await ss(o)).to.equal(mirror(o));
      });
    });
  });
});
