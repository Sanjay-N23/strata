# Strata AI Underwriter — off-chain agent

The autonomous agent behind Strata's Turing benchmark. It continuously re-underwrites
an issuer, reasons over its signals, and acts on-chain.

## Loop

```
perceive (ReplayOracle signals)
  -> reason  (Z.AI GLM-4.6 credit memo)
  -> score   (pdModel.ts — deterministic scorecard)
  -> ACT     (StrataAIAgent.submitScore = causal reprice;
              TuringBenchmark.record; proposeDefault on distress)
```

## Hybrid design (honest AI)

- **`pdModel.ts`** produces the *number* (score 0–1000, PD bps). Deterministic →
  the benchmark is reproducible (rebuts "one lucky run").
- **`zai.ts`** (GLM-4.6) produces the *credit memo* — the reasoning a judge reads.
  Falls back to the deterministic rationale if `ZAI_API_KEY` is unset.
- The static "human rulebook" arm (`IRSOracle.computeStaticScore`) is blind to
  sentiment; the AI uses it — which is **why the AI flags distress earlier**.

## Run

Deploy first (`scripts/deploy.ts`), then:

```bash
# local hardhat node
NETWORK=localhost ISSUER_ADDRESS=0x... npx ts-node agent/index.ts

# Mantle Sepolia
NETWORK=mantleSepolia ISSUER_ADDRESS=0x... npx ts-node agent/index.ts
```

Settle the benchmark (owner):

```bash
ISSUER_ADDRESS=0x... npx hardhat run scripts/strata-resolve.ts --network <net>
```

## Env (`.env` in repo root)

| Var | Purpose |
|---|---|
| `DEPLOYER_PRIVATE_KEY` | operator wallet (submits scores) |
| `ISSUER_ADDRESS` | the RWA token / issuer key being underwritten |
| `ZAI_API_KEY` | optional — GLM-4.6 memo (offline fallback if unset) |
| `RPC_URL` | optional — overrides the default RPC for the network |
| `NETWORK` | `mantleSepolia` (default) / `localhost` / ... |
| `ZAI_MODEL` | optional — defaults to `glm-4.6` |
| `ZAI_BASE_URL` | optional — overrides the Z.AI endpoint (defaults to `api.z.ai`) |

## Proof

`test/integration/TuringBenchmark.test.ts` replays the real **USDC–SVB depeg**
on-chain and asserts the AI's lead-time beats the rulebook (AI alarms 3 epochs
early; rulebook only at the event).
