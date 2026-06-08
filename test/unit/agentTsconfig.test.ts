import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";

/**
 * ============================================================================
 *  agent/tsconfig.json — scoped typecheck config (validation)
 * ============================================================================
 *  A static JSON config has no runtime logic, so classic BVA/EP don't apply.
 *  The legitimate checks: validity, inheritance (extends root), the noEmit
 *  override, include coverage (agent + typechain), and inherited invariants.
 *  The FUNCTIONAL proof — agent sources typecheck under it — is the
 *  `tsc --noEmit -p agent/tsconfig.json` run accompanying this suite.
 * ============================================================================
 */

const ROOT = path.join(__dirname, "..", "..");
const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));

describe("agent/tsconfig.json · scoped typecheck config", function () {
  let cfg: any;
  before(function () { cfg = readJson("agent/tsconfig.json"); });

  // ── M0: validity ──────────────────────────────────────────────────────
  describe("M0 · validity", function () {
    it("parses as valid JSON", function () {
      expect(() => readJson("agent/tsconfig.json")).to.not.throw();
    });
    it("has extends, compilerOptions and an array include", function () {
      expect(cfg).to.include.keys(["extends", "compilerOptions", "include"]);
      expect(cfg.include).to.be.an("array");
    });
  });

  // ── M1: inheritance ───────────────────────────────────────────────────
  describe("M1 · inheritance", function () {
    it("extends ../tsconfig.json", function () {
      expect(cfg.extends).to.equal("../tsconfig.json");
    });
    it("the extended root config resolves to an existing, valid file", function () {
      const rootPath = path.join(ROOT, "agent", cfg.extends); // agent/../tsconfig.json
      expect(fs.existsSync(rootPath)).to.equal(true);
      expect(() => JSON.parse(fs.readFileSync(rootPath, "utf8"))).to.not.throw();
    });
  });

  // ── M2: compilerOptions override ──────────────────────────────────────
  describe("M2 · compilerOptions", function () {
    it("sets noEmit = true (typecheck only)", function () {
      expect(cfg.compilerOptions.noEmit).to.equal(true);
    });
    it("does NOT override inherited safety options (strict/module/target stay from root)", function () {
      const co = cfg.compilerOptions;
      expect(co).to.not.have.property("strict");
      expect(co).to.not.have.property("module");
      expect(co).to.not.have.property("target");
    });
  });

  // ── M3: include coverage ──────────────────────────────────────────────
  describe("M3 · include", function () {
    it("includes all agent TS files (./**/*.ts)", function () {
      expect(cfg.include).to.include("./**/*.ts");
    });
    it("includes typechain types so chain.ts factory imports resolve", function () {
      expect(cfg.include).to.include("../typechain-types/**/*.ts");
    });
  });

  // ── M4: inherited invariants (present on root → agent inherits) ───────
  describe("M4 · inherited invariants", function () {
    it("root provides resolveJsonModule / esModuleInterop / strict for the agent", function () {
      const root = readJson("tsconfig.json").compilerOptions;
      expect(root.resolveJsonModule).to.equal(true); // agent imports usdc_svb.json
      expect(root.esModuleInterop).to.equal(true);
      expect(root.strict).to.equal(true);            // agent typechecks under strict
    });
  });
});
