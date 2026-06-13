import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Seed Default/Payout Demo — deploys a SECOND issuer token ("GhostIssuer") and runs
 * the full default lifecycle on it. The primary issuer (MockERC3643Token) stays ACTIVE,
 * so the live dashboard/pool/coverage demo is untouched. The resulting on-chain state
 * gives us real TX hashes to show on the HashKey explorer during Demo Day.
 *
 * Run once: npx hardhat run scripts/seed-default-demo.ts --network hashkeyTestnet
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const deployFile = path.join(__dirname, "..", "deployments", "hashkeyTestnet.json");
  const deployment = JSON.parse(fs.readFileSync(deployFile, "utf-8"));
  const c = deployment.contracts;

  const USDT = ethers.parseEther;
  const explorerBase = "https://testnet-explorer.hsk.xyz/tx/";

  console.log("══════════════════════════════════════════════════════════════════");
  console.log("  STRATA — SEED DEFAULT/PAYOUT DEMO (GhostIssuer)");
  console.log(`  Deployer: ${deployer.address}`);
  console.log("══════════════════════════════════════════════════════════════════\n");

  // Reuse existing shared contracts
  const mockUSDT         = await ethers.getContractAt("MockUSDT", c.MockUSDT);
  const mockIdRegistry   = await ethers.getContractAt("MockIdentityRegistry", c.MockIdentityRegistry);
  const mockBAS          = await ethers.getContractAt("MockBASAttestation", c.MockBAS);
  const tir              = await ethers.getContractAt("TIR", c.TIR);
  const issuerBond       = await ethers.getContractAt("IssuerBond", c.IssuerBond);
  const irsOracle        = await ethers.getContractAt("IRSOracle", c.IRSOracle);
  const issuerRegistry   = await ethers.getContractAt("IssuerRegistry", c.IssuerRegistry);
  const insurancePool    = await ethers.getContractAt("InsurancePool", c.InsurancePool);
  const payoutEngine     = await ethers.getContractAt("PayoutEngine", c.PayoutEngine);
  const subrogationNFT   = await ethers.getContractAt("SubrogationNFT", c.SubrogationNFT);

  const txHashes: Record<string, string> = {};
  let tx, receipt;

  // ── STEP 0: Deploy a fresh MockERC3643Token (GhostIssuer) ─────────────
  console.log("Step 0: Deploy GhostIssuer token...");
  const MockERC3643Factory = await ethers.getContractFactory("MockERC3643Token");
  const ghostToken = await MockERC3643Factory.deploy("GhostIssuer", "GHOST", c.MockIdentityRegistry);
  await ghostToken.waitForDeployment();
  const ghostAddress = await ghostToken.getAddress();
  console.log(`  GhostIssuer deployed at: ${ghostAddress}`);
  console.log(`  Explorer: https://testnet-explorer.hsk.xyz/address/${ghostAddress}\n`);

  // Ensure deployer has USDT (for bond + deposits + coverage)
  try {
    tx = await mockUSDT.mint(deployer.address, USDT("1000"));
    await tx.wait();
    console.log("  Minted 1000 USDT to deployer for seeding\n");
  } catch (e: any) {
    console.log(`  USDT mint skipped: ${e.message?.slice(0, 80)}\n`);
  }

  // Mint ghost tokens to deployer (market cap reference)
  tx = await ghostToken.mint(deployer.address, USDT("100"));
  await tx.wait();
  console.log("  Minted 100 GHOST tokens to deployer\n");

  // ── STEP 1: BAS attestation ───────────────────────────────────────────
  console.log("Step 1: Submit BAS attestation...");
  try {
    tx = await mockBAS.submitAttestation(ghostAddress, "LEGAL_ENTITY", ethers.keccak256(ethers.toUtf8Bytes("ghost-demo")));
    receipt = await tx.wait();
    console.log(`  BAS attestation: ${explorerBase}${receipt!.hash}\n`);
  } catch (e: any) {
    console.log(`  BAS skipped: ${e.message?.slice(0, 80)}\n`);
  }

  // ── STEP 2: Register issuer ───────────────────────────────────────────
  console.log("Step 2: Register GhostIssuer...");
  tx = await issuerRegistry.register(
    ghostAddress, 1000, deployer.address, deployer.address, deployer.address, USDT("100"), false
  );
  receipt = await tx.wait();
  console.log(`  Registered: ${explorerBase}${receipt!.hash}\n`);

  // ── STEP 3: Bond ──────────────────────────────────────────────────────
  console.log("Step 3: Deposit issuer bond ($5)...");
  tx = await mockUSDT.approve(c.IssuerBond, USDT("5"));
  await tx.wait();
  tx = await issuerBond.deposit(ghostAddress, USDT("5"), USDT("100"));
  receipt = await tx.wait();
  console.log(`  Bond deposited: ${explorerBase}${receipt!.hash}\n`);

  // ── STEP 4: Attestations + force-activate ────────────────────────────
  console.log("Step 4: Record attestations + activate issuer...");
  try {
    tx = await issuerRegistry.recordAttestation(ghostAddress); await tx.wait();
    tx = await issuerRegistry.recordAttestation(ghostAddress); await tx.wait();
    tx = await issuerRegistry.recordAttestation(ghostAddress); await tx.wait();
  } catch (e: any) {
    console.log(`  Attestation records skipped: ${e.message?.slice(0, 80)}`);
  }
  tx = await issuerRegistry.forceActivateForDemo(ghostAddress);
  receipt = await tx.wait();
  console.log(`  Force-activated: ${explorerBase}${receipt!.hash}\n`);

  // ── STEP 5: IRS score + pool activate ────────────────────────────────
  console.log("Step 5: Init IRS score + activate pool...");
  try {
    tx = await irsOracle.initializeScore(ghostAddress, 400); // lower score — defaulting issuer
    await tx.wait();
  } catch (e: any) {
    console.log(`  IRS init skipped: ${e.message?.slice(0, 80)}`);
  }
  tx = await insurancePool.activatePool(ghostAddress);
  receipt = await tx.wait();
  console.log(`  Pool activated: ${explorerBase}${receipt!.hash}\n`);

  // ── STEP 6: Underwriter deposits ─────────────────────────────────────
  console.log("Step 6: Underwriter deposits ($3 junior + $7 senior)...");
  tx = await mockUSDT.approve(c.InsurancePool, USDT("100"));
  await tx.wait();

  tx = await insurancePool.depositJunior(ghostAddress, USDT("3"));
  receipt = await tx.wait();
  console.log(`  Junior $3: ${explorerBase}${receipt!.hash}`);

  tx = await insurancePool.depositSenior(ghostAddress, USDT("7"));
  receipt = await tx.wait();
  console.log(`  Senior $7: ${explorerBase}${receipt!.hash}\n`);

  // ── STEP 7: Coverage purchase ────────────────────────────────────────
  console.log("Step 7: Purchase $10 coverage...");
  tx = await mockUSDT.approve(c.PayoutEngine, USDT("10"));
  await tx.wait();
  tx = await payoutEngine.purchaseCoverage(ghostAddress, USDT("10"));
  receipt = await tx.wait();
  console.log(`  Coverage purchased: ${explorerBase}${receipt!.hash}\n`);

  // ── STEP 8: Force confirm default (TX1 of the headline pair) ─────────
  console.log("Step 8: Force-confirm default via TIR (attestor consensus)...");
  tx = await tir.forceConfirmDefault(ghostAddress);
  receipt = await tx.wait();
  txHashes["headline_tx1_default"] = receipt!.hash;
  console.log(`  ★ DEFAULT CONFIRMED: ${explorerBase}${receipt!.hash}\n`);

  // ── STEP 9: Execute payout (TX2 of the headline pair) ────────────────
  console.log("Step 9: Execute payout (waterfall + SubrogationNFT mint)...");
  tx = await payoutEngine.executePayout(ghostAddress);
  receipt = await tx.wait();
  txHashes["headline_tx2_payout"] = receipt!.hash;
  console.log(`  ★ PAYOUT EXECUTED: ${explorerBase}${receipt!.hash}\n`);

  // ── Final state ───────────────────────────────────────────────────────
  console.log("══════════════════════════════════════════════════════════════════");
  console.log("  FINAL STATE");
  console.log("══════════════════════════════════════════════════════════════════");

  const statusNames = ["OBSERVATION", "ACTIVE", "MONITORING", "DEFAULTED", "WIND_DOWN", "CLOSED"];
  try {
    const status = await issuerRegistry.getStatus(ghostAddress);
    console.log(`  GhostIssuer Status:   ${statusNames[Number(status)]} (expected DEFAULTED)`);
  } catch (e) {}

  try {
    const claimId = await subrogationNFT.getClaimByIssuer(ghostAddress);
    console.log(`  SubrogationNFT ID:    #${claimId}`);
    if (claimId > 0n) {
      const claim = await subrogationNFT.getClaimData(claimId);
      console.log(`    issuerToken:        ${claim.issuerToken}`);
      console.log(`    defaultType:        ${claim.defaultType}`);
      console.log(`    totalPayoutAmount:  ${ethers.formatEther(claim.totalPayoutAmount)} USDT`);
      console.log(`    bondLiquidated:     ${ethers.formatEther(claim.bondLiquidated)} USDT`);
      console.log(`    juniorLiquidated:   ${ethers.formatEther(claim.juniorLiquidated)} USDT`);
      console.log(`    seniorLiquidated:   ${ethers.formatEther(claim.seniorLiquidated)} USDT`);
      console.log(`    insuredHolderCount: ${claim.insuredHolderCount}`);
      console.log(`    payoutBlock:        ${claim.payoutBlock}`);
    }
  } catch (e: any) {
    console.log(`  SubrogationNFT check error: ${e.message?.slice(0, 80)}`);
  }

  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log("  🎯 EXPLORER URLS FOR PITCH (copy these)");
  console.log("══════════════════════════════════════════════════════════════════");
  console.log(`\n  Default TX (attestor consensus):`);
  console.log(`    ${explorerBase}${txHashes["headline_tx1_default"]}`);
  console.log(`\n  Payout TX (4-event waterfall + SubrogationNFT mint):`);
  console.log(`    ${explorerBase}${txHashes["headline_tx2_payout"]}`);
  console.log(`\n  GhostIssuer contract:`);
  console.log(`    https://testnet-explorer.hsk.xyz/address/${ghostAddress}`);
  console.log(`\n  SubrogationNFT contract (read getClaimData):`);
  console.log(`    https://testnet-explorer.hsk.xyz/address/${c.SubrogationNFT}#readContract`);
  console.log(`\n  Live subrogation page (shows minted NFT):`);
  console.log(`    https://coverfi-protocol.vercel.app/subrogation.html`);
  console.log(`\n  Live dashboard (primary issuer still ACTIVE — $25,175 TVL):`);
  console.log(`    https://coverfi-protocol.vercel.app/dashboard.html`);
  console.log("\n══════════════════════════════════════════════════════════════════\n");

  console.log("✅ Default/payout demo seed complete.");
  console.log("   Primary issuer (MockERC3643Token) untouched — live demo still works.");
}

main().catch((e) => {
  console.error("\n❌ Script failed:", e.message || e);
  process.exit(1);
});
