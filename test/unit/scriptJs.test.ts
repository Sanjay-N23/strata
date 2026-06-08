import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import * as vm from "vm";

/**
 * ============================================================================
 *  frontend/parts/script.js — Mantle wallet config + rebrand (EXHAUSTIVE)
 * ============================================================================
 *  A browser script (window/document). We execute it in a Node vm sandbox with
 *  light DOM shims to unit-test its pure logic:
 *    • MANTLE chain config (chainId/symbol/URLs) + cross-consistency
 *    • formatNumber (BVA/EP on thousands separators)
 *    • updatePremium formula (BVA on IRS / amount / days)
 *    • rebrand hygiene (no HashKey/HSK/CoverFi; says Mantle/MNT)
 *  (connectWallet's window.ethereum flow is browser-only and out of scope here.)
 * ============================================================================
 */

const ROOT = path.join(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const src = read("frontend/parts/script.js");

function load(els: Record<string, any> = {}) {
  const sandbox: any = {
    window: {},
    document: { addEventListener: () => {}, getElementById: (id: string) => els[id] || null },
    console: { log: () => {}, error: () => {}, warn: () => {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(
    src + "\n;globalThis.__cfg=MANTLE;globalThis.__formatNumber=formatNumber;globalThis.__updatePremium=updatePremium;",
    sandbox
  );
  return sandbox;
}

describe("frontend/parts/script.js", function () {
  // ── M0: execution ─────────────────────────────────────────────────────
  describe("M0 · execution", function () {
    it("runs in a DOM sandbox and defines MANTLE + helpers", function () {
      const s = load();
      expect(s.__cfg).to.be.an("object");
      expect(s.__formatNumber).to.be.a("function");
      expect(s.__updatePremium).to.be.a("function");
    });
  });

  // ── M1: MANTLE chain config ───────────────────────────────────────────
  describe("M1 · MANTLE config", function () {
    let c: any;
    before(() => { c = load().__cfg; });
    it("chainId 0x138b == 5003 (Mantle Sepolia)", function () {
      expect(c.chainId).to.equal("0x138b");
      expect(parseInt(c.chainId, 16)).to.equal(5003);
    });
    it("native currency is MNT (18 decimals)", function () {
      expect(c.nativeCurrency.symbol).to.equal("MNT");
      expect(c.nativeCurrency.name).to.equal("Mantle");
      expect(c.nativeCurrency.decimals).to.equal(18);
    });
    it("rpc + explorer are the Mantle Sepolia endpoints", function () {
      expect(c.rpcUrls[0]).to.equal("https://rpc.sepolia.mantle.xyz");
      expect(c.blockExplorerUrls[0]).to.equal("https://explorer.sepolia.mantle.xyz");
      expect(c.chainName).to.match(/Mantle Sepolia/);
    });
  });

  // ── M2: cross-consistency (no drift vs deploy/frontend config) ────────
  describe("M2 · cross-consistency", function () {
    let c: any;
    before(() => { c = load().__cfg; });
    it("chainId 5003 matches hardhat.config.ts", function () {
      expect(read("hardhat.config.ts")).to.contain("chainId: 5003");
    });
    it("rpc matches hardhat.config.ts + strata-config.js", function () {
      expect(read("hardhat.config.ts")).to.contain(c.rpcUrls[0]);
      expect(read("frontend/strata-config.js")).to.contain(c.rpcUrls[0]);
    });
  });

  // ── M3: formatNumber (BVA/EP) ─────────────────────────────────────────
  describe("M3 · formatNumber", function () {
    let f: (v: any) => string;
    before(() => { f = load().__formatNumber; });
    const cases: [any, string][] = [
      ["0", "0"], ["100", "100"], ["999", "999"],
      ["1000", "1,000"], ["1234567", "1,234,567"],
      ["1234.56", "1,234.56"], ["0.00", "0.00"],
      [1000, "1,000"], ["-1000", "-1,000"],
    ];
    cases.forEach(([input, want]) =>
      it(`${JSON.stringify(input)} → ${want}`, function () { expect(f(input)).to.equal(want); })
    );
  });

  // ── M4: updatePremium formula (BVA) ───────────────────────────────────
  describe("M4 · updatePremium", function () {
    function calc(irs: number, amount: number, days: number) {
      const els = {
        issuerSelect: { value: String(irs) },
        coverageAmount: { value: String(amount) },
        coverageDuration: { value: String(days) },
        premiumRate: { textContent: "" },
        premiumAmount: { textContent: "" },
      };
      const s = load(els);
      s.__updatePremium();
      return { rate: els.premiumRate.textContent, amt: els.premiumAmount.textContent };
    }
    it("IRS 0 → 1600 bps (16%)", function () {
      expect(calc(0, 10000, 365).rate).to.equal("1600 bps (16.00%)");
    });
    it("IRS 1000 → 400 bps (4%)", function () {
      expect(calc(1000, 10000, 365).rate).to.equal("400 bps (4.00%)");
    });
    it("premium scales with amount (10000 @ 4% / 1yr = $400)", function () {
      expect(calc(1000, 10000, 365).amt).to.equal("$400.00");
    });
    it("premium scales with duration (2 years = $800)", function () {
      expect(calc(1000, 10000, 730).amt).to.equal("$800.00");
    });
    it("zero amount → $0.00", function () {
      expect(calc(1000, 0, 365).amt).to.equal("$0.00");
    });
    it("formats large premiums with separators ($1,600.00 at IRS 0)", function () {
      expect(calc(0, 10000, 365).amt).to.equal("$1,600.00");
    });
  });

  // ── M5: rebrand hygiene ───────────────────────────────────────────────
  describe("M5 · rebrand hygiene", function () {
    it("no legacy brand strings (HashKey / HSK / CoverFi / BSC_TESTNET)", function () {
      expect(src).to.not.match(/HashKey/);
      expect(src).to.not.match(/\bHSK\b/);
      expect(src).to.not.match(/CoverFi/);
      expect(src).to.not.match(/BSC_TESTNET/);
    });
    it("uses Mantle Sepolia + MNT", function () {
      expect(src).to.contain("Mantle Sepolia");
      expect(src).to.contain("MNT");
      expect(src).to.contain("Failed to switch to Mantle Sepolia");
    });
  });
});
