/**
 * Update all frontend HTML files and parts/script.js to use HashKey Chain
 * Mainnet contract addresses and chain config.
 *
 * Reads addresses from deployments/hashkeyMainnet.json and performs targeted
 * find/replace across all 6 HTML files + script.js. Adds a MAINNET banner.
 *
 * Run AFTER scripts/deploy-mainnet.ts succeeds:
 *   npx hardhat run scripts/update-frontend-mainnet.ts --network hashkeyMainnet
 *
 * For a dry-run preview (no files written):
 *   npx hardhat run scripts/update-frontend-mainnet.ts --network hashkeyMainnet -- --dry
 */

import * as fs from "fs";
import * as path from "path";

interface Deployment {
  network: string;
  chainId: number;
  contracts: Record<string, string>;
}

const FRONTEND_DIR = path.join(__dirname, "..", "frontend");

// Files that contain CONTRACTS arrays AND/OR chain config
const FILES_WITH_CONFIG = [
  "parts/script.js",
  "dashboard.html",
  "pool.html",
  "issuer-dashboard.html",
  "coverage.html",
  "register.html",
  "attestor.html",
];

// Files that only need banner + safety banner (read-only pages)
const ALL_HTML_PAGES = [
  "index.html",
  "stats.html",
  "issuers.html",
  "subrogation.html",
  "dashboard.html",
  "pool.html",
  "issuer-dashboard.html",
  "coverage.html",
  "register.html",
  "attestor.html",
];

// Old testnet addresses (from deployments/hashkeyTestnet.json) → new mainnet addresses
function buildAddressReplacements(mainnet: Deployment): Array<[string, string]> {
  const testnetFile = path.join(__dirname, "..", "deployments", "hashkeyTestnet.json");
  const testnet: Deployment = JSON.parse(fs.readFileSync(testnetFile, "utf8"));
  const replacements: Array<[string, string]> = [];

  // Mocks → CoverFiStablecoin (since we removed mocks on mainnet)
  if (testnet.contracts.MockUSDT && mainnet.contracts.CoverFiStablecoin) {
    replacements.push([testnet.contracts.MockUSDT, mainnet.contracts.CoverFiStablecoin]);
  }

  // Direct mappings for core contracts
  const coreContracts = ["TIR", "IssuerBond", "IRSOracle", "DefaultOracle",
    "IssuerRegistry", "InsurancePool", "srCVR", "jrCVR",
    "ProtectionCert", "PayoutEngine", "SubrogationNFT"];

  for (const key of coreContracts) {
    if (testnet.contracts[key] && mainnet.contracts[key]) {
      replacements.push([testnet.contracts[key], mainnet.contracts[key]]);
    }
  }

  return replacements;
}

