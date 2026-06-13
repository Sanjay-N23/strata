import { ethers } from "hardhat";

async function main() {
  const signers = await ethers.getSigners();
  const [deployer, issuer, custodian, legalRep, auditor, underwriter, investor1] = signers;

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  STRATA PROTOCOL — FULL DEPLOY + DEMO (3 Transactions)");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const foundation = deployer.address;
  const USDT = ethers.parseEther;

  // ═══════════════════════════════════════════════════════════════════
  // DEPLOY ALL CONTRACTS
  // ═══════════════════════════════════════════════════════════════════
  console.log("--- Deploying Mock Contracts ---");
  const mockUSDT = await (await ethers.getContractFactory("MockUSDT")).deploy();
  const mockIdRegistry = await (await ethers.getContractFactory("MockIdentityRegistry")).deploy();
  const mockToken = await (await ethers.getContractFactory("MockERC3643Token")).deploy("Mock RWA Token", "mRWA", await mockIdRegistry.getAddress());
  const mockBAS = await (await ethers.getContractFactory("MockBASAttestation")).deploy();
  const mockChainlink = await (await ethers.getContractFactory("MockChainlinkPoR")).deploy();
  console.log("Mocks deployed ✓");

  console.log("--- Deploying Core Contracts ---");
  const usdtAddr = await mockUSDT.getAddress();
  const tir = await (await ethers.getContractFactory("TIR")).deploy();
  const issuerBond = await (await ethers.getContractFactory("IssuerBond")).deploy(usdtAddr, deployer.address);
  const irsOracle = await (await ethers.getContractFactory("IRSOracle")).deploy();
  const defaultOracle = await (await ethers.getContractFactory("DefaultOracle")).deploy(await tir.getAddress());
  const issuerRegistry = await (await ethers.getContractFactory("IssuerRegistry")).deploy(
    await tir.getAddress(), await issuerBond.getAddress(), await irsOracle.getAddress(), await defaultOracle.getAddress()
  );
  const insurancePool = await (await ethers.getContractFactory("InsurancePool")).deploy(usdtAddr, deployer.address);
  const srCVR = await (await ethers.getContractFactory("srCVR")).deploy(await insurancePool.getAddress(), usdtAddr);
  const jrCVR = await (await ethers.getContractFactory("jrCVR")).deploy(await insurancePool.getAddress(), usdtAddr);
  const protectionCert = await (await ethers.getContractFactory("ProtectionCert")).deploy();
  const payoutEngine = await (await ethers.getContractFactory("PayoutEngine")).deploy(usdtAddr, foundation);
  const subrogationNFT = await (await ethers.getContractFactory("SubrogationNFT")).deploy(await payoutEngine.getAddress(), foundation);
  console.log("Core contracts deployed ✓");

  console.log("--- Wiring Permissions ---");
  await insurancePool.setSrCVR(await srCVR.getAddress());
  await insurancePool.setJrCVR(await jrCVR.getAddress());
  await insurancePool.setIssuerRegistry(await issuerRegistry.getAddress());
  await insurancePool.setIRSOracle(await irsOracle.getAddress());
  await insurancePool.setDefaultOracle(await defaultOracle.getAddress());
  await insurancePool.setPayoutEngine(await payoutEngine.getAddress());
  await issuerBond.setPayoutEngine(await payoutEngine.getAddress());
  await issuerBond.setIssuerRegistry(await issuerRegistry.getAddress());
  await irsOracle.setInsurancePool(await insurancePool.getAddress());
  await irsOracle.setPayoutEngine(await payoutEngine.getAddress());
  await irsOracle.setKeeper(deployer.address);
  await defaultOracle.setIRSOracle(await irsOracle.getAddress());
  await defaultOracle.setInsurancePool(await insurancePool.getAddress());
  await defaultOracle.setPayoutEngine(await payoutEngine.getAddress());
  await defaultOracle.setIssuerRegistry(await issuerRegistry.getAddress());
  await issuerRegistry.setInsurancePool(await insurancePool.getAddress());
  await issuerRegistry.setPayoutEngine(await payoutEngine.getAddress());
  await protectionCert.setPayoutEngine(await payoutEngine.getAddress());
  await payoutEngine.setInsurancePool(await insurancePool.getAddress());
  await payoutEngine.setDefaultOracle(await defaultOracle.getAddress());
  await payoutEngine.setProtectionCert(await protectionCert.getAddress());
  await payoutEngine.setIssuerBond(await issuerBond.getAddress());
  await payoutEngine.setSubrogationNFT(await subrogationNFT.getAddress());
  await payoutEngine.setIRSOracle(await irsOracle.getAddress());
  await payoutEngine.setIssuerRegistry(await issuerRegistry.getAddress());
  console.log("All permissions wired ✓\n");

  const tokenAddress = await mockToken.getAddress();

  // ═══════════════════════════════════════════════════════════════════
  // SETUP: Mint USDT and configure actors
  // ═══════════════════════════════════════════════════════════════════
  console.log("--- Setting up demo actors ---");
  await mockUSDT.mint(issuer.address, USDT("1000"));
  await mockUSDT.mint(underwriter.address, USDT("1000"));
  await mockUSDT.mint(investor1.address, USDT("1000"));
  await mockToken.mint(investor1.address, USDT("100"));
  await mockIdRegistry.setVerified(investor1.address, true);
  await mockIdRegistry.setVerified(underwriter.address, true);
  await mockIdRegistry.setVerified(issuer.address, true);
  await tir.connect(custodian).registerAttestor(0, { value: ethers.parseEther("5") });
  await tir.connect(legalRep).registerAttestor(1, { value: ethers.parseEther("5") });
  await tir.connect(auditor).registerAttestor(2, { value: ethers.parseEther("5") });
  console.log("Actors configured ✓\n");

  // ═══════════════════════════════════════════════════════════════════
  // TX1: Issuer Registration + Bond + Activation
  // ═══════════════════════════════════════════════════════════════════
  console.log("═══════════════════════════════════════════════════");
  console.log("  TX1: Issuer Registration + Bond + Activation");
  console.log("═══════════════════════════════════════════════════");

  await mockBAS.connect(issuer).submitAttestation(tokenAddress, "LEGAL_ENTITY", ethers.keccak256(ethers.toUtf8Bytes("demo")));

  const marketCap = USDT("100");
  const tx1reg = await issuerRegistry.connect(issuer).register(tokenAddress, 1000, custodian.address, legalRep.address, auditor.address, marketCap, false);
  console.log("Issuer registered. TX:", (await tx1reg.wait())?.hash);

  const bondAmount = USDT("5");
  await mockUSDT.connect(issuer).approve(await issuerBond.getAddress(), bondAmount);
  const tx1bond = await issuerBond.connect(issuer).deposit(tokenAddress, bondAmount, marketCap);
  console.log("Bond deposited ($5). TX:", (await tx1bond.wait())?.hash);

  await issuerRegistry.recordAttestation(tokenAddress);
  await issuerRegistry.recordAttestation(tokenAddress);
  await issuerRegistry.recordAttestation(tokenAddress);

  const tx1activate = await issuerRegistry.forceActivateForDemo(tokenAddress);
  console.log("Coverage activated. TX:", (await tx1activate.wait())?.hash);

  await irsOracle.initializeScore(tokenAddress, 600);
  await insurancePool.activatePool(tokenAddress);

  const score = await irsOracle.getScore(tokenAddress);
  const premiumBPS = await irsOracle.getPremiumRateBPS(tokenAddress);
  console.log(`\n✅ TX1 Complete: IRS=${score}, Premium=${premiumBPS}bps (${Number(premiumBPS)/100}% APR)\n`);

  // ═══════════════════════════════════════════════════════════════════
  // TX2: Underwriter Deposits + Investor Buys Coverage
  // ═══════════════════════════════════════════════════════════════════
  console.log("═══════════════════════════════════════════════════");
  console.log("  TX2: Underwriter Deposits + Coverage Purchase");
  console.log("═══════════════════════════════════════════════════");

  await mockUSDT.connect(underwriter).approve(await insurancePool.getAddress(), USDT("100"));

  // Junior first (to satisfy 25% min ratio)
  const tx2jr = await insurancePool.connect(underwriter).depositJunior(tokenAddress, USDT("3"));
  console.log("Junior deposited ($3). TX:", (await tx2jr.wait())?.hash);

  const tx2sr = await insurancePool.connect(underwriter).depositSenior(tokenAddress, USDT("7"));
  console.log("Senior deposited ($7). TX:", (await tx2sr.wait())?.hash);

  const tx2cov = await payoutEngine.connect(investor1).purchaseCoverage(tokenAddress, USDT("100"));
  console.log("Coverage purchased (100 tokens). TX:", (await tx2cov.wait())?.hash);

  const poolState = await insurancePool.getPoolState(tokenAddress);
  console.log(`\n✅ TX2 Complete: Senior=${ethers.formatEther(poolState.seniorTVL)}, Junior=${ethers.formatEther(poolState.juniorTVL)}, Bond=$5\n`);

  // ═══════════════════════════════════════════════════════════════════
  // TX3: Default Confirmation + Payout + SubrogationNFT
  // ═══════════════════════════════════════════════════════════════════
  console.log("═══════════════════════════════════════════════════");
  console.log("  TX3: Default + Payout + SubrogationNFT");
  console.log("═══════════════════════════════════════════════════");

  const balanceBefore = await mockUSDT.balanceOf(investor1.address);

  // Custodian attestation
  await mockBAS.connect(custodian).submitAttestation(tokenAddress, "DEFAULT", ethers.ZeroHash);
  const tx3a = await tir.connect(custodian).submitDefaultAttestation(tokenAddress, 1001, ethers.ZeroHash);
  console.log("Custodian attested. TX:", (await tx3a.wait())?.hash);

  // Legal Rep attestation (2-of-3 reached!)
  await mockBAS.connect(legalRep).submitAttestation(tokenAddress, "DEFAULT", ethers.ZeroHash);
  const tx3b = await tir.connect(legalRep).submitDefaultAttestation(tokenAddress, 1002, ethers.ZeroHash);
  console.log("Legal Rep attested (2-of-3 ✓). TX:", (await tx3b.wait())?.hash);

  const isConfirmed = await tir.isDefaultConfirmed(tokenAddress);
  console.log(`Default confirmed by TIR: ${isConfirmed}`);

  // Execute payout
  const tx3c = await payoutEngine.executePayout(tokenAddress);
  const receipt3c = await tx3c.wait();
  console.log("Payout executed. TX:", receipt3c?.hash);

  const balanceAfter = await mockUSDT.balanceOf(investor1.address);
  const scoreAfter = await irsOracle.getScore(tokenAddress);
  const statusAfter = await issuerRegistry.getStatus(tokenAddress);

  console.log(`\n✅ TX3 Complete:`);
  console.log(`   Investor USDT before:  ${ethers.formatEther(balanceBefore)}`);
  console.log(`   Investor USDT after:   ${ethers.formatEther(balanceAfter)}`);
  console.log(`   USDT received:         ${ethers.formatEther(balanceAfter - balanceBefore)}`);
  console.log(`   IRS Score:             ${scoreAfter} (should be 0)`);
  console.log(`   Issuer Status:         ${statusAfter} (3 = DEFAULTED)`);

  const claimId = await subrogationNFT.getClaimByIssuer(tokenAddress);
  if (claimId > 0n) {
    const claim = await subrogationNFT.getClaimData(claimId);
    console.log(`   SubrogationNFT #${claimId}:`);
    console.log(`     Total payout:     ${ethers.formatEther(claim.totalPayoutAmount)} USDT`);
    console.log(`     Bond liquidated:  ${ethers.formatEther(claim.bondLiquidated)} USDT`);
    console.log(`     Junior liquidated:${ethers.formatEther(claim.juniorLiquidated)} USDT`);
    console.log(`     Senior liquidated:${ethers.formatEther(claim.seniorLiquidated)} USDT`);
  }

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  ALL 3 DEMO TRANSACTIONS COMPLETE ✅");
  console.log("  12 contracts deployed, wired, and full lifecycle executed");
  console.log("═══════════════════════════════════════════════════════════════\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
