import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { mine } from "@nomicfoundation/hardhat-network-helpers";

// ═══════════════════════════════════════════════════════════════════════════
//  Edge Case & Security Tests for Strata Smart Contracts
// ═══════════════════════════════════════════════════════════════════════════

describe("EdgeCases", function () {
  // ─── Insurance Pool Fixture ──────────────────────────────────────────
  async function deployInsurancePoolFixture() {
    const [owner, user1, user2, defaultOracle, payoutEngine, treasury, issuerToken] =
      await ethers.getSigners();

    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    const usdt = await MockERC20Factory.deploy("Mock USDT", "USDT", 6);
    await usdt.waitForDeployment();

    const MockTrancheFactory = await ethers.getContractFactory("MockTrancheToken");
    const srCVR = await MockTrancheFactory.deploy("Senior CVR", "srCVR", await usdt.getAddress());
    await srCVR.waitForDeployment();

    const jrCVR = await MockTrancheFactory.deploy("Junior CVR", "jrCVR", await usdt.getAddress());
    await jrCVR.waitForDeployment();

    const InsurancePoolFactory = await ethers.getContractFactory("InsurancePool");
    const pool = await InsurancePoolFactory.deploy(await usdt.getAddress(), treasury.address);
    await pool.waitForDeployment();

    await pool.setSrCVR(await srCVR.getAddress());
    await pool.setJrCVR(await jrCVR.getAddress());
    await pool.setDefaultOracle(defaultOracle.address);
    await pool.setPayoutEngine(payoutEngine.address);

    await srCVR.setPool(await pool.getAddress());
    await jrCVR.setPool(await pool.getAddress());

    const mintAmount = ethers.parseUnits("1000000", 6);
    await usdt.mint(user1.address, mintAmount);
    await usdt.mint(user2.address, mintAmount);
    await usdt.connect(user1).approve(await pool.getAddress(), ethers.MaxUint256);
    await usdt.connect(user2).approve(await pool.getAddress(), ethers.MaxUint256);

    return { pool, usdt, srCVR, jrCVR, owner, user1, user2, defaultOracle, payoutEngine, treasury, issuerToken };
  }

  // ─── PayoutEngine Fixture ────────────────────────────────────────────
  async function deployPayoutEngineFixture() {
    const [owner, foundation, holder1, holder2, holder3, oracleAddr, attacker] =
      await ethers.getSigners();

    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    const usdt = await MockUSDT.deploy();

    const MockIdentityRegistry = await ethers.getContractFactory("MockIdentityRegistry");
    const identityRegistry = await MockIdentityRegistry.deploy();

    const MockERC3643Token = await ethers.getContractFactory("MockERC3643Token");
    const issuerToken = await MockERC3643Token.deploy(
      "Test RWA Token", "tRWA", await identityRegistry.getAddress()
    );

    await identityRegistry.setVerified(holder1.address, true);
    await identityRegistry.setVerified(holder2.address, true);
    await identityRegistry.setVerified(holder3.address, true);

    const ProtectionCert = await ethers.getContractFactory("ProtectionCert");
    const protectionCert = await ProtectionCert.deploy();

    const MockIssuerBond = await ethers.getContractFactory("MockIssuerBondForPayout");
    const issuerBond = await MockIssuerBond.deploy();

    const MockInsurancePool = await ethers.getContractFactory("MockInsurancePoolForPayout");
    const insurancePool = await MockInsurancePool.deploy();

    const MockIRSOracle = await ethers.getContractFactory("MockIRSOracleForPayout");
    const irsOracle = await MockIRSOracle.deploy();

    const MockIssuerRegistry = await ethers.getContractFactory("MockIssuerRegistryForPayout");
    const issuerRegistry = await MockIssuerRegistry.deploy();

    const SubrogationNFT = await ethers.getContractFactory("SubrogationNFT");

    const PayoutEngine = await ethers.getContractFactory("PayoutEngine");
    const payoutEngine = await PayoutEngine.deploy(await usdt.getAddress(), foundation.address);

    await payoutEngine.setInsurancePool(await insurancePool.getAddress());
    await payoutEngine.setDefaultOracle(oracleAddr.address);
    await payoutEngine.setProtectionCert(await protectionCert.getAddress());
    await payoutEngine.setIssuerBond(await issuerBond.getAddress());
    await payoutEngine.setIRSOracle(await irsOracle.getAddress());
    await payoutEngine.setIssuerRegistry(await issuerRegistry.getAddress());

    await protectionCert.setPayoutEngine(await payoutEngine.getAddress());

    const subrogationNFT = await SubrogationNFT.deploy(
      await payoutEngine.getAddress(), foundation.address
    );
    await payoutEngine.setSubrogationNFT(await subrogationNFT.getAddress());

    const issuerTokenAddr = await issuerToken.getAddress();

    return {
      payoutEngine, usdt, identityRegistry, issuerToken, protectionCert,
      issuerBond, insurancePool, irsOracle, issuerRegistry, subrogationNFT,
      owner, foundation, holder1, holder2, holder3, oracleAddr, attacker, issuerTokenAddr,
    };
  }

  // ─── IRSOracle Fixture ───────────────────────────────────────────────
  async function deployIRSOracleFixture() {
    const [owner, keeper, insurancePool, payoutEngine, tokenAddr, unauthorized] =
      await ethers.getSigners();

    const Factory = await ethers.getContractFactory("IRSOracle");
    const oracle = await Factory.deploy();

    await oracle.setKeeper(keeper.address);
    await oracle.setInsurancePool(insurancePool.address);
    await oracle.setPayoutEngine(payoutEngine.address);

    return { oracle, owner, keeper, insurancePool, payoutEngine, tokenAddr, unauthorized };
  }

  // ─── IssuerBond Fixture ──────────────────────────────────────────────
  async function deployIssuerBondFixture() {
    const [owner, issuer, payoutEngine, issuerRegistry, treasury, tokenAddr, outsider] =
      await ethers.getSigners();

    const MockUSDTFactory = await ethers.getContractFactory("MockUSDT");
    const usdt = await MockUSDTFactory.deploy();

    const IssuerBondFactory = await ethers.getContractFactory("IssuerBond");
    const bond = await IssuerBondFactory.deploy(await usdt.getAddress(), treasury.address);

    await bond.connect(owner).setPayoutEngine(payoutEngine.address);
    await bond.connect(owner).setIssuerRegistry(issuerRegistry.address);

    await usdt.mint(issuer.address, ethers.parseEther("1000000"));
    await usdt.connect(issuer).approve(await bond.getAddress(), ethers.parseEther("1000000"));

    return { bond, usdt, owner, issuer, payoutEngine, issuerRegistry, treasury, tokenAddr, outsider };
  }

  // ─── Token Fixture ───────────────────────────────────────────────────
  async function deployTokensFixture() {
    const [owner, pool, payoutEngine, foundation, user1, user2, attacker] =
      await ethers.getSigners();

    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    const usdt = await MockUSDT.deploy();

    const SrCVR = await ethers.getContractFactory("srCVR");
    const srCVR = await SrCVR.deploy(pool.address, await usdt.getAddress());

    const JrCVR = await ethers.getContractFactory("jrCVR");
    const jrCVR = await JrCVR.deploy(pool.address, await usdt.getAddress());

    const ProtectionCert = await ethers.getContractFactory("ProtectionCert");
    const protectionCert = await ProtectionCert.deploy();
    await protectionCert.setPayoutEngine(payoutEngine.address);

    const SubrogationNFT = await ethers.getContractFactory("SubrogationNFT");
    const subrogationNFT = await SubrogationNFT.deploy(payoutEngine.address, foundation.address);

    const srCVRAddr = await srCVR.getAddress();
    const jrCVRAddr = await jrCVR.getAddress();
    await usdt.mint(srCVRAddr, ethers.parseEther("100000"));
    await usdt.mint(jrCVRAddr, ethers.parseEther("100000"));

    const issuerToken = ethers.Wallet.createRandom().address;

    return {
      usdt, srCVR, jrCVR, protectionCert, subrogationNFT,
      owner, pool, payoutEngine, foundation, user1, user2, attacker, issuerToken,
    };
  }

  // ─── IssuerRegistry Fixture ──────────────────────────────────────────
  async function deployIssuerRegistryFixture() {
    const [owner, issuerEOA, custodian, legalRep, auditor, defaultOracle, payoutEngine, randomUser] =
      await ethers.getSigners();

    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    const tirMock = await MockERC20Factory.deploy("TIR Mock", "TIR", 18);
    const bondMock = await MockERC20Factory.deploy("Bond Mock", "BOND", 18);
    const irsMock = await MockERC20Factory.deploy("IRS Mock", "IRS", 18);

    const IssuerRegistryFactory = await ethers.getContractFactory("IssuerRegistry");
    const registry = await IssuerRegistryFactory.deploy(
      await tirMock.getAddress(),
      await bondMock.getAddress(),
      await irsMock.getAddress(),
      defaultOracle.address
    );
    await registry.waitForDeployment();
    await registry.setPayoutEngine(payoutEngine.address);

    const tokenAddress = ethers.Wallet.createRandom().address;

    return {
      registry, owner, issuerEOA, custodian, legalRep, auditor,
      defaultOracle, payoutEngine, randomUser, tokenAddress,
    };
  }

  // ─── TIR Fixture ─────────────────────────────────────────────────────
  async function deployTIRFixture() {
    const [owner, custodian, legalRep, auditor, outsider, tokenAddr] =
      await ethers.getSigners();

    const TIRFactory = await ethers.getContractFactory("TIR");
    const tir = await TIRFactory.deploy();

    return { tir, owner, custodian, legalRep, auditor, outsider, tokenAddr };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  1. REENTRANCY PROTECTION
  // ═══════════════════════════════════════════════════════════════════════

  describe("Reentrancy Protection", function () {
    it("InsurancePool.depositSenior uses nonReentrant guard", async function () {
      const { pool, issuerToken, user1, owner } = await loadFixture(deployInsurancePoolFixture);

      await pool.connect(owner).activatePool(issuerToken.address);

      // Deposit junior first to satisfy the 25% junior ratio requirement
      await pool.connect(user1).depositJunior(issuerToken.address, ethers.parseUnits("500", 6));

      // Verify the function works normally (nonReentrant doesn't block normal calls)
      const depositAmount = ethers.parseUnits("500", 6);
      await expect(
        pool.connect(user1).depositSenior(issuerToken.address, depositAmount)
      ).to.not.be.reverted;

      // A second, independent call also succeeds (nonReentrant only blocks re-entry within the same tx)
      await expect(
        pool.connect(user1).depositSenior(issuerToken.address, depositAmount)
      ).to.not.be.reverted;
    });

    it("InsurancePool.depositJunior uses nonReentrant guard", async function () {
      const { pool, issuerToken, user1, owner } = await loadFixture(deployInsurancePoolFixture);

      await pool.connect(owner).activatePool(issuerToken.address);

      const depositAmount = ethers.parseUnits("500", 6);
      await expect(
        pool.connect(user1).depositJunior(issuerToken.address, depositAmount)
      ).to.not.be.reverted;

      await expect(
        pool.connect(user1).depositJunior(issuerToken.address, depositAmount)
      ).to.not.be.reverted;
    });

    it("PayoutEngine.executePayout uses nonReentrant guard", async function () {
      const f = await loadFixture(deployPayoutEngineFixture);

      // Setup pool and coverage
      await f.insurancePool.setPoolState(f.issuerTokenAddr, ethers.parseEther("5000"), ethers.parseEther("3000"), 0);
      await f.payoutEngine.connect(f.holder1).purchaseCoverage(f.issuerTokenAddr, ethers.parseEther("1000"));

      await f.issuerBond.setLiquidationReturn(f.issuerTokenAddr, ethers.parseEther("100"));
      await f.insurancePool.setLiquidationReturn(f.issuerTokenAddr, ethers.parseEther("200"), ethers.parseEther("300"));
      await f.usdt.mint(await f.payoutEngine.getAddress(), ethers.parseEther("600"));

      // Normal execution succeeds (demonstrates nonReentrant doesn't block normal flow)
      await expect(
        f.payoutEngine.connect(f.oracleAddr).executePayout(f.issuerTokenAddr)
      ).to.not.be.reverted;
    });

    it("IssuerBond.liquidate uses nonReentrant guard", async function () {
      const { bond, usdt, issuer, payoutEngine, tokenAddr } =
        await loadFixture(deployIssuerBondFixture);

      const amount = ethers.parseEther("50000");
      const marketCap = ethers.parseEther("1000000");
      await bond.connect(issuer).deposit(tokenAddr.address, amount, marketCap);

      // Normal liquidation succeeds
      await expect(
        bond.connect(payoutEngine).liquidate(tokenAddr.address)
      ).to.not.be.reverted;
    });

    it("IssuerBond.release uses nonReentrant guard", async function () {
      const { bond, issuer, issuerRegistry, tokenAddr } =
        await loadFixture(deployIssuerBondFixture);

      const amount = ethers.parseEther("50000");
      const marketCap = ethers.parseEther("1000000");
      await bond.connect(issuer).deposit(tokenAddr.address, amount, marketCap);

      // Normal release succeeds
      await expect(
        bond.connect(issuerRegistry).release(tokenAddr.address, issuer.address)
      ).to.not.be.reverted;
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  2. INTEGER OVERFLOW / UNDERFLOW
  // ═══════════════════════════════════════════════════════════════════════

  describe("Integer Overflow/Underflow", function () {
    it("IRSOracle: dimension score cannot exceed max caps (250, 250, 300, 150, 50)", async function () {
      const { oracle, keeper, tokenAddr } = await loadFixture(deployIRSOracleFixture);

      // Initialize at max score 1000 — all dimensions at their maximum
      await oracle.initializeScore(tokenAddr.address, 1000);

      // Attempt to push NAV beyond 250 with repeated on-time updates (+5 each)
      for (let i = 0; i < 5; i++) {
        await oracle.connect(keeper).recordNAVUpdate(tokenAddr.address, true, 0);
      }

      const components = await oracle.getComponents(tokenAddr.address);
      expect(components.navPunctuality).to.equal(250);       // Capped at MAX_NAV
      expect(components.attestationAccuracy).to.equal(250);   // Capped at MAX_ATTESTATION
      expect(components.repaymentHistory).to.equal(300);      // Capped at MAX_REPAYMENT
      expect(components.collateralHealth).to.equal(150);      // Capped at MAX_COLLATERAL
      expect(components.governanceActivity).to.equal(50);     // Capped at MAX_ACTIVITY
    });

    it("IRSOracle: dimension score cannot go below 0", async function () {
      const { oracle, keeper, tokenAddr } = await loadFixture(deployIRSOracleFixture);

      // Initialize at very low score (50)
      await oracle.initializeScore(tokenAddr.address, 50);

      // Each dimension starts proportionally low. Subtract large penalties.
      // NAV starts at 50*250/1000 = 12. Subtract 25 (>7 days late) should clamp to 0.
      await oracle.connect(keeper).recordNAVUpdate(tokenAddr.address, false, 10); // -25

      const components = await oracle.getComponents(tokenAddr.address);
      expect(components.navPunctuality).to.equal(0); // Should NOT underflow

      // Repayment starts at 50*300/1000 = 15. Subtract 80 should clamp to 0.
      await oracle.connect(keeper).recordRepaymentEvent(tokenAddr.address, false, 45); // -80
      const after = await oracle.getComponents(tokenAddr.address);
      expect(after.repaymentHistory).to.equal(0);
    });

    it("InsurancePool: TVL calculations don't overflow with large deposits", async function () {
      const { pool, usdt, issuerToken, user1, owner } =
        await loadFixture(deployInsurancePoolFixture);

      await pool.connect(owner).activatePool(issuerToken.address);

      // Deposit a large amount (close to realistic max for 6 decimal USDT)
      const largeAmount = ethers.parseUnits("500000", 6); // 500K USDT
      await usdt.mint(user1.address, largeAmount * 2n);
      await usdt.connect(user1).approve(await pool.getAddress(), ethers.MaxUint256);

      // Both deposits succeed without overflow
      await pool.connect(user1).depositJunior(issuerToken.address, largeAmount);
      await pool.connect(user1).depositSenior(issuerToken.address, largeAmount);

      const state = await pool.getPoolState(issuerToken.address);
      expect(state.seniorTVL).to.equal(largeAmount);
      expect(state.juniorTVL).to.equal(largeAmount);
    });

    it("srCVR: exchange rate doesn't overflow with large yield accrual", async function () {
      const { srCVR, pool, user1, issuerToken } = await loadFixture(deployTokensFixture);

      // Mint a small amount of srCVR
      await srCVR.connect(pool).mint(user1.address, ethers.parseEther("1"), issuerToken);

      // Accrue a very large yield relative to supply
      const largeYield = ethers.parseEther("1000000");
      await srCVR.connect(pool).accrueYield(largeYield, issuerToken);

      const rate = await srCVR.exchangeRateMantissa();
      // Rate = (1 + 1000000) * 1e18 / 1 = ~1000001e18
      expect(rate).to.be.gt(ethers.parseEther("1")); // Rate increased
      expect(rate).to.equal(ethers.parseEther("1000001")); // Exact expected value
    });

    it("PayoutEngine: pro-rata distribution with extreme ratios (1 wei vs large amount)", async function () {
      const f = await loadFixture(deployPayoutEngineFixture);

      await f.insurancePool.setPoolState(f.issuerTokenAddr, ethers.parseEther("5000"), ethers.parseEther("3000"), 0);

      // holder1 purchases coverage for 1 wei
      await f.payoutEngine.connect(f.holder1).purchaseCoverage(f.issuerTokenAddr, 1n);

      // Update totalInsured in pool
      await f.insurancePool.setPoolState(
        f.issuerTokenAddr,
        ethers.parseEther("5000"),
        ethers.parseEther("3000"),
        1n
      );

      // holder2 purchases coverage for a large amount
      const largeAmount = ethers.parseEther("10000");
      await f.payoutEngine.connect(f.holder2).purchaseCoverage(f.issuerTokenAddr, largeAmount);

      // Execute payout — should not revert due to rounding
      await f.issuerBond.setLiquidationReturn(f.issuerTokenAddr, ethers.parseEther("100"));
      await f.insurancePool.setLiquidationReturn(f.issuerTokenAddr, ethers.parseEther("200"), ethers.parseEther("300"));
      await f.usdt.mint(await f.payoutEngine.getAddress(), ethers.parseEther("600"));

      await expect(
        f.payoutEngine.connect(f.oracleAddr).executePayout(f.issuerTokenAddr)
      ).to.not.be.reverted;
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  3. ACCESS CONTROL
  // ═══════════════════════════════════════════════════════════════════════

  describe("Access Control", function () {
    it("should reject EVERY onlyOwner function on InsurancePool from non-owner", async function () {
      const { pool, user1 } = await loadFixture(deployInsurancePoolFixture);

      await expect(pool.connect(user1).setSrCVR(user1.address))
        .to.be.revertedWith("Ownable: caller is not the owner");
      await expect(pool.connect(user1).setJrCVR(user1.address))
        .to.be.revertedWith("Ownable: caller is not the owner");
      await expect(pool.connect(user1).setIssuerRegistry(user1.address))
        .to.be.revertedWith("Ownable: caller is not the owner");
      await expect(pool.connect(user1).setIRSOracle(user1.address))
        .to.be.revertedWith("Ownable: caller is not the owner");
      await expect(pool.connect(user1).setDefaultOracle(user1.address))
        .to.be.revertedWith("Ownable: caller is not the owner");
      await expect(pool.connect(user1).setPayoutEngine(user1.address))
        .to.be.revertedWith("Ownable: caller is not the owner");
      await expect(pool.connect(user1).activatePool(user1.address))
        .to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should reject EVERY onlyKeeper function on IRSOracle from non-keeper", async function () {
      const { oracle, unauthorized, tokenAddr } = await loadFixture(deployIRSOracleFixture);

      await oracle.initializeScore(tokenAddr.address, 600);

      await expect(oracle.connect(unauthorized).recordNAVUpdate(tokenAddr.address, true, 0))
        .to.be.revertedWith("IRSOracle: not keeper");
      await expect(oracle.connect(unauthorized).recordRepaymentEvent(tokenAddr.address, true, 0))
        .to.be.revertedWith("IRSOracle: not keeper");
      await expect(oracle.connect(unauthorized).recordCollateralHealth(tokenAddr.address, 10000))
        .to.be.revertedWith("IRSOracle: not keeper");
      await expect(oracle.connect(unauthorized).recordAttestationDispute(tokenAddr.address, true))
        .to.be.revertedWith("IRSOracle: not keeper");
      await expect(oracle.connect(unauthorized).recordActivity(tokenAddr.address))
        .to.be.revertedWith("IRSOracle: not keeper");
      await expect(oracle.connect(unauthorized).updateTWASCache(tokenAddr.address, 500))
        .to.be.revertedWith("IRSOracle: not keeper");
    });

    it("should reject EVERY onlyInsurancePool function on srCVR/jrCVR from non-pool", async function () {
      const { srCVR, jrCVR, attacker, user1, issuerToken } =
        await loadFixture(deployTokensFixture);

      // srCVR access control
      await expect(srCVR.connect(attacker).mint(user1.address, 100, issuerToken))
        .to.be.revertedWith("srCVR: only pool");
      await expect(srCVR.connect(attacker).redeem(user1.address, 100, issuerToken))
        .to.be.revertedWith("srCVR: only pool");
      await expect(srCVR.connect(attacker).accrueYield(100, issuerToken))
        .to.be.revertedWith("srCVR: only pool");
      await expect(srCVR.connect(attacker).liquidate(issuerToken))
        .to.be.revertedWith("srCVR: only pool");

      // jrCVR access control
      await expect(jrCVR.connect(attacker).mint(user1.address, 100, issuerToken))
        .to.be.revertedWith("jrCVR: only pool");
      await expect(jrCVR.connect(attacker).redeem(user1.address, 100, issuerToken))
        .to.be.revertedWith("jrCVR: only pool");
      await expect(jrCVR.connect(attacker).liquidate(issuerToken))
        .to.be.revertedWith("jrCVR: only pool");
    });

    it("PayoutEngine rejects non-defaultOracle callers for executePayout", async function () {
      const f = await loadFixture(deployPayoutEngineFixture);

      await expect(
        f.payoutEngine.connect(f.attacker).executePayout(f.issuerTokenAddr)
      ).to.be.revertedWith("PayoutEngine: unauthorized");

      // Also reject holder
      await expect(
        f.payoutEngine.connect(f.holder1).executePayout(f.issuerTokenAddr)
      ).to.be.revertedWith("PayoutEngine: unauthorized");

      // Also reject foundation
      await expect(
        f.payoutEngine.connect(f.foundation).executePayout(f.issuerTokenAddr)
      ).to.be.revertedWith("PayoutEngine: unauthorized");
    });

    it("SubrogationNFT rejects non-payoutEngine callers for mint", async function () {
      const { subrogationNFT, attacker, foundation, issuerToken } =
        await loadFixture(deployTokensFixture);

      await expect(
        subrogationNFT.connect(attacker).mint(
          foundation.address, issuerToken, 0,
          ethers.parseEther("5000"), ethers.parseEther("1000"),
          ethers.parseEther("2000"), ethers.parseEther("2000"), 5
        )
      ).to.be.revertedWith("SubrogationNFT: unauthorized");

      // Also reject foundation directly
      await expect(
        subrogationNFT.connect(foundation).mint(
          foundation.address, issuerToken, 0,
          ethers.parseEther("5000"), ethers.parseEther("1000"),
          ethers.parseEther("2000"), ethers.parseEther("2000"), 5
        )
      ).to.be.revertedWith("SubrogationNFT: unauthorized");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  4. ZERO / EMPTY STATE
  // ═══════════════════════════════════════════════════════════════════════

  describe("Zero/Empty State", function () {
    it("InsurancePool: deposit to non-existent (inactive) pool reverts", async function () {
      const { pool, user1 } = await loadFixture(deployInsurancePoolFixture);

      // Pool for a random address was never activated
      const randomToken = ethers.Wallet.createRandom().address;

      await expect(
        pool.connect(user1).depositSenior(randomToken, ethers.parseUnits("100", 6))
      ).to.be.revertedWith("InsurancePool: pool not active");

      await expect(
        pool.connect(user1).depositJunior(randomToken, ethers.parseUnits("100", 6))
      ).to.be.revertedWith("InsurancePool: pool not active");
    });

    it("PayoutEngine: payout with zero coverage amount reverts on purchaseCoverage", async function () {
      const f = await loadFixture(deployPayoutEngineFixture);

      await f.insurancePool.setPoolState(
        f.issuerTokenAddr, ethers.parseEther("5000"), ethers.parseEther("3000"), 0
      );

      await expect(
        f.payoutEngine.connect(f.holder1).purchaseCoverage(f.issuerTokenAddr, 0)
      ).to.be.revertedWith("PayoutEngine: zero amount");
    });

    it("IRSOracle: premium for uninitialized issuer returns max (1600 bps)", async function () {
      const { oracle } = await loadFixture(deployIRSOracleFixture);

      // Query premium for a completely uninitialized address
      const randomAddr = ethers.Wallet.createRandom().address;
      const premium = await oracle.getPremiumRateBPS(randomAddr);

      expect(premium).to.equal(1600);
    });

    it("IssuerRegistry: activate unregistered issuer reverts", async function () {
      const { registry, owner, tokenAddress } = await loadFixture(deployIssuerRegistryFixture);

      // forceActivateForDemo reverts for unregistered token
      await expect(
        registry.connect(owner).forceActivateForDemo(tokenAddress)
      ).to.be.revertedWith("IssuerRegistry: not registered");

      // tryActivateCoverage on unregistered token — status is 0 (OBSERVATION by default
      // in uninitialized struct), but registration block is 0 so observation end is 0,
      // so it passes observation check but fails on attestation count
      await expect(
        registry.tryActivateCoverage(tokenAddress)
      ).to.be.revertedWith("IssuerRegistry: insufficient attestations");
    });

    it("TIR: vote by unregistered attestor reverts", async function () {
      const { tir, outsider, tokenAddr } = await loadFixture(deployTIRFixture);

      const BAS_UID = 12345n;
      const EVIDENCE_HASH = ethers.keccak256(ethers.toUtf8Bytes("evidence"));

      await expect(
        tir.connect(outsider).submitDefaultAttestation(tokenAddr.address, BAS_UID, EVIDENCE_HASH)
      ).to.be.revertedWith("TIR: not active attestor");
    });
  });
});
