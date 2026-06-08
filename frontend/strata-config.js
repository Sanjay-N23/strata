// Strata frontend config.
// REPLAY MODE works with no config. To enable LIVE mode, deploy to Mantle Sepolia
//   npx hardhat run scripts/deploy.ts --network mantleSepolia
// then copy the addresses from deployments/mantleSepolia.json into `addresses` below.
window.STRATA_CONFIG = {
  netTag: "Mantle Sepolia · 5003",
  rpc: "https://rpc.sepolia.mantle.xyz",
  explorer: "https://explorer.sepolia.mantle.xyz",
  addresses: {
    // StrataAIAgent:   "0x...",
    // TuringBenchmark: "0x...",
    // IRSOracle:       "0x...",
    // ReplayOracle:    "0x..."
  }
};
