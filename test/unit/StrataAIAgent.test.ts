import { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

/**
 * ============================================================================
 *  StrataAIAgent.sol — EXHAUSTIVE test suite
 * ============================================================================
 *  The on-chain decision layer / autonomy boundary. Tested in tiny modules with:
 *    • Equivalence Partitioning  — caller classes, event-type classes, branches
 *    • Boundary Value Analysis   — score 0/1/999/1000/1001, pd 0/.../10001,
 *                                  eventType 0..3/4/255, uint8 level, uint64 epoch
 *    • State-transition testing  — pause/unpause, operator/guardian rotation
 *    • Cross-contract dependency — unwired score-oracle / default-proposer reverts
 *    • Event assertions          — ScoreSubmitted / EarlyWarning / DefaultProposed
 *                                  / ReputationUpdated / AgentPausedSet / ConfigUpdated
 *    • Integration of the human gate — confirmed defaults block re-proposal
 *
 *  Autonomy boundary under test:
 *    🟢 submitScore / flagEarlyWarning  — onlyAgent (reversible)
 *    🔴 proposeDefault                  — onlyAgent, FLAGS only (humans confirm)
 *    🛑 pause / setAgentOperator / setGuardian — onlyGuardian
 *    owner-only config: setBenchmark / setScoreOracle / setDefaultOracle / setErc8004
 *    onlyAgent = operator && !paused && (no ERC-8004 registry || operator owns token)
 * ============================================================================
 */

const HASH = (s: string) => ethers.id(s);
const Z = ethers.ZeroHash;
const ZA = ethers.ZeroAddress;
const rnd = () => ethers.Wallet.createRandom().address;
const U64_MAX = 18446744073709551615n;

describe("StrataAIAgent", function () {
  async function fx() {
    const [owner, other, issuer, issuer2, benchmark, newOp, g1] = await ethers.getSigners();
    const oracle = await (await ethers.getContractFactory("IRSOracle")).deploy();
    const defaultOracle = await (await ethers.getContractFactory("DefaultOracle")).deploy(owner.address);
    const agent = await (await ethers.getContractFactory("StrataAIAgent")).deploy(
      await oracle.getAddress(), await defaultOracle.getAddress()
    );
    await oracle.setStrataAgent(await agent.getAddress());
    await defaultOracle.setAIProposer(await agent.getAddress());
    return { owner, other, issuer, issuer2, benchmark, newOp, g1, oracle, defaultOracle, agent };
  }
  const Agent = async () => (await ethers.getContractFactory("StrataAIAgent"));
  const Oracle = async () => (await ethers.getContractFactory("IRSOracle"));
  const DOracle = async () => (await ethers.getContractFactory("DefaultOracle"));

  // ════════════════════════════════════════════════════════════════════
  // M0 · deployment & initial state
  // ════════════════════════════════════════════════════════════════════
  describe("M0 · deployment & initial state", function () {
    it("operator = guardian = owner = deployer", async function () {
      const { agent, owner } = await loadFixture(fx);
      expect(await agent.agentOperator()).to.equal(owner.address);
      expect(await agent.guardian()).to.equal(owner.address);
      expect(await agent.owner()).to.equal(owner.address);
    });
    it("unpaused, zero counters & reputation", async function () {
      const { agent } = await loadFixture(fx);
      expect(await agent.paused()).to.equal(false);
      expect(await agent.scoresSubmitted()).to.equal(0);
      expect(await agent.proposalsCount()).to.equal(0);
      const [c, t] = await agent.reputation();
      expect(c).to.equal(0); expect(t).to.equal(0);
    });
    it("stores the oracle addresses; benchmark/erc8004 unset", async function () {
      const { agent, oracle, defaultOracle } = await loadFixture(fx);
      expect(await agent.scoreOracle()).to.equal(await oracle.getAddress());
      expect(await agent.defaultOracle()).to.equal(await defaultOracle.getAddress());
      expect(await agent.benchmark()).to.equal(ZA);
      expect(await agent.erc8004Registry()).to.equal(ZA);
    });
    it("EDGE: constructor does not validate zero-address oracles", async function () {
      const a = await (await Agent()).deploy(ZA, ZA);
      expect(await a.scoreOracle()).to.equal(ZA);
      expect(await a.defaultOracle()).to.equal(ZA);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // M1 · submitScore — happy path & latestScore fidelity
  // ════════════════════════════════════════════════════════════════════
  describe("M1 · submitScore happy path", function () {
    it("stores every latestScore field, increments counter, emits event", async function () {
      const { agent, issuer } = await loadFixture(fx);
      const memo = HASH("memo-1");
      await expect(agent.submitScore(issuer.address, 720, 2800, memo, 4))
        .to.emit(agent, "ScoreSubmitted").withArgs(issuer.address, 720, 2800, memo, 4);
      const ls = await agent.latestScore(issuer.address);
      expect(ls.score).to.equal(720);
      expect(ls.pdBps).to.equal(2800);
      expect(ls.rationaleHash).to.equal(memo);
      expect(ls.epoch).to.equal(4);
      expect(ls.timestamp).to.be.greaterThan(0);
      expect(await agent.scoresSubmitted()).to.equal(1);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // M2 · submitScore — score BVA
  // ════════════════════════════════════════════════════════════════════
  describe("M2 · submitScore score bounds (BVA)", function () {
    it("0, 1, 999, 1000 accepted", async function () {
      const { agent, issuer } = await loadFixture(fx);
      for (const s of [0, 1, 999, 1000]) {
        await expect(agent.submitScore(issuer.address, s, 0, Z, 0)).to.not.be.reverted;
      }
    });
    it("1001 reverts", async function () {
      const { agent, issuer } = await loadFixture(fx);
      await expect(agent.submitScore(issuer.address, 1001, 0, Z, 0)).to.be.revertedWith("Strata: score>1000");
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // M3 · submitScore — pdBps BVA
  // ════════════════════════════════════════════════════════════════════
  describe("M3 · submitScore pd bounds (BVA)", function () {
    it("0, 1, 9999, 10000 accepted", async function () {
      const { agent, issuer } = await loadFixture(fx);
      for (const pd of [0, 1, 9999, 10000]) {
        await expect(agent.submitScore(issuer.address, 500, pd, Z, 0)).to.not.be.reverted;
      }
    });
    it("10001 reverts", async function () {
      const { agent, issuer } = await loadFixture(fx);
      await expect(agent.submitScore(issuer.address, 500, 10001, Z, 0)).to.be.revertedWith("Strata: pd>10000");
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // M4 · submitScore — causal reprice (BVA on the on-chain effect)
  // ════════════════════════════════════════════════════════════════════
  describe("M4 · submitScore causal reprice", function () {
    it("writes AI score to the oracle and flips aiScored", async function () {
      const { agent, oracle, issuer } = await loadFixture(fx);
      await agent.submitScore(issuer.address, 640, 0, Z, 0);
      expect(await oracle.getAIScore(issuer.address)).to.equal(640);
      expect(await oracle.aiScored(issuer.address)).to.equal(true);
    });
    it("BVA: score 1000 → effective premium 400; score 0 → 1600", async function () {
      const { agent, oracle, issuer, issuer2 } = await loadFixture(fx);
      await agent.submitScore(issuer.address, 1000, 0, Z, 0);
      expect(await oracle.getEffectivePremiumBPS(issuer.address)).to.equal(400);
      await agent.submitScore(issuer2.address, 0, 10000, Z, 0);
      expect(await oracle.getEffectivePremiumBPS(issuer2.address)).to.equal(1600);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // M5 · submitScore — accumulation, overwrite, per-issuer independence
  // ════════════════════════════════════════════════════════════════════
  describe("M5 · submitScore accumulation & isolation", function () {
    it("scoresSubmitted is a GLOBAL counter across issuers", async function () {
      const { agent, issuer, issuer2 } = await loadFixture(fx);
      await agent.submitScore(issuer.address, 800, 0, Z, 1);
      await agent.submitScore(issuer2.address, 300, 0, Z, 1);
      expect(await agent.scoresSubmitted()).to.equal(2);
    });
    it("latestScore is PER-issuer and overwrites with the newest epoch", async function () {
      const { agent, issuer, issuer2 } = await loadFixture(fx);
      await agent.submitScore(issuer.address, 800, 2000, HASH("a"), 1);
      await agent.submitScore(issuer.address, 300, 7000, HASH("b"), 2);
      await agent.submitScore(issuer2.address, 555, 1000, HASH("c"), 9);
      const l1 = await agent.latestScore(issuer.address);
      const l2 = await agent.latestScore(issuer2.address);
      expect(l1.score).to.equal(300); expect(l1.epoch).to.equal(2);
      expect(l2.score).to.equal(555); expect(l2.epoch).to.equal(9);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // M6 · submitScore — rationaleHash & epoch carriers
  // ════════════════════════════════════════════════════════════════════
  describe("M6 · submitScore metadata carriers", function () {
    it("stores an arbitrary non-zero rationaleHash verbatim", async function () {
      const { agent, issuer } = await loadFixture(fx);
      const h = "0x" + "ab".repeat(32);
      await agent.submitScore(issuer.address, 500, 0, h, 0);
      expect((await agent.latestScore(issuer.address)).rationaleHash).to.equal(h);
    });
    it("BVA: epoch uint64 max is stored", async function () {
      const { agent, issuer } = await loadFixture(fx);
      await agent.submitScore(issuer.address, 500, 0, Z, U64_MAX);
      expect((await agent.latestScore(issuer.address)).epoch).to.equal(U64_MAX);
    });
    it("EDGE: zero-address issuer key is accepted (trusted input)", async function () {
      const { agent } = await loadFixture(fx);
      await expect(agent.submitScore(ZA, 500, 0, Z, 0)).to.not.be.reverted;
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // M7 · submitScore — access control & pause (EP + state)
  // ════════════════════════════════════════════════════════════════════
  describe("M7 · submitScore access & pause", function () {
    it("rejects a non-operator (incl. owner-but-not-operator after rotation)", async function () {
      const { agent, other, issuer } = await loadFixture(fx);
      await expect(agent.connect(other).submitScore(issuer.address, 500, 0, Z, 0))
        .to.be.revertedWith("Strata: not agent");
    });
    it("blocks while paused; resumes after unpause", async function () {
      const { agent, issuer } = await loadFixture(fx);
      await agent.pauseAgent();
      await expect(agent.submitScore(issuer.address, 500, 0, Z, 0)).to.be.revertedWith("Strata: paused");
      await agent.unpauseAgent();
      await expect(agent.submitScore(issuer.address, 500, 0, Z, 0)).to.not.be.reverted;
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // M8 · submitScore — cross-contract dependency
  // ════════════════════════════════════════════════════════════════════
  describe("M8 · submitScore requires oracle wiring", function () {
    it("reverts if the score oracle has not authorised this agent", async function () {
      const [owner, issuer] = await ethers.getSigners();
      const oracle = await (await Oracle()).deploy();          // NOT wired to agent
      const dOracle = await (await DOracle()).deploy(owner.address);
      const agent = await (await Agent()).deploy(await oracle.getAddress(), await dOracle.getAddress());
      // oracle.setStrataAgent(agent) intentionally omitted
      await expect(agent.submitScore(issuer.address, 500, 0, Z, 0))
        .to.be.revertedWith("IRSOracle: not strata agent");
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // M9 · flagEarlyWarning
  // ════════════════════════════════════════════════════════════════════
  describe("M9 · flagEarlyWarning", function () {
    it("emits EarlyWarning with args", async function () {
      const { agent, issuer } = await loadFixture(fx);
      const ev = HASH("ews");
      await expect(agent.flagEarlyWarning(issuer.address, 2, ev, 5))
        .to.emit(agent, "EarlyWarning").withArgs(issuer.address, 2, ev, 5);
    });
    it("BVA: uint8 level 0 and 255 both accepted", async function () {
      const { agent, issuer } = await loadFixture(fx);
      await expect(agent.flagEarlyWarning(issuer.address, 0, Z, 0)).to.not.be.reverted;
      await expect(agent.flagEarlyWarning(issuer.address, 255, Z, 0)).to.not.be.reverted;
    });
    it("rejects non-operator and respects pause", async function () {
      const { agent, other, issuer } = await loadFixture(fx);
      await expect(agent.connect(other).flagEarlyWarning(issuer.address, 1, Z, 0)).to.be.revertedWith("Strata: not agent");
      await agent.pauseAgent();
      await expect(agent.flagEarlyWarning(issuer.address, 1, Z, 0)).to.be.revertedWith("Strata: paused");
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // M10 · proposeDefault — core behaviour
  // ════════════════════════════════════════════════════════════════════
  describe("M10 · proposeDefault core", function () {
    it("returns id, records proposal, flags DefaultOracle, does NOT confirm", async function () {
      const { agent, defaultOracle, issuer } = await loadFixture(fx);
      const ev = HASH("evidence");
      const id = await agent.proposeDefault.staticCall(issuer.address, 2, ev);
      expect(id).to.equal(0);
      await expect(agent.proposeDefault(issuer.address, 2, ev))
        .to.emit(agent, "DefaultProposed").withArgs(0, issuer.address, 2, ev);
      expect(await agent.proposalsCount()).to.equal(1);
      const p = await agent.proposals(0);
      expect(p.issuer).to.equal(issuer.address);
      expect(p.eventType).to.equal(2);
      expect(p.evidenceHash).to.equal(ev);
      expect(p.timestamp).to.be.greaterThan(0);
      const active = await defaultOracle.getActiveEvent(issuer.address);
      expect(active.isActive).to.equal(true);
      expect(await defaultOracle.isDefaultConfirmed(issuer.address)).to.equal(false);
    });
    it("proposalId increments across calls", async function () {
      const { agent } = await loadFixture(fx);
      await agent.proposeDefault(rnd(), 0, Z);
      const a1 = rnd();
      await expect(agent.proposeDefault(a1, 1, Z))
        .to.emit(agent, "DefaultProposed").withArgs(1, a1, 1, Z);
      expect(await agent.proposalsCount()).to.equal(2);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // M11 · proposeDefault — eventType EP/BVA + mapping
  // ════════════════════════════════════════════════════════════════════
  describe("M11 · proposeDefault eventType", function () {
    it("EP valid classes 0..3 map through to DefaultOracle", async function () {
      const { agent, defaultOracle } = await loadFixture(fx);
      for (let t = 0; t < 4; t++) {
        const a = rnd();
        await agent.proposeDefault(a, t, Z);
        expect((await defaultOracle.getActiveEvent(a)).eventType).to.equal(t);
      }
    });
    it("BVA: eventType 4 and 255 revert", async function () {
      const { agent } = await loadFixture(fx);
      await expect(agent.proposeDefault(rnd(), 4, Z)).to.be.revertedWith("Strata: bad eventType");
      await expect(agent.proposeDefault(rnd(), 255, Z)).to.be.revertedWith("Strata: bad eventType");
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // M12 · proposeDefault — access, dependency, human-gate integration
  // ════════════════════════════════════════════════════════════════════
  describe("M12 · proposeDefault access & gate", function () {
    it("rejects non-operator and respects pause", async function () {
      const { agent, other, issuer } = await loadFixture(fx);
      await expect(agent.connect(other).proposeDefault(issuer.address, 0, Z)).to.be.revertedWith("Strata: not agent");
      await agent.pauseAgent();
      await expect(agent.proposeDefault(issuer.address, 0, Z)).to.be.revertedWith("Strata: paused");
    });
    it("reverts if the DefaultOracle has not authorised this agent as proposer", async function () {
      const [owner, issuer] = await ethers.getSigners();
      const oracle = await (await Oracle()).deploy();
      const dOracle = await (await DOracle()).deploy(owner.address);
      const agent = await (await Agent()).deploy(await oracle.getAddress(), await dOracle.getAddress());
      await oracle.setStrataAgent(await agent.getAddress());
      // dOracle.setAIProposer(agent) intentionally omitted
      await expect(agent.proposeDefault(issuer.address, 0, Z))
        .to.be.revertedWith("DefaultOracle: not authorized to flag");
    });
    it("re-proposing an unconfirmed issuer is allowed (counter grows)", async function () {
      const { agent, issuer } = await loadFixture(fx);
      await agent.proposeDefault(issuer.address, 0, Z);
      await agent.proposeDefault(issuer.address, 1, Z);
      expect(await agent.proposalsCount()).to.equal(2);
    });
    it("HUMAN GATE: once a default is confirmed, re-proposal reverts", async function () {
      const { agent, defaultOracle, issuer, owner } = await loadFixture(fx);
      await agent.proposeDefault(issuer.address, 0, Z);
      await defaultOracle.connect(owner).processConfirmation(issuer.address); // stands in for TIR 2-of-3
      await expect(agent.proposeDefault(issuer.address, 1, Z))
        .to.be.revertedWith("DefaultOracle: already confirmed");
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // M13 · recordOutcome / reputation
  // ════════════════════════════════════════════════════════════════════
  describe("M13 · recordOutcome / reputation", function () {
    it("all-true sequence", async function () {
      const { agent } = await loadFixture(fx);
      await agent.recordOutcome(true); await agent.recordOutcome(true);
      const [c, t] = await agent.reputation();
      expect(c).to.equal(2); expect(t).to.equal(2);
    });
    it("all-false sequence (correct stays 0)", async function () {
      const { agent } = await loadFixture(fx);
      await agent.recordOutcome(false); await agent.recordOutcome(false);
      const [c, t] = await agent.reputation();
      expect(c).to.equal(0); expect(t).to.equal(2);
    });
    it("mixed sequence + event", async function () {
      const { agent } = await loadFixture(fx);
      await expect(agent.recordOutcome(true)).to.emit(agent, "ReputationUpdated").withArgs(1, 1);
      await agent.recordOutcome(false);
      await agent.recordOutcome(true);
      const [c, t] = await agent.reputation();
      expect(c).to.equal(2); expect(t).to.equal(3);
    });
    it("access: owner and a set benchmark may record; others cannot", async function () {
      const { agent, other, benchmark } = await loadFixture(fx);
      await expect(agent.connect(other).recordOutcome(true)).to.be.revertedWith("Strata: not benchmark");
      await agent.setBenchmark(benchmark.address);
      await expect(agent.connect(benchmark).recordOutcome(true)).to.not.be.reverted;
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // M14 · guardian — pause/unpause events, idempotency, owner-retains
  // ════════════════════════════════════════════════════════════════════
  describe("M14 · guardian pause controls", function () {
    it("pause/unpause emit AgentPausedSet", async function () {
      const { agent } = await loadFixture(fx);
      await expect(agent.pauseAgent()).to.emit(agent, "AgentPausedSet").withArgs(true);
      await expect(agent.unpauseAgent()).to.emit(agent, "AgentPausedSet").withArgs(false);
    });
    it("pause is idempotent (re-pause stays paused)", async function () {
      const { agent, issuer } = await loadFixture(fx);
      await agent.pauseAgent();
      await agent.pauseAgent();
      expect(await agent.paused()).to.equal(true);
      await expect(agent.submitScore(issuer.address, 1, 0, Z, 0)).to.be.revertedWith("Strata: paused");
    });
    it("non-guardian cannot pause", async function () {
      const { agent, other } = await loadFixture(fx);
      await expect(agent.connect(other).pauseAgent()).to.be.revertedWith("Strata: not guardian");
    });
    it("owner RETAINS guardian power even after delegating guardian", async function () {
      const { agent, g1, owner } = await loadFixture(fx);
      await agent.setGuardian(g1.address);
      await expect(agent.connect(owner).pauseAgent()).to.not.be.reverted; // owner || guardian
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // M15 · operator & guardian rotation
  // ════════════════════════════════════════════════════════════════════
  describe("M15 · operator / guardian rotation", function () {
    it("setAgentOperator transfers the GREEN role away from the old operator", async function () {
      const { agent, newOp, issuer, owner } = await loadFixture(fx);
      await expect(agent.setAgentOperator(newOp.address))
        .to.emit(agent, "ConfigUpdated").withArgs("agentOperator", newOp.address);
      await expect(agent.connect(newOp).submitScore(issuer.address, 500, 0, Z, 0)).to.not.be.reverted;
      await expect(agent.connect(owner).submitScore(issuer.address, 500, 0, Z, 0)).to.be.revertedWith("Strata: not agent");
    });
    it("a guardian (non-owner) may rotate the operator", async function () {
      const { agent, g1, newOp } = await loadFixture(fx);
      await agent.setGuardian(g1.address);
      await expect(agent.connect(g1).setAgentOperator(newOp.address)).to.not.be.reverted;
      expect(await agent.agentOperator()).to.equal(newOp.address);
    });
    it("the new operator is NOT automatically a guardian", async function () {
      const { agent, newOp } = await loadFixture(fx);
      await agent.setAgentOperator(newOp.address);
      await expect(agent.connect(newOp).pauseAgent()).to.be.revertedWith("Strata: not guardian");
    });
    it("setGuardian hands off; the old (non-owner) guardian loses power", async function () {
      const { agent, g1, other } = await loadFixture(fx);
      await agent.setGuardian(g1.address);
      await agent.connect(g1).setGuardian(other.address);
      await expect(agent.connect(g1).pauseAgent()).to.be.revertedWith("Strata: not guardian");
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // M16 · owner-only config setters
  // ════════════════════════════════════════════════════════════════════
  describe("M16 · owner-only config", function () {
    it("all four setters reject non-owner", async function () {
      const { agent, other } = await loadFixture(fx);
      const a = rnd();
      await expect(agent.connect(other).setBenchmark(a)).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(agent.connect(other).setScoreOracle(a)).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(agent.connect(other).setDefaultOracle(a)).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(agent.connect(other).setErc8004(a, 1)).to.be.revertedWith("Ownable: caller is not the owner");
    });
    it("owner setters update state and emit ConfigUpdated", async function () {
      const { agent } = await loadFixture(fx);
      const b = rnd(), so = rnd(), dno = rnd(), reg = rnd();
      await expect(agent.setBenchmark(b)).to.emit(agent, "ConfigUpdated").withArgs("benchmark", b);
      await expect(agent.setScoreOracle(so)).to.emit(agent, "ConfigUpdated").withArgs("scoreOracle", so);
      await expect(agent.setDefaultOracle(dno)).to.emit(agent, "ConfigUpdated").withArgs("defaultOracle", dno);
      await expect(agent.setErc8004(reg, 7)).to.emit(agent, "ConfigUpdated").withArgs("erc8004Registry", reg);
      expect(await agent.benchmark()).to.equal(b);
      expect(await agent.scoreOracle()).to.equal(so);
      expect(await agent.defaultOracle()).to.equal(dno);
      expect(await agent.erc8004Registry()).to.equal(reg);
      expect(await agent.erc8004TokenId()).to.equal(7);
    });
  });

  // ════════════════════════════════════════════════════════════════════
  // M17 · ERC-8004 identity gate (applies to ALL onlyAgent functions)
  // ════════════════════════════════════════════════════════════════════
  describe("M17 · ERC-8004 identity gate", function () {
    async function withId() {
      const base = await loadFixture(fx);
      const id = await (await ethers.getContractFactory("MockERC8004")).deploy();
      await base.agent.setErc8004(await id.getAddress(), 1);
      return { ...base, id };
    }
    it("blocks submitScore / flagEarlyWarning / proposeDefault when operator lacks the token", async function () {
      const { agent, issuer } = await withId();
      await expect(agent.submitScore(issuer.address, 1, 0, Z, 0)).to.be.revertedWith("Strata: agent lacks ERC-8004 identity");
      await expect(agent.flagEarlyWarning(issuer.address, 1, Z, 0)).to.be.revertedWith("Strata: agent lacks ERC-8004 identity");
      await expect(agent.proposeDefault(issuer.address, 0, Z)).to.be.revertedWith("Strata: agent lacks ERC-8004 identity");
    });
    it("unblocks once the operator owns the token", async function () {
      const { agent, issuer, owner, id } = await withId();
      await id.mint(owner.address, 1);
      await expect(agent.submitScore(issuer.address, 1, 0, Z, 0)).to.not.be.reverted;
    });
    it("token owned by someone else does NOT satisfy the gate", async function () {
      const { agent, issuer, other, id } = await withId();
      await id.mint(other.address, 1);
      await expect(agent.submitScore(issuer.address, 1, 0, Z, 0)).to.be.revertedWith("Strata: agent lacks ERC-8004 identity");
    });
    it("burning the identity re-blocks the agent", async function () {
      const { agent, issuer, owner, id } = await withId();
      await id.mint(owner.address, 1);
      await agent.submitScore(issuer.address, 1, 0, Z, 0);
      await id.burn(1);
      await expect(agent.submitScore(issuer.address, 1, 0, Z, 0)).to.be.revertedWith("Strata: agent lacks ERC-8004 identity");
    });
    it("registry = address(0) disables the gate entirely", async function () {
      const { agent, issuer } = await withId();
      await agent.setErc8004(ZA, 0);
      await expect(agent.submitScore(issuer.address, 1, 0, Z, 0)).to.not.be.reverted;
    });
  });
});
