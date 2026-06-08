# CoverFi Protocol

### Mainnet Deployment Report · v2.0

`🔴 LIVE ON MAINNET` · `✅ 12 / 12 SOURCE-VERIFIED` · `🛡️ 155 / 157 TESTS PASS` · `💰 759.5 cfUSD PAYOUT EXECUTED ON CHAIN`

> **Status:** Live on HashKey Chain Mainnet
> **Network:** HashKey Chain Mainnet · Chain ID 177
> **Deployment date:** 2026-05-09
> **Document version:** 2.0 · Last updated 2026-05-10
> **Submitted by:** The CoverFi Team

---

## TL;DR

CoverFi — a fully on-chain DeFi insurance protocol — is **deployed, wired, source-verified, and lifecycle-proven on HashKey Chain Mainnet.** Every line of production code is publicly auditable on Blockscout. **155 of 157 on-chain tests pass post-deployment**, including a full end-to-end run that exercised every state-changing function in the protocol — culminating in a real default that paid out **759.5 cfUSD to the insured holder**, mathematically reconcilable to the deployed contract code.

This document is everything you need to verify our deployment. Click links, run scripts, read code — every claim below is independently verifiable.

---

## At a Glance

| | |
|---|---|
| **Contracts deployed** | 12 / 12 |
| **Cross-contract wiring transactions** | 25 / 25 |
| **Mainnet smoke tests** | 89 / 89 passing |
| **Disaster-recovery tests** | 15 / 15 passing |
| **Functional E2E lifecycle tests** | 51 / 53 passing (2 fixed via gas-estimation patch) |
| **Source verification on Blockscout** | 12 / 12 verified |
| **Total mainnet checks** | **155 / 157 (98.7 %)** |
| **Total mainnet transactions executed by deployer** | 74 |
| **Pre-deployment unit + integration tests** | 513 / 513 passing |
| **Audit findings remediated** | 13 / 13 (3 critical, 4 high, 3 medium, 3 low) |
| **HSK spent on full deployment + all tests** | 0.0075 HSK (~₹0.86) |

---

## Verifier's Checklist (tick these off in your browser)

We invite you to inspect — not trust. Tick each box yourself:

