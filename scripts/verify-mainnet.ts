/**
 * Verify all Strata contracts on HashKey Chain Blockscout.
 *
 * Reads addresses from deployments/hashkeyMainnet.json and submits the
 * source code for each contract to Blockscout. This is FREE (Blockscout
 * doesn't require API keys) and adds enormous credibility — anyone can
 * audit deployed bytecode against your GitHub source.
 *
 * Run AFTER scripts/deploy-mainnet.ts succeeds:
 *   npx hardhat run scripts/verify-mainnet.ts --network hashkeyMainnet
 */

import { run } from "hardhat";
import * as fs from "fs";
import * as path from "path";

interface Deployment {
  network: string;
  chainId: number;
  deployer: string;
  foundation: string;
  contracts: Record<string, string>;
}

async function main() {
  const network = (await import("hardhat")).network;
  const chainId = network.config.chainId;
  const filename =
    chainId === 177 ? "hashkeyMainnet.json" :
    chainId === 133 ? "hashkeyTestnet-dryrun.json" :
    "localhost.json";

  const file = path.join(__dirname, "..", "deployments", filename);
  if (!fs.existsSync(file)) {
    throw new Error(`Deployment file not found: ${file}. Run deploy-mainnet.ts first.`);
  }
  const dep: Deployment = JSON.parse(fs.readFileSync(file, "utf8"));

  console.log("\n─── Blockscout Verification ───────────────────────────────────\n");
  console.log("  Network:    ", network.name);
  console.log("  Chain ID:   ", chainId);
  console.log("  Source file:", file);
  console.log("");

  // Verification args (must match constructor args from deployment)
  const verifications: Array<{ name: string; address: string; args: any[] }> = [
    { name: "CoverFiStablecoin", address: dep.contracts.CoverFiStablecoin, args: [] },
    { name: "TIR",               address: dep.contracts.TIR,               args: [] },
    { name: "IssuerBond",        address: dep.contracts.IssuerBond,        args: [dep.contracts.CoverFiStablecoin, dep.deployer] },
    { name: "IRSOracle",         address: dep.contracts.IRSOracle,         args: [] },
    { name: "DefaultOracle",     address: dep.contracts.DefaultOracle,     args: [dep.contracts.TIR] },
    { name: "IssuerRegistry",    address: dep.contracts.IssuerRegistry,    args: [dep.contracts.TIR, dep.contracts.IssuerBond, dep.contracts.IRSOracle, dep.contracts.DefaultOracle] },
    { name: "InsurancePool",     address: dep.contracts.InsurancePool,     args: [dep.contracts.CoverFiStablecoin, dep.deployer] },
    { name: "srCVR",             address: dep.contracts.srCVR,             args: [dep.contracts.InsurancePool, dep.contracts.CoverFiStablecoin] },
    { name: "jrCVR",             address: dep.contracts.jrCVR,             args: [dep.contracts.InsurancePool, dep.contracts.CoverFiStablecoin] },
    { name: "ProtectionCert",    address: dep.contracts.ProtectionCert,    args: [] },
    { name: "PayoutEngine",      address: dep.contracts.PayoutEngine,      args: [dep.contracts.CoverFiStablecoin, dep.foundation] },
    { name: "SubrogationNFT",    address: dep.contracts.SubrogationNFT,    args: [dep.contracts.PayoutEngine, dep.foundation] },
  ];

  const results: Array<{ name: string; status: "OK" | "ALREADY" | "FAIL"; message?: string }> = [];

  for (const v of verifications) {
    if (!v.address) {
      console.log(`  ${v.name.padEnd(22)} skipped (no address)`);
      results.push({ name: v.name, status: "FAIL", message: "no address" });
      continue;
    }
    process.stdout.write(`  ${v.name.padEnd(22)} ${v.address}  `);
    try {
      await run("verify:verify", {
        address: v.address,
        constructorArguments: v.args,
      });
      console.log("✓");
      results.push({ name: v.name, status: "OK" });
    } catch (e: any) {
      const msg = e.message || String(e);
      if (msg.toLowerCase().includes("already verified")) {
        console.log("✓ (already verified)");
        results.push({ name: v.name, status: "ALREADY" });
      } else {
        console.log("✗");
        console.log(`     → ${msg.split("\n")[0]}`);
        results.push({ name: v.name, status: "FAIL", message: msg });
      }
    }
  }

  console.log("\n─── Summary ───────────────────────────────────────────────────\n");
  const ok = results.filter((r) => r.status === "OK" || r.status === "ALREADY").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  console.log(`  Verified: ${ok} / ${verifications.length}`);
  if (fail > 0) {
    console.log(`  Failed:   ${fail}`);
    console.log("\n  Failures (manual verification via Blockscout UI may be needed):");
    for (const r of results.filter((x) => x.status === "FAIL")) {
      console.log(`    • ${r.name}: ${(r.message || "").split("\n")[0]}`);
    }
  }
  console.log("");
}

main().catch((e) => {
  console.error("Verification script failed:", e);
  process.exitCode = 1;
});
