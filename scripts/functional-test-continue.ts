/**
 * Continuation of functional-test-mainnet.ts. Picks up where the first run
 * stopped (Phase 9 IRS updates onward) and uses try/catch around every
 * state-changing call so one revert does not abort the suite.
 *
 *   npx hardhat run scripts/functional-test-continue.ts --network hashkeyMainnet
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const u = (n: string) => ethers.parseUnits(n, 6);

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
  console.log("  STRATA MAINNET FUNCTIONAL E2E — CONTINUATION (Phase 9-11)");
  console.log("═══════════════════════════════════════════════════════════════\n");
  console.log("  Chain:    ", chainId, "  Source:", filename);
  console.log("  Signer:   ", signer.address);

  const cfUSD = await ethers.getContractAt("CoverFiStablecoin", dep.contracts.CoverFiStablecoin);
  const pool  = await ethers.getContractAt("InsurancePool",     dep.contracts.InsurancePool);
  const pe    = await ethers.getContractAt("PayoutEngine",      dep.contracts.PayoutEngine);
  const irs   = await ethers.getContractAt("IRSOracle",         dep.contracts.IRSOracle);
  const bond  = await ethers.getContractAt("IssuerBond",        dep.contracts.IssuerBond);
  const reg   = await ethers.getContractAt("IssuerRegistry",    dep.contracts.IssuerRegistry);
  const sub   = await ethers.getContractAt("SubrogationNFT",    dep.contracts.SubrogationNFT);

  const issuerToken = await cfUSD.getAddress();

  let pass = 0, fail = 0;
  const log = (ok: boolean, msg: string, extra?: string) => {
    if (ok) { console.log(`  ✓ ${msg}${extra ? "   " + extra : ""}`); pass++; }
    else    { console.log(`  ✗ ${msg}${extra ? "   " + extra : ""}`); fail++; }
  };
  const step = (msg: string) => console.log("\n─── " + msg + " " + "─".repeat(Math.max(0, 64 - msg.length)));
  const send = async (label: string, txp: Promise<any>): Promise<boolean> => {
    try {
      const tx = await txp;
      const r = await tx.wait();
      if (r.status === 1) { log(true, label); return true; }
      log(false, label, "status=0 (reverted, no reason)");
      return false;
    } catch (e: any) {
      const reason = e.reason || e.shortMessage || String(e.message || e).slice(0, 100);
      log(false, label, `err=${reason}`);
      return false;
    }
  };

  const startBal = await ethers.provider.getBalance(signer.address);
  console.log("  Starting HSK:", ethers.formatEther(startBal));

  // Print pre-state
  step("Pre-State Snapshot (proves Phase 1-8 ran successfully on mainnet)");
  const cfBal = await cfUSD.balanceOf(signer.address);
  const totalSupply = await cfUSD.totalSupply();
  const poolState = await pool.pools(issuerToken);
  const bondAmt = await bond.getBond(issuerToken);
  const profile = await reg.getProfile(issuerToken);
  const irsScore = await irs.getScore(issuerToken);
  const isInsured = await pe.isInsured(issuerToken, signer.address);
  log(cfBal > 0n,             `cfUSD balance: ${ethers.formatUnits(cfBal, 6)}`);
  log(totalSupply > 0n,       `cfUSD totalSupply: ${ethers.formatUnits(totalSupply, 6)}`);
  log(poolState.isActive,     `Pool isActive: ${poolState.isActive}`);
  log(poolState.seniorTVL > 0n, `seniorTVL: ${ethers.formatUnits(poolState.seniorTVL, 6)}`);
  log(poolState.juniorTVL > 0n, `juniorTVL: ${ethers.formatUnits(poolState.juniorTVL, 6)}`);
  log(bondAmt > 0n,           `Issuer bond: ${ethers.formatUnits(bondAmt, 6)}`);
  log(profile.registrationBlock > 0n, `Issuer registered (block ${profile.registrationBlock})`);
  log(irsScore > 0n,          `IRS score: ${irsScore}`);
  log(isInsured,              `Coverage purchased: ${isInsured}`);

  // ─────────────── PHASE 9: IRS Keeper Updates ───────────────
  step("PHASE 9: IRS Keeper Updates (each tx independent)");
  await send("IRSOracle.recordNAVUpdate(onTime=true)",
    irs.recordNAVUpdate(issuerToken, true, 0));
  await send("IRSOracle.recordRepaymentEvent(onTime=true)",
    irs.recordRepaymentEvent(issuerToken, true, 0));
  await send("IRSOracle.recordCollateralHealth(110%)",
    irs.recordCollateralHealth(issuerToken, 11000));
  await send("IRSOracle.recordActivity()",
    irs.recordActivity(issuerToken));
  await send("IRSOracle.recordAttestationDispute(resolvedAgainstIssuer=false)",
    irs.recordAttestationDispute(issuerToken, false));

  try {
    const score = await irs.getScore(issuerToken);
    log(score > 0n && score <= 1000n, "IRS score in valid range", `score=${score}`);
    const premiumBPS = await irs.getPremiumRateBPS(issuerToken);
    log(premiumBPS >= 400n && premiumBPS <= 1600n,
        "Premium rate in valid range [400, 1600] BPS",
        `premium=${premiumBPS} BPS = ${Number(premiumBPS)/100}%`);
  } catch (e: any) {
    log(false, "IRS read after updates failed", String(e.message).slice(0, 100));
  }

  // ─────────────── PHASE 10: Withdrawal Initiation ───────────────
  step("PHASE 10: Withdrawal Initiation");
  await send("InsurancePool.initiateWithdrawalSenior(100 srCVR)",
    pool.initiateWithdrawalSenior(issuerToken, u("100")));
  await send("InsurancePool.initiateWithdrawalJunior(50 jrCVR)",
    pool.initiateWithdrawalJunior(issuerToken, u("50")));

  try {
    const nextId = await pool.nextRequestId();
    log(nextId > 1n, "Withdrawal requests recorded", `nextRequestId=${nextId}`);
  } catch (e: any) {
    log(false, "nextRequestId read failed");
  }

  // ─────────────── PHASE 11: Default → Payout → SubrogationNFT ───────────────
  step("PHASE 11: Default → Payout → SubrogationNFT (destructive end-to-end)");
  console.log("    Liquidates bond + pool, distributes payout, mints SubrogationNFT.\n");
  const beforePayoutBal = await cfUSD.balanceOf(signer.address);
  const beforeSubBal    = await sub.balanceOf(dep.foundation);

  const ok = await send("PayoutEngine.executePayout(issuerToken) [owner-path]",
    pe.executePayout(issuerToken));

  if (ok) {
    try {
      const afterPayoutBal = await cfUSD.balanceOf(signer.address);
      const afterSubBal    = await sub.balanceOf(dep.foundation);
      const payoutReceived = afterPayoutBal - beforePayoutBal;
      log(payoutReceived > 0n, "Payout transferred to insured holder",
          `+${ethers.formatUnits(payoutReceived, 6)} cfUSD`);
      log((await pe.positions(issuerToken, signer.address)).paid,
          "Position marked as paid");
      log(afterSubBal > beforeSubBal,
          "SubrogationNFT minted to foundation",
          `+${afterSubBal - beforeSubBal}`);
      log((await irs.getScore(issuerToken)) === 0n,
          "IRS score set to 0 (issuer blacklisted)");
      log(await reg.isDefaulted(issuerToken),
          "IssuerRegistry status = DEFAULTED");
      const poolFinal = await pool.pools(issuerToken);
      log(!poolFinal.isActive, "Pool deactivated post-payout");
      const bondRec = await bond.getBondRecord(issuerToken);
      log(bondRec.liquidated, "Bond record marked liquidated");
    } catch (e: any) {
      log(false, "Post-payout state read failed", String(e.message).slice(0, 100));
    }
  }

  // ─────────────── Summary ───────────────
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
