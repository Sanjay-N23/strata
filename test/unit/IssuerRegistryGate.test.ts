import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

/**
 * ============================================================================
 *  IssuerRegistry — fast-track eligibility gate + anti-squat remediation (#15)
 * ============================================================================
 *  register() was permissionless and its useFastTrack branch only PROMISED a TIR
 *  eligibility check in a comment. This implements it as an OPT-IN gate (default
 *  OFF, so existing flows are unaffected) plus owner anti-squat reassignment.
 * ============================================================================
 */
const rnd = () => ethers.Wallet.createRandom().address;

describe("IssuerRegistry · fast-track gate + anti-squat (#15)", function () {
  async function fx() {
    const [owner, issuer, other] = await ethers.getSigners();
    const elig = await (await ethers.getContractFactory("MockTIREligibility")).deploy();
    const ZA = ethers.ZeroAddress;
    const reg = await (await ethers.getContractFactory("IssuerRegistry")).deploy(
      await elig.getAddress(), ZA, ZA, ZA // _tir = eligibility mock; bond/irs/default unused here
    );
    return { owner, issuer, other, reg, elig };
  }
  // register(token, basLegalAttestUID, custodian, legalRep, auditor, marketCap, useFastTrack)
  const REG = (reg: any, signer: any, token: string, custodian: string, fast: boolean) =>
    reg.connect(signer).register(token, 1, custodian, rnd(), rnd(), 1000, fast);

  it("TC15.1 gate OFF by default → fast-track register works", async function () {
    const { reg, issuer } = await loadFixture(fx);
    await expect(REG(reg, issuer, rnd(), rnd(), true)).to.not.be.reverted;
  });

  it("TC15.2 gate ON + custodian NOT eligible → fast-track register reverts", async function () {
    const { reg, issuer, elig } = await loadFixture(fx);
    await reg.setFastTrackGate(true);
    await elig.setEligible(false);
    await expect(REG(reg, issuer, rnd(), rnd(), true))
      .to.be.revertedWith("IssuerRegistry: custodian not fast-track eligible");
  });

  it("TC15.3 gate ON + custodian eligible → fast-track register works", async function () {
    const { reg, issuer, elig } = await loadFixture(fx);
    await reg.setFastTrackGate(true);
    await elig.setEligible(true);
    await expect(REG(reg, issuer, rnd(), rnd(), true)).to.not.be.reverted;
  });

  it("TC15.4 gate ON but STANDARD-track register is unaffected (gate only on fast-track)", async function () {
    const { reg, issuer, elig } = await loadFixture(fx);
    await reg.setFastTrackGate(true);
    await elig.setEligible(false);
    await expect(REG(reg, issuer, rnd(), rnd(), false)).to.not.be.reverted;
  });

  it("TC15.5 anti-squat: owner reassigns issuer EOA; non-owner cannot", async function () {
    const { reg, owner, issuer, other } = await loadFixture(fx);
    const token = rnd();
    await REG(reg, issuer, token, rnd(), false); // a squatter registers the token first
    expect((await reg.issuers(token)).issuerEOA).to.equal(issuer.address);
    await expect(reg.connect(other).reassignIssuer(token, other.address))
      .to.be.revertedWith("Ownable: caller is not the owner");
    await reg.connect(owner).reassignIssuer(token, other.address);
    expect((await reg.issuers(token)).issuerEOA).to.equal(other.address);
    expect(await reg.issuerOfToken(token)).to.equal(other.address);
  });

  it("TC15.6 setFastTrackGate / setTIR are owner-only", async function () {
    const { reg, other, elig } = await loadFixture(fx);
    await expect(reg.connect(other).setFastTrackGate(true)).to.be.revertedWith("Ownable: caller is not the owner");
    await expect(reg.connect(other).setTIR(await elig.getAddress())).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("TC15.7 reassignIssuer reverts for unregistered token / zero EOA", async function () {
    const { reg, owner, other } = await loadFixture(fx);
    await expect(reg.connect(owner).reassignIssuer(rnd(), other.address))
      .to.be.revertedWith("IssuerRegistry: not registered");
    const token = rnd();
    await REG(reg, other, token, rnd(), false);
    await expect(reg.connect(owner).reassignIssuer(token, ethers.ZeroAddress))
      .to.be.revertedWith("IssuerRegistry: zero EOA");
  });
});
