/**
 * Quick pre-flight balance and network sanity check before mainnet deployment.
 *
 * Run:
 *   npx hardhat run scripts/check-balance.ts --network hashkeyMainnet
 *   npx hardhat run scripts/check-balance.ts --network hashkeyTestnet
 */

import { ethers } from "hardhat";

const RECOMMENDED_HSK = ethers.parseEther("0.10"); // 10x safety margin

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  console.log("\n─── Pre-Flight Check ──────────────────────────────────────────\n");
  console.log("  Deployer wallet:  ", deployer.address);
  console.log("  Network name:     ", network.name);
  console.log("  Chain ID:         ", chainId);

  // Network identification
  const networkLabel =
    chainId === 177 ? "HashKey Chain Mainnet" :
    chainId === 133 ? "HashKey Chain Testnet" :
    `Unknown chain (${chainId})`;
  console.log("  Network label:    ", networkLabel);

  // Block height (confirms RPC is healthy)
  const blockNumber = await ethers.provider.getBlockNumber();
  console.log("  Latest block:     ", blockNumber.toLocaleString());

  // Gas price
  const feeData = await ethers.provider.getFeeData();
  const gasPriceGwei = ethers.formatUnits(feeData.gasPrice ?? 0n, "gwei");
  console.log("  Gas price:        ", gasPriceGwei, "gwei");

  // Balance
  const balance = await ethers.provider.getBalance(deployer.address);
  const balanceHSK = ethers.formatEther(balance);
  console.log("  Balance:          ", balanceHSK, "HSK");

  // Recommended balance check
  const recommended = ethers.formatEther(RECOMMENDED_HSK);
  console.log("  Recommended min:  ", recommended, "HSK");

  console.log("\n─── Status ────────────────────────────────────────────────────\n");

  if (balance >= RECOMMENDED_HSK) {
    console.log("  ✓ Ready to deploy. Balance comfortably exceeds the recommended minimum.");
  } else if (balance > 0n) {
    const shortfall = ethers.formatEther(RECOMMENDED_HSK - balance);
    console.log(`  ⚠️  Balance below recommended minimum. Shortfall: ${shortfall} HSK.`);
    console.log("     You may still succeed, but recommended to top up first.");
  } else {
    console.log("  ❌ Wallet has zero balance. Cannot deploy.");
    console.log(`     Send HSK to: ${deployer.address}`);
  }

  // Cost projection
  console.log("\n─── Estimated Mainnet Deployment Cost ─────────────────────────\n");
  // Rough estimate: 12 contracts × avg 2.5M gas + 25 wiring × 50K gas = 31.25M gas
  const estimatedGas = 31_250_000n;
  if (feeData.gasPrice) {
    const estimatedCost = feeData.gasPrice * estimatedGas;
    const estimatedHSK = ethers.formatEther(estimatedCost);
    console.log(`  Estimated gas:     ~${estimatedGas.toLocaleString()} units`);
    console.log(`  Estimated cost:    ~${estimatedHSK} HSK`);
  }

  console.log("");
}

main().catch((error) => {
  console.error("Pre-flight check failed:", error);
  process.exitCode = 1;
});
