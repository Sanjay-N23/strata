import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { deploymentFilename } from "./deployHelpers";

// Settle the Turing benchmark against ground truth (owner-only).
// Usage: ISSUER_ADDRESS=0x... npx hardhat run scripts/strata-resolve.ts --network <net>
async function main() {
  const issuer = process.env.ISSUER_ADDRESS;
  if (!issuer) throw new Error("Set ISSUER_ADDRESS.");

  const fname = deploymentFilename((await ethers.provider.getNetwork()).chainId);

  const d = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", fname), "utf8"));
  const dataset = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "agent", "data", "usdc_svb.json"), "utf8")
  );

  const bench = await ethers.getContractAt("TuringBenchmark", d.contracts.TuringBenchmark);
  const tx = await bench.resolve(issuer, dataset.event.defaulted, dataset.event.eventEpoch);
  await tx.wait();

  const res = await bench.resolutions(issuer);
  const [ai, stat, avg] = await bench.tally();
  console.log(`Resolved ${issuer}`);
  console.log(`  AI lead: ${res.aiLeadEpochs} epochs | static lead: ${res.staticLeadEpochs} | winner: ${res.winner === 1n ? "AI" : res.winner === 2n ? "static" : "tie"}`);
  console.log(`  Tally — AI wins: ${ai}, static wins: ${stat}, avg lead delta: ${avg} epochs`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
