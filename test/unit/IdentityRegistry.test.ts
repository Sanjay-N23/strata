import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

/**
 * ============================================================================
 *  IdentityRegistry — ERC-8004 reference impl (unit + gate integration)
 * ============================================================================
 *  The hackathon mandates an ERC-8004 agent identity. The canonical registry is
 *  Mantle-mainnet-only, so this reference IdentityRegistry serves the Sepolia demo.
 *  Tests: ERC-721 register/own/URI/metadata semantics, owner-gated mutations, and
 *  that the registry actually satisfies StrataAIAgent's onlyAgent identity gate
 *  (so setErc8004 against THIS registry is real authorization, not a shim).
 * ============================================================================
 */

describe("IdentityRegistry (ERC-8004 reference)", function () {
  async function fx() {
    const [owner, agent1, agent2, other] = await ethers.getSigners();
    const reg = await (await ethers.getContractFactory("IdentityRegistry")).deploy();
    return { owner, agent1, agent2, other, reg };
  }

  it("register mints agentId == tokenId (1-indexed) to caller + stores agentURI", async function () {
    const { reg, agent1 } = await loadFixture(fx);
    await reg.connect(agent1).register("ipfs://card1");
    expect(await reg.agentCount()).to.equal(1);
    expect(await reg.ownerOf(1)).to.equal(agent1.address);
    expect(await reg.agentURI(1)).to.equal("ipfs://card1");
    expect(await reg.tokenURI(1)).to.equal("ipfs://card1");
  });

  it("agentIds increment across registrations", async function () {
    const { reg, agent1, agent2 } = await loadFixture(fx);
    await reg.connect(agent1).register("a");
    await reg.connect(agent2).register("b");
    expect(await reg.ownerOf(1)).to.equal(agent1.address);
    expect(await reg.ownerOf(2)).to.equal(agent2.address);
    expect(await reg.agentCount()).to.equal(2);
  });

  it("only the agent owner may setAgentURI / setMetadata", async function () {
    const { reg, agent1, other } = await loadFixture(fx);
    await reg.connect(agent1).register("a");
    await expect(reg.connect(other).setAgentURI(1, "x")).to.be.revertedWith("ERC8004: not agent owner");
    await reg.connect(agent1).setAgentURI(1, "a2");
    expect(await reg.agentURI(1)).to.equal("a2");
    const key = ethers.id("a2a");
    await expect(reg.connect(other).setMetadata(1, key, "0x1234")).to.be.revertedWith("ERC8004: not agent owner");
    await reg.connect(agent1).setMetadata(1, key, "0x1234");
    expect(await reg.getMetadata(1, key)).to.equal("0x1234");
  });

  it("agentURI reverts for an unminted agentId", async function () {
    const { reg } = await loadFixture(fx);
    await expect(reg.agentURI(99)).to.be.reverted;
  });

  it("emits Registered(agentId, owner, agentURI)", async function () {
    const { reg, agent1 } = await loadFixture(fx);
    await expect(reg.connect(agent1).register("uri"))
      .to.emit(reg, "Registered").withArgs(1, agent1.address, "uri");
  });

  describe("satisfies StrataAIAgent identity gate (real authorization)", function () {
    async function gated() {
      const [owner, issuer, third] = await ethers.getSigners();
      const oracle = await (await ethers.getContractFactory("IRSOracle")).deploy();
      const dOracle = await (await ethers.getContractFactory("DefaultOracle")).deploy(owner.address);
      const agent = await (await ethers.getContractFactory("StrataAIAgent")).deploy(
        await oracle.getAddress(), await dOracle.getAddress()
      );
      await oracle.setStrataAgent(await agent.getAddress());
      const reg = await (await ethers.getContractFactory("IdentityRegistry")).deploy();
      return { owner, issuer, third, oracle, agent, reg };
    }

    it("operator registers → gate passes; transfers identity away → gate blocks", async function () {
      const { owner, issuer, third, agent, reg } = await loadFixture(gated);
      const Z = ethers.ZeroHash;
      await reg.register("ipfs://strata-agent"); // owner == agentOperator, owns agentId 1
      await agent.setErc8004(await reg.getAddress(), 1);
      await expect(agent.submitScore(issuer.address, 800, 2000, Z, 0)).to.not.be.reverted;
      // hand the identity NFT to someone else → operator no longer owns it
      await reg.transferFrom(owner.address, third.address, 1);
      await expect(agent.submitScore(issuer.address, 800, 2000, Z, 1))
        .to.be.revertedWith("Strata: agent lacks ERC-8004 identity");
    });
  });
});
