import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Seed remaining demo data — picks up where a prior run left off.
 * Safe to run when issuer is already registered.
 * Activates issuer, purchases coverage, pays a premium to move exchange rate.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const deployFile = path.join(__dirname, "..", "deployments", "hashkeyTestnet.json");
  const deployment = JSON.parse(fs.readFileSync(deployFile, "utf-8"));
  const c = deployment.contracts;

  const mockUSDT       = await ethers.getContractAt("MockUSDT", c.MockUSDT);
  const issuerRegistry = await ethers.getContractAt("IssuerRegistry", c.IssuerRegistry);
  const irsOracle      = await ethers.getContractAt("IRSOracle", c.IRSOracle);
  const insurancePool  = await ethers.getContractAt("InsurancePool", c.InsurancePool);
  const payoutEngine   = await ethers.getContractAt("PayoutEngine", c.PayoutEngine);
  const protectionCert = await ethers.getContractAt("ProtectionCert", c.ProtectionCert);
  const issuerBond     = await ethers.getContractAt("IssuerBond", c.IssuerBond);

  const tokenAddress = c.MockERC3643Token;
  const explorerBase = "https://testnet-explorer.hsk.xyz/tx/";

  console.log("══════════════════════════════════════════════════════");
  console.log("  STRATA — SEED REMAINING DEMO DATA");
  console.log(`  Deployer: ${deployer.address}`);
  console.log("══════════════════════════════════════════════════════\n");

  let tx, receipt;

  // ── STEP 1: Deposit issuer bond if not yet done ──────────────────
  console.log("Step 1: Check / deposit issuer bond...");
  try {
    const bond = await issuerBond.bonds(tokenAddress);
    if (bond.bondAmount === 0n) {
      tx = await mockUSDT.approve(c.IssuerBond, ethers.parseEther("5"));
      await tx.wait();
      tx = await issuerBond.deposit(tokenAddress, ethers.parseEther("5"), ethers.parseEther("100"));
      receipt = await tx.wait();
      console.log(`  Bond deposited ($5): ${explorerBase}${receipt!.hash}`);
    } else {
      console.log(`  Bond already deposited: ${ethers.formatEther(bond.bondAmount)} USDT ✓`);
    }
  } catch(e: any) {
    console.log(`  Bond check error: ${e.message?.slice(0,80)}`);
    // Try depositing anyway
    try {
      tx = await mockUSDT.approve(c.IssuerBond, ethers.parseEther("5"));
      await tx.wait();
      tx = await issuerBond.deposit(tokenAddress, ethers.parseEther("5"), ethers.parseEther("100"));
      receipt = await tx.wait();
      console.log(`  Bond deposited ($5): ${explorerBase}${receipt!.hash}`);
    } catch(e2: any) {
      console.log(`  Bond deposit skipped: ${e2.message?.slice(0,80)}`);
    }
  }

  // ── STEP 2: Record attestations + force-activate issuer ──────────
  console.log("\nStep 2: Activate issuer coverage...");
  const status = await issuerRegistry.getStatus(tokenAddress);
  // 2 = ACTIVE
  if (Number(status) < 2) {
    try {
      tx = await issuerRegistry.recordAttestation(tokenAddress);
      await tx.wait();
      tx = await issuerRegistry.recordAttestation(tokenAddress);
      await tx.wait();
      tx = await issuerRegistry.recordAttestation(tokenAddress);
      await tx.wait();
      console.log("  Attestations recorded ✓");
    } catch(e: any) {
      console.log(`  Attestations skipped: ${e.message?.slice(0,80)}`);
    }

    try {
      tx = await issuerRegistry.forceActivateForDemo(tokenAddress);
      receipt = await tx.wait();
      console.log(`  Issuer force-activated: ${explorerBase}${receipt!.hash}`);
    } catch(e: any) {
      console.log(`  Force activate failed: ${e.message?.slice(0,80)}`);
    }
  } else {
    console.log(`  Issuer already ACTIVE (status=${status}) ✓`);
  }

  // Activate pool if needed
  try {
    const poolState = await insurancePool.getPoolState(tokenAddress);
    if (!poolState.isActive) {
      tx = await insurancePool.activatePool(tokenAddress);
      await tx.wait();
      console.log("  Pool activated ✓");
    } else {
      console.log("  Pool already active ✓");
    }
  } catch(e: any) {
    console.log(`  Pool activate skipped: ${e.message?.slice(0,80)}`);
  }

  // ── STEP 3: Pay a premium to move the exchange rate ──────────────
  console.log("\nStep 3: Pay premium to accrue yield...");
  try {
    const premiumBps = await irsOracle.getPremiumRateBPS(tokenAddress);
    // Pay $500 premium to show meaningful yield (premiums go 70/30 to tranches)
    const premiumAmount = ethers.parseEther("500");
    tx = await mockUSDT.approve(c.InsurancePool, premiumAmount);
    await tx.wait();
    tx = await insurancePool.payPremium(tokenAddress, premiumAmount);
    receipt = await tx.wait();
    console.log(`  Premium paid ($500): ${explorerBase}${receipt!.hash}`);
    console.log(`  Senior gets $350, Junior gets $150 (after 5% protocol fee)`);
  } catch(e: any) {
    console.log(`  Premium payment failed: ${e.message?.slice(0,80)}`);
  }

  // ── STEP 4: Purchase coverage ────────────────────────────────────
  console.log("\nStep 4: Purchase coverage (ProtectionCert NFT)...");
  try {
    const certBal = await protectionCert.balanceOf(deployer.address);
    if (certBal === 0n) {
      // Approve USDT to PayoutEngine for coverage amount
      const coverageAmount = ethers.parseEther("1000");
      tx = await mockUSDT.approve(c.PayoutEngine, coverageAmount);
      await tx.wait();
      tx = await payoutEngine.purchaseCoverage(tokenAddress, coverageAmount);
      receipt = await tx.wait();
      console.log(`  Coverage purchased ($1000): ${explorerBase}${receipt!.hash}`);
      const newBal = await protectionCert.balanceOf(deployer.address);
      console.log(`  ProtectionCert NFTs owned: ${newBal}`);
    } else {
      console.log(`  Coverage already purchased (${certBal} NFTs) ✓`);
    }
  } catch(e: any) {
    console.log(`  Coverage purchase failed: ${e.message?.slice(0,80)}`);
  }

  // ── FINAL STATE ──────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════════");
  console.log("  FINAL STATE");
  console.log("══════════════════════════════════════════════════════");

  try {
    const statusNames = ["NONE","OBSERVATION","ACTIVE","MONITORING","DEFAULTED","WIND_DOWN","CLOSED"];
    const finalStatus = await issuerRegistry.getStatus(tokenAddress);
    const score = await irsOracle.getScore(tokenAddress);
    const premium = await irsOracle.getPremiumRateBPS(tokenAddress);
    const pool = await insurancePool.getPoolState(tokenAddress);
    const certBal = await protectionCert.balanceOf(deployer.address);
    const usdtBal = await mockUSDT.balanceOf(deployer.address);

    console.log(`Issuer Status:    ${statusNames[Number(finalStatus)]}`);
    console.log(`IRS Score:        ${score}`);
    console.log(`Premium Rate:     ${premium} bps (${Number(premium)/100}% APR)`);
    console.log(`Senior TVL:       $${ethers.formatEther(pool.seniorTVL)}`);
    console.log(`Junior TVL:       $${ethers.formatEther(pool.juniorTVL)}`);
    console.log(`Pool Active:      ${pool.isActive}`);
    console.log(`ProtectionCerts:  ${certBal}`);
    console.log(`Deployer USDT:    $${ethers.formatEther(usdtBal)}`);
    console.log("\n✅ Demo data seeding complete. App is ready for Demo Day.");
  } catch(e: any) {
    console.log(`Final state check error: ${e.message}`);
  }
}

main().catch(console.error);
