import { ethers } from "hardhat";

// Preflight for the Mantle Sepolia deploy: prints the deployer address (NOT the key)
// and its testnet MNT balance. Run: npx hardhat run scripts/check-mantle.ts --network mantleSepolia
async function main() {
  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    console.log("ERROR: no signer — set DEPLOYER_PRIVATE_KEY in .env");
    process.exitCode = 1;
    return;
  }
  const d = signers[0];
  const net = await ethers.provider.getNetwork();
  const bal = await ethers.provider.getBalance(d.address);
  console.log(`Network:  ${net.name} (chainId ${net.chainId})`);
  console.log(`Deployer: ${d.address}`);
  console.log(`Balance:  ${ethers.formatEther(bal)} MNT`);
  console.log(bal === 0n
    ? "STATUS:   NEEDS FUNDING (0 MNT) -> send testnet MNT from the Mantle Sepolia faucet to the address above"
    : "STATUS:   FUNDED, ready to deploy");
}

main().catch((e) => { console.error("ERROR:", e.message || e); process.exitCode = 1; });
