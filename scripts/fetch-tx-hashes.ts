/**
 * Fetches all transactions from the deployer wallet on HashKey Mainnet via
 * Blockscout API, then identifies and labels the deploy + lifecycle txs.
 * Output: deployments/lifecycle-tx-hashes.json
 */

import * as fs from "fs";
import * as path from "path";
import { ethers } from "hardhat";

interface Tx {
  hash: string;
  blockNumber: string;
  timeStamp: string;
  from: string;
  to: string;
  contractAddress: string;
  input: string;
  value: string;
  txreceipt_status: string;
  isError: string;
}

interface ApiResponse {
  message: string;
  result: Tx[];
}

const DEPLOYER = "0xce220d9eD9527f9997c8045844210637F3A42fb3".toLowerCase();
const EXPLORER = "https://hashkey.blockscout.com/tx/";

async function main() {
  const dep = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployments", "hashkeyMainnet.json"), "utf8")
  );
  const contractsByAddr: Record<string, string> = {};
  for (const [name, addr] of Object.entries(dep.contracts) as [string, string][]) {
    contractsByAddr[addr.toLowerCase()] = name;
  }

  console.log("Fetching deployer tx list via Blockscout API...");
  const url = `https://hashkey.blockscout.com/api?module=account&action=txlist&address=${DEPLOYER}&sort=asc`;
  const res = await fetch(url);
  const data = (await res.json()) as ApiResponse;
  if (data.message !== "OK") throw new Error("Blockscout API error: " + JSON.stringify(data).slice(0, 200));

  const txs = data.result.filter((t) => t.from.toLowerCase() === DEPLOYER);
  console.log(`Got ${txs.length} txs from the deployer.\n`);

  // Build method-selector → function-name map by introspecting the ABIs.
  const factories = await Promise.all([
    ethers.getContractFactory("CoverFiStablecoin"),
    ethers.getContractFactory("InsurancePool"),
    ethers.getContractFactory("PayoutEngine"),
    ethers.getContractFactory("IssuerBond"),
    ethers.getContractFactory("IssuerRegistry"),
    ethers.getContractFactory("IRSOracle"),
    ethers.getContractFactory("DefaultOracle"),
    ethers.getContractFactory("TIR"),
    ethers.getContractFactory("ProtectionCert"),
    ethers.getContractFactory("SubrogationNFT"),
    ethers.getContractFactory("srCVR"),
    ethers.getContractFactory("jrCVR"),
  ]);

  const selectorMap: Record<string, string> = {};
  for (const f of factories) {
    f.interface.forEachFunction((frag) => {
      selectorMap[frag.selector] = frag.name;
    });
  }

  // Build readable rows
  const rows: any[] = [];
  for (const t of txs) {
    const isContractCreation = t.contractAddress && t.contractAddress !== "";
    const toAddr = (isContractCreation ? t.contractAddress : t.to).toLowerCase();
    const contractName = contractsByAddr[toAddr] || (isContractCreation ? "(deploy)" : "(unknown)");
    let action: string;
    if (isContractCreation) {
      action = `DEPLOY ${contractName}`;
    } else {
      const sel = t.input.slice(0, 10);
      const fn = selectorMap[sel] || `selector=${sel}`;
      action = `${contractName}.${fn}()`;
    }

    rows.push({
      block: Number(t.blockNumber),
      hash: t.hash,
      contractName,
      action,
      status: t.txreceipt_status === "1" ? "✓" : "✗",
      url: EXPLORER + t.hash,
    });
  }

  // Print all
  console.log(
    "Block       Hash                                                                Action                                       Status"
  );
  console.log("─".repeat(160));
  for (const r of rows) {
    console.log(
      `${String(r.block).padEnd(11)} ${r.hash}  ${r.action.padEnd(45)}  ${r.status}`
    );
  }

  // Save JSON
  const outPath = path.join(__dirname, "..", "deployments", "lifecycle-tx-hashes.json");
  fs.writeFileSync(outPath, JSON.stringify({ deployer: DEPLOYER, fetchedAt: new Date().toISOString(), rows }, null, 2));
  console.log(`\nSaved to ${outPath}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