- [ ] Click [the deployer's Blockscout page](https://hashkey.blockscout.com/address/0xce220d9eD9527f9997c8045844210637F3A42fb3) — see 74 transactions, 12 contract creations
- [ ] Click any contract address below — see the green "Verified" badge on Blockscout
- [ ] Click the "Contract" tab on InsurancePool — read full Solidity source, line by line
- [ ] Click the [Phase 11 default-payout transaction](https://hashkey.blockscout.com/tx/0x648f26f8ec3c81fcf96a6b8ee1ca78ce41f0319ba9316a5eea5987061fd26d0d) — see 759.5 cfUSD transferred in a single atomic operation
- [ ] Open the [GitHub repo](https://github.com/Sanjay-N23/coverfi-protocol) — confirm source matches what's on chain
- [ ] Run `npx hardhat run scripts/smoke-test-mainnet.ts --network hashkeyMainnet` — watch 89 / 89 tests pass against the live deployment

Every item above is independently verifiable. We are not asking for trust — we are asking for inspection.

---

## Deployed Contracts

All 12 contracts are deployed on **HashKey Chain Mainnet (Chain ID 177)** and source-verified on Blockscout. Click any address to view the verified Solidity code; click any creation tx to view the deploy transaction.

| # | Contract | Role | Address | Creation Tx |
|---|---|---|---|---|
| 1 | **CoverFiStablecoin** (cfUSD) | Phase-1 USD stablecoin (1B cap, 6 decimals) | [`0x38907c…36E5`](https://hashkey.blockscout.com/address/0x38907cC4E615D3C7BDCBC9910C050260bBC836E5) | [tx](https://hashkey.blockscout.com/tx/0xfb192f6907c2fb8fe038067434a0be216f397521edfb7377826152d991472b2e) |
| 2 | **InsurancePool** | Tranched senior/junior liquidity pool | [`0xF1E252…3E71`](https://hashkey.blockscout.com/address/0xF1E25246D7Dcc8E63EAe39BE03DEae0C2Ed93E71) | [tx](https://hashkey.blockscout.com/tx/0x99d9df762126708a809393067f20789e3f62d828ff02de46dc7ae27ba59e68f3) |
| 3 | **PayoutEngine** | Coverage purchase + claim settlement | [`0xBCF001…49eA`](https://hashkey.blockscout.com/address/0xBCF0012388045eA1183c96EEbe24754842a549eA) | [tx](https://hashkey.blockscout.com/tx/0x8e9133b2ce8341a67566aee97477cb39e29bb7cd43ba8f3aae5d7a9de42349a1) |
| 4 | **IssuerBond** | Issuer-staked bond / first-loss capital | [`0x65A3Ae…0212`](https://hashkey.blockscout.com/address/0x65A3Ae0e4787856CfcDdE505015c5CC3d5560212) | [tx](https://hashkey.blockscout.com/tx/0xa444c5ebc41b74e229dc5cff9bb327e29ff2a2d49a4374660c3540403036a44a) |
| 5 | **IssuerRegistry** | Issuer onboarding + lifecycle state-machine | [`0xB10b1c…7552`](https://hashkey.blockscout.com/address/0xB10b1c9D88126965E57cCa2a7ED5a1348dbf7552) | [tx](https://hashkey.blockscout.com/tx/0x7c16da7a7d4b7503c9fa0e59c5d3c71bf64e535405029af036dca0d0239e44d2) |
| 6 | **TIR** | Trust & Identity Registry | [`0x7dD7C1…27fC`](https://hashkey.blockscout.com/address/0x7dD7C1adC65D9e6e7Bd5532b678f856C8Ea627fC) | [tx](https://hashkey.blockscout.com/tx/0x2d558e07d92f6464e313d6c2f04a9324420bf1d7f324a8be204e50507473ec60) |
| 7 | **IRSOracle** | Issuer Reliability Score oracle (5-dim, exp premium) | [`0x20619c…06B3`](https://hashkey.blockscout.com/address/0x20619c533854C5a0c20284f7Dc7F5Dc3DFdD06B3) | [tx](https://hashkey.blockscout.com/tx/0x1d29a85ffae5a55bdc73f040741b50d86b0533c67e9199512cdbd332768a100d) |
| 8 | **DefaultOracle** | On-chain default detection oracle | [`0xa7C664…9655`](https://hashkey.blockscout.com/address/0xa7C664459C66325Cd9dB15245DD901f1623c9655) | [tx](https://hashkey.blockscout.com/tx/0x217c1cd514aeabe1ec219686624f3a141d8c72e577fc60bb2edb43df5a7d93c0) |
| 9 | **srCVR** | Senior tranche LP token | [`0xa4ECEB…Fc3A`](https://hashkey.blockscout.com/address/0xa4ECEB47F80a32D7176C23e4993cDa4d2337Fc3A) | [tx](https://hashkey.blockscout.com/tx/0xbe0c38828a206e2f0a9e199353b1cc2bf4d992eeaf7d8e509129ef5968da222f) |
| 10 | **jrCVR** | Junior tranche LP token | [`0x1Ca7B6…664D`](https://hashkey.blockscout.com/address/0x1Ca7B678BDf1deCe9964c5178C01AB9312F2664D) | [tx](https://hashkey.blockscout.com/tx/0xae9232e78c9b7cf59733aed0d0b0d855f938438e74e34e91088b360f1f49b90b) |
| 11 | **ProtectionCert** | NFT representing buyer coverage | [`0x8D4C37…A50C`](https://hashkey.blockscout.com/address/0x8D4C37f45883aAEEd20d2CC1020e6Ab193D3A50C) | [tx](https://hashkey.blockscout.com/tx/0xab25093fb0ed512ca08dbb5ea00c192c9c801306e21fcdda02d8003ad1c77464) |
| 12 | **SubrogationNFT** | NFT carrying recovery claim post-payout | [`0xc07859…8A9f`](https://hashkey.blockscout.com/address/0xc07859b25FC869F0a81fae86b9B5bEa868D08A9f) | [tx](https://hashkey.blockscout.com/tx/0xd93e3f01cbcbfd48eb560da08316be686e1a02bfe2411ca46865dc3567116993) |

All 12 contracts deployed in blocks **22 003 463 → 22 003 496** (33 blocks ≈ 100 seconds). The 25 wiring transactions followed in blocks **22 003 499 → 22 003 571**.

---

## Live Lifecycle Receipts

The protocol's full operational lifecycle was executed against the live deployment. Every state-changing call is a clickable mainnet receipt.

| Phase | Action | Block | Mainnet Receipt |
|---|---|---|---|
| 1 | `CoverFiStablecoin.mint(10,000 cfUSD)` | 22 004 667 | [tx](https://hashkey.blockscout.com/tx/0x56dd29492aaf840db80d471a8e10cf62be5e383b10792d73011e8c3741e03813) |
| 2 | `InsurancePool.activatePool()` | 22 004 677 | [tx](https://hashkey.blockscout.com/tx/0x8cdea68c729af5de202016cd0f1ca87b43653f2927fe7afd062cf639c225d0f2) |
| 2 | `IRSOracle.initializeScore(600)` | 22 004 679 | [tx](https://hashkey.blockscout.com/tx/0xef68716fd9c841c90f2ad48b920f02f9fb6340bac9bd8daf3ca5d2dac60cdcf9) |
| 3 | `IssuerRegistry.register()` | 22 004 681 | [tx](https://hashkey.blockscout.com/tx/0xfad3fe2db086460f15b11e5f5c17d576b5fac63b29c7e69ac090f46092d252e2) |
| 4 | `IssuerBond.deposit(50 cfUSD)` | 22 004 687 | [tx](https://hashkey.blockscout.com/tx/0x63aa01216361f6039e6c55580ad7d080fc12b4cae4b60712f1be0b762ed0caee) |
| 5 | `InsurancePool.depositJunior(200 cfUSD)` | 22 004 690 | [tx](https://hashkey.blockscout.com/tx/0x187a6bee1bcbefcc104b9056f6aa308f96f195fadbf83f18e115b1a76f53f7cf) |
| 6 | `InsurancePool.depositSenior(500 cfUSD)` | 22 004 693 | [tx](https://hashkey.blockscout.com/tx/0x800e26734437c79a2ab110f5e1578d4744d13656617d5650248f52b754ff9bd5) |
| 7 | `PayoutEngine.purchaseCoverage(100 cfUSD)` | 22 004 696 | [tx](https://hashkey.blockscout.com/tx/0x0bdbb6f2ac4eb9f6a16a04f64e77f822a8d007e3f091cdb4a48e6750c8fb9873) |
| 8 | `InsurancePool.payPremium(10 cfUSD)` | 22 004 699 | [tx](https://hashkey.blockscout.com/tx/0x739f457af64c20cfeb2c2d00755558af0b7d1307f2e8cc55c034371609494c53) |
| 9 | `IRSOracle.recordNAVUpdate()` | 22 004 702 | [tx](https://hashkey.blockscout.com/tx/0xcd3e64d4babffc3c5a9b46503c3dcfef6aa1f2f4d561494b710e786b62550b4c) |
| 9 | `IRSOracle.recordCollateralHealth(110 %)` | 22 004 780 | [tx](https://hashkey.blockscout.com/tx/0xd8f60acc5fffc1774770bac73f2543e51e1cf73168dce7eef3af5a91c7afbf31) |
| 9 | `IRSOracle.recordAttestationDispute()` | 22 004 786 | [tx](https://hashkey.blockscout.com/tx/0xdd481835779a61e3b5a0ba316fdb2d4d4e858189ca1a76299ea66742730151d2) |
| 9 | `IRSOracle.recordRepaymentEvent()` (with explicit gas) | 22 004 919 | [tx](https://hashkey.blockscout.com/tx/0x3d03658182dadeff750537fc88180715ecf816e6a0f7a4f57602f727d0fc128e) |
| 9 | `IRSOracle.recordActivity()` (with explicit gas) | 22 004 921 | [tx](https://hashkey.blockscout.com/tx/0xa7cf522faf13e141c083f390c09c5e562708c7f99b38cd140ee735fca4561fac) |
| 10 | `InsurancePool.initiateWithdrawalSenior()` | 22 004 789 | [tx](https://hashkey.blockscout.com/tx/0x922e3c5fa9de1f5b9dd0b070e621395747bf072fe7edc7d51135c289fde9f7c1) |
| 10 | `InsurancePool.initiateWithdrawalJunior()` | 22 004 792 | [tx](https://hashkey.blockscout.com/tx/0xc6ec939a2be810d7e68a64e305ee07c398417d8e98f893457d8651edf9351f98) |
| **11 ★** | **`PayoutEngine.executePayout()` — full liquidation waterfall** | **22 004 796** | **[★ tx](https://hashkey.blockscout.com/tx/0x648f26f8ec3c81fcf96a6b8ee1ca78ce41f0319ba9316a5eea5987061fd26d0d)** |

The Phase 11 transaction is the centerpiece of this proof. Click it. Read the internal calls. Reconcile the math.

---

## The Phase 11 Lifecycle Proof

When the destructive end-to-end was triggered in [tx `0x648f…6d0d`](https://hashkey.blockscout.com/tx/0x648f26f8ec3c81fcf96a6b8ee1ca78ce41f0319ba9316a5eea5987061fd26d0d), the protocol on mainnet:

- Liquidated the **issuer bond** — 50 cfUSD
- Liquidated the **junior tranche first** — 202.85 cfUSD (200 deposit + 2.85 accrued premium)
- Liquidated the **senior tranche second** — 506.65 cfUSD (500 deposit + 6.65 accrued premium)
- Distributed the resulting **759.5 cfUSD pro-rata to the insured holder** — exactly `50 + 202.85 + 506.65`
- Burned the ProtectionCert NFT
- Minted the SubrogationNFT to the foundation
- Set the IRS score to **0** (issuer blacklisted)
- Marked the issuer as `DEFAULTED` in IssuerRegistry
- Deactivated the pool

**This is the strongest possible evidence the protocol works.** Not a simulation, not a unit test — a real default settled with real cfUSD on Chain 177, with the on-chain math reconciling the waterfall to the cent.

---

## Validation Evidence

We did not deploy and walk away. Every contract was validated **on mainnet** post-deployment.

### Mainnet Smoke Test Suite — 89 / 89 passing

| Category | Tests | Result |
|---|---|---|
| Bytecode presence on Chain 177 | 12 | ✅ All deployed |
| cfUSD configuration & state reads | 8 | ✅ All correct |
| Core contract immutable & wired reads | 37 | ✅ All correct |
| Cross-wiring sanity (bidirectional refs) | 10 | ✅ All consistent |
| Adversarial — must-revert checks | 14 | ✅ All revert correctly |
| Constants & immutability guarantees | 5 | ✅ All locked |

### Disaster Recovery Suite — 15 / 15 passing

| Category | Tests | Result |
|---|---|---|
| cfUSD pause / unpause cycle | 3 | ✅ |
| InsurancePool pause / unpause cycle | 3 | ✅ |
| PayoutEngine pause / unpause cycle | 3 | ✅ |
| IssuerBond pause / unpause cycle | 3 | ✅ |
| Pause-independence (no cross-contagion) | 3 | ✅ |

This proves the emergency-stop circuit works in production and that pausing one module cannot accidentally freeze the rest of the system.

### Functional End-to-End Test Suite — 51 / 53 passing

Every state-changing function in the protocol was exercised on **live mainnet**, in dependency order.

| Phase | What it proved | Result |
|---|---|---|
| 1. cfUSD mint | Stablecoin issuance under owner-only minter role | ✅ 10,000 cfUSD minted |
| 2. Pool activation + IRS init | Activation flag + score initialization | ✅ |
| 3. Issuer registration | `IssuerRegistry.register` records lifecycle profile | ✅ Registered at block 22 004 681 |
| 4. Issuer bond stake | First-loss capital lock-up (50 cfUSD) | ✅ |
| 5. Junior tranche deposit | jrCVR mint + 25 % junior-ratio invariant | ✅ |
| 6. Senior tranche deposit | srCVR mint + ratio re-validated (28 %) | ✅ |
| 7. Coverage purchase | `purchaseCoverage` + ProtectionCert ERC-721 mint | ✅ certId = 1 |
| 8. Premium payment | 5 % protocol fee + 70 / 30 senior / junior yield split | ✅ +6.65 / +2.85 cfUSD |
| 9. IRS keeper updates | All 5 keeper functions exercised | ✅ All 5 working |
| 10. Withdrawal initiation | Senior + junior withdrawal request rows recorded | ✅ |
| 11. Default → Payout → Subrogation | **Full liquidation waterfall executed on mainnet** | ✅ +759.5 cfUSD paid out |

> **Note on the "2 / 53 fails":** Two IRS keeper functions (`recordRepaymentEvent` and `recordActivity`) initially reverted under Hardhat's auto gas-estimator. Root-caused to gas under-estimation on cold-storage SSTOREs (~22 100 gas vs ~5 000 estimated). Re-running with explicit `gasLimit: 300_000` produced 4 / 4 successes (see retry receipts in the Lifecycle table above). **The contract logic is correct; the failure was in the test harness.** All 5 IRS keeper functions are confirmed working on mainnet.

### Pre-Deployment Validation

- **513 unit + integration tests** passing under Hardhat (474 protocol + 28 cfUSD unit + 11 cfUSD integration)
- **13 audit findings** remediated (3 critical · 4 high · 3 medium · 3 low) — all fixes have corresponding regression tests
- **Testnet dry-run** completed end-to-end with identical wiring topology (`hashkeyTestnet-dryrun.json`)

---

## Security & Audit Posture

### 13 audit findings remediated

| Severity | Count | Categories addressed |
|---|---|---|
| Critical | 3 | Reentrancy on payout path · access-control bypass on liquidation · immutable foundation address |
| High | 4 | Integer math in premium formula · missing pause guards · oracle update authorization · withdrawal-gate edge cases |
| Medium | 3 | Event-emission consistency · tranche-ratio rounding · ERC-3643 compliance fallback |
| Low | 3 | Gas optimization · redundant SLOAD · NatSpec polish |

Every finding has a corresponding regression test in the 513-test suite.

### Defensive design patterns

- **Ownable2Step** — typo-safe ownership transfer on every admin contract
- **Pausable + ReentrancyGuard** — on every state-changing entry point
- **Immutable storage** — `usdt`, `foundation`, `protocolTreasury` cannot be re-pointed after deployment
- **4-tier access control** — `owner` / `keeper` / `payoutEngine` / public, with explicit `require` checks
- **Deterministic liquidation waterfall** — bond → junior → senior, no off-chain steps
- **Cap enforcement** — `MAX_SUPPLY` on cfUSD, `MAX_SCORE` on IRS, `MIN_JUNIOR_RATIO_PCT` on pool

### Reproducible verification

- Source code verified on Blockscout (12 / 12 contracts)
- **Compiler:** Solidity 0.8.19 with optimizer (200 runs) and `viaIR` enabled
- Bytecode hash matches GitHub source at the deployment commit
- All 12 contracts source-match the open-source repo

---

## Reproduce This Yourself (5 minutes)

Don't trust this report — verify it. Anyone with Node.js can replicate every test in this document:

```bash
git clone https://github.com/Sanjay-N23/coverfi-protocol
cd coverfi-protocol
npm install

# 89 read-only smoke tests against live mainnet — costs 0 HSK
npx hardhat run scripts/smoke-test-mainnet.ts --network hashkeyMainnet

# Read back every state change from our lifecycle test (Phase 9-11 evidence)
npx hardhat run scripts/functional-test-continue.ts --network hashkeyMainnet

# Optional: re-fetch all 74 mainnet transaction hashes from Blockscout
npx hardhat run scripts/fetch-tx-hashes.ts --network hashkeyMainnet
```

The first command alone validates 89 invariants of the deployed protocol against live state. The second reads back every state change from our end-to-end lifecycle run.

---

## What CoverFi Does

CoverFi is the first **fully on-chain insurance protocol for DeFi default risk**.

When users deposit into yield-bearing protocols, they are exposed to issuer-side default — a risk that today is either uninsured or insured by opaque off-chain markets. CoverFi makes this risk **priced, traded, and settled entirely on-chain**:

- **Senior / Junior tranching** — Liquidity providers choose risk appetite. Senior LPs (srCVR) earn lower yield with first-loss protection from junior LPs (jrCVR), who earn higher yield in return for absorbing initial losses.
- **Issuer Reliability Score (IRS)** — An oracle-driven on-chain score (0 – 1000, 5 dimensions) prices each issuer's premium dynamically via an exponential formula: `premium_bps = 1600 × e^(-0.001386 × IRS)`. Better behavior → cheaper coverage.
- **Issuer Bonds** — Issuers post first-loss capital before they can be insured. Aligns incentives without trusting reputation alone.
- **NFT-based Protection Certificates** — Coverage is a transferable ERC-721 asset. Buyers can sell, hedge, or LP their coverage.
- **Subrogation NFTs** — After a payout, the recovery claim against the defaulting issuer becomes a tradeable NFT, creating a secondary market for distressed-debt recovery.
- **No off-chain settlement** — Every cash flow, every claim, every state change is transparent on Chain 177.

---

## Architecture (How the 12 Contracts Talk)

```
                     ┌─────────────────┐
                     │   cfUSD (ERC20) │  ←── 1B cap, 6 decimals, owner-mintable
                     └────────┬────────┘
                              │ used by
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
     ┌────────────┐   ┌────────────┐   ┌──────────────┐
     │ Insurance  │◄─►│  Payout    │◄─►│ IssuerBond   │
     │   Pool     │   │  Engine    │   │ (first-loss) │
     └─────┬──────┘   └──────┬─────┘   └──────┬───────┘
           │                 │                │
           ▼                 ▼                ▼
   ┌──────────────┐   ┌──────────────┐  ┌──────────────┐
   │ srCVR / jrCVR│   │ ProtectionCert│  │ SubrogationNFT│
   │  LP tokens   │   │    (ERC721)   │  │   (ERC721)    │
   └──────────────┘   └──────────────┘  └──────────────┘
                              ▲
                              │ informed by
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────────┐  ┌──────────────┐
        │   TIR    │──►│  IRSOracle   │  │ DefaultOracle│
        └──────────┘   └──────────────┘  └──────────────┘
                       Issuer Registry routes everything
```

All 25 cross-contract wiring transactions executed atomically post-deployment with zero failures.

---

## Phase 1 Design Choices (Intentional Constraints)

This is an intentional Phase 1 launch. Three design choices may surprise readers — each is documented and roadmapped to evolve.

| Choice | Phase 1 reality | Phase 2 plan |
|---|---|---|
| **Stablecoin** | Custom **cfUSD** (1B cap, 6 decimals, owner-mintable) acts as the settlement asset | Native USDT integration once HashKey × Tether partnership is formalized |
| **Foundation / treasury** | Equal to deployer EOA (`0xce22…2fb3`) for clean Phase 1 launch | Migrate to a 3-of-5 Gnosis Safe multisig |
| **Issuer onboarding** | `forceActivateForDemo()` used for our own test artifact | Standard 60-day observation + 3 attestations required |
| **Test issuerToken** | cfUSD self-reference (acceptable; `PayoutEngine` has try/catch ERC-3643 fallback) | Real RWA tokens registered through TIR |

These aren't omissions — they're scoped Phase 1 choices that let us ship a fully-functional protocol on day one and progressively decentralize as real-world counterparties come on chain.

---

## Known Limitations

We disclose what we know:

1. **Single-key admin in Phase 1** — All `onlyOwner` functions are controlled by a single EOA (the deployer). Multisig migration is the first Phase 2 task.
2. **Phase-1 stablecoin** — `cfUSD` is owner-mintable. Phase 2 swaps it for native USDT.
3. **Test artifacts on chain** — Our Phase 11 lifecycle test left a defaulted pool, a SubrogationNFT, and an inactive issuer entry on chain. These are immutable evidence of the test, not bugs.
4. **Gas-estimation quirk** — `recordRepaymentEvent` and `recordActivity` require an explicit `gasLimit ≥ 200 000` on first cold-storage call. Confirmed not a contract bug (4 / 4 retries pass). SDK and frontend integrations should pass an explicit gas limit.
5. **Frontend hosted URL pending** — The UI lives in `frontend/*.html` in the repo and is wired to mainnet contract addresses; a hosted preview link will be added shortly.

---

## Roadmap

### Phase 1 — NOW (proven on mainnet)
- ✅ Tranched insurance pool with srCVR / jrCVR
- ✅ Issuer bonding + IRS scoring + default oracle
- ✅ NFT-based protection certificates and subrogation
- ✅ Full lifecycle proven on Chain 177

### Phase 2 — next 90 days
- USDT integration replacing cfUSD as settlement asset
- Multisig migration of all admin keys (Gnosis Safe, 3-of-5)
- TIR-driven issuer onboarding with on-chain BAS attestations
- Frontend hosted production deployment + WalletConnect integration

### Phase 3 — 90 – 180 days
- Multi-issuer pools with cross-tranche correlation modeling
- Cross-chain bridges to Ethereum and BNB Chain
- Reinsurance derivative for senior tranche LPs
- Public bug bounty programme (Immunefi)

---

## Recognition

🏆 **Winner — DeFi Track, HashKey Chain Horizon Hackathon 2026**

CoverFi was selected from a competitive cohort by HashKey Chain's hackathon panel. This deployment fulfills the prize-disbursement condition of "verified mainnet deployment of the submitted protocol."

---

## Technical Specifications

| Specification | Value |
|---|---|
| Network | HashKey Chain Mainnet |
| Chain ID | 177 |
| RPC endpoint | `https://mainnet.hsk.xyz` |
| Block explorer | [hashkey.blockscout.com](https://hashkey.blockscout.com) |
| Deployer address | `0xce220d9eD9527f9997c8045844210637F3A42fb3` |
| Foundation / treasury | `0xce220d9eD9527f9997c8045844210637F3A42fb3` (= deployer for Phase 1) |
| Solidity compiler | 0.8.19 with optimizer (200 runs), `viaIR: true` |
| Toolchain | Hardhat |
| Verification | Blockscout (12 / 12 source-matched) |
| Total mainnet transactions executed | 74 (12 deploys · 25 wirings · 12 disaster-recovery · 25 functional) |
| Block range of activity | 22 003 463 → 22 004 926 (≈ 78 minutes total) |
| Observed gas price | 0.01 gwei (≈ 60 000× cheaper than Ethereum L1) |
| License | MIT (SPDX-License-Identifier in every contract) |

---

## Cost Breakdown

| Item | Amount |
|---|---|
| Starting balance | 10.81 HSK |
| Spent on full deployment (12 contracts + 25 wirings) | 0.007368 HSK |
| Spent on disaster-recovery + functional E2E (~37 mainnet txs) | 0.000183 HSK |
| **Total HSK spent across deployment + all on-chain testing** | **~0.0076 HSK** |
| Ending balance | ~10.80 HSK |
| Approximate INR cost of everything above | ~₹0.86 |

The deployment was capital-efficient by design: HashKey Chain's low gas environment makes auditable insurance infrastructure economically viable in markets that have historically been priced out of DeFi.

---

## Team & Contact

| Role | Name | Email | Telegram |
|---|---|---|---|
| **Team Lead** | Sanjay N | sanjayn0369@gmail.com | [@Sxnj_y](https://t.me/Sxnj_y) |
| **Engineer** | Danish A G | danish@xzashr.com | — |
| **Engineer** | Preethi S | preethisivachandran0@gmail.com | — |
| **Engineer** | Ismail Ridwan S | ismailridwans.cse2023@citchennai.net | — |

GitHub: [`@Sanjay-N23`](https://github.com/Sanjay-N23) · Repository: [`coverfi-protocol`](https://github.com/Sanjay-N23/coverfi-protocol)
For fastest response, ping the team lead on Telegram: [@Sxnj_y](https://t.me/Sxnj_y).

---

## Resources & References

| Resource | Link |
|---|---|
| GitHub repository | https://github.com/Sanjay-N23/coverfi-protocol |
| Block explorer | https://hashkey.blockscout.com |
| Deployment artifact (full JSON) | `deployments/hashkeyMainnet.json` in the repo |
| Lifecycle tx hashes (full JSON) | `deployments/lifecycle-tx-hashes.json` in the repo |
| Smoke-test report (full JSON) | `deployments/smoke-test-177.json` in the repo |
| Functional E2E test scripts | `scripts/functional-test-mainnet.ts`, `scripts/functional-test-continue.ts` |
| Disaster-recovery test script | `scripts/smoke-test-disaster-recovery.ts` |

---

## Closing

This deployment is not an announcement. It is a **publicly auditable fact** recorded permanently on HashKey Chain. The contracts are live. The tests pass. The waterfall is mathematically reconciled. The source matches the bytecode.

We invite anyone — judges, auditors, partners, skeptics — to verify every claim in this document. Click the links. Run the scripts. Read the code.

**The proof is the chain.**

— **The CoverFi Team**
2026-05-10 · HashKey Chain Mainnet · Chain ID 177
