import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { IssuerBond, MockUSDT } from "../../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const USDT_AMOUNT = ethers.parseEther("50000"); // 50k USDT bond
const MARKET_CAP = ethers.parseEther("1000000"); // 1M market cap
const WIND_DOWN_FEE_BPS = 50n; // 0.5%

describe("IssuerBond — First-loss Capital", function () {
  // ─── Fixture ───────────────────────────────────────────────────────
  async function deployFixture() {
    const [owner, issuer, payoutEngine, issuerRegistry, treasury, tokenAddr, outsider] =
      await ethers.getSigners();

    // Deploy MockUSDT
    const MockUSDTFactory = await ethers.getContractFactory("MockUSDT");
    const usdt = (await MockUSDTFactory.deploy()) as MockUSDT;

    // Deploy IssuerBond
    const IssuerBondFactory = await ethers.getContractFactory("IssuerBond");
    const bond = (await IssuerBondFactory.deploy(
      await usdt.getAddress(),
      treasury.address
    )) as IssuerBond;

    // Configure roles
    await bond.connect(owner).setPayoutEngine(payoutEngine.address);
    await bond.connect(owner).setIssuerRegistry(issuerRegistry.address);

    // Mint USDT to issuer and approve
    await usdt.mint(issuer.address, ethers.parseEther("1000000"));
    await usdt
      .connect(issuer)
      .approve(await bond.getAddress(), ethers.parseEther("1000000"));

    return { bond, usdt, owner, issuer, payoutEngine, issuerRegistry, treasury, tokenAddr, outsider };
  }

  /** Fixture with a bond already deposited. */
  async function deployWithBondFixture() {
    const base = await deployFixture();
    const { bond, issuer, tokenAddr } = base;

    await bond
      .connect(issuer)
      .deposit(tokenAddr.address, USDT_AMOUNT, MARKET_CAP);

    return base;
  }

  // ═══════════════════════════════════════════════════════════════════
  // 1. Bond Deposit with Correct Amount
  // ═══════════════════════════════════════════════════════════════════
  describe("Bond Deposit", function () {
    it("should accept a valid bond deposit", async function () {
      const { bond, issuer, tokenAddr } = await loadFixture(deployFixture);

      await bond
        .connect(issuer)
        .deposit(tokenAddr.address, USDT_AMOUNT, MARKET_CAP);

      const record = await bond.getBondRecord(tokenAddr.address);
      expect(record.bondAmount).to.equal(USDT_AMOUNT);
      expect(record.marketCapAtDeposit).to.equal(MARKET_CAP);
      expect(record.liquidated).to.be.false;
      expect(record.released).to.be.false;
      expect(record.depositBlock).to.be.gt(0);
    });

    it("should transfer USDT from depositor to contract", async function () {
      const { bond, usdt, issuer, tokenAddr } = await loadFixture(
        deployFixture
      );

      const issuerBalBefore = await usdt.balanceOf(issuer.address);

      await bond
        .connect(issuer)
        .deposit(tokenAddr.address, USDT_AMOUNT, MARKET_CAP);

      const issuerBalAfter = await usdt.balanceOf(issuer.address);
      const contractBal = await usdt.balanceOf(await bond.getAddress());

      expect(issuerBalBefore - issuerBalAfter).to.equal(USDT_AMOUNT);
      expect(contractBal).to.equal(USDT_AMOUNT);
    });

    it("should track bond amount via getBond view", async function () {
      const { bond, issuer, tokenAddr } = await loadFixture(deployFixture);

      await bond
        .connect(issuer)
        .deposit(tokenAddr.address, USDT_AMOUNT, MARKET_CAP);

      expect(await bond.getBond(tokenAddr.address)).to.equal(USDT_AMOUNT);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 2. Duplicate Bond Deposit Rejection
  // ═══════════════════════════════════════════════════════════════════
  describe("Duplicate Bond Deposit Rejection", function () {
    it("should revert if bond already exists for token", async function () {
      const { bond, issuer, tokenAddr } = await loadFixture(
        deployWithBondFixture
      );

      await expect(
        bond
          .connect(issuer)
          .deposit(tokenAddr.address, USDT_AMOUNT, MARKET_CAP)
      ).to.be.revertedWith("IssuerBond: bond exists");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 3. Bond Liquidation by PayoutEngine Only
  // ═══════════════════════════════════════════════════════════════════
  describe("Bond Liquidation", function () {
    it("should allow PayoutEngine to liquidate", async function () {
      const { bond, usdt, payoutEngine, tokenAddr } = await loadFixture(
        deployWithBondFixture
      );

      const result = await bond
        .connect(payoutEngine)
        .liquidate.staticCall(tokenAddr.address);
      expect(result).to.equal(USDT_AMOUNT);

      await bond.connect(payoutEngine).liquidate(tokenAddr.address);

      const record = await bond.getBondRecord(tokenAddr.address);
      expect(record.liquidated).to.be.true;
      expect(record.bondAmount).to.equal(0);

      // USDT transferred to payoutEngine
      expect(await usdt.balanceOf(payoutEngine.address)).to.equal(USDT_AMOUNT);
    });

    it("should revert on double liquidation (bond zeroed)", async function () {
      const { bond, payoutEngine, tokenAddr } = await loadFixture(
        deployWithBondFixture
      );

      await bond.connect(payoutEngine).liquidate(tokenAddr.address);

      // bondAmount is zeroed after first liquidation, so "no bond" fires first
      await expect(
        bond.connect(payoutEngine).liquidate(tokenAddr.address)
      ).to.be.revertedWith("IssuerBond: no bond");
    });

    it("should revert liquidation if bond was already released (bond zeroed)", async function () {
      const { bond, issuerRegistry, payoutEngine, issuer, tokenAddr } =
        await loadFixture(deployWithBondFixture);

      await bond
        .connect(issuerRegistry)
        .release(tokenAddr.address, issuer.address);

      // bondAmount is zeroed after release, so "no bond" fires first
      await expect(
        bond.connect(payoutEngine).liquidate(tokenAddr.address)
      ).to.be.revertedWith("IssuerBond: no bond");
    });

    it("should revert liquidation for non-existent bond", async function () {
      const { bond, payoutEngine, outsider } = await loadFixture(
        deployFixture
      );

      await expect(
        bond.connect(payoutEngine).liquidate(outsider.address)
      ).to.be.revertedWith("IssuerBond: no bond");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 4. Bond Release After Wind-Down
  // ═══════════════════════════════════════════════════════════════════
  describe("Bond Release (Wind-Down)", function () {
    it("should release bond minus 0.5% fee via IssuerRegistry", async function () {
      const { bond, usdt, issuerRegistry, issuer, treasury, tokenAddr } =
        await loadFixture(deployWithBondFixture);

      const expectedFee = (USDT_AMOUNT * WIND_DOWN_FEE_BPS) / 10000n;
      const expectedReturn = USDT_AMOUNT - expectedFee;

      const issuerBalBefore = await usdt.balanceOf(issuer.address);

      await bond
        .connect(issuerRegistry)
        .release(tokenAddr.address, issuer.address);

      const issuerBalAfter = await usdt.balanceOf(issuer.address);
      expect(issuerBalAfter - issuerBalBefore).to.equal(expectedReturn);

      // Fee sent to treasury
      expect(await usdt.balanceOf(treasury.address)).to.equal(expectedFee);

      // Record updated
      const record = await bond.getBondRecord(tokenAddr.address);
      expect(record.released).to.be.true;
      expect(record.bondAmount).to.equal(0);
    });

    it("should revert double release (bond zeroed)", async function () {
      const { bond, issuerRegistry, issuer, tokenAddr } = await loadFixture(
        deployWithBondFixture
      );

      await bond
        .connect(issuerRegistry)
        .release(tokenAddr.address, issuer.address);

      // bondAmount is zeroed after release, so "no bond" fires first
      await expect(
        bond
          .connect(issuerRegistry)
          .release(tokenAddr.address, issuer.address)
      ).to.be.revertedWith("IssuerBond: no bond");
    });

    it("should revert release if bond was liquidated (bond zeroed)", async function () {
      const { bond, issuerRegistry, payoutEngine, issuer, tokenAddr } =
        await loadFixture(deployWithBondFixture);

      await bond.connect(payoutEngine).liquidate(tokenAddr.address);

      // bondAmount is zeroed after liquidation, so "no bond" fires first
      await expect(
        bond
          .connect(issuerRegistry)
          .release(tokenAddr.address, issuer.address)
      ).to.be.revertedWith("IssuerBond: no bond");
    });

    it("should revert release for non-existent bond", async function () {
      const { bond, issuerRegistry, issuer, outsider } = await loadFixture(
        deployFixture
      );

      await expect(
        bond
          .connect(issuerRegistry)
          .release(outsider.address, issuer.address)
      ).to.be.revertedWith("IssuerBond: no bond");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 5. Unauthorized Liquidation Attempt
  // ═══════════════════════════════════════════════════════════════════
  describe("Unauthorized Liquidation", function () {
    it("should revert when called by owner (not PayoutEngine)", async function () {
      const { bond, owner, tokenAddr } = await loadFixture(
        deployWithBondFixture
      );

      await expect(
        bond.connect(owner).liquidate(tokenAddr.address)
      ).to.be.revertedWith("IssuerBond: only PayoutEngine");
    });

    it("should revert when called by issuer", async function () {
      const { bond, issuer, tokenAddr } = await loadFixture(
        deployWithBondFixture
      );

      await expect(
        bond.connect(issuer).liquidate(tokenAddr.address)
      ).to.be.revertedWith("IssuerBond: only PayoutEngine");
    });

    it("should revert when called by random outsider", async function () {
      const { bond, outsider, tokenAddr } = await loadFixture(
        deployWithBondFixture
      );

      await expect(
        bond.connect(outsider).liquidate(tokenAddr.address)
      ).to.be.revertedWith("IssuerBond: only PayoutEngine");
    });

    it("should revert release when called by non-IssuerRegistry", async function () {
      const { bond, outsider, issuer, tokenAddr } = await loadFixture(
        deployWithBondFixture
      );

      await expect(
        bond.connect(outsider).release(tokenAddr.address, issuer.address)
      ).to.be.revertedWith("IssuerBond: only IssuerRegistry");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 6. Bond Amount Tracking Per Token
  // ═══════════════════════════════════════════════════════════════════
  describe("Bond Amount Tracking Per Token", function () {
    it("should track independent bonds for different tokens", async function () {
      const { bond, usdt, issuer } = await loadFixture(deployFixture);

      const [, , , , , , , tokenA, tokenB] = await ethers.getSigners();

      const amountA = ethers.parseEther("30000");
      const amountB = ethers.parseEther("70000");

      await bond.connect(issuer).deposit(tokenA.address, amountA, MARKET_CAP);
      await bond.connect(issuer).deposit(tokenB.address, amountB, MARKET_CAP);

      expect(await bond.getBond(tokenA.address)).to.equal(amountA);
      expect(await bond.getBond(tokenB.address)).to.equal(amountB);
    });

    it("should return zero for token with no bond", async function () {
      const { bond, outsider } = await loadFixture(deployFixture);
      expect(await bond.getBond(outsider.address)).to.equal(0);
    });

    it("should report isBondSufficient correctly", async function () {
      const { bond, tokenAddr } = await loadFixture(deployWithBondFixture);

      expect(
        await bond.isBondSufficient(tokenAddr.address, USDT_AMOUNT)
      ).to.be.true;
      expect(
        await bond.isBondSufficient(tokenAddr.address, USDT_AMOUNT + 1n)
      ).to.be.false;
      expect(await bond.isBondSufficient(tokenAddr.address, 0)).to.be.true;
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 7. USDT Approval and Transfer
  // ═══════════════════════════════════════════════════════════════════
  describe("USDT Approval and Transfer", function () {
    it("should revert deposit if USDT not approved", async function () {
      const { bond, usdt, outsider, tokenAddr } = await loadFixture(
        deployFixture
      );

      // Mint USDT to outsider but do NOT approve
      await usdt.mint(outsider.address, USDT_AMOUNT);

      await expect(
        bond
          .connect(outsider)
          .deposit(tokenAddr.address, USDT_AMOUNT, MARKET_CAP)
      ).to.be.reverted; // SafeERC20 will revert
    });

    it("should revert deposit if USDT balance insufficient", async function () {
      const { bond, usdt, outsider, tokenAddr } = await loadFixture(
        deployFixture
      );

      // Approve but no balance
      await usdt
        .connect(outsider)
        .approve(await bond.getAddress(), USDT_AMOUNT);

      await expect(
        bond
          .connect(outsider)
          .deposit(tokenAddr.address, USDT_AMOUNT, MARKET_CAP)
      ).to.be.reverted;
    });

    it("should handle exact USDT approval amount", async function () {
      const { bond, usdt, tokenAddr } = await loadFixture(deployFixture);
      const [, , , , , , , , depositor] = await ethers.getSigners();

      await usdt.mint(depositor.address, USDT_AMOUNT);
      await usdt
        .connect(depositor)
        .approve(await bond.getAddress(), USDT_AMOUNT);

      await expect(
        bond
          .connect(depositor)
          .deposit(tokenAddr.address, USDT_AMOUNT, MARKET_CAP)
      ).to.not.be.reverted;

      expect(await usdt.balanceOf(depositor.address)).to.equal(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 8. Event Emissions
  // ═══════════════════════════════════════════════════════════════════
  describe("Event Emissions", function () {
    it("should emit BondDeposited on deposit", async function () {
      const { bond, issuer, tokenAddr } = await loadFixture(deployFixture);

      await expect(
        bond
          .connect(issuer)
          .deposit(tokenAddr.address, USDT_AMOUNT, MARKET_CAP)
      )
        .to.emit(bond, "BondDeposited")
        .withArgs(tokenAddr.address, USDT_AMOUNT, MARKET_CAP);
    });

    it("should emit BondLiquidated on liquidation", async function () {
      const { bond, payoutEngine, tokenAddr } = await loadFixture(
        deployWithBondFixture
      );

      await expect(
        bond.connect(payoutEngine).liquidate(tokenAddr.address)
      )
        .to.emit(bond, "BondLiquidated")
        .withArgs(tokenAddr.address, USDT_AMOUNT);
    });

    it("should emit BondReleased on release with correct fee breakdown", async function () {
      const { bond, issuerRegistry, issuer, tokenAddr } = await loadFixture(
        deployWithBondFixture
      );

      const expectedFee = (USDT_AMOUNT * WIND_DOWN_FEE_BPS) / 10000n;
      const expectedReturn = USDT_AMOUNT - expectedFee;

      await expect(
        bond
          .connect(issuerRegistry)
          .release(tokenAddr.address, issuer.address)
      )
        .to.emit(bond, "BondReleased")
        .withArgs(tokenAddr.address, expectedReturn, expectedFee);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 9. Integration with IssuerRegistry Authorization
  // ═══════════════════════════════════════════════════════════════════
  describe("IssuerRegistry Authorization", function () {
    it("should only allow the configured issuerRegistry to call release", async function () {
      const { bond, owner, issuer, tokenAddr } = await loadFixture(
        deployWithBondFixture
      );

      await expect(
        bond.connect(owner).release(tokenAddr.address, issuer.address)
      ).to.be.revertedWith("IssuerBond: only IssuerRegistry");
    });

    it("should allow owner to change issuerRegistry address", async function () {
      const { bond, owner, outsider, issuer, tokenAddr } = await loadFixture(
        deployWithBondFixture
      );

      // Change issuerRegistry to outsider
      await bond.connect(owner).setIssuerRegistry(outsider.address);

      // Now outsider can call release
      await expect(
        bond.connect(outsider).release(tokenAddr.address, issuer.address)
      ).to.not.be.reverted;
    });

    it("should allow owner to change payoutEngine address", async function () {
      const { bond, owner, outsider, tokenAddr } = await loadFixture(
        deployWithBondFixture
      );

      await bond.connect(owner).setPayoutEngine(outsider.address);

      // Now outsider can call liquidate
      await expect(
        bond.connect(outsider).liquidate(tokenAddr.address)
      ).to.not.be.reverted;
    });

    it("should revert setPayoutEngine from non-owner", async function () {
      const { bond, outsider } = await loadFixture(deployFixture);

      await expect(
        bond.connect(outsider).setPayoutEngine(outsider.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should revert setIssuerRegistry from non-owner", async function () {
      const { bond, outsider } = await loadFixture(deployFixture);

      await expect(
        bond.connect(outsider).setIssuerRegistry(outsider.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should expose protocolTreasury as immutable (no setter exists)", async function () {
      const { bond, treasury } = await loadFixture(deployFixture);
      // protocolTreasury is immutable post-deployment for safety.
      // Its value is set in the constructor and cannot be changed.
      expect(await bond.protocolTreasury()).to.equal(treasury.address);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 10. Zero Amount Edge Cases
  // ═══════════════════════════════════════════════════════════════════
  describe("Zero Amount Edge Cases", function () {
    it("should revert deposit with zero USDT amount", async function () {
      const { bond, issuer, tokenAddr } = await loadFixture(deployFixture);

      await expect(
        bond.connect(issuer).deposit(tokenAddr.address, 0, MARKET_CAP)
      ).to.be.revertedWith("IssuerBond: zero amount");
    });

    it("should accept deposit with zero market cap (no validation on marketCap)", async function () {
      const { bond, issuer, tokenAddr } = await loadFixture(deployFixture);

      await expect(
        bond.connect(issuer).deposit(tokenAddr.address, USDT_AMOUNT, 0)
      ).to.not.be.reverted;

      const record = await bond.getBondRecord(tokenAddr.address);
      expect(record.marketCapAtDeposit).to.equal(0);
    });

    it("should revert constructor with zero USDT address", async function () {
      const IssuerBondFactory = await ethers.getContractFactory("IssuerBond");
      const [, , , , treasury] = await ethers.getSigners();

      await expect(
        IssuerBondFactory.deploy(ethers.ZeroAddress, treasury.address)
      ).to.be.revertedWith("IssuerBond: zero USDT");
    });

    it("should report isBondSufficient as false for zero-bond token with non-zero required", async function () {
      const { bond, outsider } = await loadFixture(deployFixture);

      expect(await bond.isBondSufficient(outsider.address, 1)).to.be.false;
    });

    it("should report isBondSufficient as true for zero-bond token with zero required", async function () {
      const { bond, outsider } = await loadFixture(deployFixture);

      expect(await bond.isBondSufficient(outsider.address, 0)).to.be.true;
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Bonus: WIND_DOWN_FEE_BPS constant
  // ═══════════════════════════════════════════════════════════════════
  describe("Constants", function () {
    it("should expose WIND_DOWN_FEE_BPS as 50 (0.5%)", async function () {
      const { bond } = await loadFixture(deployFixture);
      expect(await bond.WIND_DOWN_FEE_BPS()).to.equal(50);
    });

    it("should expose immutable usdt address", async function () {
      const { bond, usdt } = await loadFixture(deployFixture);
      expect(await bond.usdt()).to.equal(await usdt.getAddress());
    });
  });
});
