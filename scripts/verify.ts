import { run } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const network = process.env.HARDHAT_NETWORK || "bscTestnet";
  const filename = network === "bscMainnet" ? "bscMainnet.json" :
                   network === "hashkeyTestnet" ? "hashkeyTestnet.json" :
                   "bscTestnet.json";
  const deployFile = path.join(__dirname, "..", "deployments", filename);

  if (!fs.existsSync(deployFile)) {
    console.error(`No deployment file found at ${deployFile}. Run deploy.ts first.`);
    return;
  }

  const deployment = JSON.parse(fs.readFileSync(deployFile, "utf-8"));
  const contracts = deployment.contracts;
  const deployer = deployment.deployer;
  const foundation = deployment.foundation;

  console.log("═══════════════════════════════════════════════════");
  console.log("  STRATA — BNBScan Contract Verification");
  console.log(`  Network: ${network}`);
  console.log("═══════════════════════════════════════════════════\n");

  const verifications: Array<{
    name: string;
    address: string;
    constructorArguments: any[];
  }> = [
    { name: "MockUSDT", address: contracts.MockUSDT, constructorArguments: [] },
    { name: "MockIdentityRegistry", address: contracts.MockIdentityRegistry, constructorArguments: [] },
    {
      name: "MockERC3643Token",
      address: contracts.MockERC3643Token,
      constructorArguments: ["Mock RWA Token", "mRWA", contracts.MockIdentityRegistry],
    },
    { name: "MockBASAttestation", address: contracts.MockBAS, constructorArguments: [] },
    { name: "MockChainlinkPoR", address: contracts.MockChainlink, constructorArguments: [] },
    { name: "TIR", address: contracts.TIR, constructorArguments: [] },
    {
      name: "IssuerBond",
      address: contracts.IssuerBond,
      constructorArguments: [contracts.MockUSDT, deployer],
    },
    { name: "IRSOracle", address: contracts.IRSOracle, constructorArguments: [] },
    {
      name: "DefaultOracle",
      address: contracts.DefaultOracle,
      constructorArguments: [contracts.TIR],
    },
    {
      name: "IssuerRegistry",
      address: contracts.IssuerRegistry,
      constructorArguments: [contracts.TIR, contracts.IssuerBond, contracts.IRSOracle, contracts.DefaultOracle],
    },
    {
      name: "InsurancePool",
      address: contracts.InsurancePool,
      constructorArguments: [contracts.MockUSDT, deployer],
    },
    {
      name: "srCVR",
      address: contracts.srCVR,
      constructorArguments: [contracts.InsurancePool, contracts.MockUSDT],
    },
    {
      name: "jrCVR",
      address: contracts.jrCVR,
      constructorArguments: [contracts.InsurancePool, contracts.MockUSDT],
    },
    { name: "ProtectionCert", address: contracts.ProtectionCert, constructorArguments: [] },
    {
      name: "PayoutEngine",
      address: contracts.PayoutEngine,
      constructorArguments: [contracts.MockUSDT, foundation],
    },
    {
      name: "SubrogationNFT",
      address: contracts.SubrogationNFT,
      constructorArguments: [contracts.PayoutEngine, foundation],
    },
  ];

  let verified = 0;
  let failed = 0;

  for (const v of verifications) {
    try {
      console.log(`Verifying ${v.name} at ${v.address}...`);
      await run("verify:verify", {
        address: v.address,
        constructorArguments: v.constructorArguments,
      });
      console.log(`  ✅ ${v.name} verified\n`);
      verified++;
    } catch (error: any) {
      if (error.message.includes("Already Verified") || error.message.includes("already verified")) {
        console.log(`  ✅ ${v.name} already verified\n`);
        verified++;
      } else {
        console.log(`  ❌ ${v.name} failed: ${error.message}\n`);
        failed++;
      }
    }
  }

  console.log("═══════════════════════════════════════════════════");
  console.log(`  Verified: ${verified} | Failed: ${failed}`);
  console.log("═══════════════════════════════════════════════════\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
