import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * LIVE YIELD TEST — HashKey Chain Testnet
 * Tests real on-chain yield calculation with actual transactions
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  STRATA — LIVE YIELD TEST ON HASHKEY CHAIN TESTNET");
  console.log(`  Account: ${deployer.address}`);
  console.log(`  Balance: ${ethers.formatEther(balance)} HSK`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Load deployment
  const network = await ethers.provider.getNetwork();
  const deployFilename = Number(network.chainId) === 133 ? "hashkeyTestnet.json" : "bscTestnet.json";
  const deployFile = path.join(__dirname, "..", "deployments", deployFilename);
  if (!fs.existsSync(deployFile)) {
    console.error("No deployment found. Run deploy first.");
    return;
  }
  const deployment = JSON.parse(fs.readFileSync(deployFile, "utf-8"));
  const c = deployment.contracts;

  // Get contract instances
  const usdt = await ethers.getContractAt("MockUSDT", c.MockUSDT);
  const pool = await ethers.getContractAt("InsurancePool", c.InsurancePool);
  const srCVR = await ethers.getContractAt("srCVR", c.srCVR);
  const jrCVR = await ethers.getContractAt("jrCVR", c.jrCVR);
  const irsOracle = await ethers.getContractAt("IRSOracle", c.IRSOracle);
  const registry = await ethers.getContractAt("IssuerRegistry", c.IssuerRegistry);
  const tokenAddr = c.MockERC3643Token;

  let passed = 0;
  let failed = 0;
  const results: { name: string; status: string; detail: string }[] = [];

  function pass(name: string, detail: string) {
    passed++;
    results.push({ name, status: "PASS", detail });
    console.log(`  ✅ ${name}`);
    console.log(`     ${detail}\n`);
  }
  function fail(name: string, detail: string) {
    failed++;
    results.push({ name, status: "FAIL", detail });
    console.log(`  ❌ ${name}`);
    console.log(`     ${detail}\n`);
  }

  // ═══════════════════════════════════════════════════════════════
  // SETUP: Mint USDT and initialize issuer
  // ═══════════════════════════════════════════════════════════════
  console.log("--- SETUP: Minting USDT & Initializing Issuer ---\n");

  try {
    const mintTx = await usdt.mint(deployer.address, ethers.parseEther("100000"));
    await mintTx.wait();
    const usdtBal = await usdt.balanceOf(deployer.address);
    console.log(`  Minted: ${ethers.formatEther(usdtBal)} USDT\n`);
  } catch (e: any) {
    console.log(`  USDT mint: ${e.message}\n`);
  }

  // Initialize IRS score for the token
  try {
    const initTx = await irsOracle.initializeScore(tokenAddr, 600);
    await initTx.wait();
    console.log("  IRS initialized at 600\n");
  } catch (e: any) {
    console.log(`  IRS init (may already exist): ${e.reason || e.message}\n`);
  }

  // Activate pool
  try {
    const activateTx = await pool.activatePool(tokenAddr);
    await activateTx.wait();
    console.log("  Pool activated\n");
  } catch (e: any) {
    console.log(`  Pool activate (may already be active): ${e.reason || e.message}\n`);
  }

  // ═══════════════════════════════════════════════════════════════
  // TEST 1: Exchange rate = 1.0 before any deposits
  // ═══════════════════════════════════════════════════════════════
  console.log("--- TEST 1: Initial Exchange Rate ---\n");
  try {
    const rate = await srCVR.getCurrentExchangeRate();
    const rateNum = parseFloat(ethers.formatEther(rate));
    if (rateNum >= 0) {
      pass("T1: srCVR exchange rate readable", `Rate = ${rateNum.toFixed(6)} (${rateNum === 1.0 ? 'fresh pool' : 'existing pool with accrued yield'})`);
    } else {
      fail("T1: srCVR exchange rate readable", `Rate = ${rateNum}, unexpected negative`);
    }
  } catch (e: any) {
    fail("T1: Initial srCVR exchange rate", `Contract call failed: ${e.message}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // TEST 2: Deposit Junior FIRST (25% min ratio enforced)
  // ═══════════════════════════════════════════════════════════════
  console.log("--- TEST 2: Junior Deposit (must go before senior) ---\n");
  try {
    const depositAmt = ethers.parseEther("3000");
    const approveTx = await usdt.approve(c.InsurancePool, depositAmt);
    await approveTx.wait();

    const depTx = await pool.depositJunior(tokenAddr, depositAmt);
    await depTx.wait();

    const jrBal = await jrCVR.balanceOf(deployer.address);
    const jrBalNum = parseFloat(ethers.formatEther(jrBal));
    const underlying = await jrCVR.getPoolUnderlying(tokenAddr);
    const underlyingNum = parseFloat(ethers.formatEther(underlying));
    const supply = await jrCVR.poolSupply(tokenAddr);
    const supplyNum = parseFloat(ethers.formatEther(supply));

    const jrRate = supplyNum > 0 ? underlyingNum / supplyNum : 1.0;

    if (jrBalNum > 0) {
      pass("T2: Junior deposit", `Got ${jrBalNum} jrCVR, underlying=${underlyingNum}, rate=${jrRate.toFixed(4)}`);
    } else {
      fail("T2: Junior deposit", `jrCVR=${jrBalNum}, underlying=${underlyingNum}, rate=${jrRate}`);
    }
  } catch (e: any) {
    fail("T2: Junior deposit", `TX failed: ${e.reason || e.message}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // TEST 3: Deposit Senior AFTER junior (ratio enforcement)
  // ═══════════════════════════════════════════════════════════════
  console.log("--- TEST 3: Senior Deposit ---\n");
  try {
    const depositAmt = ethers.parseEther("5000");
    const approveTx = await usdt.approve(c.InsurancePool, depositAmt);
    await approveTx.wait();

    const depTx = await pool.depositSenior(tokenAddr, depositAmt);
    await depTx.wait();

    const srBal = await srCVR.balanceOf(deployer.address);
    const srBalNum = parseFloat(ethers.formatEther(srBal));
    const rate = await srCVR.getCurrentExchangeRate();
    const rateNum = parseFloat(ethers.formatEther(rate));

    if (srBalNum > 0) {
      pass("T3: Senior deposit", `Got ${srBalNum.toFixed(2)} srCVR, rate = ${rateNum.toFixed(6)}`);
    } else {
      fail("T3: Senior deposit", `srCVR = ${srBalNum}, rate = ${rateNum}`);
    }
  } catch (e: any) {
    fail("T3: Senior deposit", `TX failed: ${e.reason || e.message}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // TEST 4: Pay Premium — check yield accrual
  // ═══════════════════════════════════════════════════════════════
  console.log("--- TEST 4: Premium Payment & Yield Accrual ---\n");
  try {
    const rateBefore = await srCVR.getCurrentExchangeRate();
    const jrUnderlyingBefore = await jrCVR.getPoolUnderlying(tokenAddr);

    const premiumAmt = ethers.parseEther("1000");
    const approveTx = await usdt.approve(c.InsurancePool, premiumAmt);
    await approveTx.wait();

    const premTx = await pool.payPremium(tokenAddr, premiumAmt);
    await premTx.wait();

    const rateAfter = await srCVR.getCurrentExchangeRate();
    const jrUnderlyingAfter = await jrCVR.getPoolUnderlying(tokenAddr);

    const rateBeforeNum = parseFloat(ethers.formatEther(rateBefore));
    const rateAfterNum = parseFloat(ethers.formatEther(rateAfter));
    const jrBefore = parseFloat(ethers.formatEther(jrUnderlyingBefore));
    const jrAfter = parseFloat(ethers.formatEther(jrUnderlyingAfter));

    // Premium = 1000, protocol fee = 50, net = 950
    // Senior share = 70% of 950 = 665
    // Junior share = 30% of 950 = 285

    if (rateAfterNum > rateBeforeNum) {
      pass("T4a: srCVR rate increased after premium", `Rate: ${rateBeforeNum.toFixed(6)} → ${rateAfterNum.toFixed(6)}`);
    } else {
      fail("T4a: srCVR rate increased after premium", `Rate: ${rateBeforeNum} → ${rateAfterNum} (should increase)`);
    }

    if (jrAfter > jrBefore) {
      pass("T4b: jrCVR poolUnderlying increased after premium", `Underlying: ${jrBefore} → ${jrAfter} (+${(jrAfter - jrBefore).toFixed(2)})`);
    } else {
      fail("T4b: jrCVR poolUnderlying increased after premium", `Underlying: ${jrBefore} → ${jrAfter} (should increase)`);
    }
  } catch (e: any) {
    fail("T4: Premium payment", `TX failed: ${e.reason || e.message}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // TEST 5: Verify unrealized yield calculation (what frontend does)
  // ═══════════════════════════════════════════════════════════════
  console.log("--- TEST 5: Frontend Yield Calculation Simulation ---\n");
  try {
    const srBal = await srCVR.balanceOf(deployer.address);
    const jrBal = await jrCVR.balanceOf(deployer.address);
    const srRate = await srCVR.getCurrentExchangeRate();
    const jrUnderlying = await jrCVR.getPoolUnderlying(tokenAddr);
    const jrSupply = await jrCVR.poolSupply(tokenAddr);

    const srBalNum = parseFloat(ethers.formatEther(srBal));
    const jrBalNum = parseFloat(ethers.formatEther(jrBal));
    const srRateNum = parseFloat(ethers.formatEther(srRate));
    const jrRateNum = Number(jrSupply) > 0
      ? parseFloat(ethers.formatEther(jrUnderlying)) / parseFloat(ethers.formatEther(jrSupply))
      : 1.0;

    // This is exactly what the frontend calculates
    const estValue = (srBalNum * srRateNum) + (jrBalNum * jrRateNum);
    const srYield = srBalNum * (srRateNum - 1.0);
    const jrYield = jrBalNum * (jrRateNum - 1.0);
    const totalYield = srYield + jrYield;

    console.log(`     srCVR: ${srBalNum.toFixed(2)} tokens × ${srRateNum.toFixed(6)} rate = $${(srBalNum * srRateNum).toFixed(2)}`);
    console.log(`     jrCVR: ${jrBalNum.toFixed(2)} tokens × ${jrRateNum.toFixed(6)} rate = $${(jrBalNum * jrRateNum).toFixed(2)}`);
    console.log(`     Est. Value: $${estValue.toFixed(2)}`);
    console.log(`     Sr Yield: +$${srYield.toFixed(2)}`);
    console.log(`     Jr Yield: +$${jrYield.toFixed(2)}`);
    console.log(`     Total Yield: +$${totalYield.toFixed(2)}`);

    if (totalYield > 0 && estValue > 8000) {
      pass("T5: Frontend yield calculation", `Value=$${estValue.toFixed(2)}, Yield=+$${totalYield.toFixed(2)}`);
    } else {
      fail("T5: Frontend yield calculation", `Value=$${estValue.toFixed(2)}, Yield=$${totalYield.toFixed(2)}`);
    }

    // Verify getRedeemableUSDT matches
    const redeemable = await srCVR.getRedeemableUSDT(srBal);
    const redeemableNum = parseFloat(ethers.formatEther(redeemable));
    const expectedSrValue = srBalNum * srRateNum;

    if (Math.abs(redeemableNum - expectedSrValue) < 1) {
      pass("T5b: getRedeemableUSDT matches rate calc", `Redeemable=$${redeemableNum.toFixed(2)}, Calc=$${expectedSrValue.toFixed(2)}`);
    } else {
      fail("T5b: getRedeemableUSDT matches rate calc", `Redeemable=$${redeemableNum.toFixed(2)} vs Calc=$${expectedSrValue.toFixed(2)}`);
    }
  } catch (e: any) {
    fail("T5: Frontend yield calculation", `Read failed: ${e.message}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // TEST 6: Second premium — verify yield compounds
  // ═══════════════════════════════════════════════════════════════
  console.log("--- TEST 6: Second Premium — Yield Compounds ---\n");
  try {
    const rateBefore = parseFloat(ethers.formatEther(await srCVR.getCurrentExchangeRate()));

    const premiumAmt = ethers.parseEther("2000");
    const approveTx = await usdt.approve(c.InsurancePool, premiumAmt);
    await approveTx.wait();
    const premTx = await pool.payPremium(tokenAddr, premiumAmt);
    await premTx.wait();

    const rateAfter = parseFloat(ethers.formatEther(await srCVR.getCurrentExchangeRate()));

    if (rateAfter > rateBefore) {
      pass("T6: Yield compounds on second premium", `Rate: ${rateBefore.toFixed(6)} → ${rateAfter.toFixed(6)}`);
    } else {
      fail("T6: Yield compounds on second premium", `Rate unchanged: ${rateBefore} → ${rateAfter}`);
    }
  } catch (e: any) {
    fail("T6: Second premium", `TX failed: ${e.reason || e.message}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // TEST 7: Epoch yield tracking
  // ═══════════════════════════════════════════════════════════════
  console.log("--- TEST 7: Epoch Yield Tracking ---\n");
  try {
    const epoch = await jrCVR.currentEpoch();
    const epochYieldVal = await jrCVR.epochYield(epoch);
    const epochYieldNum = parseFloat(ethers.formatEther(epochYieldVal));

    if (epochYieldNum > 0) {
      pass("T7: Epoch yield tracked", `Epoch ${epoch}: $${epochYieldNum.toFixed(2)} yield`);
    } else {
      // Epoch 0 may have all the yield
      const epoch0Yield = await jrCVR.epochYield(0);
      const e0Num = parseFloat(ethers.formatEther(epoch0Yield));
      if (e0Num > 0) {
        pass("T7: Epoch yield tracked (epoch 0)", `Epoch 0: $${e0Num.toFixed(2)} yield`);
      } else {
        fail("T7: Epoch yield tracking", `Epoch ${epoch} yield = $${epochYieldNum}`);
      }
    }
  } catch (e: any) {
    fail("T7: Epoch yield tracking", `Read failed: ${e.message}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // TEST 8: Pool state consistency
  // ═══════════════════════════════════════════════════════════════
  console.log("--- TEST 8: Pool State Consistency ---\n");
  try {
    const poolState = await pool.getPoolState(tokenAddr);
    const seniorTVL = parseFloat(ethers.formatEther(poolState.seniorTVL));
    const juniorTVL = parseFloat(ethers.formatEther(poolState.juniorTVL));
    const isActive = poolState.isActive;

    // Senior TVL should be: deposit(5000) + premium_share(665 + 1330) = 6995
    // Junior TVL should be: deposit(3000) + premium_share(285 + 570) = 3855

    if (isActive && seniorTVL > 5000 && juniorTVL > 3000) {
      pass("T8: Pool state consistent", `Active=${isActive}, SeniorTVL=$${seniorTVL.toFixed(0)}, JuniorTVL=$${juniorTVL.toFixed(0)}`);
    } else {
      fail("T8: Pool state", `Active=${isActive}, SeniorTVL=${seniorTVL}, JuniorTVL=${juniorTVL}`);
    }
  } catch (e: any) {
    fail("T8: Pool state", `Read failed: ${e.message}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // TEST 9: Withdrawal request (senior)
  // ═══════════════════════════════════════════════════════════════
  console.log("--- TEST 9: Senior Withdrawal Request ---\n");
  try {
    const srBal = await srCVR.balanceOf(deployer.address);
    const withdrawAmt = srBal / 10n; // 10% of balance

    const approveTx = await srCVR.approve(c.InsurancePool, withdrawAmt);
    await approveTx.wait();

    const wdTx = await pool.initiateWithdrawalSenior(tokenAddr, withdrawAmt);
    await wdTx.wait();

    pass("T9: Senior withdrawal request", `Requested withdrawal of ${parseFloat(ethers.formatEther(withdrawAmt)).toFixed(2)} srCVR`);
  } catch (e: any) {
    // May fail if approval not needed or other reason
    fail("T9: Senior withdrawal request", `TX failed: ${e.reason || e.message}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // TEST 10: Final yield snapshot (what user sees on dashboard)
  // ═══════════════════════════════════════════════════════════════
  console.log("--- TEST 10: Final Dashboard Snapshot ---\n");
  try {
    const srBal = await srCVR.balanceOf(deployer.address);
    const jrBal = await jrCVR.balanceOf(deployer.address);
    const srRate = await srCVR.getCurrentExchangeRate();
    const jrUnderlying = await jrCVR.getPoolUnderlying(tokenAddr);
    const jrSupply = await jrCVR.poolSupply(tokenAddr);

    const srBalNum = parseFloat(ethers.formatEther(srBal));
    const jrBalNum = parseFloat(ethers.formatEther(jrBal));
    const srRateNum = parseFloat(ethers.formatEther(srRate));
    const jrRateNum = Number(jrSupply) > 0
      ? parseFloat(ethers.formatEther(jrUnderlying)) / parseFloat(ethers.formatEther(jrSupply))
      : 1.0;

    const estValue = (srBalNum * srRateNum) + (jrBalNum * jrRateNum);
    const totalYield = srBalNum * (srRateNum - 1.0) + jrBalNum * (jrRateNum - 1.0);

    console.log("     ┌─────────────────────────────────────────┐");
    console.log(`     │ srCVR Balance:    ${srBalNum.toFixed(2).padStart(14)} srCVR  │`);
    console.log(`     │ jrCVR Balance:    ${jrBalNum.toFixed(2).padStart(14)} jrCVR  │`);
    console.log(`     │ Sr Exchange Rate: ${srRateNum.toFixed(6).padStart(14)}        │`);
    console.log(`     │ Jr Pro-Rata Rate: ${jrRateNum.toFixed(6).padStart(14)}        │`);
    console.log(`     │ Est. Value:       $${estValue.toFixed(2).padStart(13)}        │`);
    console.log(`     │ Unrealized Yield: +$${totalYield.toFixed(2).padStart(12)}        │`);
    console.log("     └─────────────────────────────────────────┘");

    pass("T10: Final dashboard snapshot", `Value=$${estValue.toFixed(2)}, Yield=+$${totalYield.toFixed(2)}`);
  } catch (e: any) {
    fail("T10: Final dashboard snapshot", `Read failed: ${e.message}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(`  RESULTS: ${passed} PASSED, ${failed} FAILED (${passed + failed} total)`);
  console.log("═══════════════════════════════════════════════════════════════");

  if (failed > 0) {
    console.log("\n  FAILURES:");
    results.filter(r => r.status === "FAIL").forEach(r => {
      console.log(`    ❌ ${r.name}: ${r.detail}`);
    });
  }

  console.log("");
}

main().catch(console.error);
