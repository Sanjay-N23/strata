import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer, issuer, custodian, legalRep, auditor, underwriter, investor1] =
    await ethers.getSigners();

  console.log("═══════════════════════════════════════════════════");
  console.log("  STRATA PROTOCOL — DEMO SETUP (3 Transactions)  ");
  console.log("═══════════════════════════════════════════════════\n");

  // Load deployment addresses
  const deployFile = path.join(__dirname, "..", "deployments", "localhost.json");
  let addresses: Record<string, string>;
  if (fs.existsSync(deployFile)) {
    const deployment = JSON.parse(fs.readFileSync(deployFile, "utf-8"));
    addresses = deployment.contracts;
  } else {
    console.log("No deployment found. Run deploy.ts first.");
    return;
  }

  // Get contract instances
  const mockUSDT = await ethers.getContractAt("MockUSDT", addresses.MockUSDT);
  const mockToken = await ethers.getContractAt("MockERC3643Token", addresses.MockERC3643Token);
  const mockIdRegistry = await ethers.getContractAt("MockIdentityRegistry", addresses.MockIdentityRegistry);
  const mockBAS = await ethers.getContractAt("MockBASAttestation", addresses.MockBAS);
  const tir = await ethers.getContractAt("TIR", addresses.TIR);
  const issuerBond = await ethers.getContractAt("IssuerBond", addresses.IssuerBond);
  const irsOracle = await ethers.getContractAt("IRSOracle", addresses.IRSOracle);
  const issuerRegistry = await ethers.getContractAt("IssuerRegistry", addresses.IssuerRegistry);
  const insurancePool = await ethers.getContractAt("InsurancePool", addresses.InsurancePool);
  const payoutEngine = await ethers.getContractAt("PayoutEngine", addresses.PayoutEngine);

  const tokenAddress = addresses.MockERC3643Token;
  const USDT = ethers.parseEther; // 18 decimals

  // ═══════════════════════════════════════════════════════════════════
  // SETUP: Mint USDT and configure actors
  // ═══════════════════════════════════════════════════════════════════
  console.log("--- Setting up demo actors ---");

  // Mint USDT to all participants
  await mockUSDT.mint(issuer.address, USDT("1000"));
  await mockUSDT.mint(underwriter.address, USDT("1000"));
  await mockUSDT.mint(investor1.address, USDT("1000"));
  console.log("USDT minted to issuer, underwriter, investor1");

  // Mint RWA tokens
  await mockToken.mint(investor1.address, USDT("100"));
  console.log("RWA tokens minted to investor1");

  // Set KYC verification
  await mockIdRegistry.setVerified(investor1.address, true);
  await mockIdRegistry.setVerified(underwriter.address, true);
  await mockIdRegistry.setVerified(issuer.address, true);
  console.log("KYC set for all participants");

  // Register TIR attestors (custodian, legalRep, auditor)
  await tir.connect(custodian).registerAttestor(0, { value: ethers.parseEther("5") });  // CUSTODIAN
  await tir.connect(legalRep).registerAttestor(1, { value: ethers.parseEther("5") });   // LEGAL_REP
  await tir.connect(auditor).registerAttestor(2, { value: ethers.parseEther("5") });    // AUDITOR
  console.log("TIR attestors registered (custodian, legalRep, auditor)");

  console.log("\n");

  // ═══════════════════════════════════════════════════════════════════
  // TRANSACTION 1: Issuer Registration + Bond + Activation
  // ═══════════════════════════════════════════════════════════════════
  console.log("═══════════════════════════════════════════════════");
  console.log("  TX1: Issuer Registration + Bond + Activation");
  console.log("═══════════════════════════════════════════════════");

  // 1a. Submit BAS legal attestation
  const tx1a = await mockBAS.connect(issuer).submitAttestation(
    tokenAddress,
    "LEGAL_ENTITY_REGISTRATION",
    ethers.keccak256(ethers.toUtf8Bytes("Strata Demo Issuer Legal Entity"))
  );
  const receipt1a = await tx1a.wait();
  console.log("BAS legal attestation submitted. TX:", receipt1a?.hash);

  // 1b. Register issuer
  const marketCap = USDT("100"); // $100 demo market cap
  const tx1b = await issuerRegistry.connect(issuer).register(
    tokenAddress,
    1000,             // BAS UID
    custodian.address,
    legalRep.address,
    auditor.address,
    marketCap,
    false             // standard track
  );
  const receipt1b = await tx1b.wait();
  console.log("Issuer registered. TX:", receipt1b?.hash);

  // 1c. Deposit issuer bond (5% of market cap = 5 USDT)
  const bondAmount = USDT("5");
  await mockUSDT.connect(issuer).approve(addresses.IssuerBond, bondAmount);
  const tx1c = await issuerBond.connect(issuer).deposit(tokenAddress, bondAmount, marketCap);
  const receipt1c = await tx1c.wait();
  console.log("Issuer bond deposited ($5 USDT). TX:", receipt1c?.hash);

  // 1d. Record 3 attestations
  await issuerRegistry.recordAttestation(tokenAddress);
  await issuerRegistry.recordAttestation(tokenAddress);
  await issuerRegistry.recordAttestation(tokenAddress);
  console.log("3 attestations recorded");

  // 1e. Force activate (demo — skips time requirement)
  const tx1e = await issuerRegistry.forceActivateForDemo(tokenAddress);
  const receipt1e = await tx1e.wait();
  console.log("Coverage activated (DEMO). TX:", receipt1e?.hash);

  // 1f. Initialize IRS score
  await irsOracle.initializeScore(tokenAddress, 600);
  console.log("IRS initialized at 600");

  // 1g. Activate insurance pool
  await insurancePool.activatePool(tokenAddress);
  console.log("Insurance pool activated");

  // Verify
  const profile = await issuerRegistry.getProfile(tokenAddress);
  const score = await irsOracle.getScore(tokenAddress);
  const premiumBPS = await irsOracle.getPremiumRateBPS(tokenAddress);
  console.log(`\n✅ TX1 Complete:`);
  console.log(`   Status: ${profile.status} (1 = ACTIVE)`);
  console.log(`   IRS Score: ${score}`);
  console.log(`   Premium: ${premiumBPS} bps (${Number(premiumBPS) / 100}% APR)`);

  console.log("\n");

  // ═══════════════════════════════════════════════════════════════════
  // TRANSACTION 2: Underwriter Deposits + Investor Buys Coverage
  // ═══════════════════════════════════════════════════════════════════
  console.log("═══════════════════════════════════════════════════");
  console.log("  TX2: Underwriter Deposits + Coverage Purchase");
  console.log("═══════════════════════════════════════════════════");

  // 2a. Underwriter deposits to junior tranche first (to satisfy 25% ratio)
  const juniorDeposit = USDT("3");
  await mockUSDT.connect(underwriter).approve(addresses.InsurancePool, USDT("100"));

  // Transfer USDT to jrCVR contract for it to hold
  const tx2a = await insurancePool.connect(underwriter).depositJunior(tokenAddress, juniorDeposit);
  const receipt2a = await tx2a.wait();
  console.log(`Junior deposited ($3 USDT). TX: ${receipt2a?.hash}`);

  // 2b. Underwriter deposits to senior tranche
  const seniorDeposit = USDT("7");
  const tx2b = await insurancePool.connect(underwriter).depositSenior(tokenAddress, seniorDeposit);
  const receipt2b = await tx2b.wait();
  console.log(`Senior deposited ($7 USDT). TX: ${receipt2b?.hash}`);

  // 2c. Investor purchases coverage
  const coverageAmount = USDT("100"); // covering 100 tokens
  const tx2c = await payoutEngine.connect(investor1).purchaseCoverage(tokenAddress, coverageAmount);
  const receipt2c = await tx2c.wait();
  console.log(`Coverage purchased (100 tokens). TX: ${receipt2c?.hash}`);

  // Verify
  const poolState = await insurancePool.getPoolState(tokenAddress);
  const position = await payoutEngine.getInsuredPosition(tokenAddress, investor1.address);
  console.log(`\n✅ TX2 Complete:`);
  console.log(`   Senior TVL: ${ethers.formatEther(poolState.seniorTVL)} USDT`);
  console.log(`   Junior TVL: ${ethers.formatEther(poolState.juniorTVL)} USDT`);
  console.log(`   Bond: ${ethers.formatEther(await issuerBond.getBond(tokenAddress))} USDT`);
  console.log(`   Total Pool: ${ethers.formatEther(poolState.seniorTVL + poolState.juniorTVL)} USDT + bond`);
  console.log(`   Investor covered: ${ethers.formatEther(position.coveredAmount)} tokens`);
  console.log(`   Est. payout %: ${Number(position.estimatedPayoutPct) / 100}%`);

  console.log("\n");

  // ═══════════════════════════════════════════════════════════════════
  // TRANSACTION 3: Default Confirmation + Payout + SubrogationNFT
  // ═══════════════════════════════════════════════════════════════════
  console.log("═══════════════════════════════════════════════════");
  console.log("  TX3: Default + Payout + SubrogationNFT");
  console.log("═══════════════════════════════════════════════════");

  // Record investor balance before payout
  const balanceBefore = await mockUSDT.balanceOf(investor1.address);
  console.log(`Investor1 USDT balance before: ${ethers.formatEther(balanceBefore)}`);

  // 3a. Custodian submits default attestation
  await mockBAS.connect(custodian).submitAttestation(
    tokenAddress,
    "DEFAULT_PAYMENT_DELAY",
    ethers.keccak256(ethers.toUtf8Bytes("Payment overdue 14 days"))
  );
  const tx3a = await tir.connect(custodian).submitDefaultAttestation(
    tokenAddress,
    1001,
    ethers.ZeroHash
  );
  const receipt3a = await tx3a.wait();
  console.log(`Custodian attestation submitted. TX: ${receipt3a?.hash}`);

  // 3b. Legal Rep submits default attestation (2-of-3 reached)
  await mockBAS.connect(legalRep).submitAttestation(
    tokenAddress,
    "DEFAULT_PAYMENT_DELAY",
    ethers.keccak256(ethers.toUtf8Bytes("Confirmed payment default"))
  );
  const tx3b = await tir.connect(legalRep).submitDefaultAttestation(
    tokenAddress,
    1002,
    ethers.ZeroHash
  );
  const receipt3b = await tx3b.wait();
  console.log(`Legal Rep attestation submitted (2-of-3 reached). TX: ${receipt3b?.hash}`);

  // Verify TIR confirmation
  const isConfirmed = await tir.isDefaultConfirmed(tokenAddress);
  console.log(`Default confirmed by TIR: ${isConfirmed}`);

  // 3c. Execute payout
  const tx3c = await payoutEngine.executePayout(tokenAddress);
  const receipt3c = await tx3c.wait();
  console.log(`Payout executed. TX: ${receipt3c?.hash}`);

  // Verify results
  const balanceAfter = await mockUSDT.balanceOf(investor1.address);
  const scoreAfter = await irsOracle.getScore(tokenAddress);
  const statusAfter = await issuerRegistry.getStatus(tokenAddress);

  console.log(`\n✅ TX3 Complete:`);
  console.log(`   Investor1 USDT before: ${ethers.formatEther(balanceBefore)}`);
  console.log(`   Investor1 USDT after:  ${ethers.formatEther(balanceAfter)}`);
  console.log(`   USDT received:         ${ethers.formatEther(balanceAfter - balanceBefore)}`);
  console.log(`   IRS Score after:        ${scoreAfter} (should be 0)`);
  console.log(`   Issuer Status:          ${statusAfter} (3 = DEFAULTED)`);

  // Check SubrogationNFT
  const subNFT = await ethers.getContractAt("SubrogationNFT", addresses.SubrogationNFT);
  const claimId = await subNFT.getClaimByIssuer(tokenAddress);
  if (claimId > 0n) {
    const claim = await subNFT.getClaimData(claimId);
    console.log(`   SubrogationNFT #${claimId} minted`);
    console.log(`   Total payout:           ${ethers.formatEther(claim.totalPayoutAmount)} USDT`);
    console.log(`   Bond liquidated:        ${ethers.formatEther(claim.bondLiquidated)} USDT`);
    console.log(`   Junior liquidated:      ${ethers.formatEther(claim.juniorLiquidated)} USDT`);
    console.log(`   Senior liquidated:      ${ethers.formatEther(claim.seniorLiquidated)} USDT`);
  }

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  ALL 3 DEMO TRANSACTIONS COMPLETE ✅");
  console.log("═══════════════════════════════════════════════════\n");

  // Save demo transaction hashes
  const demoTxs = {
    tx1_register: receipt1b?.hash,
    tx1_bond: receipt1c?.hash,
    tx1_activate: receipt1e?.hash,
    tx2_junior_deposit: receipt2a?.hash,
    tx2_senior_deposit: receipt2b?.hash,
    tx2_coverage: receipt2c?.hash,
    tx3_custodian_attest: receipt3a?.hash,
    tx3_legal_attest: receipt3b?.hash,
    tx3_payout: receipt3c?.hash,
  };

  console.log("Demo Transaction Hashes:");
  for (const [key, hash] of Object.entries(demoTxs)) {
    console.log(`  ${key}: ${hash}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
