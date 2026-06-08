import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";

/**
 * ============================================================================
 *  README.md + STRATA_DEMO.md — documentation-as-contract (drift detection)
 * ============================================================================
 *  Docs are prose, so classic BVA/EP don't apply. We test ACCURACY vs the
 *  codebase: referenced files/commands exist, contract names resolve, key
 *  claims are present + consistent across both docs, and the headline test
 *  count isn't stale (the 534→900+ fix this suite enforces going forward).
 * ============================================================================
 */

const ROOT = path.join(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));
const README = read("README.md");
const DEMO = read("STRATA_DEMO.md");

describe("docs · README + STRATA_DEMO", function () {
  // ── M0: structure ─────────────────────────────────────────────────────
  describe("M0 · structure", function () {
    it("both docs are non-empty with headings", function () {
      expect(README.trim().length).to.be.greaterThan(0);
      expect(DEMO.trim().length).to.be.greaterThan(0);
      expect(README).to.match(/^#\s+\S/m);
      expect(DEMO).to.match(/^#\s+\S/m);
    });
  });

  // ── M1: README current claims ─────────────────────────────────────────
  describe("M1 · README claims are current (Mantle/ERC-8004/console)", function () {
    it("badges reflect Mantle Sepolia 5003 + ERC-8004 + the console", function () {
      expect(README).to.contain("Mantle");
      expect(README).to.contain("5003");
      expect(README).to.contain("ERC-8004");
      expect(README).to.contain("console.html");
    });
  });

  // ── M2: referenced files exist ────────────────────────────────────────
  describe("M2 · referenced files exist", function () {
    // files referenced by PATH/filename (contracts are referenced by name → M3)
    const refs = [
      "test/integration/TuringBenchmark.test.ts",
      "frontend/console.html",
      "agent/index.ts",
      "STRATA_DEMO.md",
    ];
    refs.forEach(r =>
      it(`${r} exists (and is referenced)`, function () {
        const base = path.basename(r);
        const mentioned = README.includes(base) || DEMO.includes(base);
        expect(mentioned, `neither doc references ${base}`).to.equal(true);
        expect(exists(r), `${r} missing`).to.equal(true);
      })
    );
  });

  // ── M3: contract names resolve to .sol ────────────────────────────────
  describe("M3 · contract names resolve", function () {
    ["StrataAIAgent", "TuringBenchmark", "ReplayOracle"].forEach(name =>
      it(`${name} is mentioned and has a contract`, function () {
        expect(README.includes(name) || DEMO.includes(name)).to.equal(true);
        expect(exists(`contracts/strata/${name}.sol`)).to.equal(true);
      })
    );
  });

  // ── M4: key claims + cross-doc consistency ────────────────────────────
  describe("M4 · cross-doc consistency", function () {
    const claims = ["USDC", "Mantle", "ERC-8004"];
    claims.forEach(c =>
      it(`both docs mention "${c}"`, function () {
        expect(README, `README missing ${c}`).to.contain(c);
        expect(DEMO, `DEMO missing ${c}`).to.contain(c);
      })
    );
    it("both reference the AI brain (Z.AI / GLM)", function () {
      expect(README).to.match(/Z\.?AI|GLM/i);
      expect(DEMO).to.match(/Z\.?AI|GLM/i);
    });
    it("both reference the human 2-of-3 gate", function () {
      expect(README).to.match(/2-of-3/);
      expect(DEMO).to.match(/2-of-3/);
    });
    it("both cite the 3-epoch lead", function () {
      expect(README).to.match(/3 epochs?/);
      expect(DEMO).to.match(/3 epochs?/);
    });
  });

  // ── M5: headline test-count not stale ─────────────────────────────────
  describe("M5 · test-count freshness", function () {
    it("README badge cites a current count (>= 500, not the stale 534/416)", function () {
      const m = README.match(/Tests-(\d+)/);
      expect(m, "no Tests badge found").to.exist;
      expect(Number(m![1])).to.be.at.least(500);
    });
    it("STRATA_DEMO cites a current test count (>= 500)", function () {
      const m = DEMO.match(/(\d+)\+?\s*tests/i);
      expect(m, "no test-count in DEMO").to.exist;
      expect(Number(m![1])).to.be.at.least(500);
    });
  });
});
