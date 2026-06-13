import { HardhatUserConfig, subtask } from "hardhat/config";
import { TASK_TEST_GET_TEST_FILES } from "hardhat/builtin-tasks/task-names";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

// `hardhat test` / `npm test` (and `hardhat coverage`) must run ONLY the
// Solidity + TS hardhat tests. The Playwright e2e specs (test/e2e/*.spec.js)
// and the standalone node frontend tests (test/frontend/*.test.js) live under
// test/ but use their own runners (`npm run test:e2e` / `test:frontend`);
// loading them under hardhat's mocha crashes the run. Filter them out of
// hardhat's test-file discovery so the runner stays clean and green.
subtask(TASK_TEST_GET_TEST_FILES, async (args, _hre, runSuper) => {
  const files: string[] = await runSuper(args);
  return files.filter((f) => {
    const p = f.replace(/\\/g, "/");
    return !p.includes("/test/e2e/") && !p.includes("/test/frontend/");
  });
});

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "0x" + "0".repeat(64);
const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200, // Production-balanced: small deploy + efficient runtime gas.
      },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    bscTestnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545",
      chainId: 97,
      gasPrice: 10000000000,
      accounts: DEPLOYER_PRIVATE_KEY !== "0x" + "0".repeat(64) ? [DEPLOYER_PRIVATE_KEY] : [],
    },
    bscMainnet: {
      url: "https://bsc-dataseed.binance.org/",
      chainId: 56,
      gasPrice: 3000000000,
      accounts: DEPLOYER_PRIVATE_KEY !== "0x" + "0".repeat(64) ? [DEPLOYER_PRIVATE_KEY] : [],
    },
    hashkeyTestnet: {
      url: "https://testnet.hsk.xyz",
      chainId: 133,
      // Slight bump above network minimum (~0.001 gwei) to overtake any
      // stuck pending tx during retries. Negligible cost on L2.
      gasPrice: 10_000_000, // 0.01 gwei
      accounts: DEPLOYER_PRIVATE_KEY !== "0x" + "0".repeat(64) ? [DEPLOYER_PRIVATE_KEY] : [],
    },
    hashkeyMainnet: {
      url: "https://mainnet.hsk.xyz",
      chainId: 177,
      // Same gas price strategy as testnet. HashKey Mainnet base fee is
      // ~0.001 gwei; 0.01 gwei guarantees prompt inclusion at trivial cost.
      gasPrice: 10_000_000, // 0.01 gwei
      accounts: DEPLOYER_PRIVATE_KEY !== "0x" + "0".repeat(64) ? [DEPLOYER_PRIVATE_KEY] : [],
    },
    // ─── Mantle (Turing Test Hackathon 2026) ───────────────────────
    // Gas is paid in MNT (not ETH). gasPrice omitted: Mantle has an L1 data
    // fee component, so let the provider estimate rather than pin a value.
    mantleSepolia: {
      url: "https://rpc.sepolia.mantle.xyz",
      chainId: 5003,
      accounts: DEPLOYER_PRIVATE_KEY !== "0x" + "0".repeat(64) ? [DEPLOYER_PRIVATE_KEY] : [],
    },
    mantleMainnet: {
      url: "https://rpc.mantle.xyz",
      chainId: 5000,
      accounts: DEPLOYER_PRIVATE_KEY !== "0x" + "0".repeat(64) ? [DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      bscTestnet: BSCSCAN_API_KEY,
      bsc: BSCSCAN_API_KEY,
      // Blockscout doesn't require an API key but hardhat-verify needs a
      // non-empty placeholder. Any string works for Blockscout endpoints.
      hashkeyMainnet: "blockscout-no-key-required",
      hashkeyTestnet: "blockscout-no-key-required",
      mantleMainnet: "blockscout-no-key-required",
      mantleSepolia: "blockscout-no-key-required",
    },
    customChains: [
      {
        network: "mantleMainnet",
        chainId: 5000,
        urls: {
          apiURL: "https://explorer.mantle.xyz/api",
          browserURL: "https://explorer.mantle.xyz",
        },
      },
      {
        network: "mantleSepolia",
        chainId: 5003,
        urls: {
          apiURL: "https://explorer.sepolia.mantle.xyz/api",
          browserURL: "https://explorer.sepolia.mantle.xyz",
        },
      },
      {
        network: "hashkeyMainnet",
        chainId: 177,
        urls: {
          apiURL: "https://hashkey.blockscout.com/api",
          browserURL: "https://hashkey.blockscout.com",
        },
      },
      {
        network: "hashkeyTestnet",
        chainId: 133,
        urls: {
          apiURL: "https://testnet-explorer.hsk.xyz/api",
          browserURL: "https://testnet-explorer.hsk.xyz",
        },
      },
    ],
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
  },
};

export default config;
