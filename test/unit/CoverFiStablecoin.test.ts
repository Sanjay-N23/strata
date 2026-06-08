import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("CoverFiStablecoin (cfUSD)", function () {
  async function deployFixture() {
    const [owner, minter, user, recipient, attacker] = await ethers.getSigners();
    const Stablecoin = await ethers.getContractFactory("CoverFiStablecoin");
    const cfUSD = await Stablecoin.deploy();
    await cfUSD.waitForDeployment();
    return { cfUSD, owner, minter, user, recipient, attacker };
  }

  describe("Initialization", function () {
    it("has correct name and symbol", async function () {
      const { cfUSD } = await loadFixture(deployFixture);
      expect(await cfUSD.name()).to.equal("CoverFi Stablecoin");
      expect(await cfUSD.symbol()).to.equal("cfUSD");
    });

    it("uses 6 decimals to match USDT/USDC convention", async function () {
      const { cfUSD } = await loadFixture(deployFixture);
      expect(await cfUSD.decimals()).to.equal(6);
    });

    it("starts with zero total supply", async function () {
      const { cfUSD } = await loadFixture(deployFixture);
      expect(await cfUSD.totalSupply()).to.equal(0);
    });

    it("sets deployer as owner", async function () {
      const { cfUSD, owner } = await loadFixture(deployFixture);
      expect(await cfUSD.owner()).to.equal(owner.address);
    });

    it("sets deployer as initial minter", async function () {
      const { cfUSD, owner } = await loadFixture(deployFixture);
      expect(await cfUSD.minter()).to.equal(owner.address);
    });

    it("emits MinterUpdated event from address(0) on construction", async function () {
      const [owner] = await ethers.getSigners();
      const Stablecoin = await ethers.getContractFactory("CoverFiStablecoin");
      const cfUSD = await Stablecoin.deploy();
      await expect(cfUSD.deploymentTransaction())
        .to.emit(cfUSD, "MinterUpdated")
        .withArgs(ethers.ZeroAddress, owner.address);
    });

    it("not paused on construction", async function () {
      const { cfUSD } = await loadFixture(deployFixture);
      expect(await cfUSD.paused()).to.equal(false);
    });
  });

  describe("Supply Cap", function () {
    it("enforces hard 1B cfUSD cap", async function () {
      const { cfUSD, owner, recipient } = await loadFixture(deployFixture);
      const cap = await cfUSD.MAX_SUPPLY();
      expect(cap).to.equal(1_000_000_000n * 10n ** 6n); // 1 billion with 6 decimals
      // Mint up to cap should succeed
      await cfUSD.connect(owner).mint(recipient.address, cap);
      expect(await cfUSD.totalSupply()).to.equal(cap);
    });

    it("rejects mint that would exceed cap by 1 wei", async function () {
      const { cfUSD, owner, recipient } = await loadFixture(deployFixture);
      const cap = await cfUSD.MAX_SUPPLY();
      await cfUSD.connect(owner).mint(recipient.address, cap);
      await expect(
        cfUSD.connect(owner).mint(recipient.address, 1)
      ).to.be.revertedWith("cfUSD: cap exceeded");
    });

    it("rejects mint that exceeds cap when starting from partial supply", async function () {
      const { cfUSD, owner, recipient } = await loadFixture(deployFixture);
      const cap = await cfUSD.MAX_SUPPLY();
      const half = cap / 2n;
      await cfUSD.connect(owner).mint(recipient.address, half);
      // Trying to mint half + 1 should fail
      await expect(
        cfUSD.connect(owner).mint(recipient.address, half + 1n)
      ).to.be.revertedWith("cfUSD: cap exceeded");
    });
  });

  describe("Minting Access Control", function () {
    it("rejects mint from non-minter (random user)", async function () {
      const { cfUSD, attacker, recipient } = await loadFixture(deployFixture);
      await expect(
        cfUSD.connect(attacker).mint(recipient.address, 1000)
      ).to.be.revertedWith("cfUSD: caller is not minter");
    });

    it("rejects mint to zero address", async function () {
      const { cfUSD, owner } = await loadFixture(deployFixture);
      await expect(
        cfUSD.connect(owner).mint(ethers.ZeroAddress, 1000)
      ).to.be.revertedWith("cfUSD: mint to zero address");
    });

    it("rejects zero-amount mint", async function () {
      const { cfUSD, owner, recipient } = await loadFixture(deployFixture);
      await expect(
        cfUSD.connect(owner).mint(recipient.address, 0)
      ).to.be.revertedWith("cfUSD: zero amount");
    });

    it("succeeds when minter mints to a valid recipient", async function () {
      const { cfUSD, owner, recipient } = await loadFixture(deployFixture);
      await cfUSD.connect(owner).mint(recipient.address, 1_000_000); // 1 cfUSD
      expect(await cfUSD.balanceOf(recipient.address)).to.equal(1_000_000);
    });
  });

  describe("Minter Rotation", function () {
    it("allows owner to update the minter", async function () {
      const { cfUSD, owner, minter } = await loadFixture(deployFixture);
      await expect(cfUSD.connect(owner).setMinter(minter.address))
        .to.emit(cfUSD, "MinterUpdated")
        .withArgs(owner.address, minter.address);
      expect(await cfUSD.minter()).to.equal(minter.address);
    });

    it("allows new minter to mint after rotation", async function () {
      const { cfUSD, owner, minter, recipient } = await loadFixture(deployFixture);
      await cfUSD.connect(owner).setMinter(minter.address);
      await cfUSD.connect(minter).mint(recipient.address, 5_000_000);
      expect(await cfUSD.balanceOf(recipient.address)).to.equal(5_000_000);
    });

    it("revokes minter privileges from previous holder", async function () {
      const { cfUSD, owner, minter, recipient } = await loadFixture(deployFixture);
      await cfUSD.connect(owner).setMinter(minter.address);
      // Owner is no longer the minter
      await expect(
        cfUSD.connect(owner).mint(recipient.address, 1000)
      ).to.be.revertedWith("cfUSD: caller is not minter");
    });

    it("allows owner to revoke minting permanently by setting to zero", async function () {
      const { cfUSD, owner, recipient } = await loadFixture(deployFixture);
      await cfUSD.connect(owner).setMinter(ethers.ZeroAddress);
      expect(await cfUSD.minter()).to.equal(ethers.ZeroAddress);
      await expect(
        cfUSD.connect(owner).mint(recipient.address, 1000)
      ).to.be.revertedWith("cfUSD: caller is not minter");
    });

    it("non-owner cannot rotate minter", async function () {
      const { cfUSD, attacker, minter } = await loadFixture(deployFixture);
      await expect(
        cfUSD.connect(attacker).setMinter(minter.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Pausable", function () {
    it("allows owner to pause", async function () {
      const { cfUSD, owner } = await loadFixture(deployFixture);
      await cfUSD.connect(owner).pause();
      expect(await cfUSD.paused()).to.equal(true);
    });

    it("blocks transfers when paused", async function () {
      const { cfUSD, owner, recipient, user } = await loadFixture(deployFixture);
      await cfUSD.connect(owner).mint(user.address, 1_000_000);
      await cfUSD.connect(owner).pause();
      await expect(
        cfUSD.connect(user).transfer(recipient.address, 100)
      ).to.be.revertedWith("Pausable: paused");
    });

    it("blocks minting when paused", async function () {
      const { cfUSD, owner, recipient } = await loadFixture(deployFixture);
      await cfUSD.connect(owner).pause();
      await expect(
        cfUSD.connect(owner).mint(recipient.address, 1000)
      ).to.be.revertedWith("Pausable: paused");
    });

    it("allows owner to unpause and resume operations", async function () {
      const { cfUSD, owner, recipient } = await loadFixture(deployFixture);
      await cfUSD.connect(owner).pause();
      await cfUSD.connect(owner).unpause();
      await cfUSD.connect(owner).mint(recipient.address, 1000);
      expect(await cfUSD.balanceOf(recipient.address)).to.equal(1000);
    });

    it("non-owner cannot pause", async function () {
      const { cfUSD, attacker } = await loadFixture(deployFixture);
      await expect(
        cfUSD.connect(attacker).pause()
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Two-Step Ownership Transfer", function () {
    it("requires accept step from new owner (typo protection)", async function () {
      const { cfUSD, owner, user } = await loadFixture(deployFixture);
      // Step 1: initiate transfer
      await cfUSD.connect(owner).transferOwnership(user.address);
      // Owner is still the original owner
      expect(await cfUSD.owner()).to.equal(owner.address);
      expect(await cfUSD.pendingOwner()).to.equal(user.address);
      // Step 2: new owner accepts
      await cfUSD.connect(user).acceptOwnership();
      expect(await cfUSD.owner()).to.equal(user.address);
    });

    it("non-pending-owner cannot accept", async function () {
      const { cfUSD, owner, user, attacker } = await loadFixture(deployFixture);
      await cfUSD.connect(owner).transferOwnership(user.address);
      await expect(
        cfUSD.connect(attacker).acceptOwnership()
      ).to.be.revertedWith("Ownable2Step: caller is not the new owner");
    });
  });

  describe("Standard ERC20 Transfers", function () {
    it("allows transfers between users when not paused", async function () {
      const { cfUSD, owner, user, recipient } = await loadFixture(deployFixture);
      await cfUSD.connect(owner).mint(user.address, 1_000_000);
      await cfUSD.connect(user).transfer(recipient.address, 250_000);
      expect(await cfUSD.balanceOf(user.address)).to.equal(750_000);
      expect(await cfUSD.balanceOf(recipient.address)).to.equal(250_000);
    });

    it("supports approve + transferFrom", async function () {
      const { cfUSD, owner, user, recipient } = await loadFixture(deployFixture);
      await cfUSD.connect(owner).mint(user.address, 1_000_000);
      await cfUSD.connect(user).approve(recipient.address, 100_000);
      await cfUSD
        .connect(recipient)
        .transferFrom(user.address, recipient.address, 100_000);
      expect(await cfUSD.balanceOf(recipient.address)).to.equal(100_000);
    });
  });
});
