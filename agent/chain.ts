/**
 * Chain wiring for the off-chain Strata agent.
 *
 * Uses a standalone ethers v6 provider/wallet (not hardhat) so the agent can run
 * against any deployed network — Mantle Sepolia for the live demo, or a local
 * hardhat node (NETWORK=localhost) using deployments/localhost.json.
 *
 * Typed contracts come from the generated typechain factories.
 */
import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import {
  StrataAIAgent__factory,
  IRSOracle__factory,
  ReplayOracle__factory,
  TuringBenchmark__factory,
  DefaultOracle__factory,
} from "../typechain-types";

export function loadDeployment(network: string): any {
  const p = path.join(__dirname, "..", "deployments", `${network}.json`);
  if (!fs.existsSync(p)) {
    throw new Error(`No deployment file at ${p}. Deploy first (scripts/deploy.ts).`);
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

export function getContracts(network = process.env.NETWORK || "mantleSepolia") {
  const rpc =
    process.env.RPC_URL ||
    (network === "localhost" ? "http://127.0.0.1:8545" : "https://rpc.sepolia.mantle.xyz");
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk || pk === "0x" + "0".repeat(64)) {
    throw new Error("Set DEPLOYER_PRIVATE_KEY in .env to run the agent.");
  }

  const provider = new ethers.JsonRpcProvider(rpc);
  const signer = new ethers.Wallet(pk, provider);
  const c = loadDeployment(network).contracts;

  return {
    signer,
    provider,
    network,
    agent: StrataAIAgent__factory.connect(c.StrataAIAgent, signer),
    oracle: IRSOracle__factory.connect(c.IRSOracle, signer),
    replay: ReplayOracle__factory.connect(c.ReplayOracle, signer),
    bench: TuringBenchmark__factory.connect(c.TuringBenchmark, signer),
    defaultOracle: DefaultOracle__factory.connect(c.DefaultOracle, signer),
  };
}
