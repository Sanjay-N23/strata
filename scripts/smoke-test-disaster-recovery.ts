/**
 * Disaster Recovery Smoke Test — verifies the pause / unpause cycle on
 * cfUSD and the 3 pausable core contracts. Each pause is followed by a
 * state check and an unpause.
 *
 * Run AFTER the smoke-test-mainnet.ts read suite passes:
 *   npx hardhat run scripts/smoke-test-disaster-recovery.ts --network hashkeyTestnet
 *
 * On mainnet: each pause/unpause spends ~50K gas (~₹0.005 each).
 * Total cost: ~₹0.04. Validates emergency stop works in production.
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

interface Deployment { network: string; chainId: number; deployer: string; foundation: string; contracts: Record<string, string>; }

async function main() {
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const filename =
    chainId === 177 ? "hashkeyMainnet.json" :
    chainId === 133 ? "hashkeyTestnet-dryrun.json" :
    `chain-${chainId}.json`;
  const dep: Deployment = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", filename), "utf8"));

  console.log("\n─── Disaster Recovery Smoke Test ──────────────────────────────\n");
  console.log("  Chain:", chainId, "  Source:", filename);
  console.log("");

  const [signer] = await ethers.getSigners();
  if (signer.address.toLowerCase() !== dep.deployer.toLowerCase()) {
    throw new Error(`Signer ${signer.address} is not the deployer ${dep.deployer}`);
  }

  const cfUSD = await ethers.getContractAt("CoverFiStablecoin", dep.contracts.CoverFiStablecoin);
  const pool  = await ethers.getContractAt("InsurancePool",     dep.contracts.InsurancePool);
  const pe    = await ethers.getContractAt("PayoutEngine",      dep.contracts.PayoutEngine);
  const bond  = await ethers.getContractAt("IssuerBond",        dep.contracts.IssuerBond);

  let pass = 0, fail = 0;
  const log = (ok: boolean, msg: string) => {
    if (ok) { console.log(`  ✓ ${msg}`); pass++; } else { console.log(`  ✗ ${msg}`); fail++; }
  };

  // cfUSD pause cycle
  console.log("─── cfUSD ────────────────────────────────────────────────────\n");
  await (await cfUSD.pause()).wait();
  log(await cfUSD.paused() === true, "cfUSD.pause() succeeds");
  try {
    await cfUSD.transfer.staticCall(signer.address, 1n);
    log(false, "transfer should revert when paused");
  } catch (e: any) {
    log(String(e.message).includes("Pausable: paused"), "transfer reverts with 'Pausable: paused'");
  }
  await (await cfUSD.unpause()).wait();
  log(await cfUSD.paused() === false, "cfUSD.unpause() restores normal state");

  // InsurancePool pause cycle
  console.log("\n─── InsurancePool ────────────────────────────────────────────\n");
  await (await pool.pause()).wait();
  log(await pool.paused() === true, "InsurancePool.pause() succeeds");
  try {
    await pool.depositSenior.staticCall(ethers.ZeroAddress, 1n);
    log(false, "depositSenior should revert when paused");
  } catch (e: any) {
    log(String(e.message).includes("Pausable: paused"), "depositSenior reverts with 'Pausable: paused'");
  }
  await (await pool.unpause()).wait();
  log(await pool.paused() === false, "InsurancePool.unpause() restores");

  // PayoutEngine pause cycle
  console.log("\n─── PayoutEngine ─────────────────────────────────────────────\n");
  await (await pe.pause()).wait();
  log(await pe.paused() === true, "PayoutEngine.pause() succeeds");
  try {
    await pe.purchaseCoverage.staticCall(ethers.ZeroAddress, 1n);
    log(false, "purchaseCoverage should revert when paused");
  } catch (e: any) {
    log(String(e.message).includes("Pausable: paused"), "purchaseCoverage reverts with 'Pausable: paused'");
  }
  await (await pe.unpause()).wait();
  log(await pe.paused() === false, "PayoutEngine.unpause() restores");

  // IssuerBond pause cycle
  console.log("\n─── IssuerBond ───────────────────────────────────────────────\n");
  await (await bond.pause()).wait();
  log(await bond.paused() === true, "IssuerBond.pause() succeeds");
  try {
    await bond.deposit.staticCall(ethers.ZeroAddress, 1n, 1n);
    log(false, "deposit should revert when paused");
  } catch (e: any) {
    log(String(e.message).includes("Pausable: paused"), "deposit reverts with 'Pausable: paused'");
  }
  await (await bond.unpause()).wait();
  log(await bond.paused() === false, "IssuerBond.unpause() restores");

  // Independence check
  console.log("\n─── Pause Independence ──────────────────────────────────────\n");
  await (await pool.pause()).wait();
  log(await pe.paused() === false, "Pausing pool does NOT pause PayoutEngine");
  log(await bond.paused() === false, "Pausing pool does NOT pause IssuerBond");
  log(await cfUSD.paused() === false, "Pausing pool does NOT pause cfUSD");
  await (await pool.unpause()).wait();

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(`  Total: ${pass + fail}   ✓ Pass: ${pass}   ✗ Fail: ${fail}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  if (fail > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