const CHAIN_REPLACEMENTS: Array<[RegExp | string, string]> = [
  // Chain ID
  [/chainId:\s*['"]0x85['"]/g, "chainId: '0xb1'"],
  [/BSC_TESTNET_CHAIN_ID\s*=\s*133/g, "BSC_TESTNET_CHAIN_ID = 177"],
  [/chainId\s*===\s*133/g, "chainId === 177"],

  // Chain name
  [/['"]HashKey Chain Testnet['"]/g, "'HashKey Chain Mainnet'"],

  // RPC
  [/['"]https:\/\/testnet\.hsk\.xyz['"]/g, "'https://mainnet.hsk.xyz'"],
  [/https:\/\/testnet\.hsk\.xyz/g, "https://mainnet.hsk.xyz"],

  // Block explorer
  [/['"]https:\/\/testnet-explorer\.hsk\.xyz['"]/g, "'https://hashkey.blockscout.com'"],
  [/https:\/\/testnet-explorer\.hsk\.xyz/g, "https://hashkey.blockscout.com"],

  // Comments / labels
  [/HashKey Chain Testnet Config/g, "HashKey Chain Mainnet Config"],
  [/HashKey Chain Testnet Contract Addresses/g, "HashKey Chain Mainnet Contract Addresses"],
  [/from deployments\/hashkeyTestnet\.json/g, "from deployments/hashkeyMainnet.json"],
];

const MAINNET_BANNER_HTML = `
<!-- STRATA MAINNET PHASE 1 BANNER -->
<div id="cfMainnetBanner" style="
  position:fixed;top:0;left:0;right:0;z-index:99999;
  background:linear-gradient(90deg,#fbbf24,#f59e0b);
  color:#1f2937;font-weight:600;font-size:13px;
  padding:8px 16px;text-align:center;
  border-bottom:1px solid #d97706;
  font-family:-apple-system,BlinkMacSystemFont,sans-serif;
  box-shadow:0 1px 3px rgba(0,0,0,0.1);
">
  ⚠️ MAINNET — PHASE 1 DEPLOYMENT · Coverage purchase activates in Phase 2 once issuer onboarding completes ·
  <a href="https://hashkey.blockscout.com" target="_blank" rel="noopener" style="color:#1f2937;text-decoration:underline;">View on Blockscout</a>
</div>
<style>body{padding-top:36px !important;}</style>
<!-- END BANNER -->
`;

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry");

  console.log("\n─── Frontend Mainnet Migration ────────────────────────────────\n");
  console.log("  Mode:    ", dryRun ? "DRY RUN (no files written)" : "WRITE");
  console.log("  Frontend:", FRONTEND_DIR);

  const mainnetFile = path.join(__dirname, "..", "deployments", "hashkeyMainnet.json");
  if (!fs.existsSync(mainnetFile)) {
    throw new Error(`Mainnet deployment file not found: ${mainnetFile}\nRun deploy-mainnet.ts first.`);
  }
  const mainnet: Deployment = JSON.parse(fs.readFileSync(mainnetFile, "utf8"));
  console.log("  Mainnet: ", mainnet.contracts.InsurancePool, "(InsurancePool)\n");

  const addressReplacements = buildAddressReplacements(mainnet);

  console.log("─── Address Replacements ──────────────────────────────────────\n");
  for (const [old, fresh] of addressReplacements) {
    console.log(`  ${old} → ${fresh}`);
  }
  console.log("");

  let totalChanges = 0;

  // Phase A: Address + chain config replacements
  console.log("─── Updating Files ────────────────────────────────────────────\n");

  for (const relativeFile of FILES_WITH_CONFIG) {
    const file = path.join(FRONTEND_DIR, relativeFile);
    if (!fs.existsSync(file)) {
      console.log(`  ${relativeFile.padEnd(30)} (file not found, skipping)`);
      continue;
    }

    let content = fs.readFileSync(file, "utf8");
    const original = content;
    let changeCount = 0;

    // Address replacements (case-insensitive — addresses can be checksummed differently)
    for (const [old, fresh] of addressReplacements) {
      const re = new RegExp(old.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      const matches = content.match(re);
      if (matches) {
        changeCount += matches.length;
        content = content.replace(re, fresh);
      }
    }

    // Chain config replacements
    for (const [pattern, replacement] of CHAIN_REPLACEMENTS) {
      const before = content;
      content = content.replace(pattern as any, replacement);
      if (content !== before) {
        // Count approximate replacements
        const beforeMatches = before.match(pattern as any);
        if (beforeMatches) changeCount += beforeMatches.length;
      }
    }

    if (changeCount > 0 && content !== original) {
      if (!dryRun) {
        fs.writeFileSync(file, content);
      }
      console.log(`  ${relativeFile.padEnd(30)} ${changeCount} replacement(s) ${dryRun ? "[dry]" : "✓"}`);
      totalChanges += changeCount;
    } else {
      console.log(`  ${relativeFile.padEnd(30)} no changes`);
    }
  }

  // Phase B: Inject MAINNET banner into all HTML pages
  console.log("\n─── Injecting MAINNET Banner ──────────────────────────────────\n");

  for (const relativeFile of ALL_HTML_PAGES) {
    const file = path.join(FRONTEND_DIR, relativeFile);
    if (!fs.existsSync(file)) {
      console.log(`  ${relativeFile.padEnd(30)} (file not found)`);
      continue;
    }
    let content = fs.readFileSync(file, "utf8");
    if (content.includes("cfMainnetBanner")) {
      console.log(`  ${relativeFile.padEnd(30)} banner already present`);
      continue;
    }
    // Insert banner right after <body> tag
    const bodyMatch = content.match(/<body[^>]*>/i);
    if (!bodyMatch) {
      console.log(`  ${relativeFile.padEnd(30)} no <body> tag found, skipping`);
      continue;
    }
    const insertAt = bodyMatch.index! + bodyMatch[0].length;
    content = content.slice(0, insertAt) + MAINNET_BANNER_HTML + content.slice(insertAt);
    if (!dryRun) {
      fs.writeFileSync(file, content);
    }
    console.log(`  ${relativeFile.padEnd(30)} banner injected ${dryRun ? "[dry]" : "✓"}`);
    totalChanges++;
  }

  console.log("\n─── Summary ───────────────────────────────────────────────────\n");
  console.log(`  Total changes:  ${totalChanges}`);
  console.log(`  Mode:           ${dryRun ? "DRY RUN — no files modified" : "WRITTEN to disk"}`);
  if (dryRun) {
    console.log(`\n  Run again without --dry to apply changes.`);
  } else {
    console.log(`\n  Recommended next step: hard refresh frontend in browser, verify chain switches to 177.`);
  }
  console.log("");
}

main().catch((e) => {
  console.error("Frontend migration failed:", e);
  process.exitCode = 1;
});
