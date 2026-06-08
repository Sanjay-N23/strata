/**
 * Reproduces the recordRepaymentEvent + recordActivity reverts using
 * staticCall, which surfaces the underlying revert reason that broadcast lost.
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
  console.log("\n─── IRS Revert Debug ───────────────────────────────────────\n");
  console.log("  Signer:    ", signer.address);
  console.log("  IRSOracle: ", dep.contracts.IRSOracle);

  const irs = await ethers.getContractAt("IRSOracle", dep.contracts.IRSOracle);
  const issuerToken = dep.contracts.CoverFiStablecoin;

  // Check IRS state first
  console.log("\n  Pre-state:");
  const score = await irs.getScore(issuerToken);
  console.log("    score:        ", score);
  const components = await irs.getComponents(issuerToken);
  console.log("    navPunctuality:     ", components.navPunctuality);
  console.log("    attestationAccuracy:", components.attestationAccuracy);
  console.log("    repaymentHistory:   ", components.repaymentHistory);
  console.log("    collateralHealth:   ", components.collateralHealth);
  console.log("    governanceActivity: ", components.governanceActivity);
  console.log("    totalScore:         ", components.totalScore);
  console.log("    lastUpdatedBlock:   ", components.lastUpdatedBlock);

  console.log("\n  Keeper / Owner:");
  console.log("    keeper:    ", await irs.keeper());
  console.log("    owner:     ", await irs.owner());

  console.log("\n─── staticCall recordRepaymentEvent(true, 0) ───\n");
  try {
    await irs.recordRepaymentEvent.staticCall(issuerToken, true, 0);
    console.log("  staticCall returned successfully (no revert simulated)");
  } catch (e: any) {
    console.log("  Reverted with:", e.reason || e.shortMessage || e.message);
    console.log("  Full error:");
    console.log("    code:        ", e.code);
    console.log("    data:        ", e.data);
    console.log("    transaction: ", e.transaction);
  }

  console.log("\n─── staticCall recordActivity() ───\n");
  try {
    await irs.recordActivity.staticCall(issuerToken);
    console.log("  staticCall returned successfully (no revert simulated)");
  } catch (e: any) {
    console.log("  Reverted with:", e.reason || e.shortMessage || e.message);
    console.log("  Full error:");
    console.log("    code:        ", e.code);
    console.log("    data:        ", e.data);
  }

  // Compare with NAV update which works
  console.log("\n─── staticCall recordNAVUpdate(true, 0) [should succeed] ───\n");
  try {
    await irs.recordNAVUpdate.staticCall(issuerToken, true, 0);
    console.log("  staticCall returned successfully ✓");
  } catch (e: any) {
    console.log("  ✗ Reverted with:", e.reason || e.shortMessage || e.message);
  }

  // Try with eth_call directly to capture raw revert data
  console.log("\n─── Raw eth_call recordRepaymentEvent ───\n");
  const data = irs.interface.encodeFunctionData("recordRepaymentEvent", [issuerToken, true, 0]);
  try {
    const result = await ethers.provider.call({
      to: dep.contracts.IRSOracle,
      from: signer.address,
      data,
    });
    console.log("  Result:", result, "(expected empty bytes for void function)");
  } catch (e: any) {
    console.log("  Reverted:");
    console.log("    raw data:", e.data);
    console.log("    info:    ", e.info);
    console.log("    message: ", e.message?.slice(0, 200));
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
