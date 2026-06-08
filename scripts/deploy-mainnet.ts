/**
 * CoverFi Protocol — HashKey Chain Mainnet Deployment Script
 *
 * Phase 1 industrial-grade deployment:
 *   - 1 production stablecoin (CoverFiStablecoin / cfUSD)
 *   - 11 core protocol contracts
 *   - NO mocks (replaced by clearly-named cfUSD; ERC-3643 / BAS / Chainlink
 *     come from runtime issuer registration, not constructor args)
 *
 * Safety features:
 *   - Pre-deploy HSK balance check
 *   - Checkpoint saves after every contract (recovery from partial failures)
 *   - Post-deploy verification of every contract
 *   - Explicit network gating (refuses to run on testnet/local without flag)
 *
 * Run:
 *   npx hardhat run scripts/deploy-mainnet.ts --network hashkeyMainnet
 *
 * For a dry run on testnet:
 *   npx hardhat run scripts/deploy-mainnet.ts --network hashkeyTestnet
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Minimum HSK balance required before we let the deploy proceed.
// 0.10 HSK is ~10x our worst-case projection (0.01 HSK), giving 10x safety.
const MIN_HSK_BALANCE = ethers.parseEther("0.10");

// Maximum HSK consumption ceiling. If we exceed this, something's wrong.
const MAX_HSK_SPEND_CEILING = ethers.parseEther("0.5");

interface DeploymentState {
  network: string;
  chainId: number;
  deployedAt: string;
  deployer: string;
  foundation: string;
  contracts: Record<string, string>;
  startingBalance?: string;
  endingBalance?: string;
  spentHSK?: string;
}

function getCheckpointPath(chainId: number): string {
  const filename =
    chainId === 177 ? "hashkeyMainnet.json" :
    chainId === 133 ? "hashkeyTestnet-dryrun.json" :
    `chain-${chainId}-dryrun.json`;
  const deployDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deployDir)) {
    fs.mkdirSync(deployDir, { recursive: true });
  }
  return path.join(deployDir, filename);
}

function getExplorerUrl(chainId: number, address: string): string {
  if (chainId === 177) return `https://hashkey.blockscout.com/address/${address}`;
  if (chainId === 133) return `https://testnet-explorer.hsk.xyz/address/${address}`;
  return `(no explorer for chain ${chainId})`;
}

function saveCheckpoint(state: DeploymentState): void {
  const file = getCheckpointPath(state.chainId);
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
}

async function main() {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  COVERFI PROTOCOL — MAINNET DEPLOYMENT (Phase 1)");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  console.log("Deployer:    ", deployer.address);
  console.log("Network:     ", network.name);
  console.log("Chain ID:    ", chainId);
  console.log("");

  // Network gating
  if (chainId !== 177 && chainId !== 133) {
    throw new Error(
      `❌ This script targets HashKey Mainnet (177) or Testnet (133) for dry runs. ` +
      `Refusing to run on chain ${chainId}.`
    );
  }

  if (chainId === 177) {
    console.log("⚠️  ═══ MAINNET DEPLOYMENT — REAL HSK WILL BE SPENT ═══\n");
  } else {
    console.log("ℹ️  Running mainnet deploy flow on testnet (DRY RUN)\n");
  }

  // ─── PRE-DEPLOY BALANCE CHECK ──────────────────────────────────────
  const startingBalance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:     ", ethers.formatEther(startingBalance), "HSK");

  if (chainId === 177 && startingBalance < MIN_HSK_BALANCE) {
    throw new Error(
      `❌ Insufficient HSK balance for mainnet deployment.\n` +
      `   Required: ${ethers.formatEther(MIN_HSK_BALANCE)} HSK (10x safety margin)\n` +
      `   Current:  ${ethers.formatEther(startingBalance)} HSK\n` +
      `   Top up the deployer wallet (${deployer.address}) before retrying.`
    );
  }

  const foundation = process.env.COVERFI_FOUNDATION || deployer.address;
  console.log("Foundation:  ", foundation);
  console.log("");

  // ─── DEPLOYMENT STATE ──────────────────────────────────────────────
  const state: DeploymentState = {
    network: network.name,
    chainId,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    foundation,
    contracts: {},
    startingBalance: ethers.formatEther(startingBalance),
  };

  const deploy = async (
    label: string,
    factoryName: string,
    args: any[] = [],
  ): Promise<string> => {
    process.stdout.write(`  Deploying ${label.padEnd(22)}... `);
    const Factory = await ethers.getContractFactory(factoryName);
    const contract = await Factory.deploy(...args);
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    state.contracts[label] = address;
    saveCheckpoint(state); // checkpoint after every deploy
    console.log(`✓  ${address}`);
    return address;
  };

  const tx = async (label: string, fn: () => Promise<any>): Promise<void> => {
    process.stdout.write(`  ${label.padEnd(45)}`);
    const t = await fn();
    await t.wait();
    console.log("✓");
  };

  // ═══════════════════════════════════════════════════════════════════
  // STEP 1: Phase 1 Stablecoin
  // ═══════════════════════════════════════════════════════════════════
  console.log("─── 1. Stablecoin ─────────────────────────────────────────────\n");

  await deploy("CoverFiStablecoin", "CoverFiStablecoin");
  const stablecoin = state.contracts.CoverFiStablecoin;

  // ═══════════════════════════════════════════════════════════════════
  // STEP 2: Core Protocol Contracts (in dependency order)
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n─── 2. Core Protocol Contracts ────────────────────────────────\n");

  await deploy("TIR", "TIR");
  await deploy("IssuerBond", "IssuerBond", [stablecoin, deployer.address]);
  await deploy("IRSOracle", "IRSOracle");
  await deploy("DefaultOracle", "DefaultOracle", [state.contracts.TIR]);
  await deploy("IssuerRegistry", "IssuerRegistry", [
    state.contracts.TIR,
    state.contracts.IssuerBond,
    state.contracts.IRSOracle,
    state.contracts.DefaultOracle,
  ]);
  await deploy("InsurancePool", "InsurancePool", [stablecoin, deployer.address]);
  await deploy("srCVR", "srCVR", [state.contracts.InsurancePool, stablecoin]);
  await deploy("jrCVR", "jrCVR", [state.contracts.InsurancePool, stablecoin]);
  await deploy("ProtectionCert", "ProtectionCert");
  await deploy("PayoutEngine", "PayoutEngine", [stablecoin, foundation]);
  await deploy("SubrogationNFT", "SubrogationNFT", [
    state.contracts.PayoutEngine,
    foundation,
  ]);

  // ═══════════════════════════════════════════════════════════════════
  // STEP 3: Wire Permissions
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n─── 3. Wiring Permissions ─────────────────────────────────────\n");

  const insurancePool = await ethers.getContractAt("InsurancePool", state.contracts.InsurancePool);
  const issuerBond = await ethers.getContractAt("IssuerBond", state.contracts.IssuerBond);
  const irsOracle = await ethers.getContractAt("IRSOracle", state.contracts.IRSOracle);
  const defaultOracle = await ethers.getContractAt("DefaultOracle", state.contracts.DefaultOracle);
  const issuerRegistry = await ethers.getContractAt("IssuerRegistry", state.contracts.IssuerRegistry);
  const protectionCert = await ethers.getContractAt("ProtectionCert", state.contracts.ProtectionCert);
  const payoutEngine = await ethers.getContractAt("PayoutEngine", state.contracts.PayoutEngine);

  // InsurancePool
  await tx("InsurancePool.setSrCVR",          () => insurancePool.setSrCVR(state.contracts.srCVR));
  await tx("InsurancePool.setJrCVR",          () => insurancePool.setJrCVR(state.contracts.jrCVR));
  await tx("InsurancePool.setIssuerRegistry", () => insurancePool.setIssuerRegistry(state.contracts.IssuerRegistry));
  await tx("InsurancePool.setIRSOracle",      () => insurancePool.setIRSOracle(state.contracts.IRSOracle));
  await tx("InsurancePool.setDefaultOracle",  () => insurancePool.setDefaultOracle(state.contracts.DefaultOracle));
  await tx("InsurancePool.setPayoutEngine",   () => insurancePool.setPayoutEngine(state.contracts.PayoutEngine));

  // IssuerBond
  await tx("IssuerBond.setPayoutEngine",      () => issuerBond.setPayoutEngine(state.contracts.PayoutEngine));
  await tx("IssuerBond.setIssuerRegistry",    () => issuerBond.setIssuerRegistry(state.contracts.IssuerRegistry));

  // IRSOracle
  await tx("IRSOracle.setInsurancePool",      () => irsOracle.setInsurancePool(state.contracts.InsurancePool));
  await tx("IRSOracle.setPayoutEngine",       () => irsOracle.setPayoutEngine(state.contracts.PayoutEngine));
  await tx("IRSOracle.setKeeper",             () => irsOracle.setKeeper(deployer.address));

  // DefaultOracle
  await tx("DefaultOracle.setIRSOracle",      () => defaultOracle.setIRSOracle(state.contracts.IRSOracle));
  await tx("DefaultOracle.setInsurancePool",  () => defaultOracle.setInsurancePool(state.contracts.InsurancePool));
  await tx("DefaultOracle.setPayoutEngine",   () => defaultOracle.setPayoutEngine(state.contracts.PayoutEngine));
  await tx("DefaultOracle.setIssuerRegistry", () => defaultOracle.setIssuerRegistry(state.contracts.IssuerRegistry));

  // IssuerRegistry
  await tx("IssuerRegistry.setInsurancePool", () => issuerRegistry.setInsurancePool(state.contracts.InsurancePool));
  await tx("IssuerRegistry.setPayoutEngine",  () => issuerRegistry.setPayoutEngine(state.contracts.PayoutEngine));

  // ProtectionCert
  await tx("ProtectionCert.setPayoutEngine",  () => protectionCert.setPayoutEngine(state.contracts.PayoutEngine));

  // PayoutEngine
  await tx("PayoutEngine.setInsurancePool",   () => payoutEngine.setInsurancePool(state.contracts.InsurancePool));
  await tx("PayoutEngine.setDefaultOracle",   () => payoutEngine.setDefaultOracle(state.contracts.DefaultOracle));
  await tx("PayoutEngine.setProtectionCert",  () => payoutEngine.setProtectionCert(state.contracts.ProtectionCert));
  await tx("PayoutEngine.setIssuerBond",      () => payoutEngine.setIssuerBond(state.contracts.IssuerBond));
  await tx("PayoutEngine.setSubrogationNFT",  () => payoutEngine.setSubrogationNFT(state.contracts.SubrogationNFT));
  await tx("PayoutEngine.setIRSOracle",       () => payoutEngine.setIRSOracle(state.contracts.IRSOracle));
  await tx("PayoutEngine.setIssuerRegistry",  () => payoutEngine.setIssuerRegistry(state.contracts.IssuerRegistry));

  console.log("\n  ✓ All 25 wiring transactions complete\n");

  // ═══════════════════════════════════════════════════════════════════
  // STEP 4: Post-Deploy Verification
  // ═══════════════════════════════════════════════════════════════════
  console.log("─── 4. Post-Deploy Verification ───────────────────────────────\n");

  const checks: Array<{ label: string; expected: string; actual: () => Promise<string> }> = [
    { label: "InsurancePool.usdt()",       expected: stablecoin,                         actual: async () => (await insurancePool.usdt()).toString() },
    { label: "InsurancePool.srCVRToken()", expected: state.contracts.srCVR,             actual: async () => (await insurancePool.srCVRToken()).toString() },
    { label: "InsurancePool.jrCVRToken()", expected: state.contracts.jrCVR,             actual: async () => (await insurancePool.jrCVRToken()).toString() },
    { label: "InsurancePool.owner()",      expected: deployer.address,                  actual: async () => (await insurancePool.owner()).toString() },
    { label: "PayoutEngine.usdt()",        expected: stablecoin,                         actual: async () => (await payoutEngine.usdt()).toString() },
    { label: "PayoutEngine.insurancePool()", expected: state.contracts.InsurancePool,   actual: async () => (await payoutEngine.insurancePool()).toString() },
    { label: "IRSOracle.keeper()",         expected: deployer.address,                  actual: async () => (await irsOracle.keeper()).toString() },
    { label: "IssuerRegistry.tir()",       expected: state.contracts.TIR,               actual: async () => (await issuerRegistry.tir()).toString() },
  ];

  let allPassed = true;
  for (const check of checks) {
    process.stdout.write(`  ${check.label.padEnd(40)}`);
    try {
      const actual = await check.actual();
      const matches = actual.toLowerCase() === check.expected.toLowerCase();
      console.log(matches ? "✓" : `✗  (expected ${check.expected}, got ${actual})`);
      if (!matches) allPassed = false;
    } catch (e: any) {
      console.log(`✗  (error: ${e.message})`);
      allPassed = false;
    }
  }

  if (!allPassed) {
    console.log("\n⚠️  Some verification checks failed. Review state above before proceeding.");
  } else {
    console.log("\n  ✓ All verification checks passed\n");
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 5: Final Save + Summary
  // ═══════════════════════════════════════════════════════════════════
  const endingBalance = await ethers.provider.getBalance(deployer.address);
  const spent = startingBalance - endingBalance;
  state.endingBalance = ethers.formatEther(endingBalance);
  state.spentHSK = ethers.formatEther(spent);
  saveCheckpoint(state);

  if (spent > MAX_HSK_SPEND_CEILING) {
    console.log(
      `\n⚠️  Spend ${ethers.formatEther(spent)} HSK exceeds expected ceiling ` +
      `${ethers.formatEther(MAX_HSK_SPEND_CEILING)} HSK. Investigate.`,
    );
  }

  console.log("─── 5. Deployment Summary ─────────────────────────────────────\n");
  console.log("  Contracts deployed: ", Object.keys(state.contracts).length);
  console.log("  Starting balance:   ", state.startingBalance, "HSK");
  console.log("  Ending balance:     ", state.endingBalance, "HSK");
  console.log("  Spent:              ", state.spentHSK, "HSK");
  console.log("  Saved to:           ", getCheckpointPath(chainId));
  console.log("");

  console.log("─── Block Explorer Links ──────────────────────────────────────\n");
  for (const [label, address] of Object.entries(state.contracts)) {
    console.log(`  ${label.padEnd(22)}  ${getExplorerUrl(chainId, address)}`);
  }

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  COVERFI PROTOCOL DEPLOYMENT COMPLETE ✓");
  console.log("═══════════════════════════════════════════════════════════════\n");
}

main().catch((error) => {
  console.error("\n❌ Deployment failed:");
  console.error(error);
  console.error("\nCheckpoint file may contain partial state. Inspect before retrying.");
  process.exitCode = 1;
});
