# Strata — Demo Script (Turing Test Hackathon 2026, Mantle)

**One-liner:** Strata is an autonomous AI underwriting desk for RWA credit risk. An AI agent
continuously re-underwrites issuers, prices risk, and acts on-chain — and **proves on-chain that
it flags distress earlier than the static rulebook**. That proof *is* the Turing Test.

---

## The hook (15s)

> "Tokenized RWAs have $26B+ on-chain and zero automated issuer-default protection. Strata is an
> AI underwriter that watches them 24/7. To prove it works, we replayed the **real USDC–SVB depeg**
> on-chain: our AI flagged the collateral shortfall **3 epochs before** the rules-based baseline.
> AI proposes; humans still adjudicate. Here it is, live on Mantle."

---

## 3-minute live walkthrough

### 1. The Console (45s) — `frontend/console.html`
- **Turing Scoreboard**: AI Underwriter **+3 epochs** early vs rulebook **0**. Verdict: *AI passed the Turing Test*.
- Hit **▶ Play replay**. Watch the feed: at **epoch 3 (Mar 10)** the AI score crosses into **DISTRESS (250)**
  while the rulebook still reads **926** — calm. The AI saw the confidence collapse; the rulebook is
  blind to sentiment by construction.
- Point at the **memo**: the AI's rationale ("acute confidence collapse → distress override").

### 2. The human gate (30s)
- **Autonomy Boundary** panel: 🟢 GREEN (score/reprice/warn) is autonomous; 🔴 RED (declare default)
  is **AI-proposes / humans-dispose**. During the crisis the AI *proposes* a COLLATERAL_SHORTFALL
  default — but it shows **"awaiting 2-of-3 human attestation."** The AI **cannot** confirm a default.
- This is the institutional-trust story: AI automates everything reversible; humans adjudicate everything legal.

### 3. Identity & reputation (20s)
- ERC-8004 agent identity + **reputation 1/1** — earned only from a correct, *timely* call, never self-asserted.

### 4. The on-chain proof (45s) — terminal
```bash
npx hardhat test test/integration/TuringBenchmark.test.ts
```
- Replays USDC–SVB on-chain. Asserts: AI lead **3**, static lead **0**, winner **AI**, reputation earned,
  and the AI **proposes but cannot confirm** the default. Deterministic → reproducible (temp=0, seeded).

### 5. Live on Mantle (20s)
- Console **"Load live tally"** reads `TuringBenchmark.tally()` from the deployed contract on Mantle Sepolia.
- `submitScore()` is the AI-powered on-chain function — it reprices the issuer in the same tx (**Deployment Award**).

---

## Why it wins

| Hackathon demand | Strata's answer |
|---|---|
| On-chain AI benchmarking | The Turing harness is a reference implementation — real ground truth (USDC–SVB) |
| AI x RWA (Track 3) | Autonomous AI underwriting + risk management of RWA issuers on Mantle |
| Agents adapting in real time | Continuous re-underwriting loop; sentiment-driven distress detection |
| ERC-8004 identity + reputation | Every agent has one; reputation accrues only from correct calls |
| Institutional trust | Human-in-the-loop 2-of-3 gate for all legal/irreversible actions |
| Judges (Z.AI, Allora, Nansen, Virtuals) | GLM-4.6 brain · scorecard inference · sentiment signals · agent reputation |

## Honest framing (pre-empt the skeptics)
- The benchmark uses **real** USDC–SVB data, not a scripted scenario.
- USDC **repegged** — this measures who flagged the *shortfall event* earliest, not permanent failure.
- The "AI" is a **hybrid**: a deterministic scorecard produces the number (reproducible); the LLM writes the memo.
- The win is **continuous, autonomous, earlier** underwriting — not a claim of superhuman judgment.

## Architecture (one breath)
12 core contracts (reused) + Strata AI layer: `StrataAIAgent` (autonomy boundary, causal reprice),
`TuringBenchmark` (on-chain AI-vs-rulebook record), `ReplayOracle` (ground-truth feed), AI-arm on
`IRSOracle`, AI-proposer hook on `DefaultOracle`. **900+ tests pass.** Off-chain agent: Z.AI GLM-4.6 + PD scorecard.
