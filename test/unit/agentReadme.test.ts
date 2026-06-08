import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";

/**
 * ============================================================================
 *  agent/README.md — documentation-as-contract (drift detection)
 * ============================================================================
 *  A README is prose — classic BVA/EP don't apply. But docs CAN be tested for
 *  ACCURACY against the codebase (consistency / regression testing):
 *    • structure        — required sections exist
 *    • referenced files — every path it mentions actually exists
 *    • env contract     — documented env vars == env vars the agent code reads
 *                         (bidirectional: no undocumented, no stale)
 *    • defaults         — documented defaults match the code's defaults
 *  This catches doc drift (e.g. a new env var added in code but not documented).
 * ============================================================================
 */

const ROOT = path.join(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const readme = read("agent/README.md");

const AGENT_TS = ["agent/index.ts", "agent/chain.ts", "agent/zai.ts", "agent/pdModel.ts"];

// env vars the agent code actually reads
const codeEnv = new Set<string>();
for (const f of AGENT_TS) {
  const src = read(f);
  for (const m of src.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)) codeEnv.add(m[1]);
}
// env vars documented in the README table (`| `VAR` | ... |`)
const docEnv = new Set<string>();
for (const m of readme.matchAll(/^\|\s*`([A-Z_][A-Z0-9_]*)`\s*\|/gm)) docEnv.add(m[1]);

describe("agent/README.md · docs-as-contract", function () {
  // ── M0: structure ─────────────────────────────────────────────────────
  describe("M0 · structure", function () {
    it("is non-empty with a top-level title", function () {
      expect(readme.trim().length).to.be.greaterThan(0);
      expect(readme).to.match(/^#\s+\S/m);
    });
    it("has the key sections (Run, Env, Proof)", function () {
      expect(readme).to.match(/##\s+Run/);
      expect(readme).to.match(/##\s+Env/);
      expect(readme).to.match(/##\s+Proof/);
    });
  });

  // ── M1: referenced files exist ────────────────────────────────────────
  describe("M1 · referenced files exist", function () {
    const refs = [
      "agent/index.ts", "agent/pdModel.ts", "agent/zai.ts",
      "scripts/deploy.ts", "scripts/strata-resolve.ts",
      "test/integration/TuringBenchmark.test.ts",
    ];
    refs.forEach(r =>
      it(`mentions ${r} — and it exists`, function () {
        const base = path.basename(r);
        expect(readme, `README should reference ${base}`).to.contain(base);
        expect(fs.existsSync(path.join(ROOT, r)), `${r} missing`).to.equal(true);
      })
    );
  });

  // ── M2: env contract (bidirectional) ──────────────────────────────────
  describe("M2 · env contract", function () {
    it("every env var the agent reads is documented (no undocumented vars)", function () {
      const undocumented = [...codeEnv].filter(v => !docEnv.has(v));
      expect(undocumented, `undocumented env vars: ${undocumented.join(", ")}`).to.deep.equal([]);
    });
    it("every documented env var is actually read by the agent (no stale docs)", function () {
      const stale = [...docEnv].filter(v => !codeEnv.has(v));
      expect(stale, `stale documented env vars: ${stale.join(", ")}`).to.deep.equal([]);
    });
    it("documents the core vars explicitly", function () {
      for (const v of ["DEPLOYER_PRIVATE_KEY", "ISSUER_ADDRESS", "ZAI_API_KEY", "NETWORK"]) {
        expect(docEnv.has(v), `missing ${v}`).to.equal(true);
      }
    });
  });

  // ── M3: defaults match the code ───────────────────────────────────────
  describe("M3 · documented defaults match code", function () {
    it("model default glm-4.6 matches zai.ts", function () {
      expect(readme).to.contain("glm-4.6");
      expect(read("agent/zai.ts")).to.contain('"glm-4.6"');
    });
    it("network default mantleSepolia matches chain.ts", function () {
      expect(readme).to.contain("mantleSepolia");
      expect(read("agent/chain.ts")).to.contain('"mantleSepolia"');
    });
    it("offline-fallback claim matches zai.ts behavior", function () {
      expect(readme.toLowerCase()).to.contain("fallback");
      expect(read("agent/zai.ts")).to.contain("pd.rationale");
    });
  });
});
