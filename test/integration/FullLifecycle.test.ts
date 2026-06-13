import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Strata Protocol — Full Lifecycle Integration Tests", function () {
  // Signers
  let deployer: SignerWithAddress;
  let issuer: SignerWithAddress;
  let custodian: SignerWithAddress;
  let legalRep: SignerWithAddress;
  let auditor: SignerWithAddress;
  let underwriter: SignerWithAddress;
  let investor1: SignerWithAddress;
  let investor2: SignerWithAddress;

  // Contracts
  let mockUSDT: any;
  let mockToken: any;
  let mockIdRegistry: any;
  let mockBAS: any;
  let tir: any;
  let issuerBond: any;
  let irsOracle: any;
  let defaultOracle: any;
  let issuerRegistry: any;
  let insurancePool: any;
  let srCVR: any;
  let jrCVR: any;
  let protectionCert: any;
  let payoutEngine: any;
  let subrogationNFT: any;

  let tokenAddress: string;
  const USDT = ethers.parseEther;

  beforeEach(async function () {
    [deployer, issuer, custodian, legalRep, auditor, underwriter, investor1, investor2] =
      await ethers.getSigners();

    // Deploy mocks
    mockUSDT = await (await ethers.getContractFactory("MockUSDT")).deploy();
    mockIdRegistry = await (await ethers.getContractFactory("MockIdentityRegistry")).deploy();
    mockToken = await (await ethers.getContractFactory("MockERC3643Token")).deploy(
      "Mock RWA", "mRWA", await mockIdRegistry.getAddress()
    );
    mockBAS = await (await ethers.getContractFactory("MockBASAttestation")).deploy();

    const usdtAddr = await mockUSDT.getAddress();
    tokenAddress = await mockToken.getAddress();

    // Deploy core
    tir = await (await ethers.getContractFactory("TIR")).deploy();
    issuerBond = await (await ethers.getContractFactory("IssuerBond")).deploy(usdtAddr, deployer.address);
    irsOracle = await (await ethers.getContractFactory("IRSOracle")).deploy();
    defaultOracle = await (await ethers.getContractFactory("DefaultOracle")).deploy(await tir.getAddress());
    issuerRegistry = await (await ethers.getContractFactory("IssuerRegistry")).deploy(
      await tir.getAddress(), await issuerBond.getAddress(), await irsOracle.getAddress(), await defaultOracle.getAddress()
    );
    insurancePool = await (await ethers.getContractFactory("InsurancePool")).deploy(usdtAddr, deployer.address);
    srCVR = await (await ethers.getContractFactory("srCVR")).deploy(await insurancePool.getAddress(), usdtAddr);
    jrCVR = await (await ethers.getContractFactory("jrCVR")).deploy(await insurancePool.getAddress(), usdtAddr);
    protectionCert = await (await ethers.getContractFactory("ProtectionCert")).deploy();
    payoutEngine = await (await ethers.getContractFactory("PayoutEngine")).deploy(usdtAddr, deployer.address);
    subrogationNFT = await (await ethers.getContractFactory("SubrogationNFT")).deploy(
      await payoutEngine.getAddress(), deployer.address
    );

    // Wire permissions
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

    // Setup actors
    await mockUSDT.mint(issuer.address, USDT("10000"));
    await mockUSDT.mint(underwriter.address, USDT("10000"));
    await mockUSDT.mint(investor1.address, USDT("10000"));
    await mockUSDT.mint(investor2.address, USDT("10000"));
    await mockToken.mint(investor1.address, USDT("1000"));
    await mockToken.mint(investor2.address, USDT("500"));
    await mockIdRegistry.setVerified(investor1.address, true);
    await mockIdRegistry.setVerified(investor2.address, true);
    await mockIdRegistry.setVerified(underwriter.address, true);
    await mockIdRegistry.setVerified(issuer.address, true);
  });

  // ════════════════════════════════════════════════════════════════════
  // SCENARIO A: Default Lifecycle (the hackathon demo)
  // ════════════════════════════════════════════════════════════════════
  describe("Scenario A: Default Lifecycle (Demo)", function () {
    it("should execute the complete register → activate → deposit → coverage → default → payout flow", async function () {
      // --- PHASE 1: Register TIR Attestors ---
      await tir.connect(custodian).registerAttestor(0, { value: ethers.parseEther("5") });
      await tir.connect(legalRep).registerAttestor(1, { value: ethers.parseEther("5") });
      await tir.connect(auditor).registerAttestor(2, { value: ethers.parseEther("5") });

      expect(await tir.isActiveAttestor(custodian.address)).to.be.true;
      expect(await tir.isActiveAttestor(legalRep.address)).to.be.true;
      expect(await tir.isActiveAttestor(auditor.address)).to.be.true;

      // --- PHASE 2: Register Issuer ---
      await issuerRegistry.connect(issuer).register(
        tokenAddress, 1000, custodian.address, legalRep.address, auditor.address, USDT("100"), false
      );

      const profileBefore = await issuerRegistry.getProfile(tokenAddress);
      expect(profileBefore.status).to.equal(0); // OBSERVATION

      // --- PHASE 3: Bond + Activate ---
      const bondAmount = USDT("5");
      await mockUSDT.connect(issuer).approve(await issuerBond.getAddress(), bondAmount);
      await issuerBond.connect(issuer).deposit(tokenAddress, bondAmount, USDT("100"));

      expect(await issuerBond.getBond(tokenAddress)).to.equal(bondAmount);

      await issuerRegistry.recordAttestation(tokenAddress);
      await issuerRegistry.recordAttestation(tokenAddress);
      await issuerRegistry.recordAttestation(tokenAddress);
      await issuerRegistry.forceActivateForDemo(tokenAddress);

      expect(await issuerRegistry.isActive(tokenAddress)).to.be.true;

      // --- PHASE 4: Initialize IRS ---
      await irsOracle.initializeScore(tokenAddress, 600);
      expect(await irsOracle.getScore(tokenAddress)).to.equal(600);

      // Verify premium formula: IRS 600 should give ~696 bps
      const premiumBPS = await irsOracle.getPremiumRateBPS(tokenAddress);
      expect(premiumBPS).to.be.gte(690);
      expect(premiumBPS).to.be.lte(710);

      // --- PHASE 5: Activate Pool + Deposits ---
      await insurancePool.activatePool(tokenAddress);
      await mockUSDT.connect(underwriter).approve(await insurancePool.getAddress(), USDT("1000"));

      // Junior first (25% minimum ratio)
      await insurancePool.connect(underwriter).depositJunior(tokenAddress, USDT("3"));
      await insurancePool.connect(underwriter).depositSenior(tokenAddress, USDT("7"));

      const pool = await insurancePool.getPoolState(tokenAddress);
      expect(pool.seniorTVL).to.equal(USDT("7"));
      expect(pool.juniorTVL).to.equal(USDT("3"));

      // --- PHASE 6: Purchase Coverage ---
      await payoutEngine.connect(investor1).purchaseCoverage(tokenAddress, USDT("100"));

      expect(await payoutEngine.isInsured(tokenAddress, investor1.address)).to.be.true;

      // Verify ProCert was minted (soulbound)
      const certId = await protectionCert.holderCerts(investor1.address, tokenAddress);
      expect(certId).to.be.gt(0);
      expect(await protectionCert.locked(certId)).to.be.true;

      // --- PHASE 7: TIR 2-of-3 Default Confirmation ---
      await tir.connect(custodian).submitDefaultAttestation(tokenAddress, 1001, ethers.ZeroHash);
      expect(await tir.isDefaultConfirmed(tokenAddress)).to.be.false;

      await tir.connect(legalRep).submitDefaultAttestation(tokenAddress, 1002, ethers.ZeroHash);
      expect(await tir.isDefaultConfirmed(tokenAddress)).to.be.true; // 2-of-3 reached

      // --- PHASE 8: Execute Payout ---
      const balanceBefore = await mockUSDT.balanceOf(investor1.address);
      await payoutEngine.executePayout(tokenAddress);
      const balanceAfter = await mockUSDT.balanceOf(investor1.address);

      // Investor should receive all pool + bond funds
      const received = balanceAfter - balanceBefore;
      expect(received).to.equal(USDT("15")); // $5 bond + $3 junior + $7 senior

      // --- PHASE 9: Verify Post-Default State ---
      expect(await irsOracle.getScore(tokenAddress)).to.equal(0);
      expect(await issuerRegistry.getStatus(tokenAddress)).to.equal(3); // DEFAULTED

      // SubrogationNFT minted
      const claimId = await subrogationNFT.getClaimByIssuer(tokenAddress);
      expect(claimId).to.be.gt(0);
      const claim = await subrogationNFT.getClaimData(claimId);
      expect(claim.totalPayoutAmount).to.equal(USDT("15"));
      expect(claim.bondLiquidated).to.equal(USDT("5"));
      expect(claim.juniorLiquidated).to.equal(USDT("3"));
      expect(claim.seniorLiquidated).to.equal(USDT("7"));
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // SCENARIO B: TIR 2-of-3 Logic
  // ════════════════════════════════════════════════════════════════════
  describe("Scenario B: TIR 2-of-3 Confirmation Logic", function () {
    beforeEach(async function () {
      await tir.connect(custodian).registerAttestor(0, { value: ethers.parseEther("5") });
      await tir.connect(legalRep).registerAttestor(1, { value: ethers.parseEther("5") });
      await tir.connect(auditor).registerAttestor(2, { value: ethers.parseEther("5") });
    });

    it("should NOT confirm with only 1 attestation", async function () {
      await tir.connect(custodian).submitDefaultAttestation(tokenAddress, 1001, ethers.ZeroHash);
      expect(await tir.isDefaultConfirmed(tokenAddress)).to.be.false;
    });

    it("should confirm with custodian + legalRep (2-of-3)", async function () {
      await tir.connect(custodian).submitDefaultAttestation(tokenAddress, 1001, ethers.ZeroHash);
      await tir.connect(legalRep).submitDefaultAttestation(tokenAddress, 1002, ethers.ZeroHash);
      expect(await tir.isDefaultConfirmed(tokenAddress)).to.be.true;
    });

    it("should confirm with custodian + auditor (2-of-3)", async function () {
      await tir.connect(custodian).submitDefaultAttestation(tokenAddress, 1001, ethers.ZeroHash);
      await tir.connect(auditor).submitDefaultAttestation(tokenAddress, 1003, ethers.ZeroHash);
      expect(await tir.isDefaultConfirmed(tokenAddress)).to.be.true;
    });

    it("should confirm with legalRep + auditor (2-of-3)", async function () {
      await tir.connect(legalRep).submitDefaultAttestation(tokenAddress, 1002, ethers.ZeroHash);
      await tir.connect(auditor).submitDefaultAttestation(tokenAddress, 1003, ethers.ZeroHash);
      expect(await tir.isDefaultConfirmed(tokenAddress)).to.be.true;
    });

    it("should reject duplicate category votes", async function () {
      await tir.connect(custodian).submitDefaultAttestation(tokenAddress, 1001, ethers.ZeroHash);
      await expect(
        tir.connect(custodian).submitDefaultAttestation(tokenAddress, 1004, ethers.ZeroHash)
      ).to.be.revertedWith("TIR: custodian already voted");
    });

    it("should reject attestation from non-active attestor", async function () {
      await expect(
        tir.connect(investor1).submitDefaultAttestation(tokenAddress, 9999, ethers.ZeroHash)
      ).to.be.revertedWith("TIR: not active attestor");
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // SCENARIO C: IRS Oracle and Premium Formula
  // ════════════════════════════════════════════════════════════════════
  describe("Scenario C: IRS Premium Formula", function () {
    beforeEach(async function () {
      await irsOracle.initializeScore(tokenAddress, 600);
    });

    it("should return ~1600 bps at IRS 0", async function () {
      await irsOracle.setScoreForTest(tokenAddress, 0);
      const premium = await irsOracle.getPremiumRateBPS(tokenAddress);
      expect(premium).to.equal(1600);
    });

    it("should return ~400 bps at IRS 1000", async function () {
      await irsOracle.setScoreForTest(tokenAddress, 1000);
      const premium = await irsOracle.getPremiumRateBPS(tokenAddress);
      expect(premium).to.equal(400);
    });

    it("should return ~696 bps at IRS 600", async function () {
      const premium = await irsOracle.getPremiumRateBPS(tokenAddress);
      expect(premium).to.be.gte(690);
      expect(premium).to.be.lte(710);
    });

    it("should be monotonically decreasing", async function () {
      let lastPremium = 2000n;
      for (const irs of [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]) {
        await irsOracle.setScoreForTest(tokenAddress, irs);
        const premium = await irsOracle.getPremiumRateBPS(tokenAddress);
        expect(premium).to.be.lte(lastPremium);
        lastPremium = premium;
      }
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // SCENARIO D: Insurance Pool Mechanics
  // ════════════════════════════════════════════════════════════════════
  describe("Scenario D: Insurance Pool", function () {
    beforeEach(async function () {
      await tir.connect(custodian).registerAttestor(0, { value: ethers.parseEther("5") });
      await tir.connect(legalRep).registerAttestor(1, { value: ethers.parseEther("5") });
      await tir.connect(auditor).registerAttestor(2, { value: ethers.parseEther("5") });
      await issuerRegistry.connect(issuer).register(
        tokenAddress, 1000, custodian.address, legalRep.address, auditor.address, USDT("100"), false
      );
      await issuerRegistry.forceActivateForDemo(tokenAddress);
      await irsOracle.initializeScore(tokenAddress, 600);
      await insurancePool.activatePool(tokenAddress);
      await mockUSDT.connect(underwriter).approve(await insurancePool.getAddress(), USDT("10000"));
    });

    it("should enforce 25% minimum junior ratio", async function () {
      // Deposit $1 junior first
      await insurancePool.connect(underwriter).depositJunior(tokenAddress, USDT("1"));

      // Try to deposit $10 senior (would make junior ratio = 1/11 = 9% < 25%)
      await expect(
        insurancePool.connect(underwriter).depositSenior(tokenAddress, USDT("10"))
      ).to.be.revertedWith("InsurancePool: junior ratio too low");

      // Deposit $3 senior should work (junior ratio = 1/4 = 25%)
      await insurancePool.connect(underwriter).depositSenior(tokenAddress, USDT("3"));
      const pool = await insurancePool.getPoolState(tokenAddress);
      expect(pool.seniorTVL).to.equal(USDT("3"));
    });

    it("should block deposits when redemption gate is active", async function () {
      await insurancePool.connect(underwriter).depositJunior(tokenAddress, USDT("3"));

      // Activate gate (as owner simulating DefaultOracle)
      await insurancePool.activateRedemptionGate(tokenAddress);

      await expect(
        insurancePool.connect(underwriter).depositSenior(tokenAddress, USDT("7"))
      ).to.be.revertedWith("InsurancePool: gate active");
    });

    it("should distribute premium correctly (5% fee, 70/30 split)", async function () {
      await insurancePool.connect(underwriter).depositJunior(tokenAddress, USDT("30"));
      await insurancePool.connect(underwriter).depositSenior(tokenAddress, USDT("70"));

      const treasuryBefore = await mockUSDT.balanceOf(deployer.address);

      // Pay $100 premium
      await mockUSDT.connect(issuer).approve(await insurancePool.getAddress(), USDT("100"));
      await insurancePool.connect(issuer).payPremium(tokenAddress, USDT("100"));

      const treasuryAfter = await mockUSDT.balanceOf(deployer.address);
      const protocolFee = treasuryAfter - treasuryBefore;
      expect(protocolFee).to.equal(USDT("5")); // 5% of $100

      // Pool should reflect premium accrual
      const pool = await insurancePool.getPoolState(tokenAddress);
      // Senior gets 70% of $95 = $66.5
      expect(pool.seniorTVL).to.equal(USDT("70") + USDT("66.5"));
      // Junior gets 30% of $95 = $28.5
      expect(pool.juniorTVL).to.equal(USDT("30") + USDT("28.5"));
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // SCENARIO E: ERC-3643 Compliance (Frozen Holder)
  // ════════════════════════════════════════════════════════════════════
  describe("Scenario E: ERC-3643 Compliance", function () {
    it("should escrow payout for frozen holders", async function () {
      // Setup full pipeline
      await tir.connect(custodian).registerAttestor(0, { value: ethers.parseEther("5") });
      await tir.connect(legalRep).registerAttestor(1, { value: ethers.parseEther("5") });
      await tir.connect(auditor).registerAttestor(2, { value: ethers.parseEther("5") });
      await issuerRegistry.connect(issuer).register(
        tokenAddress, 1000, custodian.address, legalRep.address, auditor.address, USDT("100"), false
      );
      await issuerRegistry.forceActivateForDemo(tokenAddress);
      await irsOracle.initializeScore(tokenAddress, 600);
      await insurancePool.activatePool(tokenAddress);

      await mockUSDT.connect(underwriter).approve(await insurancePool.getAddress(), USDT("1000"));
      await insurancePool.connect(underwriter).depositJunior(tokenAddress, USDT("3"));
      await insurancePool.connect(underwriter).depositSenior(tokenAddress, USDT("7"));

      const bondAmount = USDT("5");
      await mockUSDT.connect(issuer).approve(await issuerBond.getAddress(), bondAmount);
      await issuerBond.connect(issuer).deposit(tokenAddress, bondAmount, USDT("100"));

      // Both investors purchase coverage
      await payoutEngine.connect(investor1).purchaseCoverage(tokenAddress, USDT("60"));
      await payoutEngine.connect(investor2).purchaseCoverage(tokenAddress, USDT("40"));

      // FREEZE investor2 (regulatory action)
      await mockToken.setFrozen(investor2.address, true);

      // Trigger default
      await tir.connect(custodian).submitDefaultAttestation(tokenAddress, 1001, ethers.ZeroHash);
      await tir.connect(legalRep).submitDefaultAttestation(tokenAddress, 1002, ethers.ZeroHash);

      const balance1Before = await mockUSDT.balanceOf(investor1.address);
      const balance2Before = await mockUSDT.balanceOf(investor2.address);

      await payoutEngine.executePayout(tokenAddress);

      const balance1After = await mockUSDT.balanceOf(investor1.address);
      const balance2After = await mockUSDT.balanceOf(investor2.address);

      // investor1 should receive their share (60/100 of $15 = $9)
      expect(balance1After - balance1Before).to.equal(USDT("9"));

      // investor2 (frozen) should NOT receive directly — escrowed
      expect(balance2After - balance2Before).to.equal(0n);

      // Check escrow exists
      const escrow = await payoutEngine.getEscrowRecord(investor2.address);
      expect(escrow.amount).to.equal(USDT("6")); // 40/100 of $15 = $6
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // SCENARIO F: Soulbound ProtectionCert
  // ════════════════════════════════════════════════════════════════════
  describe("Scenario F: Soulbound ProtectionCert", function () {
    it("should reject transfers (soulbound)", async function () {
      await tir.connect(custodian).registerAttestor(0, { value: ethers.parseEther("5") });
      await tir.connect(legalRep).registerAttestor(1, { value: ethers.parseEther("5") });
      await tir.connect(auditor).registerAttestor(2, { value: ethers.parseEther("5") });
      await issuerRegistry.connect(issuer).register(
        tokenAddress, 1000, custodian.address, legalRep.address, auditor.address, USDT("100"), false
      );
      await issuerRegistry.forceActivateForDemo(tokenAddress);
      await irsOracle.initializeScore(tokenAddress, 600);
      await insurancePool.activatePool(tokenAddress);
      await mockUSDT.connect(underwriter).approve(await insurancePool.getAddress(), USDT("100"));
      await insurancePool.connect(underwriter).depositJunior(tokenAddress, USDT("3"));
      await insurancePool.connect(underwriter).depositSenior(tokenAddress, USDT("7"));

      await payoutEngine.connect(investor1).purchaseCoverage(tokenAddress, USDT("100"));

      const certId = await protectionCert.holderCerts(investor1.address, tokenAddress);
      expect(certId).to.be.gt(0);

      // Try to transfer — should fail
      await expect(
        protectionCert.connect(investor1).transferFrom(investor1.address, investor2.address, certId)
      ).to.be.revertedWith("ProCert: soulbound, non-transferable");

      // locked() always returns true (ERC-5192)
      expect(await protectionCert.locked(certId)).to.be.true;
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // SCENARIO G: IssuerBond
  // ════════════════════════════════════════════════════════════════════
  describe("Scenario G: IssuerBond", function () {
    it("should reject duplicate bond deposits", async function () {
      await mockUSDT.connect(issuer).approve(await issuerBond.getAddress(), USDT("10"));
      await issuerBond.connect(issuer).deposit(tokenAddress, USDT("5"), USDT("100"));

      await expect(
        issuerBond.connect(issuer).deposit(tokenAddress, USDT("5"), USDT("100"))
      ).to.be.revertedWith("IssuerBond: bond exists");
    });

    it("should only allow PayoutEngine to liquidate", async function () {
      await mockUSDT.connect(issuer).approve(await issuerBond.getAddress(), USDT("5"));
      await issuerBond.connect(issuer).deposit(tokenAddress, USDT("5"), USDT("100"));

      await expect(
        issuerBond.connect(issuer).liquidate(tokenAddress)
      ).to.be.revertedWith("IssuerBond: only PayoutEngine");
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // SCENARIO H: Multi-Holder Payout Distribution
  // ════════════════════════════════════════════════════════════════════
  describe("Scenario H: Multi-Holder Pro-Rata Payout", function () {
    it("should distribute payouts pro-rata across multiple holders", async function () {
      await tir.connect(custodian).registerAttestor(0, { value: ethers.parseEther("5") });
      await tir.connect(legalRep).registerAttestor(1, { value: ethers.parseEther("5") });
      await tir.connect(auditor).registerAttestor(2, { value: ethers.parseEther("5") });
      await issuerRegistry.connect(issuer).register(
        tokenAddress, 1000, custodian.address, legalRep.address, auditor.address, USDT("100"), false
      );
      await issuerRegistry.forceActivateForDemo(tokenAddress);
      await irsOracle.initializeScore(tokenAddress, 600);
      await insurancePool.activatePool(tokenAddress);

      await mockUSDT.connect(underwriter).approve(await insurancePool.getAddress(), USDT("1000"));
      await insurancePool.connect(underwriter).depositJunior(tokenAddress, USDT("25"));
      await insurancePool.connect(underwriter).depositSenior(tokenAddress, USDT("75"));

      await mockUSDT.connect(issuer).approve(await issuerBond.getAddress(), USDT("10"));
      await issuerBond.connect(issuer).deposit(tokenAddress, USDT("10"), USDT("200"));

      // investor1 covers 60, investor2 covers 40 (total 100)
      await payoutEngine.connect(investor1).purchaseCoverage(tokenAddress, USDT("60"));
      await payoutEngine.connect(investor2).purchaseCoverage(tokenAddress, USDT("40"));

      // Default
      await tir.connect(custodian).submitDefaultAttestation(tokenAddress, 1001, ethers.ZeroHash);
      await tir.connect(legalRep).submitDefaultAttestation(tokenAddress, 1002, ethers.ZeroHash);

      const b1Before = await mockUSDT.balanceOf(investor1.address);
      const b2Before = await mockUSDT.balanceOf(investor2.address);

      await payoutEngine.executePayout(tokenAddress);

      const b1After = await mockUSDT.balanceOf(investor1.address);
      const b2After = await mockUSDT.balanceOf(investor2.address);

      // Total pool: $10 bond + $25 junior + $75 senior = $110
      // investor1: 60/100 * $110 = $66
      // investor2: 40/100 * $110 = $44
      expect(b1After - b1Before).to.equal(USDT("66"));
      expect(b2After - b2Before).to.equal(USDT("44"));
    });
  });
});
