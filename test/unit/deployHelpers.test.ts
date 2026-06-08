import { expect } from "chai";
import { deploymentFilename, assertTestnetOnly, MAINNET_CHAIN_IDS } from "../../scripts/deployHelpers";

/**
 * ============================================================================
 *  scripts/deploy.ts — pure logic (EXHAUSTIVE)
 * ============================================================================
 *  deploy.ts is a script; its unit-testable logic is the chainId→filename map
 *  and the testnet-only safety gate (extracted to scripts/deployHelpers.ts).
 *  The Strata deploy + wiring is covered by test/integration/StrataWiring.test.ts
 *  and the localhost dry-run.
 *
 *  Methods: EP (each known chain class), BVA (values adjacent to known chainIds),
 *  and consistency cross-checks.
 * ============================================================================
 */

describe("deploy.ts helpers", function () {
  // ── M0: deploymentFilename — known chains (EP) ────────────────────────
  describe("M0 · deploymentFilename known chains", function () {
    const map: [bigint, string][] = [
      [97n, "bscTestnet.json"],
      [56n, "bscMainnet.json"],
      [133n, "hashkeyTestnet.json"],
      [177n, "hashkeyMainnet.json"],
      [5003n, "mantleSepolia.json"],
      [5000n, "mantleMainnet.json"],
    ];
    map.forEach(([id, f]) =>
      it(`chain ${id} → ${f}`, () => expect(deploymentFilename(id)).to.equal(f))
    );
  });

  // ── M1: deploymentFilename — unknown → localhost (BVA / edges) ─────────
  describe("M1 · deploymentFilename unknown fallback", function () {
    // boundaries adjacent to the Mantle ids (4999/5001/5002/5004) + others
    [0n, 1n, 31337n, 55n, 57n, 176n, 178n, 4999n, 5001n, 5002n, 5004n, 132n, 134n, 9999999n].forEach(id =>
      it(`chain ${id} → localhost.json`, () => expect(deploymentFilename(id)).to.equal("localhost.json"))
    );
  });

  // ── M2: deploymentFilename — Mantle ids are distinct (no collision) ────
  describe("M2 · Mantle ids distinct", function () {
    it("5000 and 5003 map to different files", function () {
      expect(deploymentFilename(5000n)).to.equal("mantleMainnet.json");
      expect(deploymentFilename(5003n)).to.equal("mantleSepolia.json");
      expect(deploymentFilename(5000n)).to.not.equal(deploymentFilename(5003n));
    });
  });

  // ── M3: assertTestnetOnly — blocked mainnets ──────────────────────────
  describe("M3 · assertTestnetOnly blocks mainnets", function () {
    [56, 177, 5000].forEach(id =>
      it(`chain ${id} throws (TESTNET ONLY)`, () =>
        expect(() => assertTestnetOnly(id)).to.throw("TESTNET ONLY"))
    );
    it("the error names the offending chain id", function () {
      expect(() => assertTestnetOnly(5000)).to.throw("5000");
    });
  });

  // ── M4: assertTestnetOnly — allowed testnets/local ────────────────────
  describe("M4 · assertTestnetOnly allows testnets", function () {
    // includes the Mantle MAINNET neighbour 5003 (testnet) — must be allowed
    [31337, 97, 133, 5003, 0, 1].forEach(id =>
      it(`chain ${id} passes`, () => expect(() => assertTestnetOnly(id)).to.not.throw())
    );
  });

  // ── M5: consistency cross-checks ──────────────────────────────────────
  describe("M5 · consistency", function () {
    it("MAINNET_CHAIN_IDS is exactly {56, 177, 5000}", function () {
      expect(MAINNET_CHAIN_IDS).to.have.members([56, 177, 5000]);
      expect(MAINNET_CHAIN_IDS).to.have.lengthOf(3);
    });
    it("every blocked mainnet still has a (mainnet) filename mapping", function () {
      for (const id of MAINNET_CHAIN_IDS) {
        expect(deploymentFilename(BigInt(id))).to.contain("Mainnet");
      }
    });
    it("the Mantle testnet (5003) is allowed AND mapped to mantleSepolia.json", function () {
      expect(() => assertTestnetOnly(5003)).to.not.throw();
      expect(deploymentFilename(5003n)).to.equal("mantleSepolia.json");
    });
  });
});
