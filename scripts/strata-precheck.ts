import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Read-only state check on Mantle Sepolia before running the live agent.
async function main() {
  const dep = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployments", "mantleSepolia.json"), "utf8")
  );
  const c = dep.contracts;
  const net = await ethers.provider.getNetwork();
  const [signer] = await ethers.getSigners();

  const bench = await ethers.getContractAt("TuringBenchmark", c.TuringBenchmark);
  const agent = await ethers.getContractAt("StrataAIAgent", c.StrataAIAgent);

  const [ai, stat, avg] = await bench.tally();
  const demo = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
  const [rc, rt] = await agent.reputation();

  console.log(`Network:            chainId ${net.chainId}`);
  console.log(`Signer (deployer):  ${signer.address}`);
  console.log(`---- TuringBenchmark ----`);
  console.log(`tally:              AI ${ai} / static ${stat} / avgLead ${avg}`);
  console.log(`resolvedCount:      ${await bench.resolvedCount()}`);
  console.log(`demo issuer:        ${demo}`);
  console.log(`  resolved:         ${await bench.isResolved(demo)}`);
  console.log(`  recordCount:      ${await bench.recordCount(demo)}`);
  console.log(`---- StrataAIAgent ----`);
  console.log(`agentOperator:      ${await agent.agentOperator()}`);
  console.log(`paused:             ${await agent.paused()}`);
  console.log(`erc8004Registry:    ${await agent.erc8004Registry()}`);
  console.log(`scoresSubmitted:    ${await agent.scoresSubmitted()}`);
  console.log(`reputation:         ${rc}/${rt}`);
  console.log(`---- candidate issuers ----`);
  const tok = c.MockERC3643Token;
  console.log(`MockERC3643Token:   ${tok}`);
  console.log(`  resolved:         ${await bench.isResolved(tok)}`);
  console.log(`  recordCount:      ${await bench.recordCount(tok)}`);
  const ls = await agent.latestScore(tok);
  console.log(`  latestScore:      score=${ls.score} pd=${ls.pdBps} epoch=${ls.epoch}`);
}

main().catch((e) => { console.error("ERROR:", e.message || e); process.exitCode = 1; });
