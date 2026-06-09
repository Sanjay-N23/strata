// Strata frontend config — LIVE on Mantle Sepolia (chainId 5003).
// Deployed 2026-06-09. The console's "Load live tally" reads from these contracts.
window.STRATA_CONFIG = {
  netTag: "Mantle Sepolia · 5003",
  rpc: "https://rpc.sepolia.mantle.xyz",
  explorer: "https://explorer.sepolia.mantle.xyz",
  addresses: {
    StrataAIAgent:   "0xDecE5A5faEBc87E1060C55FA879bE0A645796670",
    TuringBenchmark: "0xDd10c1252795456aC6fb71f5ACfE5ACAB9B43304",
    IRSOracle:       "0xa4ECEB47F80a32D7176C23e4993cDa4d2337Fc3A",
    ReplayOracle:    "0xF66ebe1f553E4D79c89C31E4b4732ADdb8079d6e"
  }
};
