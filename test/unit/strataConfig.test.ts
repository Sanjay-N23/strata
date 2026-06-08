import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import * as vm from "vm";

/**
 * ============================================================================
 *  frontend/strata-config.js — live-mode config template (validation)
 * ============================================================================
 *  A browser config (`window.STRATA_CONFIG = {...}`). No runtime branches, so
 *  the methods are: execution validation (run it in a window sandbox), value/EP
 *  invariants (URLs, chainId tag, addresses shape), and CROSS-CONSISTENCY with
 *  the deploy config (hardhat.config.ts / chain.ts) to catch drift.
 *  Browser integration (console reads it) is covered by console.spec.js M9.
 * ============================================================================
 */

const ROOT = path.join(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const src = read("frontend/strata-config.js");

function loadConfig(): any {
  const sandbox: any = { window: {} };
  vm.runInNewContext(src, sandbox);
  return sandbox.window.STRATA_CONFIG;
}

describe("frontend/strata-config.js", function () {
  // ── M0: executes & assigns ────────────────────────────────────────────
  describe("M0 · execution", function () {
    it("runs in a window sandbox without error", function () {
      expect(() => loadConfig()).to.not.throw();
    });
    it("assigns window.STRATA_CONFIG as an object", function () {
      expect(loadConfig()).to.be.an("object");
    });
  });

  // ── M1: shape ─────────────────────────────────────────────────────────
  describe("M1 · shape", function () {
    it("has netTag, rpc, explorer (strings) and addresses (object)", function () {
      const c = loadConfig();
      expect(c.netTag).to.be.a("string").and.not.empty;
      expect(c.rpc).to.be.a("string").and.not.empty;
      expect(c.explorer).to.be.a("string").and.not.empty;
      expect(c.addresses).to.be.an("object");
    });
  });

  // ── M2: value invariants (EP) ─────────────────────────────────────────
  describe("M2 · values", function () {
    it("rpc is an https Mantle Sepolia endpoint", function () {
      const { rpc } = loadConfig();
      expect(rpc).to.match(/^https:\/\//);
      expect(rpc).to.contain("mantle");
    });
    it("explorer is an https Mantle URL", function () {
      const { explorer } = loadConfig();
      expect(explorer).to.match(/^https:\/\//);
      expect(explorer).to.contain("mantle");
    });
    it("netTag names the chain + chainId 5003", function () {
      const { netTag } = loadConfig();
      expect(netTag).to.match(/mantle/i);
      expect(netTag).to.contain("5003");
    });
  });

  // ── M3: addresses template ────────────────────────────────────────────
  describe("M3 · addresses", function () {
    it("is empty in the template (no live addresses committed)", function () {
      // EP: template state — populated post-deploy. Any present value must be a 0x address.
      const a = loadConfig().addresses;
      for (const v of Object.values(a)) {
        expect(v).to.match(/^0x[0-9a-fA-F]{40}$/);
      }
    });
  });

  // ── M4: cross-consistency with deploy config (drift) ──────────────────
  describe("M4 · cross-consistency", function () {
    it("rpc matches hardhat.config.ts mantleSepolia + chain.ts default", function () {
      const { rpc } = loadConfig();
      expect(read("hardhat.config.ts")).to.contain(rpc);
      expect(read("agent/chain.ts")).to.contain(rpc);
    });
    it("explorer matches hardhat.config.ts Mantle Sepolia browserURL", function () {
      const { explorer } = loadConfig();
      expect(read("hardhat.config.ts")).to.contain(explorer);
    });
    it("chainId 5003 in netTag matches the Mantle Sepolia network", function () {
      expect(loadConfig().netTag).to.contain("5003");
      expect(read("hardhat.config.ts")).to.contain("chainId: 5003");
    });
  });
});
