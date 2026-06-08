import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

/**
 * ============================================================================
 *  frontend/assemble.sh — build template (validation)
 * ============================================================================
 *  A bash build script that concatenates parts/* into index.html. No input
 *  ranges → classic BVA/EP don't apply. Legitimate tests for THIS rebrand
 *  modification:
 *    • structure       — shebang + expected commands
 *    • rebrand hygiene  — no legacy brand strings; title says Strata (the change)
 *    • referenced parts — every `cat parts/X` file actually exists
 *    • syntax smoke     — `bash -n` parses it (skipped if bash isn't available)
 *  We do NOT execute it (it would overwrite index.html — a side-effecting build).
 * ============================================================================
 */

const ROOT = path.join(__dirname, "..", "..");
const shPath = path.join(ROOT, "frontend", "assemble.sh");
const src = fs.readFileSync(shPath, "utf8");

// every `cat parts/<file>` reference
const partRefs = [...src.matchAll(/cat\s+(parts\/[\w.\-]+)/g)].map(m => m[1]);

describe("frontend/assemble.sh", function () {
  // ── M0: structure ─────────────────────────────────────────────────────
  describe("M0 · structure", function () {
    it("starts with a bash shebang", function () {
      expect(src.split("\n")[0]).to.match(/^#!.*\b(bash|sh)\b/);
    });
    it("assembles index.html via cat/heredoc commands", function () {
      expect(src).to.contain("index.html");
      expect(src).to.match(/cat\s+parts\//);
      expect(partRefs.length).to.be.greaterThan(0);
    });
  });

  // ── M1: rebrand hygiene (the modification) ────────────────────────────
  describe("M1 · rebrand hygiene", function () {
    it("contains no legacy brand strings", function () {
      expect(src).to.not.match(/CoverFi/);
      expect(src).to.not.match(/HashKey/);
      expect(src).to.not.match(/\bHSK\b/);
    });
    it("the generated <title> is rebranded to Strata", function () {
      const title = src.match(/<title>(.*?)<\/title>/);
      expect(title, "expected a <title> in the template").to.exist;
      expect(title![1]).to.contain("Strata");
    });
  });

  // ── M2: referenced parts exist (build won't break) ────────────────────
  describe("M2 · referenced parts exist", function () {
    [...new Set(partRefs)].forEach(rel =>
      it(`${rel} exists`, function () {
        expect(fs.existsSync(path.join(ROOT, "frontend", rel)), `${rel} missing`).to.equal(true);
      })
    );
  });

  // ── M3: bash syntax smoke (skipped if bash absent) ────────────────────
  describe("M3 · syntax", function () {
    it("parses under `bash -n`", function () {
      try {
        execSync(`bash -n "${shPath}"`, { stdio: "pipe" });
      } catch (e: any) {
        const msg = String(e.message || "");
        if (e.code === "ENOENT" || /not recognized|not found|No such file/i.test(msg)) {
          this.skip(); // bash not available on this host
        }
        throw new Error("bash -n reported a syntax error:\n" + (e.stderr?.toString?.() || msg));
      }
    });
  });
});
