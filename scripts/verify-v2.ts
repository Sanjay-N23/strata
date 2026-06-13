import hre from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const deploymentPath = path.join(__dirname, "..", "deployments", "bscTestnet.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  const c = deployment.contracts;
  const deployer = deployment.deployer;
  const foundation = deployment.foundation;
  const usdtAddress = c.MockUSDT;

  console.log("Strata Contract Verification on BSC Testnet");
  console.log("=============================================");
  console.log(`Deployer: ${deployer}`);
  console.log(`Foundation: ${foundation}`);
  console.log(`USDT: ${usdtAddress}`);
  console.log("");

  interface VerifyTask {
    name: string;
    address: string;
    constructorArguments: any[];
    contract?: string;
  }

  // Constructor args exactly match deploy.ts
  const tasks: VerifyTask[] = [
    // --- Mock contracts ---
    // MockUSDT.deploy() - no args
    { name: "MockUSDT", address: c.MockUSDT, constructorArguments: [] },

    // MockIdentityRegistry.deploy() - no args
    { name: "MockIdentityRegistry", address: c.MockIdentityRegistry, constructorArguments: [] },

    // MockERC3643Token.deploy("Mock RWA Token", "mRWA", addresses.MockIdentityRegistry)
    {
      name: "MockERC3643Token",
      address: c.MockERC3643Token,
      constructorArguments: ["Mock RWA Token", "mRWA", c.MockIdentityRegistry],
    },

    // MockBASAttestation.deploy() - no args
    {
      name: "MockBASAttestation",
      address: c.MockBAS,
      constructorArguments: [],
      contract: "contracts/mocks/MockBASAttestation.sol:MockBASAttestation",
    },

    // MockChainlinkPoR.deploy() - no args
    {
      name: "MockChainlinkPoR",
      address: c.MockChainlink,
      constructorArguments: [],
      contract: "contracts/mocks/MockChainlinkPoR.sol:MockChainlinkPoR",
    },

    // --- Core contracts ---
    // TIR.deploy() - no args
    { name: "TIR", address: c.TIR, constructorArguments: [] },

    // IssuerBond.deploy(usdtAddress, deployer.address)
    {
      name: "IssuerBond",
      address: c.IssuerBond,
      constructorArguments: [usdtAddress, deployer],
    },

    // IRSOracle.deploy() - no args
    { name: "IRSOracle", address: c.IRSOracle, constructorArguments: [] },

    // DefaultOracle.deploy(addresses.TIR)
    {
      name: "DefaultOracle",
      address: c.DefaultOracle,
      constructorArguments: [c.TIR],
    },

    // IssuerRegistry.deploy(addresses.TIR, addresses.IssuerBond, addresses.IRSOracle, addresses.DefaultOracle)
    {
      name: "IssuerRegistry",
      address: c.IssuerRegistry,
      constructorArguments: [c.TIR, c.IssuerBond, c.IRSOracle, c.DefaultOracle],
    },

    // InsurancePool.deploy(usdtAddress, deployer.address)
    {
      name: "InsurancePool",
      address: c.InsurancePool,
      constructorArguments: [usdtAddress, deployer],
    },

    // srCVR.deploy(addresses.InsurancePool, usdtAddress)
    {
      name: "srCVR",
      address: c.srCVR,
      constructorArguments: [c.InsurancePool, usdtAddress],
    },

    // jrCVR.deploy(addresses.InsurancePool, usdtAddress)
    {
      name: "jrCVR",
      address: c.jrCVR,
      constructorArguments: [c.InsurancePool, usdtAddress],
    },

    // ProtectionCert.deploy() - no args
    { name: "ProtectionCert", address: c.ProtectionCert, constructorArguments: [] },

    // PayoutEngine.deploy(usdtAddress, foundation)
    {
      name: "PayoutEngine",
      address: c.PayoutEngine,
      constructorArguments: [usdtAddress, foundation],
    },

    // SubrogationNFT.deploy(addresses.PayoutEngine, foundation)
    {
      name: "SubrogationNFT",
      address: c.SubrogationNFT,
      constructorArguments: [c.PayoutEngine, foundation],
    },
  ];

  let verified = 0;
  let skipped = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const task of tasks) {
    console.log(`\n[${verified + skipped + failed + 1}/${tasks.length}] Verifying ${task.name} at ${task.address}`);
    console.log(`  Constructor args: ${JSON.stringify(task.constructorArguments)}`);

    try {
      const verifyArgs: any = {
        address: task.address,
        constructorArguments: task.constructorArguments,
      };
      if (task.contract) {
        verifyArgs.contract = task.contract;
      }
      await hre.run("verify:verify", verifyArgs);
      console.log(`  [OK] ${task.name} verified successfully`);
      verified++;
    } catch (error: any) {
      const msg = error.message || String(error);
      if (msg.includes("Already Verified") || msg.includes("already verified")) {
        console.log(`  [SKIP] ${task.name} already verified`);
        skipped++;
      } else {
        console.error(`  [FAIL] ${task.name}: ${msg.slice(0, 200)}`);
        failures.push(`${task.name}: ${msg.slice(0, 150)}`);
        failed++;
      }
    }

    // Rate-limit delay to avoid BscScan API throttling
    await sleep(3000);
  }

  console.log("\n========================================");
  console.log("  VERIFICATION SUMMARY");
  console.log("========================================");
  console.log(`  Verified:  ${verified}`);
  console.log(`  Skipped:   ${skipped} (already verified)`);
  console.log(`  Failed:    ${failed}`);
  console.log(`  Total:     ${tasks.length}`);

  if (failures.length > 0) {
    console.log("\n  Failures:");
    failures.forEach((f) => console.log(`    - ${f}`));
  }

  console.log("========================================\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
