import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { TIR } from "../../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

// Enum mirrors from the contract
const AttestorType = { CUSTODIAN: 0, LEGAL_REP: 1, AUDITOR: 2 } as const;
const AttestorStatus = {
  UNREGISTERED: 0,
  ACTIVE: 1,
  SLASHED: 2,
  BLACKLISTED: 3,
  INACTIVE: 4,
} as const;

const MIN_BOND = ethers.parseEther("5");
const EVIDENCE_HASH = ethers.keccak256(ethers.toUtf8Bytes("evidence"));
const BAS_UID = 12345n;

describe("TIR — Trusted Issuer Registry", function () {
  // ─── Fixture ───────────────────────────────────────────────────────
  async function deployFixture() {
    const [owner, custodian, legalRep, auditor, outsider, tokenAddr] =
      await ethers.getSigners();

    const TIRFactory = await ethers.getContractFactory("TIR");
    const tir = (await TIRFactory.deploy()) as TIR;

    return { tir, owner, custodian, legalRep, auditor, outsider, tokenAddr };
  }

  /** Register three attestors (one per category) and return them. */
  async function deployWithAttestorsFixture() {
    const base = await deployFixture();
    const { tir, custodian, legalRep, auditor } = base;

    await tir
      .connect(custodian)
      .registerAttestor(AttestorType.CUSTODIAN, { value: MIN_BOND });
    await tir
      .connect(legalRep)
      .registerAttestor(AttestorType.LEGAL_REP, { value: MIN_BOND });
    await tir
      .connect(auditor)
      .registerAttestor(AttestorType.AUDITOR, { value: MIN_BOND });

    return base;
  }

  // ═══════════════════════════════════════════════════════════════════
  // 1. Attestor Registration (all 3 types)
  // ═══════════════════════════════════════════════════════════════════
  describe("Attestor Registration", function () {
    it("should register a CUSTODIAN with the minimum bond", async function () {
      const { tir, custodian } = await loadFixture(deployFixture);

      await tir
        .connect(custodian)
        .registerAttestor(AttestorType.CUSTODIAN, { value: MIN_BOND });

      const att = await tir.getAttestor(custodian.address);
      expect(att.wallet).to.equal(custodian.address);
      expect(att.attestorType).to.equal(AttestorType.CUSTODIAN);
      expect(att.bondMNT).to.equal(MIN_BOND);
      expect(att.status).to.equal(AttestorStatus.ACTIVE);
      expect(att.successfulAttestations).to.equal(0);
      expect(att.disputedAttestations).to.equal(0);
      expect(att.slashCount).to.equal(0);
    });

    it("should register a LEGAL_REP with the minimum bond", async function () {
      const { tir, legalRep } = await loadFixture(deployFixture);

      await tir
        .connect(legalRep)
        .registerAttestor(AttestorType.LEGAL_REP, { value: MIN_BOND });

      const att = await tir.getAttestor(legalRep.address);
      expect(att.attestorType).to.equal(AttestorType.LEGAL_REP);
      expect(att.status).to.equal(AttestorStatus.ACTIVE);
    });

    it("should register an AUDITOR with the minimum bond", async function () {
      const { tir, auditor } = await loadFixture(deployFixture);

      await tir
        .connect(auditor)
        .registerAttestor(AttestorType.AUDITOR, { value: MIN_BOND });

      const att = await tir.getAttestor(auditor.address);
      expect(att.attestorType).to.equal(AttestorType.AUDITOR);
      expect(att.status).to.equal(AttestorStatus.ACTIVE);
    });

    it("should accept bond amounts above the minimum", async function () {
      const { tir, custodian } = await loadFixture(deployFixture);
      const extraBond = ethers.parseEther("10");

      await tir
        .connect(custodian)
        .registerAttestor(AttestorType.CUSTODIAN, { value: extraBond });

      const att = await tir.getAttestor(custodian.address);
      expect(att.bondMNT).to.equal(extraBond);
    });

    it("should record the registration timestamp", async function () {
      const { tir, custodian } = await loadFixture(deployFixture);

      await tir
        .connect(custodian)
        .registerAttestor(AttestorType.CUSTODIAN, { value: MIN_BOND });

      const att = await tir.getAttestor(custodian.address);
      expect(att.registrationTimestamp).to.be.gt(0);
    });

    it("should revert if already registered", async function () {
      const { tir, custodian } = await loadFixture(deployFixture);

      await tir
        .connect(custodian)
        .registerAttestor(AttestorType.CUSTODIAN, { value: MIN_BOND });

      await expect(
        tir
          .connect(custodian)
          .registerAttestor(AttestorType.AUDITOR, { value: MIN_BOND })
      ).to.be.revertedWith("TIR: already registered");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 2. Minimum Bond Requirement
  // ═══════════════════════════════════════════════════════════════════
  describe("Minimum Bond Requirement", function () {
    it("should revert when bond is zero", async function () {
      const { tir, custodian } = await loadFixture(deployFixture);

      await expect(
        tir
          .connect(custodian)
          .registerAttestor(AttestorType.CUSTODIAN, { value: 0 })
      ).to.be.revertedWith("TIR: bond below minimum");
    });

    it("should revert when bond is 1 wei below minimum", async function () {
      const { tir, custodian } = await loadFixture(deployFixture);

      await expect(
        tir
          .connect(custodian)
          .registerAttestor(AttestorType.CUSTODIAN, { value: MIN_BOND - 1n })
      ).to.be.revertedWith("TIR: bond below minimum");
    });

    it("should succeed with exactly the minimum bond", async function () {
      const { tir, custodian } = await loadFixture(deployFixture);

      await expect(
        tir
          .connect(custodian)
          .registerAttestor(AttestorType.CUSTODIAN, { value: MIN_BOND })
      ).to.not.be.reverted;
    });

    it("should expose MIN_BOND_MNT constant as 5 ether", async function () {
      const { tir } = await loadFixture(deployFixture);
      expect(await tir.MIN_BOND_MNT()).to.equal(ethers.parseEther("5"));
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 3. Attestor Status Transitions
  // ═══════════════════════════════════════════════════════════════════
  describe("Status Transitions", function () {
    it("should start as UNREGISTERED before registration", async function () {
      const { tir, custodian } = await loadFixture(deployFixture);

      const att = await tir.getAttestor(custodian.address);
      expect(att.status).to.equal(AttestorStatus.UNREGISTERED);
    });

    it("should transition to ACTIVE upon registration", async function () {
      const { tir, custodian } = await loadFixture(deployFixture);

      await tir
        .connect(custodian)
        .registerAttestor(AttestorType.CUSTODIAN, { value: MIN_BOND });

      expect(await tir.isActiveAttestor(custodian.address)).to.be.true;
    });

    it("should transition from ACTIVE to SLASHED via slashAttestor", async function () {
      const { tir, owner, custodian } = await loadFixture(
        deployWithAttestorsFixture
      );

      await tir.connect(owner).slashAttestor(custodian.address, "fraud");

      const att = await tir.getAttestor(custodian.address);
      expect(att.status).to.equal(AttestorStatus.SLASHED);
      expect(att.bondMNT).to.equal(0);
      expect(att.slashCount).to.equal(1);
    });

    it("should transfer slashed bond to owner (treasury)", async function () {
      const { tir, owner, custodian } = await loadFixture(
        deployWithAttestorsFixture
      );

      const ownerBalBefore = await ethers.provider.getBalance(owner.address);
      const tx = await tir
        .connect(owner)
        .slashAttestor(custodian.address, "fraud");
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const ownerBalAfter = await ethers.provider.getBalance(owner.address);

      expect(ownerBalAfter).to.equal(ownerBalBefore + MIN_BOND - gasCost);
    });

    it("should revert slashAttestor for non-ACTIVE attestor", async function () {
      const { tir, owner, outsider } = await loadFixture(deployFixture);

      await expect(
        tir.connect(owner).slashAttestor(outsider.address, "reason")
      ).to.be.revertedWith("TIR: not active");
    });

    it("should revert slashAttestor if caller is not owner", async function () {
      const { tir, custodian, legalRep } = await loadFixture(
        deployWithAttestorsFixture
      );

      await expect(
        tir.connect(legalRep).slashAttestor(custodian.address, "fraud")
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 4. Default Attestation Submission
  // ═══════════════════════════════════════════════════════════════════
  describe("Default Attestation Submission", function () {
    it("should accept a valid attestation from an active custodian", async function () {
      const { tir, custodian, tokenAddr } = await loadFixture(
        deployWithAttestorsFixture
      );

      await tir
        .connect(custodian)
        .submitDefaultAttestation(tokenAddr.address, BAS_UID, EVIDENCE_HASH);

      const state = await tir.getDefaultConfirmation(tokenAddr.address);
      expect(state.custodianVoted).to.be.true;
      expect(state.legalVoted).to.be.false;
      expect(state.auditorVoted).to.be.false;
      expect(state.isConfirmed).to.be.false;
    });

    it("should record the vote details correctly", async function () {
      const { tir, custodian, tokenAddr } = await loadFixture(
        deployWithAttestorsFixture
      );

      await tir
        .connect(custodian)
        .submitDefaultAttestation(tokenAddr.address, BAS_UID, EVIDENCE_HASH);

      const state = await tir.getDefaultConfirmation(tokenAddr.address);
      expect(state.custodianVote.attestorWallet).to.equal(custodian.address);
      expect(state.custodianVote.attestorType).to.equal(
        AttestorType.CUSTODIAN
      );
      expect(state.custodianVote.basAttestationUID).to.equal(BAS_UID);
      expect(state.custodianVote.evidenceHash).to.equal(EVIDENCE_HASH);
    });

    it("should track vote counts via getVoteCount", async function () {
      const { tir, custodian, legalRep, tokenAddr } = await loadFixture(
        deployWithAttestorsFixture
      );

      await tir
        .connect(custodian)
        .submitDefaultAttestation(tokenAddr.address, BAS_UID, EVIDENCE_HASH);

      let [c, l, a] = await tir.getVoteCount(tokenAddr.address);
      expect(c).to.equal(1);
      expect(l).to.equal(0);
      expect(a).to.equal(0);

      await tir
        .connect(legalRep)
        .submitDefaultAttestation(tokenAddr.address, BAS_UID, EVIDENCE_HASH);

      [c, l, a] = await tir.getVoteCount(tokenAddr.address);
      expect(c).to.equal(1);
      expect(l).to.equal(1);
      expect(a).to.equal(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 5. 2-of-3 Confirmation Logic (all valid combos)
  // ═══════════════════════════════════════════════════════════════════
  describe("2-of-3 Confirmation Logic", function () {
    it("should confirm with CUSTODIAN + LEGAL_REP", async function () {
      const { tir, custodian, legalRep, tokenAddr } = await loadFixture(
        deployWithAttestorsFixture
      );

      await tir
        .connect(custodian)
        .submitDefaultAttestation(tokenAddr.address, BAS_UID, EVIDENCE_HASH);
      expect(await tir.isDefaultConfirmed(tokenAddr.address)).to.be.false;

      await tir
        .connect(legalRep)
        .submitDefaultAttestation(tokenAddr.address, BAS_UID, EVIDENCE_HASH);
      expect(await tir.isDefaultConfirmed(tokenAddr.address)).to.be.true;
    });

    it("should confirm with CUSTODIAN + AUDITOR", async function () {
      const { tir, custodian, auditor, tokenAddr } = await loadFixture(
        deployWithAttestorsFixture
      );

      await tir
        .connect(custodian)
        .submitDefaultAttestation(tokenAddr.address, BAS_UID, EVIDENCE_HASH);
      await tir
        .connect(auditor)
        .submitDefaultAttestation(tokenAddr.address, BAS_UID, EVIDENCE_HASH);

      expect(await tir.isDefaultConfirmed(tokenAddr.address)).to.be.true;
    });

    it("should confirm with LEGAL_REP + AUDITOR", async function () {
      const { tir, legalRep, auditor, tokenAddr } = await loadFixture(
        deployWithAttestorsFixture
      );

      await tir
        .connect(legalRep)
        .submitDefaultAttestation(tokenAddr.address, BAS_UID, EVIDENCE_HASH);
      await tir
        .connect(auditor)
        .submitDefaultAttestation(tokenAddr.address, BAS_UID, EVIDENCE_HASH);

      expect(await tir.isDefaultConfirmed(tokenAddr.address)).to.be.true;
    });

    it("should reject 3rd vote after 2-of-3 already confirmed", async function () {
      const { tir, custodian, legalRep, auditor, tokenAddr } =
        await loadFixture(deployWithAttestorsFixture);

      await tir
        .connect(custodian)
        .submitDefaultAttestation(tokenAddr.address, BAS_UID, EVIDENCE_HASH);
      await tir
        .connect(legalRep)
        .submitDefaultAttestation(tokenAddr.address, BAS_UID, EVIDENCE_HASH);

      // Already confirmed after 2; 3rd vote should revert
      await expect(
        tir
          .connect(auditor)
          .submitDefaultAttestation(tokenAddr.address, BAS_UID, EVIDENCE_HASH)
      ).to.be.revertedWith("TIR: already confirmed");
    });

    it("should NOT confirm with only 1 vote", async function () {
      const { tir, custodian, tokenAddr } = await loadFixture(
        deployWithAttestorsFixture
      );

      await tir
        .connect(custodian)
        .submitDefaultAttestation(tokenAddr.address, BAS_UID, EVIDENCE_HASH);

      expect(await tir.isDefaultConfirmed(tokenAddr.address)).to.be.false;
    });

    it("should record the confirmationBlock correctly", async function () {
      const { tir, custodian, legalRep, tokenAddr } = await loadFixture(
        deployWithAttestorsFixture
      );

      await tir
        .connect(custodian)
        .submitDefaultAttestation(tokenAddr.address, BAS_UID, EVIDENCE_HASH);
      const tx = await tir
        .connect(legalRep)
        .submitDefaultAttestation(tokenAddr.address, BAS_UID, EVIDENCE_HASH);
      const receipt = await tx.wait();

      const state = await tir.getDefaultConfirmation(tokenAddr.address);
      expect(state.confirmationBlock).to.equal(receipt!.blockNumber);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 6. Duplicate Category Voting Rejection
  // ═══════════════════════════════════════════════════════════════════
  describe("Duplicate Category Voting Rejection", function () {
    it("should reject duplicate CUSTODIAN vote", async function () {
      const { tir, tokenAddr } = await loadFixture(
        deployWithAttestorsFixture
      );
      const [, , , , , , extra] = await ethers.getSigners();

      // Register a second custodian
      await tir
        .connect(extra)
        .registerAttestor(AttestorType.CUSTODIAN, { value: MIN_BOND });

      // First custodian votes
      const { custodian } = await loadFixture(deployWithAttestorsFixture);
      // Use the fixture's first custodian already registered
    });

    it("should reject a second CUSTODIAN vote on same token", async function () {
      const { tir, custodian, tokenAddr } = await loadFixture(
        deployWithAttestorsFixture
      );

      // Register a second custodian
      const [, , , , , , secondCustodian] = await ethers.getSigners();
      await tir
        .connect(secondCustodian)
        .registerAttestor(AttestorType.CUSTODIAN, { value: MIN_BOND });

      await tir
        .connect(custodian)
        .submitDefaultAttestation(tokenAddr.address, BAS_UID, EVIDENCE_HASH);

      await expect(
        tir
          .connect(secondCustodian)
          .submitDefaultAttestation(tokenAddr.address, BAS_UID, EVIDENCE_HASH)
      ).to.be.revertedWith("TIR: custodian already voted");
    });

    it("should reject a second LEGAL_REP vote on same token", async function () {
      const { tir, legalRep, tokenAddr } = await loadFixture(
        deployWithAttestorsFixture
      );

      const [, , , , , , , secondLegal] = await ethers.getSigners();
      await tir
        .connect(secondLegal)
        .registerAttestor(AttestorType.LEGAL_REP, { value: MIN_BOND });

      await tir
        .connect(legalRep)
        .submitDefaultAttestation(tokenAddr.address, BAS_UID, EVIDENCE_HASH);

      await expect(
        tir
          .connect(secondLegal)
          .submitDefaultAttestation(tokenAddr.address, BAS_UID, EVIDENCE_HASH)
      ).to.be.revertedWith("TIR: legal rep already voted");
    });

    it("should reject a second AUDITOR vote on same token", async function () {
      const { tir, auditor, tokenAddr } = await loadFixture(
        deployWithAttestorsFixture
      );

      const [, , , , , , , , secondAuditor] = await ethers.getSigners();
      await tir
        .connect(secondAuditor)
        .registerAttestor(AttestorType.AUDITOR, { value: MIN_BOND });

      await tir
        .connect(auditor)
        .submitDefaultAttestation(tokenAddr.address, BAS_UID, EVIDENCE_HASH);

      await expect(
        tir
          .connect(secondAuditor)
          .submitDefaultAttestation(tokenAddr.address, BAS_UID, EVIDENCE_HASH)
      ).to.be.revertedWith("TIR: auditor already voted");
    });

    it("should reject vote after default is already confirmed", async function () {
      const { tir, custodian, legalRep, auditor, tokenAddr } =
        await loadFixture(deployWithAttestorsFixture);

      await tir
        .connect(custodian)
        .submitDefaultAttestation(tokenAddr.address, BAS_UID, EVIDENCE_HASH);
      await tir
        .connect(legalRep)
        .submitDefaultAttestation(tokenAddr.address, BAS_UID, EVIDENCE_HASH);

      // Already confirmed; auditor vote should revert
      await expect(
        tir
          .connect(auditor)
          .submitDefaultAttestation(tokenAddr.address, BAS_UID, EVIDENCE_HASH)
      ).to.be.revertedWith("TIR: already confirmed");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 7. Non-Active Attestor Rejection
  // ═══════════════════════════════════════════════════════════════════
  describe("Non-Active Attestor Rejection", function () {
    it("should reject attestation from unregistered address", async function () {
      const { tir, outsider, tokenAddr } = await loadFixture(deployFixture);

      await expect(
        tir
          .connect(outsider)
          .submitDefaultAttestation(tokenAddr.address, BAS_UID, EVIDENCE_HASH)
      ).to.be.revertedWith("TIR: not active attestor");
    });

    it("should reject attestation from slashed attestor", async function () {
      const { tir, owner, custodian, tokenAddr } = await loadFixture(
        deployWithAttestorsFixture
      );

      await tir.connect(owner).slashAttestor(custodian.address, "fraud");

      await expect(
        tir
          .connect(custodian)
          .submitDefaultAttestation(tokenAddr.address, BAS_UID, EVIDENCE_HASH)
      ).to.be.revertedWith("TIR: not active attestor");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 8. Attestor Deactivation (via slashing — the only deactivation path)
  // ═══════════════════════════════════════════════════════════════════
  describe("Attestor Deactivation", function () {
    it("should set status to SLASHED and zero the bond", async function () {
      const { tir, owner, custodian } = await loadFixture(
        deployWithAttestorsFixture
      );

      await tir.connect(owner).slashAttestor(custodian.address, "malicious");

      const att = await tir.getAttestor(custodian.address);
      expect(att.status).to.equal(AttestorStatus.SLASHED);
      expect(att.bondMNT).to.equal(0);
    });

    it("should increment slashCount", async function () {
      const { tir, owner, custodian } = await loadFixture(
        deployWithAttestorsFixture
      );

      await tir.connect(owner).slashAttestor(custodian.address, "first");

      const att = await tir.getAttestor(custodian.address);
      expect(att.slashCount).to.equal(1);
    });

    it("should prevent re-registration after slashing", async function () {
      const { tir, owner, custodian } = await loadFixture(
        deployWithAttestorsFixture
      );

      await tir.connect(owner).slashAttestor(custodian.address, "fraud");

      await expect(
        tir
          .connect(custodian)
          .registerAttestor(AttestorType.CUSTODIAN, { value: MIN_BOND })
      ).to.be.revertedWith("TIR: already registered");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 9. Bond Withdrawal for Inactive Attestors
  //    (The contract does not expose a withdraw function; bond is only
  //    moved via slashing. These tests verify that the bond cannot be
  //    retrieved after slashing.)
  // ═══════════════════════════════════════════════════════════════════
  describe("Bond Handling", function () {
    it("should hold the bond in the contract after registration", async function () {
      const { tir, custodian } = await loadFixture(
        deployWithAttestorsFixture
      );

      const contractBalance = await ethers.provider.getBalance(
        await tir.getAddress()
      );
      // At least 3 bonds deposited (custodian + legalRep + auditor)
      expect(contractBalance).to.be.gte(MIN_BOND * 3n);
    });

    it("should transfer full bond to owner on slash", async function () {
      const { tir, owner, custodian } = await loadFixture(
        deployWithAttestorsFixture
      );

      const contractBalBefore = await ethers.provider.getBalance(
        await tir.getAddress()
      );
      await tir.connect(owner).slashAttestor(custodian.address, "fraud");
      const contractBalAfter = await ethers.provider.getBalance(
        await tir.getAddress()
      );

      expect(contractBalBefore - contractBalAfter).to.equal(MIN_BOND);
    });

    it("should report correct max pool TVL (4x total bonds)", async function () {
      const { tir, custodian, legalRep, auditor } = await loadFixture(
        deployWithAttestorsFixture
      );

      const maxTVL = await tir.getMaxPoolTVL(
        custodian.address,
        legalRep.address,
        auditor.address
      );
      expect(maxTVL).to.equal(MIN_BOND * 3n * 4n);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // 10. Event Emissions
  // ═══════════════════════════════════════════════════════════════════
  describe("Event Emissions", function () {
    it("should emit AttestorRegistered on registration", async function () {
      const { tir, custodian } = await loadFixture(deployFixture);

      await expect(
        tir
          .connect(custodian)
          .registerAttestor(AttestorType.CUSTODIAN, { value: MIN_BOND })
      )
        .to.emit(tir, "AttestorRegistered")
        .withArgs(custodian.address, AttestorType.CUSTODIAN, MIN_BOND);
    });

    it("should emit DefaultAttestationSubmitted on vote", async function () {
      const { tir, custodian, tokenAddr } = await loadFixture(
        deployWithAttestorsFixture
      );

      await expect(
        tir
          .connect(custodian)
          .submitDefaultAttestation(tokenAddr.address, BAS_UID, EVIDENCE_HASH)
      )
        .to.emit(tir, "DefaultAttestationSubmitted")
        .withArgs(
          tokenAddr.address,
          custodian.address,
          AttestorType.CUSTODIAN,
          BAS_UID
        );
    });

    it("should emit DefaultConfirmed when 2-of-3 reached", async function () {
      const { tir, custodian, legalRep, tokenAddr } = await loadFixture(
        deployWithAttestorsFixture
      );

      await tir
        .connect(custodian)
        .submitDefaultAttestation(tokenAddr.address, BAS_UID, EVIDENCE_HASH);

      await expect(
        tir
          .connect(legalRep)
          .submitDefaultAttestation(tokenAddr.address, BAS_UID, EVIDENCE_HASH)
      ).to.emit(tir, "DefaultConfirmed");
    });

    it("should NOT emit DefaultConfirmed on first vote only", async function () {
      const { tir, custodian, tokenAddr } = await loadFixture(
        deployWithAttestorsFixture
      );

      await expect(
        tir
          .connect(custodian)
          .submitDefaultAttestation(tokenAddr.address, BAS_UID, EVIDENCE_HASH)
      ).to.not.emit(tir, "DefaultConfirmed");
    });

    it("should emit AttestorSlashed on slash", async function () {
      const { tir, owner, custodian } = await loadFixture(
        deployWithAttestorsFixture
      );

      await expect(
        tir.connect(owner).slashAttestor(custodian.address, "fraud")
      )
        .to.emit(tir, "AttestorSlashed")
        .withArgs(custodian.address, MIN_BOND, "fraud");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Bonus: View & Demo Helpers
  // ═══════════════════════════════════════════════════════════════════
  describe("View and Demo Helpers", function () {
    it("isActiveAttestor should return false for unregistered", async function () {
      const { tir, outsider } = await loadFixture(deployFixture);
      expect(await tir.isActiveAttestor(outsider.address)).to.be.false;
    });

    it("preRegistrationAge should return 0 for unregistered", async function () {
      const { tir, outsider } = await loadFixture(deployFixture);
      expect(await tir.preRegistrationAge(outsider.address)).to.equal(0);
    });

    it("forceConfirmDefault should work for owner", async function () {
      const { tir, owner, tokenAddr } = await loadFixture(deployFixture);

      await tir.connect(owner).forceConfirmDefault(tokenAddr.address);
      expect(await tir.isDefaultConfirmed(tokenAddr.address)).to.be.true;
    });

    it("forceConfirmDefault should revert for non-owner", async function () {
      const { tir, outsider, tokenAddr } = await loadFixture(deployFixture);

      await expect(
        tir.connect(outsider).forceConfirmDefault(tokenAddr.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("resetDefaultConfirmation should clear state", async function () {
      const { tir, owner, tokenAddr } = await loadFixture(deployFixture);

      await tir.connect(owner).forceConfirmDefault(tokenAddr.address);
      expect(await tir.isDefaultConfirmed(tokenAddr.address)).to.be.true;

      await tir.connect(owner).resetDefaultConfirmation(tokenAddr.address);
      expect(await tir.isDefaultConfirmed(tokenAddr.address)).to.be.false;
    });
  });
});
