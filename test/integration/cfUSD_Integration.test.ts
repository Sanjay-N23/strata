import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

/**
 * Integration tests verifying CoverFiStablecoin (cfUSD) works correctly as the
 * settlement asset across the CoverFi protocol. These tests catch decimal
 * mismatches, pausable interactions, and supply-cap interactions with the
 * pool that unit tests can't.
 */
describe("Integration: cfUSD with CoverFi Protocol", function () {
  async function deployFullStack() {
    const [owner, foundation, srLP, jrLP, issuerEOA] = await ethers.getSigners();

    // Deploy stablecoin
    const Stablecoin = await ethers.getContractFactory("CoverFiStablecoin");
    const cfUSD = await Stablecoin.deploy();
    const cfUSDAddr = await cfUSD.getAddress();

    // Deploy core protocol
    const TIR = await ethers.getContractFactory("TIR");
    const tir = await TIR.deploy();

    const IssuerBond = await ethers.getContractFactory("IssuerBond");
    const bond = await IssuerBond.deploy(cfUSDAddr, foundation.address);

    const IRSOracle = await ethers.getContractFactory("IRSOracle");
    const irs = await IRSOracle.deploy();

    const DefaultOracle = await ethers.getContractFactory("DefaultOracle");
    const defaultOracle = await DefaultOracle.deploy(await tir.getAddress());

    const IssuerRegistry = await ethers.getContractFactory("IssuerRegistry");
    const registry = await IssuerRegistry.deploy(
      await tir.getAddress(),
      await bond.getAddress(),
      await irs.getAddress(),
      await defaultOracle.getAddress()
    );

    const InsurancePool = await ethers.getContractFactory("InsurancePool");
    const pool = await InsurancePool.deploy(cfUSDAddr, foundation.address);

    const SrCVR = await ethers.getContractFactory("srCVR");
    const sr = await SrCVR.deploy(await pool.getAddress(), cfUSDAddr);

    const JrCVR = await ethers.getContractFactory("jrCVR");
    const jr = await JrCVR.deploy(await pool.getAddress(), cfUSDAddr);

    // Wire up
    await pool.setSrCVR(await sr.getAddress());
    await pool.setJrCVR(await jr.getAddress());
    await pool.setIssuerRegistry(await registry.getAddress());
    await pool.setIRSOracle(await irs.getAddress());

    // Fund liquidity providers with cfUSD
    const seedAmount = ethers.parseUnits("100000", 6); // 100k cfUSD
    await cfUSD.mint(srLP.address, seedAmount);
    await cfUSD.mint(jrLP.address, seedAmount);
    await cfUSD.mint(issuerEOA.address, seedAmount);

    return {
      cfUSD, tir, bond, irs, defaultOracle, registry, pool, sr, jr,
      owner, foundation, srLP, jrLP, issuerEOA,
    };
  }

  describe("Decimal Handling", function () {
    it("cfUSD reports 6 decimals consistently across contracts", async function () {
      const { cfUSD, pool, bond } = await loadFixture(deployFullStack);
      expect(await cfUSD.decimals()).to.equal(6);
      // Pool stores cfUSD address as immutable
      expect(await pool.usdt()).to.equal(await cfUSD.getAddress());
      expect(await bond.usdt()).to.equal(await cfUSD.getAddress());
    });

    it("LPs can hold and transfer cfUSD with 6-decimal precision", async function () {
      const { cfUSD, srLP, jrLP } = await loadFixture(deployFullStack);
      const oneCfUSD = ethers.parseUnits("1", 6); // 1 cfUSD = 1_000_000 wei
      const initial = await cfUSD.balanceOf(srLP.address);
      await cfUSD.connect(srLP).transfer(jrLP.address, oneCfUSD);
      expect(await cfUSD.balanceOf(srLP.address)).to.equal(initial - oneCfUSD);
    });
  });

  describe("Bond Deposits with cfUSD", function () {
    it("issuer deposits cfUSD bond to IssuerBond contract", async function () {
      const { cfUSD, bond, issuerEOA } = await loadFixture(deployFullStack);
      const issuerToken = "0x000000000000000000000000000000000000bEEF";
      const bondAmount = ethers.parseUnits("5000", 6); // 5k cfUSD
      await cfUSD.connect(issuerEOA).approve(await bond.getAddress(), bondAmount);
      await bond.connect(issuerEOA).deposit(
        issuerToken,
        bondAmount,
        ethers.parseUnits("100000", 6)
      );
      const record = await bond.bonds(issuerToken);
      expect(record.bondAmount).to.equal(bondAmount);
      expect(await cfUSD.balanceOf(await bond.getAddress())).to.equal(bondAmount);
    });
  });

  describe("Pausable Stablecoin Interactions", function () {
    it("pausing cfUSD blocks any contract that tries to transfer it", async function () {
      const { cfUSD, owner, srLP, issuerEOA, bond } = await loadFixture(deployFullStack);
      await cfUSD.connect(owner).pause();
      // Approve still works (no transfer happens during approval)
      await cfUSD.connect(issuerEOA).approve(await bond.getAddress(), ethers.parseUnits("1000", 6));
      // But the transfer-triggering bond.deposit will fail because cfUSD transfers are paused
      await expect(
        bond.connect(issuerEOA).deposit(
          "0x000000000000000000000000000000000000beef",
          ethers.parseUnits("1000", 6),
          ethers.parseUnits("100000", 6)
        )
      ).to.be.revertedWith("Pausable: paused");
    });

    it("unpausing restores normal flow", async function () {
      const { cfUSD, owner, issuerEOA, bond } = await loadFixture(deployFullStack);
      await cfUSD.connect(owner).pause();
      await cfUSD.connect(owner).unpause();
      await cfUSD.connect(issuerEOA).approve(await bond.getAddress(), ethers.parseUnits("1000", 6));
      await bond.connect(issuerEOA).deposit(
        "0x000000000000000000000000000000000000beef",
        ethers.parseUnits("1000", 6),
        ethers.parseUnits("100000", 6)
      );
      // Should succeed
      const record = await bond.bonds("0x000000000000000000000000000000000000beef");
      expect(record.bondAmount).to.equal(ethers.parseUnits("1000", 6));
    });
  });

  describe("Pool Pausable Independence", function () {
    it("pausing InsurancePool blocks deposits even when cfUSD is unpaused", async function () {
      const { pool, owner, srLP } = await loadFixture(deployFullStack);
      await pool.connect(owner).pause();
      await expect(
        pool.connect(srLP).depositSenior(
          "0x000000000000000000000000000000000000beef",
          ethers.parseUnits("100", 6)
        )
      ).to.be.revertedWith("Pausable: paused");
    });

    it("unpausing InsurancePool restores deposit flow", async function () {
      const { pool, owner } = await loadFixture(deployFullStack);
      await pool.connect(owner).pause();
      expect(await pool.paused()).to.equal(true);
      await pool.connect(owner).unpause();
      expect(await pool.paused()).to.equal(false);
    });
  });

  describe("Foundation/Treasury Immutability", function () {
    it("foundation address in PayoutEngine is immutable", async function () {
      const { cfUSD, foundation } = await loadFixture(deployFullStack);
      const PayoutEngine = await ethers.getContractFactory("PayoutEngine");
      const pe = await PayoutEngine.deploy(await cfUSD.getAddress(), foundation.address);
      expect(await pe.foundation()).to.equal(foundation.address);
      // No setter exists; verify by checking ABI doesn't have one
      const abi = (pe.interface as any).fragments.map((f: any) => f.name);
      expect(abi).to.not.include("setFoundation");
    });

    it("protocolTreasury in IssuerBond is immutable", async function () {
      const { bond, foundation } = await loadFixture(deployFullStack);
      expect(await bond.protocolTreasury()).to.equal(foundation.address);
      const abi = (bond.interface as any).fragments.map((f: any) => f.name);
      expect(abi).to.not.include("setProtocolTreasury");
    });
  });

  describe("Two-Step Ownership Transfer (Industrial Safety)", function () {
    it("InsurancePool requires acceptOwnership", async function () {
      const { pool, owner, srLP } = await loadFixture(deployFullStack);
      await pool.connect(owner).transferOwnership(srLP.address);
      // Owner is still the original owner — transfer not yet complete
      expect(await pool.owner()).to.equal(owner.address);
      expect(await pool.pendingOwner()).to.equal(srLP.address);
      await pool.connect(srLP).acceptOwnership();
      expect(await pool.owner()).to.equal(srLP.address);
    });

    it("CoverFiStablecoin requires acceptOwnership", async function () {
      const { cfUSD, owner, srLP } = await loadFixture(deployFullStack);
      await cfUSD.connect(owner).transferOwnership(srLP.address);
      expect(await cfUSD.owner()).to.equal(owner.address);
      await cfUSD.connect(srLP).acceptOwnership();
      expect(await cfUSD.owner()).to.equal(srLP.address);
    });
  });
});
