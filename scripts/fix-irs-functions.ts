/**
 * Re-runs the 2 IRS keeper functions that previously reverted, this time
 * with an explicit gas limit (bypasses ethers gas estimation, which may have
 * misjudged the cost on HashKey under certain state).
 *
 * Background:
 *   - First run: IRS state had non-zero components, recordRepaymentEvent + recordActivity reverted
 *   - Then Phase 11 reset all components to 0 (setScoreToZero on default)
 *   - staticCall now succeeds, suggesting the issue was gas estimation, not logic
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const filename =
    chainId === 177 ? "hashkeyMainnet.json" :
    chainId === 133 ? "hashkeyTestnet-dryrun.json" :
    `chain-${chainId}.json`;
  const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", filename), "utf8"));

  const [signer] = await ethers.getSigners();
  console.log("\n─── IRS Keeper Functions Retry (explicit gas) ───\n");
  console.log("  Signer:    ", signer.address);

  const irs = await ethers.getContractAt("IRSOracle", dep.contracts.IRSOracle);
  const issuerToken = dep.contracts.CoverFiStablecoin;

  // Print pre-state
  const preComponents = await irs.getComponents(issuerToken);
  console.log("\n  Pre-state components:");
  console.log("    navPunctuality:     ", preComponents.navPunctuality);
  console.log("    attestationAccuracy:", preComponents.attestationAccuracy);
  console.log("    repaymentHistory:   ", preComponents.repaymentHistory);
  console.log("    collateralHealth:   ", preComponents.collateralHealth);
  console.log("    governanceActivity: ", preComponents.governanceActivity);
  console.log("    totalScore:         ", preComponents.totalScore);

  let pass = 0, fail = 0;
  const log = (ok: boolean, msg: string, extra?: string) => {
    if (ok) { console.log(`  ✓ ${msg}${extra ? "   " + extra : ""}`); pass++; }
    else    { console.log(`  ✗ ${msg}${extra ? "   " + extra : ""}`); fail++; }
  };

  console.log("\n─── Test 1: recordRepaymentEvent(true, 0) with explicit gas ───");
  try {
    const tx = await irs.recordRepaymentEvent(issuerToken, true, 0, { gasLimit: 300_000 });
    const r = await tx.wait();
    if (r.status === 1) {
      const newScore = await irs.getScore(issuerToken);
      log(true, "recordRepaymentEvent succeeded", `gas=${r.gasUsed} score=${newScore}`);
    } else {
      log(false, "Reverted with status=0");
    }
  } catch (e: any) {
    log(false, "Threw error", e.reason || e.shortMessage || String(e.message).slice(0, 100));
  }

  console.log("\n─── Test 2: recordActivity() with explicit gas ───");
  try {
    const tx = await irs.recordActivity(issuerToken, { gasLimit: 300_000 });
    const r = await tx.wait();
    if (r.status === 1) {
      const newScore = await irs.getScore(issuerToken);
      log(true, "recordActivity succeeded", `gas=${r.gasUsed} score=${newScore}`);
    } else {
      log(false, "Reverted with status=0");
    }
  } catch (e: any) {
    log(false, "Threw error", e.reason || e.shortMessage || String(e.message).slice(0, 100));
  }

  // Re-test once more with second invocation (in case state-transition matters)
  console.log("\n─── Test 3: recordRepaymentEvent(false, 5) [late repayment] ───");
  try {
    const tx = await irs.recordRepaymentEvent(issuerToken, false, 5, { gasLimit: 300_000 });
    const r = await tx.wait();
    if (r.status === 1) {
      log(true, "Late repayment recorded successfully", `gas=${r.gasUsed}`);
    } else {
      log(false, "Reverted with status=0");
    }
  } catch (e: any) {
    log(false, "Threw error", e.reason || e.shortMessage || String(e.message).slice(0, 100));
  }

  console.log("\n─── Test 4: recordActivity() second call ───");
  try {
    const tx = await irs.recordActivity(issuerToken, { gasLimit: 300_000 });
    const r = await tx.wait();
    if (r.status === 1) {
      log(true, "Second recordActivity call succeeded", `gas=${r.gasUsed}`);
    } else {
      log(false, "Reverted with status=0");
    }
  } catch (e: any) {
    log(false, "Threw error", e.reason || e.shortMessage || String(e.message).slice(0, 100));
  }

  // Final state
  const post = await irs.getComponents(issuerToken);
  console.log("\n  Post-state components:");
  console.log("    navPunctuality:     ", post.navPunctuality);
  console.log("    attestationAccuracy:", post.attestationAccuracy);
  console.log("    repaymentHistory:   ", post.repaymentHistory);
  console.log("    collateralHealth:   ", post.collateralHealth);
  console.log("    governanceActivity: ", post.governanceActivity);
  console.log("    totalScore:         ", post.totalScore);

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(`  Total: ${pass + fail}   ✓ Pass: ${pass}   ✗ Fail: ${fail}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
