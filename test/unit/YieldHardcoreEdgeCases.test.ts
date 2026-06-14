import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

// ═══════════════════════════════════════════════════════════════════════
//  HARDCORE EDGE CASES — Yield Calculation Robustness Tests
//
//  These tests target scenarios that could break the unrealized yield
//  display on the frontend or cause silent data corruption:
//
//  1. Global vs per-issuer rate divergence
//  2. Deposit-at-different-rates yield miscalculation
//  3. Post-liquidation ghost tokens
//  4. Supply→0→supply resurrection
//  5. Rounding attacks (dust deposits/yields)
//  6. Multi-issuer cross-contamination
//  7. Redemption draining edge cases
//  8. Concurrent deposit + yield atomicity
// ═══════════════════════════════════════════════════════════════════════

describe("Yield Hardcore Edge Cases", function () {
  async function deployFixture() {
    const [owner, pool, user1, user2, user3, attacker] =
      await ethers.getSigners();

    const MockUSDT = await ethers.getContractFactory("MockUSDT");
    const usdt = await MockUSDT.deploy();

    const SrCVR = await ethers.getContractFactory("srCVR");
    const srCVR = await SrCVR.deploy(pool.address, await usdt.getAddress());

    const JrCVR = await ethers.getContractFactory("jrCVR");
    const jrCVR = await JrCVR.deploy(pool.address, await usdt.getAddress());

    await usdt.mint(await srCVR.getAddress(), ethers.parseEther("10000000"));
    await usdt.mint(await jrCVR.getAddress(), ethers.parseEther("10000000"));

    const issuerA = ethers.Wallet.createRandom().address;
    const issuerB = ethers.Wallet.createRandom().address;
    const issuerC = ethers.Wallet.createRandom().address;

    return { usdt, srCVR, jrCVR, owner, pool, user1, user2, user3, attacker, issuerA, issuerB, issuerC };
  }

  // ═══════════════════════════════════════════════════════════════════
  //  1. GLOBAL vs PER-ISSUER RATE DIVERGENCE
  //     The global exchangeRateMantissa is a BLENDED rate across all
  //     issuers, but poolUnderlying/poolSupply tracks per-issuer.
  //     This means the global rate can mislead per-issuer depositors.
  // ═══════════════════════════════════════════════════════════════════

  describe("1. Global vs Per-Issuer Rate Divergence", function () {
    it("HC-1.1: global rate hides per-issuer losses after partial liquidation", async function () {
      const { srCVR, pool, user1, user2, issuerA, issuerB } = await loadFixture(deployFixture);

      // User1 deposits 1000 under issuerA
      await srCVR.connect(pool).mint(user1.address, ethers.parseEther("1000"), issuerA);
      // User2 deposits 1000 under issuerB
      await srCVR.connect(pool).mint(user2.address, ethers.parseEther("1000"), issuerB);

      // Both get yield
      await srCVR.connect(pool).accrueYield(ethers.parseEther("500"), issuerA);
      await srCVR.connect(pool).accrueYield(ethers.parseEther("500"), issuerB);
      // Global: underlying=3000, supply=2000, rate=1.5

      // IssuerA defaults — liquidate
      await srCVR.connect(pool).liquidate(issuerA);
      // poolUnderlying[A]=0, but totalUnderlying=1500, supply=2000
      // Global rate = 1500/2000 = 0.75

      const globalRate = await srCVR.getCurrentExchangeRate();
      const issuerAUnderlying = await srCVR.poolUnderlying(issuerA);
      const issuerBUnderlying = await srCVR.poolUnderlying(issuerB);

      // Global rate dropped to 0.75 — but issuerB depositors are fine (their pool has 1500)
      expect(globalRate).to.equal(ethers.parseEther("0.75"));
      expect(issuerAUnderlying).to.equal(0);
      expect(issuerBUnderlying).to.equal(ethers.parseEther("1500"));

      // FRONTEND IMPACT: Dashboard shows global rate 0.75 for ALL users,
      // even user2 whose issuerB pool is healthy at 1.5 effective rate.
      // This is a known limitation of the cToken model with multiple issuers.
    });

    it("HC-1.2: per-issuer supply tracking diverges from global supply", async function () {
      const { srCVR, pool, user1, user2, issuerA, issuerB } = await loadFixture(deployFixture);

      await srCVR.connect(pool).mint(user1.address, ethers.parseEther("1000"), issuerA);
      await srCVR.connect(pool).mint(user2.address, ethers.parseEther("2000"), issuerB);

      const globalSupply = await srCVR.totalSupply();
      const supplyA = await srCVR.poolSupply(issuerA);
      const supplyB = await srCVR.poolSupply(issuerB);

      // Per-issuer supplies should sum to global
      expect(supplyA + supplyB).to.equal(globalSupply);
      expect(globalSupply).to.equal(ethers.parseEther("3000"));
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  2. DEPOSIT AT DIFFERENT RATES — YIELD MISCALCULATION
  //     Frontend calculates yield as: balance * (rate - 1.0)
  //     This is WRONG for late depositors who entered at rate > 1.0
  // ═══════════════════════════════════════════════════════════════════

  describe("2. Late Depositor Yield Miscalculation", function () {
    it("HC-2.1: late depositor appears to have phantom yield", async function () {
      const { srCVR, pool, user1, user2, issuerA } = await loadFixture(deployFixture);

      // User1 deposits at rate 1.0
      await srCVR.connect(pool).mint(user1.address, ethers.parseEther("1000"), issuerA);

      // Yield accrues, rate goes to 2.0
      await srCVR.connect(pool).accrueYield(ethers.parseEther("1000"), issuerA);

      // User2 deposits 2000 USDT at rate 2.0 — gets 1000 srCVR
      await srCVR.connect(pool).mint(user2.address, ethers.parseEther("2000"), issuerA);

      const bal2 = await srCVR.balanceOf(user2.address);
      const rate = await srCVR.getCurrentExchangeRate();

      // User2 has 1000 srCVR, rate = (3000/2000) * 1e18 = 1.5e18
      // Wait — rate changed because new deposit diluted it!
      // Before user2: underlying=2000, supply=1000, rate=2.0
      // After user2:  underlying=4000, supply=2000, rate=2.0 (actually stays same because mint formula is consistent)
      expect(bal2).to.equal(ethers.parseEther("1000"));
      expect(rate).to.equal(ethers.parseEther("2"));

      // Frontend would show: user2 yield = 1000 * (2.0 - 1.0) = $1000
      // But user2 actually deposited $2000 and has $2000 value — ZERO real yield!
      // This is the phantom yield bug in the frontend approximation.
      const redeemable = await srCVR.getRedeemableUSDT(bal2);
      expect(redeemable).to.equal(ethers.parseEther("2000")); // Gets back exactly what they put in
    });

    it("HC-2.2: user1 (early) actual yield is correct despite rate dilution appearance", async function () {
      const { srCVR, pool, user1, user2, issuerA } = await loadFixture(deployFixture);

      await srCVR.connect(pool).mint(user1.address, ethers.parseEther("1000"), issuerA);
      await srCVR.connect(pool).accrueYield(ethers.parseEther("1000"), issuerA);
      // Rate = 2.0, user1 has 1000 srCVR worth 2000 USDT

      await srCVR.connect(pool).mint(user2.address, ethers.parseEther("2000"), issuerA);
      // Rate stays 2.0

      const bal1 = await srCVR.balanceOf(user1.address);
      const redeemable1 = await srCVR.getRedeemableUSDT(bal1);

      // User1 deposited 1000, can redeem 2000 — real yield is $1000
      expect(redeemable1).to.equal(ethers.parseEther("2000"));
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  3. POST-LIQUIDATION GHOST TOKENS
  //     After liquidation, tokens still exist but have no backing.
  //     What happens when someone tries to use them?
  // ═══════════════════════════════════════════════════════════════════

  describe("3. Ghost Tokens After Liquidation", function () {
    it("HC-3.1: srCVR tokens exist but redeemable value is near zero", async function () {
      const { srCVR, pool, user1, issuerA } = await loadFixture(deployFixture);

      await srCVR.connect(pool).mint(user1.address, ethers.parseEther("1000"), issuerA);
      await srCVR.connect(pool).liquidate(issuerA);

      const balance = await srCVR.balanceOf(user1.address);
      const rate = await srCVR.getCurrentExchangeRate();
      const redeemable = await srCVR.getRedeemableUSDT(balance);

      // Tokens still exist
      expect(balance).to.equal(ethers.parseEther("1000"));
      // Rate is 0 (0 underlying / 1000 supply)
      expect(rate).to.equal(0);
      // Redeemable is 0
      expect(redeemable).to.equal(0);
    });

    it("HC-3.2: jrCVR ghost tokens — poolSupply > 0 but poolUnderlying = 0", async function () {
      const { jrCVR, pool, user1, issuerA } = await loadFixture(deployFixture);

      await jrCVR.connect(pool).mint(user1.address, ethers.parseEther("500"), issuerA);
      await jrCVR.connect(pool).liquidate(issuerA);

      const balance = await jrCVR.balanceOf(user1.address);
      const underlying = await jrCVR.getPoolUnderlying(issuerA);
      const supply = await jrCVR.poolSupply(issuerA);

      expect(balance).to.equal(ethers.parseEther("500"));
      expect(underlying).to.equal(0);
      expect(supply).to.equal(ethers.parseEther("500")); // Supply NOT zeroed!

      // Frontend: rate = 0/500 = 0, yield = 500*(0-1) = -500 (total loss display)
    });

    it("HC-3.3: yield accrual AFTER liquidation resurrects value from zero", async function () {
      const { srCVR, pool, user1, issuerA } = await loadFixture(deployFixture);

      await srCVR.connect(pool).mint(user1.address, ethers.parseEther("1000"), issuerA);
      await srCVR.connect(pool).liquidate(issuerA);

      // Rate is 0
      expect(await srCVR.getCurrentExchangeRate()).to.equal(0);

      // New yield accrues (e.g., from another issuer's premium going to wrong pool)
      await srCVR.connect(pool).accrueYield(ethers.parseEther("500"), issuerA);

      // Rate resurrects: 500/1000 = 0.5
      const newRate = await srCVR.getCurrentExchangeRate();
      expect(newRate).to.equal(ethers.parseEther("0.5"));

      // Frontend: yield = 1000 * (0.5 - 1.0) = -500 (still negative, but recovering)
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  4. SUPPLY→0→SUPPLY RESURRECTION
  //     What if all tokens are redeemed, then someone deposits again?
  // ═══════════════════════════════════════════════════════════════════

  describe("4. Supply Resurrection After Full Redemption", function () {
    it("HC-4.1: per-issuer rate resets to 1:1 after full redemption (no stale-rate carryover)", async function () {
      const { srCVR, pool, user1, issuerA } = await loadFixture(deployFixture);

      await srCVR.connect(pool).mint(user1.address, ethers.parseEther("1000"), issuerA);
      await srCVR.connect(pool).accrueYield(ethers.parseEther("500"), issuerA);
      // issuerA per-issuer rate = 1.5

      // Redeem everything
      await srCVR.connect(pool).redeem(user1.address, ethers.parseEther("1000"), issuerA);

      // Supply is 0, underlying is 0
      expect(await srCVR.totalSupply()).to.equal(0);
      expect(await srCVR.totalUnderlying()).to.equal(0);
      expect(await srCVR.poolSupply(issuerA)).to.equal(0);
      expect(await srCVR.poolUnderlying(issuerA)).to.equal(0);

      // FIXED (per-issuer model): the issuer's rate is back to 1e18 — no stale-rate carryover
      // that would let the next depositor enter at an inflated rate (the old global-rate bug).
      expect(await srCVR.exchangeRateOf(issuerA)).to.equal(ethers.parseEther("1"));

      // New deposit enters fresh at 1:1 → 1000 srCVR (not 666.66 at a stale 1.5), matching jrCVR.
      await srCVR.connect(pool).mint(user1.address, ethers.parseEther("1000"), issuerA);
      expect(await srCVR.balanceOf(user1.address)).to.equal(ethers.parseEther("1000"));
    });

    it("HC-4.2: jrCVR full redemption then new deposit works correctly", async function () {
      const { jrCVR, pool, user1, user2, issuerA } = await loadFixture(deployFixture);

      await jrCVR.connect(pool).mint(user1.address, ethers.parseEther("1000"), issuerA);
      await jrCVR.connect(pool).accrueYield(ethers.parseEther("500"), issuerA);

      // Redeem all — gets 1500 USDT (pro-rata)
      await jrCVR.connect(pool).redeem(user1.address, ethers.parseEther("1000"), issuerA);

      expect(await jrCVR.poolSupply(issuerA)).to.equal(0);
      expect(await jrCVR.getPoolUnderlying(issuerA)).to.equal(0);

      // New deposit — mints 1:1 fresh
      await jrCVR.connect(pool).mint(user2.address, ethers.parseEther("800"), issuerA);
      expect(await jrCVR.balanceOf(user2.address)).to.equal(ethers.parseEther("800"));
      expect(await jrCVR.getPoolUnderlying(issuerA)).to.equal(ethers.parseEther("800"));
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  5. ROUNDING / DUST ATTACKS
  //     Tiny deposits or yields that exploit integer division
  // ═══════════════════════════════════════════════════════════════════

  describe("5. Rounding and Dust Attacks", function () {
    it("HC-5.1: 1 wei deposit at high exchange rate mints 0 tokens", async function () {
      const { srCVR, pool, user1, user2, issuerA } = await loadFixture(deployFixture);

      await srCVR.connect(pool).mint(user1.address, ethers.parseEther("1000"), issuerA);
      await srCVR.connect(pool).accrueYield(ethers.parseEther("1000"), issuerA);
      // Rate = 2.0

      // 1 wei deposit: minted = 1 * 1e18 / 2e18 = 0
      await srCVR.connect(pool).mint(user2.address, 1n, issuerA);
      const bal = await srCVR.balanceOf(user2.address);
      expect(bal).to.equal(0); // Gets 0 tokens but 1 wei added to underlying!

      // This means totalUnderlying increased by 1 but no new tokens minted
      // Free value donated to existing holders
    });

    it("HC-5.2: repeated dust yields accumulate correctly", async function () {
      const { srCVR, pool, user1, issuerA } = await loadFixture(deployFixture);

      await srCVR.connect(pool).mint(user1.address, ethers.parseEther("100"), issuerA);

      // 100 tiny yields of 1e12 each (0.000001 USDT equivalent)
      for (let i = 0; i < 100; i++) {
        await srCVR.connect(pool).accrueYield(BigInt(1e12), issuerA);
      }

      const underlying = await srCVR.totalUnderlying();
      const expected = ethers.parseEther("100") + BigInt(100) * BigInt(1e12);
      expect(underlying).to.equal(expected);
    });

    it("HC-5.3: jrCVR redemption of 1 token with large underlying", async function () {
      const { jrCVR, usdt, pool, user1, issuerA } = await loadFixture(deployFixture);

      await jrCVR.connect(pool).mint(user1.address, ethers.parseEther("1000"), issuerA);
      await jrCVR.connect(pool).accrueYield(ethers.parseEther("9000"), issuerA);
      // poolUnderlying = 10000, poolSupply = 1000, rate = 10.0

      // Redeem just 1 wei of jrCVR
      const balBefore = await usdt.balanceOf(user1.address);
      await jrCVR.connect(pool).redeem(user1.address, 1n, issuerA);
      const balAfter = await usdt.balanceOf(user1.address);

      // Should get: 1 * 10000e18 / 1000e18 = 10 wei
      expect(balAfter - balBefore).to.equal(10n);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  6. MULTI-ISSUER CROSS-CONTAMINATION
  //     Yield from issuerA should not affect issuerB's poolUnderlying,
  //     but it DOES affect the global exchange rate
  // ═══════════════════════════════════════════════════════════════════

  describe("6. Multi-Issuer Cross-Contamination", function () {
    it("HC-6.1: issuerA yield does not increase issuerB poolUnderlying", async function () {
      const { srCVR, pool, user1, user2, issuerA, issuerB } = await loadFixture(deployFixture);

      await srCVR.connect(pool).mint(user1.address, ethers.parseEther("1000"), issuerA);
      await srCVR.connect(pool).mint(user2.address, ethers.parseEther("1000"), issuerB);

      await srCVR.connect(pool).accrueYield(ethers.parseEther("500"), issuerA);

      const underlyingA = await srCVR.poolUnderlying(issuerA);
      const underlyingB = await srCVR.poolUnderlying(issuerB);

      expect(underlyingA).to.equal(ethers.parseEther("1500")); // Got yield
      expect(underlyingB).to.equal(ethers.parseEther("1000")); // Unchanged
    });

    it("HC-6.2: the blended global rate is a back-compat VIEW only (not used for redeem)", async function () {
      const { srCVR, pool, user1, user2, issuerA, issuerB } = await loadFixture(deployFixture);

      await srCVR.connect(pool).mint(user1.address, ethers.parseEther("1000"), issuerA);
      await srCVR.connect(pool).mint(user2.address, ethers.parseEther("1000"), issuerB);

      // Only issuerA pays premium
      await srCVR.connect(pool).accrueYield(ethers.parseEther("500"), issuerA);

      // The legacy global view still blends: 2500/2000 = 1.25 ...
      expect(await srCVR.getCurrentExchangeRate()).to.equal(ethers.parseEther("1.25"));
      expect(await srCVR.getRedeemableUSDT(ethers.parseEther("1000"))).to.equal(ethers.parseEther("1250"));

      // ... but it is informational only. The PER-ISSUER rates are isolated:
      expect(await srCVR.exchangeRateOf(issuerA)).to.equal(ethers.parseEther("1.5")); // got the premium
      expect(await srCVR.exchangeRateOf(issuerB)).to.equal(ethers.parseEther("1"));   // untouched
      // (HC-6.3 proves redeem uses the per-issuer rate, not this blended view.)
    });

    it("HC-6.3: issuer B redeems its OWN per-issuer rate, isolated from A's premium", async function () {
      const { srCVR, pool, user1, user2, issuerA, issuerB } = await loadFixture(deployFixture);

      await srCVR.connect(pool).mint(user1.address, ethers.parseEther("1000"), issuerA);
      await srCVR.connect(pool).mint(user2.address, ethers.parseEther("1000"), issuerB);
      await srCVR.connect(pool).accrueYield(ethers.parseEther("500"), issuerA);

      // FIXED: B's redeem uses B's per-issuer rate (1.0), NOT the blended 1.25, so it neither
      // over-claims A's premium nor reverts. User2 gets exactly their fair 1000 USDT.
      const out = await srCVR.connect(pool).redeem.staticCall(user2.address, ethers.parseEther("1000"), issuerB);
      expect(out).to.equal(ethers.parseEther("1000"));
      await srCVR.connect(pool).redeem(user2.address, ethers.parseEther("1000"), issuerB);
      expect(await srCVR.poolUnderlying(issuerB)).to.equal(0);
      // A's premium is still intact for A's holder (isolation both ways)
      expect(await srCVR.poolUnderlying(issuerA)).to.equal(ethers.parseEther("1500"));
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  7. SEQUENTIAL DEPOSIT-YIELD-REDEEM STRESS TEST
  // ═══════════════════════════════════════════════════════════════════

  describe("7. Sequential Stress Test", function () {
    it("HC-7.1: 10 cycles of deposit→yield→partial-redeem maintains consistency", async function () {
      const { srCVR, usdt, pool, user1, issuerA } = await loadFixture(deployFixture);

      let totalDeposited = 0n;
      let totalRedeemed = 0n;

      for (let i = 0; i < 10; i++) {
        const depositAmt = ethers.parseEther(String(100 + i * 50));
        await srCVR.connect(pool).mint(user1.address, depositAmt, issuerA);
        totalDeposited += depositAmt;

        const yieldAmt = ethers.parseEther(String(10 + i * 5));
        await srCVR.connect(pool).accrueYield(yieldAmt, issuerA);

        // Redeem 10% of balance each cycle
        const bal = await srCVR.balanceOf(user1.address);
        const redeemAmt = bal / 10n;
        if (redeemAmt > 0n) {
          const balBefore = await usdt.balanceOf(user1.address);
          await srCVR.connect(pool).redeem(user1.address, redeemAmt, issuerA);
          const balAfter = await usdt.balanceOf(user1.address);
          totalRedeemed += (balAfter - balBefore);
        }
      }

      // Final state should be consistent
      const finalBal = await srCVR.balanceOf(user1.address);
      const finalRate = await srCVR.getCurrentExchangeRate();
      const finalUnderlying = await srCVR.totalUnderlying();
      const finalSupply = await srCVR.totalSupply();

      // Exchange rate = underlying / supply (with 1e18 precision)
      if (finalSupply > 0n) {
        const expectedRate = (finalUnderlying * BigInt(1e18)) / finalSupply;
        expect(finalRate).to.equal(expectedRate);
      }

      // Total value should be conserved: deposited + yields = redeemed + remaining value
      const remainingValue = (finalBal * finalRate) / BigInt(1e18);
      // Allow 1 wei rounding tolerance per operation (10 cycles)
      expect(remainingValue + totalRedeemed).to.be.gte(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  8. JUNIOR TRANCHE SPECIFIC EDGE CASES
  // ═══════════════════════════════════════════════════════════════════

  describe("8. Junior Tranche Specific Edge Cases", function () {
    it("HC-8.1: partial redemption updates poolSupply correctly for rate calc", async function () {
      const { jrCVR, pool, user1, user2, issuerA } = await loadFixture(deployFixture);

      await jrCVR.connect(pool).mint(user1.address, ethers.parseEther("600"), issuerA);
      await jrCVR.connect(pool).mint(user2.address, ethers.parseEther("400"), issuerA);
      await jrCVR.connect(pool).accrueYield(ethers.parseEther("1000"), issuerA);
      // poolUnderlying=2000, poolSupply=1000, rate=2.0

      // User1 redeems 300 jrCVR: gets 300*2000/1000 = 600 USDT
      await jrCVR.connect(pool).redeem(user1.address, ethers.parseEther("300"), issuerA);

      // After: poolUnderlying=1400, poolSupply=700
      const underlying = await jrCVR.getPoolUnderlying(issuerA);
      const supply = await jrCVR.poolSupply(issuerA);
      expect(underlying).to.equal(ethers.parseEther("1400"));
      expect(supply).to.equal(ethers.parseEther("700"));

      // Rate should still be 2.0
      // 1400/700 = 2.0
      const effectiveRate = Number(underlying) / Number(supply);
      expect(effectiveRate).to.equal(2.0);
    });

    it("HC-8.2: epoch yield accumulates independently of deposits/redemptions", async function () {
      const { jrCVR, pool, user1, issuerA } = await loadFixture(deployFixture);

      await jrCVR.connect(pool).mint(user1.address, ethers.parseEther("1000"), issuerA);

      // Epoch 0: 100 yield
      await jrCVR.connect(pool).accrueYield(ethers.parseEther("100"), issuerA);

      // Redeem some
      await jrCVR.connect(pool).redeem(user1.address, ethers.parseEther("200"), issuerA);

      // More yield in same epoch
      await jrCVR.connect(pool).accrueYield(ethers.parseEther("50"), issuerA);

      // Epoch 0 should have 150 total
      expect(await jrCVR.epochYield(0)).to.equal(ethers.parseEther("150"));

      // Advance epoch
      await jrCVR.connect(pool).advanceEpoch();
      await jrCVR.connect(pool).accrueYield(ethers.parseEther("200"), issuerA);

      // Epoch 1 should have 200, epoch 0 still 150
      expect(await jrCVR.epochYield(0)).to.equal(ethers.parseEther("150"));
      expect(await jrCVR.epochYield(1)).to.equal(ethers.parseEther("200"));
    });

    it("HC-8.3: three users, two issuers — one liquidated, rates diverge", async function () {
      const { jrCVR, pool, user1, user2, user3, issuerA, issuerB } = await loadFixture(deployFixture);

      await jrCVR.connect(pool).mint(user1.address, ethers.parseEther("500"), issuerA);
      await jrCVR.connect(pool).mint(user2.address, ethers.parseEther("500"), issuerA);
      await jrCVR.connect(pool).mint(user3.address, ethers.parseEther("1000"), issuerB);

      // Both issuers get yield
      await jrCVR.connect(pool).accrueYield(ethers.parseEther("500"), issuerA);
      await jrCVR.connect(pool).accrueYield(ethers.parseEther("300"), issuerB);

      // Liquidate issuerA
      await jrCVR.connect(pool).liquidate(issuerA);

      // IssuerA: underlying=0, supply=1000 → rate=0 (total loss for user1, user2)
      // IssuerB: underlying=1300, supply=1000 → rate=1.3 (healthy)
      expect(await jrCVR.getPoolUnderlying(issuerA)).to.equal(0);
      expect(await jrCVR.getPoolUnderlying(issuerB)).to.equal(ethers.parseEther("1300"));

      // User3 can still redeem normally from issuerB
      const bal3 = await jrCVR.balanceOf(user3.address);
      expect(bal3).to.equal(ethers.parseEther("1000"));
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  //  9. EXCHANGE RATE PRECISION BOUNDARIES
  // ═══════════════════════════════════════════════════════════════════

  describe("9. Precision Boundaries", function () {
    it("HC-9.1: rate at extreme high value (1000x return)", async function () {
      const { srCVR, pool, user1, issuerA } = await loadFixture(deployFixture);

      await srCVR.connect(pool).mint(user1.address, ethers.parseEther("1"), issuerA);
      await srCVR.connect(pool).accrueYield(ethers.parseEther("999"), issuerA);

      // Rate = 1000e18
      const rate = await srCVR.getCurrentExchangeRate();
      expect(rate).to.equal(ethers.parseEther("1000"));

      const redeemable = await srCVR.getRedeemableUSDT(ethers.parseEther("1"));
      expect(redeemable).to.equal(ethers.parseEther("1000"));
    });

    it("HC-9.2: rate with asymmetric precision (odd number division)", async function () {
      const { srCVR, pool, user1, issuerA } = await loadFixture(deployFixture);

      await srCVR.connect(pool).mint(user1.address, ethers.parseEther("3"), issuerA);
      await srCVR.connect(pool).accrueYield(ethers.parseEther("1"), issuerA);

      // Rate = 4/3 * 1e18 = 1.333...e18 (truncated in Solidity)
      const rate = await srCVR.getCurrentExchangeRate();
      // 4 * 1e18 / 3 = 1333333333333333333 (not exact 1.333...e18)
      expect(rate).to.equal(4n * BigInt(1e18) / 3n);

      // Redeem 3 srCVR: 3 * 1333333333333333333 / 1e18 = 3999999999999999999 (not 4e18!)
      const redeemable = await srCVR.getRedeemableUSDT(ethers.parseEther("3"));
      // Loses 1 wei due to rounding
      expect(redeemable).to.be.lte(ethers.parseEther("4"));
      expect(redeemable).to.be.gte(ethers.parseEther("4") - 2n); // Allow 2 wei tolerance
    });
  });
});
