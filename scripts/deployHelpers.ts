/**
 * Pure, unit-testable helpers extracted from scripts/deploy.ts.
 * Keeping the chainId→filename map and the testnet safety gate here lets us
 * test them with BVA/EP without spinning up a network.
 */

// Chains on which deploy.ts (which deploys MOCKS) must refuse to run.
export const MAINNET_CHAIN_IDS: number[] = [56, 177, 5000];

/**
 * Map a chainId to the deployment-output filename.
 * Unknown chains fall back to "localhost.json".
 */
export function deploymentFilename(chainId: bigint): string {
  return chainId === 97n ? "bscTestnet.json" :
         chainId === 56n ? "bscMainnet.json" :
         chainId === 133n ? "hashkeyTestnet.json" :
         chainId === 177n ? "hashkeyMainnet.json" :
         chainId === 5003n ? "mantleSepolia.json" :
         chainId === 5000n ? "mantleMainnet.json" :
         "localhost.json";
}

/**
 * Throw if the chain is a mainnet — deploy.ts deploys mock contracts and must
 * never touch mainnet. Use scripts/deploy-mainnet.ts for real mainnets.
 */
export function assertTestnetOnly(chainId: number): void {
  if (MAINNET_CHAIN_IDS.includes(chainId)) {
    throw new Error(
      `❌ deploy.ts deploys mock contracts and is for TESTNET ONLY.\n` +
      `   You ran it on chain ${chainId} (mainnet). Refusing to proceed.\n` +
      `   Use: npx hardhat run scripts/deploy-mainnet.ts --network <mainnet>`
    );
  }
}
