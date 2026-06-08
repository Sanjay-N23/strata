import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";

/**
 * ============================================================================
 *  tsconfig.json — "./agent" include (config validation)
 * ============================================================================
 *  A static JSON config has no runtime logic, so classic BVA/EP do not apply.
 *  The legitimate checks are:
 *    • validity            — the file parses
 *    • the change          — "./agent" is present in `include`
 *    • regression          — the other includes are still present, no dupes
 *    • dependency invariants— compilerOptions the agent + tests rely on
 *    • the scoped config   — agent/tsconfig.json extends root & covers agent+typechain
 *  The FUNCTIONAL proof (agent sources typecheck under this config) is the
 *  `tsc --noEmit -p agent/tsconfig.json` run accompanying this suite.
 * ============================================================================
 */

const readJson = (p: string) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", p), "utf8"));

describe("tsconfig · ./agent include", function () {
  // ── M0: validity ──────────────────────────────────────────────────────
  describe("M0 · validity", function () {
    it("root tsconfig.json parses as valid JSON", function () {
      expect(() => readJson("tsconfig.json")).to.not.throw();
    });
    it("has an array `include`", function () {
      expect(readJson("tsconfig.json").include).to.be.an("array");
    });
  });

  // ── M1: the change under test ─────────────────────────────────────────
  describe("M1 · include contains ./agent", function () {
    it("'./agent' is present in include", function () {
      expect(readJson("tsconfig.json").include).to.include("./agent");
    });
  });

  // ── M2: regression — other includes preserved, no dupes ───────────────
  describe("M2 · no regression", function () {
    it("still includes ./scripts, ./test, ./hardhat.config.ts", function () {
      expect(readJson("tsconfig.json").include).to.include.members([
        "./scripts", "./test", "./hardhat.config.ts",
      ]);
    });
    it("include has no duplicate entries", function () {
      const inc = readJson("tsconfig.json").include as string[];
      expect(new Set(inc).size).to.equal(inc.length);
    });
  });

  // ── M3: compilerOptions the agent & tests depend on ───────────────────
  describe("M3 · dependency invariants", function () {
    it("resolveJsonModule / esModuleInterop / strict are enabled", function () {
      const co = readJson("tsconfig.json").compilerOptions;
      expect(co.resolveJsonModule).to.equal(true); // agent imports usdc_svb.json
      expect(co.esModuleInterop).to.equal(true);
      expect(co.strict).to.equal(true);
    });
    it("module = commonjs, target = es2020", function () {
      const co = readJson("tsconfig.json").compilerOptions;
      expect(co.module).to.equal("commonjs");
      expect(co.target).to.equal("es2020");
    });
  });

  // ── M4: scoped agent tsconfig ─────────────────────────────────────────
  describe("M4 · agent/tsconfig.json", function () {
    it("extends root, is noEmit, and covers agent + typechain", function () {
      const a = readJson("agent/tsconfig.json");
      expect(a.extends).to.equal("../tsconfig.json");
      expect(a.compilerOptions.noEmit).to.equal(true);
      expect(a.include).to.include("./**/*.ts");
      expect(a.include).to.include("../typechain-types/**/*.ts");
    });
  });
});
