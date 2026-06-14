import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { deploymentFilename, assertTestnetOnly } from "./deployHelpers";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  // SAFETY: This script deploys MOCK contracts (MockUSDT, MockBAS, etc).
  // Mocks must NEVER touch mainnet. Use scripts/deploy-mainnet.ts instead.
  assertTestnetOnly(chainId);

  console.log("Deploying Strata Protocol with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  const foundation = process.env.COVERFI_FOUNDATION || deployer.address;
  console.log("Foundation address:", foundation);

  const addresses: Record<string, string> = {};

  // ═══════════════════════════════════════════════════════════════════
  // STEP 1: Deploy Mock Contracts (testnet only)
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n--- Deploying Mock Contracts ---");

  const MockUSDT = await ethers.getContractFactory("MockUSDT");
  const mockUSDT = await MockUSDT.deploy();
  await mockUSDT.waitForDeployment();
  addresses.MockUSDT = await mockUSDT.getAddress();
  console.log("MockUSDT:", addresses.MockUSDT);

  const MockIdentityRegistry = await ethers.getContractFactory("MockIdentityRegistry");
  const mockIdRegistry = await MockIdentityRegistry.deploy();
  await mockIdRegistry.waitForDeployment();
  addresses.MockIdentityRegistry = await mockIdRegistry.getAddress();
  console.log("MockIdentityRegistry:", addresses.MockIdentityRegistry);

  const MockERC3643Token = await ethers.getContractFactory("MockERC3643Token");
  const mockToken = await MockERC3643Token.deploy("Mock RWA Token", "mRWA", addresses.MockIdentityRegistry);
  await mockToken.waitForDeployment();
  addresses.MockERC3643Token = await mockToken.getAddress();
  console.log("MockERC3643Token:", addresses.MockERC3643Token);

  // Named Mantle RWA asset for the AI x RWA track: a testnet-mock of Ondo's USDY
  // (real USDY/mETH are Mantle-mainnet-only). The agent underwrites THIS issuer in
  // the live run, so the demo shows automated risk management of a named RWA asset.
  const mockUSDY = await MockERC3643Token.deploy("Ondo USD Yield (testnet mock)", "USDY", addresses.MockIdentityRegistry);
  await mockUSDY.waitForDeployment();
  addresses.MockUSDY = await mockUSDY.getAddress();
  console.log("MockUSDY (USDY testnet mock):", addresses.MockUSDY);

  const MockBAS = await ethers.getContractFactory("MockBASAttestation");
  const mockBAS = await MockBAS.deploy();
  await mockBAS.waitForDeployment();
  addresses.MockBAS = await mockBAS.getAddress();
  console.log("MockBAS:", addresses.MockBAS);

  const MockChainlink = await ethers.getContractFactory("MockChainlinkPoR");
  const mockChainlink = await MockChainlink.deploy();
  await mockChainlink.waitForDeployment();
  addresses.MockChainlink = await mockChainlink.getAddress();
  console.log("MockChainlink:", addresses.MockChainlink);

  const usdtAddress = addresses.MockUSDT;

  // ═══════════════════════════════════════════════════════════════════
  // STEP 2: Deploy Core Contracts (in dependency order)
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n--- Deploying Core Contracts ---");

  // 2. TIR (no dependencies)
  const TIR = await ethers.getContractFactory("TIR");
  const tir = await TIR.deploy();
  await tir.waitForDeployment();
  addresses.TIR = await tir.getAddress();
  console.log("TIR:", addresses.TIR);

  // 3. IssuerBond (depends: USDT)
  const IssuerBond = await ethers.getContractFactory("IssuerBond");
  const issuerBond = await IssuerBond.deploy(usdtAddress, deployer.address);
  await issuerBond.waitForDeployment();
  addresses.IssuerBond = await issuerBond.getAddress();
  console.log("IssuerBond:", addresses.IssuerBond);

  // 4. IRSOracle
  const IRSOracle = await ethers.getContractFactory("IRSOracle");
  const irsOracle = await IRSOracle.deploy();
  await irsOracle.waitForDeployment();
  addresses.IRSOracle = await irsOracle.getAddress();
  console.log("IRSOracle:", addresses.IRSOracle);

  // 5. DefaultOracle (depends: TIR)
  const DefaultOracle = await ethers.getContractFactory("DefaultOracle");
  const defaultOracle = await DefaultOracle.deploy(addresses.TIR);
  await defaultOracle.waitForDeployment();
  addresses.DefaultOracle = await defaultOracle.getAddress();
  console.log("DefaultOracle:", addresses.DefaultOracle);

  // 6. IssuerRegistry (depends: TIR, IssuerBond, IRSOracle, DefaultOracle)
  const IssuerRegistry = await ethers.getContractFactory("IssuerRegistry");
  const issuerRegistry = await IssuerRegistry.deploy(
    addresses.TIR,
    addresses.IssuerBond,
    addresses.IRSOracle,
    addresses.DefaultOracle
  );
  await issuerRegistry.waitForDeployment();
  addresses.IssuerRegistry = await issuerRegistry.getAddress();
  console.log("IssuerRegistry:", addresses.IssuerRegistry);

  // 7. InsurancePool (depends: USDT)
  const InsurancePool = await ethers.getContractFactory("InsurancePool");
  const insurancePool = await InsurancePool.deploy(usdtAddress, deployer.address);
  await insurancePool.waitForDeployment();
  addresses.InsurancePool = await insurancePool.getAddress();
  console.log("InsurancePool:", addresses.InsurancePool);

  // 8. srCVR (depends: InsurancePool, USDT)
  const SrCVR = await ethers.getContractFactory("srCVR");
  const srCVR = await SrCVR.deploy(addresses.InsurancePool, usdtAddress);
  await srCVR.waitForDeployment();
  addresses.srCVR = await srCVR.getAddress();
  console.log("srCVR:", addresses.srCVR);

  // 9. jrCVR (depends: InsurancePool, USDT)
  const JrCVR = await ethers.getContractFactory("jrCVR");
  const jrCVR = await JrCVR.deploy(addresses.InsurancePool, usdtAddress);
  await jrCVR.waitForDeployment();
  addresses.jrCVR = await jrCVR.getAddress();
  console.log("jrCVR:", addresses.jrCVR);

  // 10. ProtectionCert
  const ProtectionCert = await ethers.getContractFactory("ProtectionCert");
  const protectionCert = await ProtectionCert.deploy();
  await protectionCert.waitForDeployment();
  addresses.ProtectionCert = await protectionCert.getAddress();
  console.log("ProtectionCert:", addresses.ProtectionCert);

  // 11. PayoutEngine (depends: USDT, Foundation)
  const PayoutEngine = await ethers.getContractFactory("PayoutEngine");
  const payoutEngine = await PayoutEngine.deploy(usdtAddress, foundation);
  await payoutEngine.waitForDeployment();
  addresses.PayoutEngine = await payoutEngine.getAddress();
  console.log("PayoutEngine:", addresses.PayoutEngine);

  // 12. SubrogationNFT (depends: PayoutEngine, Foundation)
  const SubrogationNFT = await ethers.getContractFactory("SubrogationNFT");
  const subrogationNFT = await SubrogationNFT.deploy(addresses.PayoutEngine, foundation);
  await subrogationNFT.waitForDeployment();
  addresses.SubrogationNFT = await subrogationNFT.getAddress();
  console.log("SubrogationNFT:", addresses.SubrogationNFT);

  // ═══════════════════════════════════════════════════════════════════
  // STEP 3: Wire Permissions
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n--- Wiring Permissions ---");

  // InsurancePool setters
  await insurancePool.setSrCVR(addresses.srCVR);
  await insurancePool.setJrCVR(addresses.jrCVR);
  await insurancePool.setIssuerRegistry(addresses.IssuerRegistry);
  await insurancePool.setIRSOracle(addresses.IRSOracle);
  await insurancePool.setDefaultOracle(addresses.DefaultOracle);
  await insurancePool.setPayoutEngine(addresses.PayoutEngine);
  console.log("InsurancePool wired");

  // IssuerBond setters
  await issuerBond.setPayoutEngine(addresses.PayoutEngine);
  await issuerBond.setIssuerRegistry(addresses.IssuerRegistry);
  console.log("IssuerBond wired");

  // IRSOracle setters
  await irsOracle.setInsurancePool(addresses.InsurancePool);
  await irsOracle.setPayoutEngine(addresses.PayoutEngine);
  await irsOracle.setKeeper(deployer.address);
  console.log("IRSOracle wired");

  // DefaultOracle setters
  await defaultOracle.setIRSOracle(addresses.IRSOracle);
  await defaultOracle.setInsurancePool(addresses.InsurancePool);
  await defaultOracle.setPayoutEngine(addresses.PayoutEngine);
  await defaultOracle.setIssuerRegistry(addresses.IssuerRegistry);
  console.log("DefaultOracle wired");

  // IssuerRegistry setters
  await issuerRegistry.setInsurancePool(addresses.InsurancePool);
  await issuerRegistry.setPayoutEngine(addresses.PayoutEngine);
  console.log("IssuerRegistry wired");

  // ProtectionCert setters
  await protectionCert.setPayoutEngine(addresses.PayoutEngine);
  console.log("ProtectionCert wired");

  // PayoutEngine setters
  await payoutEngine.setInsurancePool(addresses.InsurancePool);
  await payoutEngine.setDefaultOracle(addresses.DefaultOracle);
  await payoutEngine.setProtectionCert(addresses.ProtectionCert);
  await payoutEngine.setIssuerBond(addresses.IssuerBond);
  await payoutEngine.setSubrogationNFT(addresses.SubrogationNFT);
  await payoutEngine.setIRSOracle(addresses.IRSOracle);
  await payoutEngine.setIssuerRegistry(addresses.IssuerRegistry);
  console.log("PayoutEngine wired");

  console.log("\n✅ All permissions wired successfully!");

  // ═══════════════════════════════════════════════════════════════════
  // STEP 3.5: Deploy Strata AI Layer (Turing Test)
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n--- Deploying Strata AI Layer ---");

  const StrataAIAgent = await ethers.getContractFactory("StrataAIAgent");
  const strataAgent = await StrataAIAgent.deploy(addresses.IRSOracle, addresses.DefaultOracle);
  await strataAgent.waitForDeployment();
  addresses.StrataAIAgent = await strataAgent.getAddress();
  console.log("StrataAIAgent:", addresses.StrataAIAgent);

  const ReplayOracle = await ethers.getContractFactory("ReplayOracle");
  const replayOracle = await ReplayOracle.deploy();
  await replayOracle.waitForDeployment();
  addresses.ReplayOracle = await replayOracle.getAddress();
  console.log("ReplayOracle:", addresses.ReplayOracle);

  const TuringBenchmark = await ethers.getContractFactory("TuringBenchmark");
  const turingBenchmark = await TuringBenchmark.deploy();
  await turingBenchmark.waitForDeployment();
  addresses.TuringBenchmark = await turingBenchmark.getAddress();
  console.log("TuringBenchmark:", addresses.TuringBenchmark);

  // ERC-8004 agent identity. The canonical registry (0x8004A169...432, same CREATE2
  // address on every chain) is deployed on Mantle MAINNET but NOT on this testnet, so
  // we deploy the reference IdentityRegistry here and register the agent against it.
  const IdentityRegistry = await ethers.getContractFactory("IdentityRegistry");
  const identityRegistry = await IdentityRegistry.deploy();
  await identityRegistry.waitForDeployment();
  addresses.IdentityRegistry = await identityRegistry.getAddress();
  console.log("IdentityRegistry (ERC-8004):", addresses.IdentityRegistry);

  // Wire Strata layer. Human gate preserved: the agent can FLAG defaults but only
  // 2-of-3 TIR attestors CONFIRM them. The operator wallet runs the off-chain agent
  // (submitScore + benchmark.record + replay.pushSignals).
  await irsOracle.setStrataAgent(addresses.StrataAIAgent);
  await defaultOracle.setAIProposer(addresses.StrataAIAgent);
  await strataAgent.setBenchmark(addresses.TuringBenchmark);
  await turingBenchmark.setStrataAgent(addresses.StrataAIAgent);
  await turingBenchmark.setRecorder(deployer.address);
  await turingBenchmark.setOracles(addresses.ReplayOracle, addresses.IRSOracle);
  await replayOracle.setReplayKeeper(deployer.address);

  // Register the agent's ERC-8004 identity (agentId == tokenId) and ACTIVATE the
  // onlyAgent identity gate: every submitScore/proposeDefault now requires the operator
  // to own this identity NFT. agentURI resolves to the off-chain agent card.
  const AGENT_CARD_URI = "https://raw.githubusercontent.com/Sanjay-N23/strata/main/agent/agent-card.json";
  await (await identityRegistry.register(AGENT_CARD_URI)).wait();
  const agentId = await identityRegistry.agentCount();
  await strataAgent.setErc8004(addresses.IdentityRegistry, agentId);
  console.log(`Strata AI layer wired (agent + benchmark + replay + on-chain static arm + ERC-8004 identity #${agentId})`);

  // ── Optional role separation (avoid single-key SPOF + benchmark integrity) ──────────
  // The contracts support distinct roles via their setters. When these env vars are set we
  // assign them; otherwise every role stays on the deployer (the demo path, so the seeding
  // run still works). Separating the RECORDER from the agent OPERATOR and the RESOLVER
  // (owner) is what makes the on-chain benchmark record non-fakeable by one key.
  // NOTE: a separate AGENT_OPERATOR also needs the ERC-8004 identity NFT (minted to the
  // deployer above) transferred to it so the onlyAgent identity gate keeps passing. Owner
  // (Ownable2Step) is left on the deployer here — transfer it separately via its 2-step flow.
  if (process.env.BENCHMARK_RECORDER) { await turingBenchmark.setRecorder(process.env.BENCHMARK_RECORDER); console.log("recorder    ->", process.env.BENCHMARK_RECORDER); }
  if (process.env.REPLAY_KEEPER)      { await replayOracle.setReplayKeeper(process.env.REPLAY_KEEPER);     console.log("replayKeeper->", process.env.REPLAY_KEEPER); }
  if (process.env.TREASURY)           { await tir.setTreasury(process.env.TREASURY);                        console.log("treasury    ->", process.env.TREASURY); }
  if (process.env.AGENT_OPERATOR)     { await strataAgent.setAgentOperator(process.env.AGENT_OPERATOR);     console.log("agentOperator->", process.env.AGENT_OPERATOR); } // before guardian (onlyGuardian)
  if (process.env.GUARDIAN)           { await strataAgent.setGuardian(process.env.GUARDIAN);                console.log("guardian    ->", process.env.GUARDIAN); }            // hand off LAST
  if (process.env.BENCHMARK_RECORDER || process.env.REPLAY_KEEPER || process.env.AGENT_OPERATOR || process.env.GUARDIAN || process.env.TREASURY) {
    console.log("Role separation applied from env (SPOF reduced).");
  }

  // ═══════════════════════════════════════════════════════════════════
  // STEP 4: Save Deployment Addresses
  // ═══════════════════════════════════════════════════════════════════
  const deployment = {
    network: network.name,
    chainId: Number(network.chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    foundation: foundation,
    contracts: addresses,
  };

  const deployDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deployDir)) {
    fs.mkdirSync(deployDir, { recursive: true });
  }

  const filename = deploymentFilename(network.chainId);

  fs.writeFileSync(
    path.join(deployDir, filename),
    JSON.stringify(deployment, null, 2)
  );

  console.log(`\n📁 Deployment saved to deployments/${filename}`);
  console.log("\n═══════════════════════════════════════════════");
  console.log("  STRATA PROTOCOL DEPLOYMENT COMPLETE");
  console.log("═══════════════════════════════════════════════");
  console.log(`  Contracts deployed: ${Object.keys(addresses).length}`);
  console.log(`  Network: ${network.name} (Chain ID: ${network.chainId})`);
  console.log("═══════════════════════════════════════════════\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
