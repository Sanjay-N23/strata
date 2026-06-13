import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * HashKey Chain Testnet Demo Script
 *
 * Prerequisites:
 *   1. Deploy contracts: npm run deploy:hashkey
 *   2. Fund the deployer wallet with HSK + test USDT
 *   3. Run this: npx hardhat run scripts/demo-testnet.ts --network hashkeyTestnet
 *
 * This script uses the deployer as all actors (issuer, custodian, legalRep, auditor,
 * underwriter, investor) since testnet only has one funded account.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  STRATA — HASHKEY CHAIN TESTNET DEMO (3 Transactions)");
  console.log(`  Deployer: ${deployer.address}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Load deployment
  const network = await ethers.provider.getNetwork();
  const deployFilename = Number(network.chainId) === 133 ? "hashkeyTestnet.json" : "bscTestnet.json";
  const deployFile = path.join(__dirname, "..", "deployments", deployFilename);
  if (!fs.existsSync(deployFile)) {
    console.error("No deployment found. Run: npm run deploy:hashkey or npm run deploy:testnet");
    return;
  }
  const deployment = JSON.parse(fs.readFileSync(deployFile, "utf-8"));
  const c = deployment.contracts;

  // Get contract instances
  const mockUSDT = await ethers.getContractAt("MockUSDT", c.MockUSDT);
  const mockToken = await ethers.getContractAt("MockERC3643Token", c.MockERC3643Token);
  const mockIdRegistry = await ethers.getContractAt("MockIdentityRegistry", c.MockIdentityRegistry);
  const mockBAS = await ethers.getContractAt("MockBASAttestation", c.MockBAS);
  const tir = await ethers.getContractAt("TIR", c.TIR);
  const issuerBond = await ethers.getContractAt("IssuerBond", c.IssuerBond);
  const irsOracle = await ethers.getContractAt("IRSOracle", c.IRSOracle);
  const issuerRegistry = await ethers.getContractAt("IssuerRegistry", c.IssuerRegistry);
  const insurancePool = await ethers.getContractAt("InsurancePool", c.InsurancePool);
  const payoutEngine = await ethers.getContractAt("PayoutEngine", c.PayoutEngine);
  const subrogationNFT = await ethers.getContractAt("SubrogationNFT", c.SubrogationNFT);
  const protectionCert = await ethers.getContractAt("ProtectionCert", c.ProtectionCert);

  const tokenAddress = c.MockERC3643Token;
  const USDT = ethers.parseEther;
  const explorerBase = Number(network.chainId) === 133 ? "https://testnet-explorer.hsk.xyz/tx/" : "https://testnet.bscscan.com/tx/";

  const txHashes: Record<string, string> = {};

  // ═══════════════════════════════════════════════════════════════════
  // SETUP: Mint mock USDT and configure
  // ═══════════════════════════════════════════════════════════════════
  console.log("--- Setup ---");
  let tx;
  tx = await mockUSDT.mint(deployer.address, USDT("10000"));
  await tx.wait();
  console.log("Mock USDT minted");

  tx = await mockToken.mint(deployer.address, USDT("1000"));
  await tx.wait();
  console.log("Mock RWA tokens minted");

  tx = await mockIdRegistry.setVerified(deployer.address, true);
  await tx.wait();
  console.log("KYC set");

  // Register 3 TIR attestors (all deployer for testnet simplicity)
  // We'll register 3 separate wallets generated from deployer
  // On testnet, we use forceConfirmDefault instead of real 2-of-3
  console.log("Setup complete ✓\n");

  // ═══════════════════════════════════════════════════════════════════
  // TX1: Issuer Registration + Bond + Activation
  // ═══════════════════════════════════════════════════════════════════
  console.log("═══════════════════════════════════════════════════");
  console.log("  TX1: Issuer Registration + Bond + Activation");
  console.log("═══════════════════════════════════════════════════");

  // BAS attestation
  tx = await mockBAS.submitAttestation(tokenAddress, "LEGAL_ENTITY", ethers.keccak256(ethers.toUtf8Bytes("demo")));
  let receipt = await tx.wait();
  txHashes["tx1_bas"] = receipt!.hash;
  console.log(`BAS attestation: ${explorerBase}${receipt!.hash}`);

  // Register issuer
  tx = await issuerRegistry.register(
    tokenAddress, 1000, deployer.address, deployer.address, deployer.address, USDT("100"), false
  );
  receipt = await tx.wait();
  txHashes["tx1_register"] = receipt!.hash;
  console.log(`Issuer registered: ${explorerBase}${receipt!.hash}`);

  // Bond
  tx = await mockUSDT.approve(c.IssuerBond, USDT("5"));
  await tx.wait();
  tx = await issuerBond.deposit(tokenAddress, USDT("5"), USDT("100"));
  receipt = await tx.wait();
  txHashes["tx1_bond"] = receipt!.hash;
  console.log(`Bond deposited ($5): ${explorerBase}${receipt!.hash}`);

  // Attestations + activate
  tx = await issuerRegistry.recordAttestation(tokenAddress);
  await tx.wait();
  tx = await issuerRegistry.recordAttestation(tokenAddress);
  await tx.wait();
  tx = await issuerRegistry.recordAttestation(tokenAddress);
  await tx.wait();

  tx = await issuerRegistry.forceActivateForDemo(tokenAddress);
  receipt = await tx.wait();
  txHashes["tx1_activate"] = receipt!.hash;
  console.log(`Coverage activated: ${explorerBase}${receipt!.hash}`);

  tx = await irsOracle.initializeScore(tokenAddress, 600);
  await tx.wait();

  tx = await insurancePool.activatePool(tokenAddress);
  await tx.wait();

  const score = await irsOracle.getScore(tokenAddress);
  const premium = await irsOracle.getPremiumRateBPS(tokenAddress);
  console.log(`\n✅ TX1: IRS=${score}, Premium=${premium}bps (${Number(premium)/100}% APR)\n`);

  // ═══════════════════════════════════════════════════════════════════
  // TX2: Underwriter Deposit + Coverage Purchase
  // ═══════════════════════════════════════════════════════════════════
  console.log("═══════════════════════════════════════════════════");
  console.log("  TX2: Underwriter Deposits + Coverage Purchase");
  console.log("═══════════════════════════════════════════════════");

  tx = await mockUSDT.approve(c.InsurancePool, USDT("100"));
  await tx.wait();

  tx = await insurancePool.depositJunior(tokenAddress, USDT("3"));
  receipt = await tx.wait();
  txHashes["tx2_junior"] = receipt!.hash;
  console.log(`Junior ($3): ${explorerBase}${receipt!.hash}`);

  tx = await insurancePool.depositSenior(tokenAddress, USDT("7"));
  receipt = await tx.wait();
  txHashes["tx2_senior"] = receipt!.hash;
  console.log(`Senior ($7): ${explorerBase}${receipt!.hash}`);

  tx = await payoutEngine.purchaseCoverage(tokenAddress, USDT("100"));
  receipt = await tx.wait();
  txHashes["tx2_coverage"] = receipt!.hash;
  console.log(`Coverage purchased: ${explorerBase}${receipt!.hash}`);

  const pool = await insurancePool.getPoolState(tokenAddress);
  console.log(`\n✅ TX2: Senior=${ethers.formatEther(pool.seniorTVL)}, Junior=${ethers.formatEther(pool.juniorTVL)}\n`);

  // ═══════════════════════════════════════════════════════════════════
  // TX3: Default + Payout + SubrogationNFT
  // ═══════════════════════════════════════════════════════════════════
  console.log("═══════════════════════════════════════════════════");
  console.log("  TX3: Default + Payout + SubrogationNFT");
  console.log("═══════════════════════════════════════════════════");

  const balBefore = await mockUSDT.balanceOf(deployer.address);

  // Force confirm default (uses owner bypass since testnet has 1 account)
  tx = await tir.forceConfirmDefault(tokenAddress);
  receipt = await tx.wait();
  txHashes["tx3_default"] = receipt!.hash;
  console.log(`Default confirmed: ${explorerBase}${receipt!.hash}`);

  // Execute payout
  tx = await payoutEngine.executePayout(tokenAddress);
  receipt = await tx.wait();
  txHashes["tx3_payout"] = receipt!.hash;
  console.log(`Payout executed: ${explorerBase}${receipt!.hash}`);

  const balAfter = await mockUSDT.balanceOf(deployer.address);
  const scoreAfter = await irsOracle.getScore(tokenAddress);
  const statusAfter = await issuerRegistry.getStatus(tokenAddress);

  console.log(`\n✅ TX3 Complete:`);
  console.log(`   USDT received:    ${ethers.formatEther(balAfter - balBefore)}`);
  console.log(`   IRS Score:        ${scoreAfter} (should be 0)`);
  console.log(`   Issuer Status:    ${statusAfter} (3 = DEFAULTED)`);

  const claimId = await subrogationNFT.getClaimByIssuer(tokenAddress);
  if (claimId > 0n) {
    const claim = await subrogationNFT.getClaimData(claimId);
    console.log(`   SubrogationNFT:   #${claimId}`);
    console.log(`   Total payout:     ${ethers.formatEther(claim.totalPayoutAmount)} USDT`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // SAVE RESULTS
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  ALL 3 DEMO TRANSACTIONS COMPLETE ✅");
  console.log("═══════════════════════════════════════════════════════════════\n");

  console.log("BNBScan Links:");
  for (const [key, hash] of Object.entries(txHashes)) {
    console.log(`  ${key}: ${explorerBase}${hash}`);
  }

  // Update deployment file with tx hashes
  deployment.demoTransactions = txHashes;
  deployment.demoResults = {
    tx1_irs: Number(score),
    tx1_premium_bps: Number(premium),
    tx2_senior_tvl: ethers.formatEther(pool.seniorTVL),
    tx2_junior_tvl: ethers.formatEther(pool.juniorTVL),
    tx3_usdt_received: ethers.formatEther(balAfter - balBefore),
    tx3_irs_after: Number(scoreAfter),
    tx3_status_after: Number(statusAfter),
    tx3_subrogation_nft_id: Number(claimId),
  };

  fs.writeFileSync(deployFile, JSON.stringify(deployment, null, 2));
  console.log(`\n📁 Results saved to deployments/bscTestnet.json`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
