import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import { loadDeployment, getContracts } from "../../agent/chain";

/**
 * ============================================================================
 *  agent/chain.ts — ethers/typechain wiring (EXHAUSTIVE, offline)
 * ============================================================================
 *  ethers providers/wallets and typechain .connect() do NOT touch the network
 *  on construction, so getContracts() is unit-testable offline using the
 *  localhost.json produced by the deploy dry-run.
 *
 *  Methods: EP (key present/zero/missing, RPC explicit/localhost/default,
 *  network present/missing), plus wiring assertions (addresses + signer).
 * ============================================================================
 */

const PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // hardhat acct #0
const ADDR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const ZERO_PK = "0x" + "0".repeat(64);
const localhostPath = path.join(__dirname, "..", "..", "deployments", "localhost.json");
const hasLocalhost = fs.existsSync(localhostPath);
const providerUrl = (c: any) => (c.provider as any)._getConnection().url as string;

describe("agent/chain", function () {
  const saved: Record<string, string | undefined> = {};
  beforeEach(function () {
    for (const k of ["DEPLOYER_PRIVATE_KEY", "NETWORK", "RPC_URL"]) { saved[k] = process.env[k]; delete process.env[k]; }
  });
  afterEach(function () {
    for (const k of ["DEPLOYER_PRIVATE_KEY", "NETWORK", "RPC_URL"]) {
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    }
  });

  // ── M0: loadDeployment ────────────────────────────────────────────────
  describe("M0 · loadDeployment", function () {
    it("loads an existing deployment with a .contracts map", function () {
      if (!hasLocalhost) this.skip();
      const d = loadDeployment("localhost");
      expect(d).to.have.property("contracts");
      expect(d.contracts).to.include.keys(["StrataAIAgent", "IRSOracle", "ReplayOracle", "TuringBenchmark", "DefaultOracle"]);
    });
    it("throws a helpful error for a missing network file", function () {
      expect(() => loadDeployment("no-such-network")).to.throw("No deployment file");
    });
  });

  // ── M1: DEPLOYER_PRIVATE_KEY validation (EP) ──────────────────────────
  describe("M1 · key validation", function () {
    it("missing key → throws", function () {
      process.env.NETWORK = "localhost";
      expect(() => getContracts()).to.throw("Set DEPLOYER_PRIVATE_KEY");
    });
    it("all-zero key → throws", function () {
      process.env.NETWORK = "localhost";
      process.env.DEPLOYER_PRIVATE_KEY = ZERO_PK;
      expect(() => getContracts()).to.throw("Set DEPLOYER_PRIVATE_KEY");
    });
    it("valid key → no throw", function () {
      if (!hasLocalhost) this.skip();
      process.env.NETWORK = "localhost";
      process.env.DEPLOYER_PRIVATE_KEY = PK;
      expect(() => getContracts()).to.not.throw();
    });
  });

  // ── M2: RPC selection (EP) ────────────────────────────────────────────
  describe("M2 · RPC selection", function () {
    beforeEach(() => { process.env.DEPLOYER_PRIVATE_KEY = PK; });
    it("explicit RPC_URL is used", function () {
      if (!hasLocalhost) this.skip();
      process.env.NETWORK = "localhost";
      process.env.RPC_URL = "https://custom.rpc.example/abc";
      expect(providerUrl(getContracts())).to.equal("https://custom.rpc.example/abc");
    });
    it("localhost default RPC → 127.0.0.1:8545", function () {
      if (!hasLocalhost) this.skip();
      process.env.NETWORK = "localhost";
      expect(providerUrl(getContracts())).to.contain("127.0.0.1:8545");
    });
  });

  // ── M3: contract wiring ───────────────────────────────────────────────
  describe("M3 · contract wiring", function () {
    beforeEach(() => { process.env.DEPLOYER_PRIVATE_KEY = PK; process.env.NETWORK = "localhost"; });
    it("connects all 5 contracts to the deployed addresses + the signer", async function () {
      if (!hasLocalhost) this.skip();
      const d = loadDeployment("localhost").contracts;
      const c = getContracts();
      expect(await c.agent.getAddress()).to.equal(d.StrataAIAgent);
      expect(await c.oracle.getAddress()).to.equal(d.IRSOracle);
      expect(await c.replay.getAddress()).to.equal(d.ReplayOracle);
      expect(await c.bench.getAddress()).to.equal(d.TuringBenchmark);
      expect(await c.defaultOracle.getAddress()).to.equal(d.DefaultOracle);
      expect(c.signer.address).to.equal(ADDR);
      expect(c.network).to.equal("localhost");
    });
  });

  // ── M4: network default ───────────────────────────────────────────────
  describe("M4 · network default", function () {
    beforeEach(() => { process.env.DEPLOYER_PRIVATE_KEY = PK; });
    it("defaults to mantleSepolia when NETWORK is unset", function () {
      const mantlePath = path.join(__dirname, "..", "..", "deployments", "mantleSepolia.json");
      if (fs.existsSync(mantlePath)) {
        // if a mantle deployment exists, the default resolves cleanly
        expect(() => getContracts()).to.not.throw();
      } else {
        // otherwise the error names the default network's file — proving the default
        expect(() => getContracts()).to.throw("mantleSepolia.json");
      }
    });
  });
});
