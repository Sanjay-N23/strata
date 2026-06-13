/**
 * Functional End-to-End Test Suite — runs the full Strata protocol lifecycle
 * on the live mainnet deployment, exercising every state-changing function
 * the read-only smoke-test could not cover.
 *
 * Run AFTER smoke-test-mainnet.ts:
 *   npx hardhat run scripts/functional-test-mainnet.ts --network hashkeyMainnet
 *
 * Phases (executed in dependency order):
 *   1. cfUSD mint
 *   2. Pool activation + IRS init
 *   3. Issuer registration (IssuerRegistry.register)
 *   4. Issuer bond deposit
 *   5. Junior tranche deposit (mint jrCVR)  ← junior MUST come first (25% rule)
 *   6. Senior tranche deposit (mint srCVR)
 *   7. Coverage purchase (mint ProtectionCert)
 *   8. Premium payment (foundation fee + tranche yield accrual)
 *   9. IRS keeper updates (NAV / repayment / collateral / premium calc)
 *   10. Withdrawal initiation (senior + junior request rows)
 *   11. Default → Payout → SubrogationNFT (destructive, demonstrates lifecycle)
 *
 * Cost: ~0.05 HSK on mainnet.
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const u = (n: string) => ethers.parseUnits(n, 6); // cfUSD has 6 decimals

interface Deployment {
  network: string;
  chainId: number;
  deployer: string;
  foundation: string;
  contracts: Record<string, string>;
}

async function main() {
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const filename =
    chainId === 177 ? "hashkeyMainnet.json" :
    chainId === 133 ? "hashkeyTestnet-dryrun.json" :
    `chain-${chainId}.json`;
  const dep: Deployment = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployments", filename), "utf8")
  );

  const [signer] = await ethers.getSigners();

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  STRATA MAINNET FUNCTIONAL E2E TEST SUITE");
  console.log("═══════════════════════════════════════════════════════════════\n");
  console.log("  Chain:        ", chainId);
  console.log("  Source:       ", filename);
  console.log("  Signer:       ", signer.address);
  console.log("  Deployer:     ", dep.deployer);

  if (signer.address.toLowerCase() !== dep.deployer.toLowerCase()) {
    throw new Error("Signer is not the deployer — most owner-only calls will revert");
  }

  // Get all contracts
  const cfUSD = await ethers.getContractAt("CoverFiStablecoin", dep.contracts.CoverFiStablecoin);
  const pool  = await ethers.getContractAt("InsurancePool",     dep.contracts.InsurancePool);
  const pe    = await ethers.getContractAt("PayoutEngine",      dep.contracts.PayoutEngine);
  const irs   = await ethers.getContractAt("IRSOracle",         dep.contracts.IRSOracle);
  const bond  = await ethers.getContractAt("IssuerBond",        dep.contracts.IssuerBond);
  const reg   = await ethers.getContractAt("IssuerRegistry",    dep.contracts.IssuerRegistry);
  const cert  = await ethers.getContractAt("ProtectionCert",    dep.contracts.ProtectionCert);
  const sub   = await ethers.getContractAt("SubrogationNFT",    dep.contracts.SubrogationNFT);
  const srCVR = await ethers.getContractAt("srCVR",             dep.contracts.srCVR);
  const jrCVR = await ethers.getContractAt("jrCVR",             dep.contracts.jrCVR);

  // Use cfUSD address as the test issuerToken (the RWA we're "insuring").
  // Compliance check in PayoutEngine has try/catch fallback for non-ERC3643 tokens.
  const issuerToken = await cfUSD.getAddress();
  console.log("  Test issuerToken: cfUSD self-reference (acceptable — PayoutEngine has try/catch fallback)\n");

  let pass = 0, fail = 0;
  const log = (ok: boolean, msg: string, extra?: string) => {
    if (ok) { console.log(`  ✓ ${msg}${extra ? "   " + extra : ""}`); pass++; }
    else    { console.log(`  ✗ ${msg}${extra ? "   " + extra : ""}`); fail++; }
  };
  const step = (msg: string) => console.log("\n─── " + msg + " " + "─".repeat(Math.max(0, 64 - msg.length)));

  const startBal = await ethers.provider.getBalance(signer.address);
  console.log("  Starting HSK:", ethers.formatEther(startBal));

  // ═══════════════════════════════════════════════
  // PHASE 1: cfUSD MINT
  // ═══════════════════════════════════════════════
  step("PHASE 1: cfUSD Mint");
  const mintAmount = u("10000");
  await (await cfUSD.mint(signer.address, mintAmount)).wait();
  const cfUSDBal = await cfUSD.balanceOf(signer.address);
  log(cfUSDBal >= mintAmount, "Minted 10,000 cfUSD to deployer", `bal=${ethers.formatUnits(cfUSDBal, 6)}`);
  log((await cfUSD.totalSupply()) >= mintAmount, "totalSupply increased correctly");

  // Approvals
  await (await cfUSD.approve(pool.target, ethers.MaxUint256)).wait();
  await (await cfUSD.approve(pe.target, ethers.MaxUint256)).wait();
  await (await cfUSD.approve(bond.target, ethers.MaxUint256)).wait();
  log(true, "Approvals granted (InsurancePool, PayoutEngine, IssuerBond)");

  // ═══════════════════════════════════════════════
  // PHASE 2: POOL ACTIVATION + IRS INIT
  // ═══════════════════════════════════════════════
  step("PHASE 2: Pool Activation + IRS Initialization");
  await (await pool.activatePool(issuerToken)).wait();
  const poolAfterAct = await pool.pools(issuerToken);
  log(poolAfterAct.isActive === true, "Pool activated (isActive=true)");

  await (await irs.initializeScore(issuerToken, 600)).wait();
  log((await irs.getScore(issuerToken)) === 600n, "IRS initialized to 600 (standard track)");

  // ═══════════════════════════════════════════════
  // PHASE 3: ISSUER REGISTRATION
  // ═══════════════════════════════════════════════
  step("PHASE 3: Issuer Registration (IssuerRegistry.register)");
  await (await reg.register(
    issuerToken,
    1n,                      // BAS legal attest UID (mock)
    signer.address,          // custodian
    signer.address,          // legal rep
    signer.address,          // auditor
    u("100000"),             // market cap
    false                    // not fast track
  )).wait();
  const profile = await reg.getProfile(issuerToken);
  log(profile.registrationBlock > 0n, "Issuer registered");
  log(profile.issuerEOA.toLowerCase() === signer.address.toLowerCase(), "issuerEOA recorded correctly");
  log(Number(profile.status) === 0, "Initial status = OBSERVATION (0)");

  // Force-activate for testing (skips 60-day observation period)
  await (await reg.forceActivateForDemo(issuerToken)).wait();
  log((await reg.isActive(issuerToken)) === true, "Issuer status forced to ACTIVE");

  // ═══════════════════════════════════════════════
  // PHASE 4: ISSUER BOND DEPOSIT
  // ═══════════════════════════════════════════════
  step("PHASE 4: Issuer Bond Deposit");
  await (await bond.deposit(issuerToken, u("50"), u("1000"))).wait();
  const bondAmt = await bond.getBond(issuerToken);
  log(bondAmt === u("50"), "Bond deposited (50 cfUSD)", `bond=${ethers.formatUnits(bondAmt, 6)}`);

  // ═══════════════════════════════════════════════
  // PHASE 5: JUNIOR TRANCHE DEPOSIT (must come BEFORE senior — 25% rule)
  // ═══════════════════════════════════════════════
  step("PHASE 5: Junior Tranche Deposit (jrCVR mint)");
  await (await pool.depositJunior(issuerToken, u("200"))).wait();
  const jrBal = await jrCVR.balanceOf(signer.address);
  log(jrBal > 0n, "jrCVR minted", `jrCVR=${ethers.formatUnits(jrBal, 6)}`);
  const poolAfterJr = await pool.pools(issuerToken);
  log(poolAfterJr.juniorTVL === u("200"), "juniorTVL = 200");

  // ═══════════════════════════════════════════════
  // PHASE 6: SENIOR TRANCHE DEPOSIT
  // ═══════════════════════════════════════════════
  step("PHASE 6: Senior Tranche Deposit (srCVR mint)");
  await (await pool.depositSenior(issuerToken, u("500"))).wait();
  const srBal = await srCVR.balanceOf(signer.address);
  log(srBal > 0n, "srCVR minted", `srCVR=${ethers.formatUnits(srBal, 6)}`);
  const poolAfterSr = await pool.pools(issuerToken);
  log(poolAfterSr.seniorTVL === u("500"), "seniorTVL = 500");
  const ratio = await pool.getJuniorRatio(issuerToken);
  log(ratio >= 25n, "Junior ratio invariant ≥ 25% holds", `ratio=${ratio}%`);

  // ═══════════════════════════════════════════════
  // PHASE 7: COVERAGE PURCHASE
  // ═══════════════════════════════════════════════
  step("PHASE 7: Coverage Purchase (ProtectionCert mint)");
  await (await pe.purchaseCoverage(issuerToken, u("100"))).wait();
  log(await pe.isInsured(issuerToken, signer.address), "Holder marked as insured");
  const certId = await cert.holderCerts(signer.address, issuerToken);
  log(certId > 0n, "ProtectionCert NFT minted", `certId=${certId}`);
  const pos = await pe.getInsuredPosition(issuerToken, signer.address);
  log(pos.coveredAmount === u("100"), "Position records 100 cfUSD coverage");

  // ═══════════════════════════════════════════════
  // PHASE 8: PREMIUM PAYMENT
  // ═══════════════════════════════════════════════
  step("PHASE 8: Premium Payment (foundation fee + tranche yield accrual)");
  const foundBefore = await cfUSD.balanceOf(dep.foundation);
  const srTokenBefore = await cfUSD.balanceOf(dep.contracts.srCVR);
  const jrTokenBefore = await cfUSD.balanceOf(dep.contracts.jrCVR);
  await (await pool.payPremium(issuerToken, u("10"))).wait();
  const foundAfter = await cfUSD.balanceOf(dep.foundation);
  const srTokenAfter = await cfUSD.balanceOf(dep.contracts.srCVR);
  const jrTokenAfter = await cfUSD.balanceOf(dep.contracts.jrCVR);
  // Note: foundation == deployer here, so foundation gain includes the *paid* premium going *out*.
  // Better to check tranche balances directly.
  const srYield = srTokenAfter - srTokenBefore;
  const jrYield = jrTokenAfter - jrTokenBefore;
  log(srYield > 0n, "Senior tranche yield accrued", `+${ethers.formatUnits(srYield, 6)} cfUSD`);
  log(jrYield > 0n, "Junior tranche yield accrued", `+${ethers.formatUnits(jrYield, 6)} cfUSD`);
  // 70/30 split of 9.5 net premium = 6.65 / 2.85
  log(srYield > jrYield, "Senior receives larger share (70/30 split)");

  // ═══════════════════════════════════════════════
  // PHASE 9: IRS KEEPER UPDATES
  // ═══════════════════════════════════════════════
  step("PHASE 9: IRS Keeper Updates");
  const scoreInit = await irs.getScore(issuerToken);
  await (await irs.recordNAVUpdate(issuerToken, true, 0)).wait();
  const scoreAfterNAV = await irs.getScore(issuerToken);
  log(scoreAfterNAV >= scoreInit, "NAV on-time → score non-decreasing", `${scoreInit} → ${scoreAfterNAV}`);

  await (await irs.recordRepaymentEvent(issuerToken, true, 0)).wait();
  const scoreAfterRepay = await irs.getScore(issuerToken);
  log(scoreAfterRepay >= scoreAfterNAV, "Repayment on-time → score non-decreasing", `→ ${scoreAfterRepay}`);

  await (await irs.recordCollateralHealth(issuerToken, 11000)).wait();
  log(true, "Collateral health (110%) recorded");

  await (await irs.recordActivity(issuerToken)).wait();
  log(true, "Governance activity recorded");

  const premiumBPS = await irs.getPremiumRateBPS(issuerToken);
  log(premiumBPS >= 400n && premiumBPS <= 1600n,
      "Premium rate in valid range [400, 1600] BPS",
      `premium=${premiumBPS} BPS = ${Number(premiumBPS)/100}%`);

  // ═══════════════════════════════════════════════
  // PHASE 10: WITHDRAWAL INITIATION
  // ═══════════════════════════════════════════════
  step("PHASE 10: Withdrawal Initiation (request rows only — locked 14/30 days)");
  const reqIdSr: bigint = await pool.initiateWithdrawalSenior.staticCall(issuerToken, u("100"));
  await (await pool.initiateWithdrawalSenior(issuerToken, u("100"))).wait();
  log(reqIdSr > 0n, "Senior withdrawal request created", `requestId=${reqIdSr}`);

  const reqIdJr: bigint = await pool.initiateWithdrawalJunior.staticCall(issuerToken, u("50"));
  await (await pool.initiateWithdrawalJunior(issuerToken, u("50"))).wait();
  log(reqIdJr > reqIdSr, "Junior withdrawal request created", `requestId=${reqIdJr}`);

  const srReq = await pool.withdrawalRequests(reqIdSr);
  log(srReq.depositor.toLowerCase() === signer.address.toLowerCase(), "Senior request stores depositor");
  log(srReq.isSenior === true && srReq.executed === false, "Senior request: isSenior=true, executed=false");

  // ═══════════════════════════════════════════════
  // PHASE 11: DEFAULT + PAYOUT + SUBROGATION (destructive end-to-end)
  // ═══════════════════════════════════════════════
  step("PHASE 11: Default → Payout → SubrogationNFT (destructive lifecycle)");
  console.log("    Calling executePayout (owner path) — liquidates bond + pool, distributes to insured holders\n");
  const beforePayoutBal = await cfUSD.balanceOf(signer.address);
  try {
    await (await pe.executePayout(issuerToken)).wait();
    const afterPayoutBal = await cfUSD.balanceOf(signer.address);
    const payoutReceived = afterPayoutBal - beforePayoutBal;
    log(payoutReceived > 0n, "Payout received (we are the only insured holder)",
        `+${ethers.formatUnits(payoutReceived, 6)} cfUSD`);
    log((await pe.positions(issuerToken, signer.address)).paid === true, "Position marked as paid");

    // SubrogationNFT minted to foundation (= deployer here)
    const subBalance = await sub.balanceOf(dep.foundation);
    log(subBalance > 0n, "SubrogationNFT minted to foundation", `count=${subBalance}`);

    // IRS set to 0 (blacklisted)
    log((await irs.getScore(issuerToken)) === 0n, "IRS score set to 0 (issuer blacklisted)");

    // IssuerRegistry status DEFAULTED
    log((await reg.isDefaulted(issuerToken)) === true, "IssuerRegistry status = DEFAULTED");

    // Pool deactivated
    const poolFinal = await pool.pools(issuerToken);
    log(poolFinal.isActive === false, "Pool deactivated post-payout");

    // Bond liquidated
    const bondRecord = await bond.getBondRecord(issuerToken);
    log(bondRecord.liquidated === true, "Bond record marked liquidated");
  } catch (e: any) {
    log(false, "executePayout failed", String(e.message).slice(0, 100));
  }

  // ═══════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════
  const endBal = await ethers.provider.getBalance(signer.address);
  const spent = startBal - endBal;
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(`  Total checks: ${pass + fail}`);
  console.log(`  ✓ Passed:    ${pass}`);
  console.log(`  ✗ Failed:    ${fail}`);
  console.log(`  HSK spent:   ${ethers.formatEther(spent)}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
