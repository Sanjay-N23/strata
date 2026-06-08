# APP_AUDIT.md

**Project:** CoverFi Protocol
**Event:** HashKey Chain Horizon Hackathon — Final Demo Day
**Venue:** AWS Office, Hong Kong
**Date:** April 22, 2026
**Audit time:** T-24h

---

## 1. What is actually implemented (verified from repo)

### Smart contracts — `D:\COVERFI\contracts\`
12 production contracts + 4 mocks + 1 math library. Deployed to **HashKey Chain Testnet, Chain ID 133** on 2026-04-13.

| Contract | Purpose | Address |
|---|---|---|
| `IssuerRegistry.sol` | Issuer lifecycle state machine (6 states) | `0xc07859…0A9f` |
| `IRSOracle.sol` | 5-dimension behavioral credit score (0–1000) | `0x8D4C37…A50C` |
| `IssuerBond.sol` | 5% USDT bond escrow per issuer | `0x1Ca7B6…664D` |
| `InsurancePool.sol` | Dual-tranche pool (srCVR / jrCVR) | `0xa5d64A…7C06` |
| `srCVR.sol` / `jrCVR.sol` | LP tranche tokens (Compound cToken model) | `0x2Aad26…E1CD` / `0xD01e87…Acf6B` |
| `DefaultOracle.sol` | 2-of-3 attestor consensus → default event | `0xBCF001…549eA` |
| `TIR.sol` | Bonded attestor registry + slashing | `0xa4ECEB…Fc3A` |
| `PayoutEngine.sol` | Waterfall execution + ERC-3643 compliance | `0x44944c…88F5` |
| `ProtectionCert.sol` | ERC-5192 soulbound coverage cert | `0x91062e…1e73` |
| `SubrogationNFT.sol` | Legal-recovery NFT minted on payout | `0xbBe8A2…2AB9` |
| `MockUSDT / MockIdentityRegistry / MockERC3643Token / MockBAS / MockChainlinkPoR` | Testnet infra | — |
| `ABDKMath64x64` (lib) | 128-bit fixed-point for exponential premium | — |

**Test coverage:** 13 test files in `test\unit\` and `test\integration\` — **416+ passing tests**, 40 edge-case, Playwright E2E.

### Frontend — `D:\COVERFI\frontend\` (deployed at `coverfi-protocol.vercel.app`)
10 HTML pages, all production-ready:

| Page | Judge-demoable? | Role |
|---|---|---|
| `index.html` | ✅ Yes | Landing + narrative |
| `dashboard.html` | ✅ Yes — **primary** | TVL, IRS scores, pool stats, coverage purchase |
| `pool.html` | ✅ Yes | Senior/junior tranche LP view, APYs, waterfall |
| `stats.html` | ✅ Yes | Premium curve, IRS bars, event feed |
| `coverage.html` | ✅ Yes | User's ProtectionCert holdings |
| `subrogation.html` | ✅ Yes — **killer moment** | SubrogationNFT #1 on-chain |
| `issuers.html` | ✅ Yes (backup) | Issuer directory |
| `register.html` | ⚠ Skip | Issuer onboarding — not judge-friendly in 7 min |
| `attestor.html` | ⚠ Skip | Attestor console — too niche |
| `issuer-dashboard.html` | ⚠ Skip | Issuer-side analytics |
| `pitch.html` | ✅ Yes (optional) | Vercel-style SPA pitch deck — presenter tool |

**Design system:** Claymorphism + gold accent + dark-mode toggle. HashKey Testnet badge present on every page.

### Off-chain evidence
- 25+ real transactions on HashKey Chain Testnet
- SubrogationNFT #1 already minted (GhostIssuer default, April 20)
- All deploy/TX proofs at `testnet-explorer.hsk.xyz`

---

## 2. Best demoable features (the "live proof" surface)

Ranked by narrative power per second on stage:

1. **SubrogationNFT #1 on `subrogation.html`** — "the bridge between on-chain insurance and off-chain legal recovery." Already minted. Shows default → payout → NFT atomically.
2. **HashKey explorer — PayoutEngine TX** (`0xe938fa9a…`). One TX, four events: `BondLiquidated` → `PoolLiquidated` → `SubrogationClaimed` → `IssuerDefaulted`. Raw on-chain proof.
3. **Coverage purchase on `dashboard.html`** — connect wallet → Get Coverage → premium updates in real time → confirm TX → soulbound ProtectionCert appears. This is the money shot.
4. **Premium curve on `stats.html`** — exponential curve with live issuer dots. One glance = "this isn't a mock; the math is on-chain."
5. **Dual-tranche pool on `pool.html`** — waterfall diagram + senior/junior APY split. Proves the architecture isn't naive.
6. **IRS radar + 5 dimensions** — visual credit-scoring legitimacy in 2 seconds.

---

## 3. Risky flows — DO NOT touch on stage

| Flow | Why it's risky |
|---|---|
| Live issuer registration (`register.html`) | 4+ transactions, long wait, judge loses thread |
| Attestor voting (`attestor.html`) | Requires pre-bonded wallet state; confusing to non-experts |
| IRS re-scoring live | Not a one-click action; requires NAV upload |
| `challengeWindDown` flow | Phase 1; not implemented |
| Switching MetaMask networks mid-demo | 50/50 chance the UI loses state |
| Buying coverage with >$100 amount | Slower TX; avoid large numbers — judges don't scale them |
| Any "permit" or batched signature flow | ERC-20 approve + purchase = 2 signatures; rehearse the timing |

---

## 4. Recommended 7-minute demo path (visual-only flow)

```
[0:00] index.html hero                    ← Pain
[0:50] dashboard.html (connect wallet)    ← Proof of live data
[1:40] stats.html (premium curve + IRS)   ← Novelty: credit score
[2:20] pool.html (tranches + waterfall)   ← Novelty: capital architecture
[3:00] dashboard.html → Get Coverage      ← Money shot: live TX
[4:20] coverage.html (ProtectionCert)     ← Artifact: NFT in wallet
[4:50] subrogation.html (SubrogationNFT)  ← Emotional peak: default + recovery
[5:30] HashKey explorer (PayoutEngine TX) ← Verifiability
[6:00] Return to dashboard                ← Moat + close
```

All pages are already routed, connected, and stable.

---

## 5. Strongest proof points visible to judges

| Proof point | Where to surface it | Spoken line that lands it |
|---|---|---|
| **Live chain data** | Dashboard TVL counter | "Every number on this screen came from a smart contract read in the last three seconds." |
| **Exponential premium formula** | stats.html curve + dashboard modal | "Six-point-nine-six percent. Computed on-chain from ABDKMath fixed-point." |
| **ERC-3643 compliance gate** | Toast during payout | "`isVerified` and `isFrozen` — checked before one USDT moves." |
| **Soulbound ProtectionCert** | coverage.html NFT card | "ERC-5192. Non-transferable. Bound to your wallet forever." |
| **SubrogationNFT** | subrogation.html card | "This NFT is the Foundation's legal weapon. Cryptographic proof of default." |
| **2-of-3 attestor consensus** | TIR TX on explorer | "Two-of-three bonded professionals signed. That confirmation is immutable." |
| **Atomic waterfall** | PayoutEngine TX logs | "One transaction. Four contracts. It either all executes or nothing does." |
| **12 contracts, 416 tests** | Moat segment | "Twelve smart contracts. Four-hundred-sixteen passing tests." |

---

## 6. Demo-facing weaknesses already resolved pre-audit

Three bugs were fixed and pushed to `main` in the last 4 hours:

| Fix | Commit | Risk before fix |
|---|---|---|
| `depositJunior` missing `issuerToken` arg → INVALID_ARGUMENT on every junior deposit | `6ff26cc` | Would have killed a live LP deposit attempt mid-pitch |
| Overlapping issuer labels on premium curve (Demo Issuer + GreenEnergy collision) | `2ccc114` | Visual credibility hit on stats.html |
| Tranche deposit event reading `args[1]` (token address) as USDT amount → $9.58×10⁴⁷ display | `44f735d` | Judge sees a 47-digit dollar figure → instant trust collapse |

All three are live on `coverfi-protocol.vercel.app` after Vercel auto-deploy.

---

## 7. Remaining weak spots (watch list — not blockers)

| Item | Severity | Recommendation |
|---|---|---|
| `FINAL_STATUS.md` line 141 still says "BNB Chain (BSC Testnet, Chain ID 97)" while contracts are on HashKey 133 | Medium | Fix markdown before repo is GitHub-visible to a judge post-pitch |
| A few `testnet.bscscan.com` URLs in `FINAL_STATUS.md` TX table should be `testnet-explorer.hsk.xyz` | Medium | 2-minute find-and-replace |
| Dashboard TVL may show `$10.00` (literal testnet state). Pre-empt line prepared: "ten dollars because testnet — architecture is scale-invariant." | Low | Handle in-script |
| Wallet-switching to HashKey Chain 133 requires user action first time on a fresh laptop | Medium | Pre-add the network to MetaMask before stage |
| Coverage purchase requires two signatures (USDT approve + purchase) | Low | Rehearse the 2-sig timing; Person B holds calm |

---

## 8. Unsupported claims from old script that we've softened

Reviewed `DEMO_SCRIPT.md` and `DEMO_DAY_SCRIPT.md` line-by-line. Edits applied to the **new** script:

| Old line | Problem | New line |
|---|---|---|
| "No other protocol on Earth can do this." | Too absolute, unfalsifiable | "No competitor we've found has this." |
| "It's Moody's — but it runs on-chain." | Brand risk | "It's continuous on-chain credit scoring — the category Moody's occupies off-chain." |
| "Twenty-four to forty-eight hours before any human could confirm the default. That is the moat." | No benchmark data to support numeric claim | Kept but re-framed as design intent, not measured outcome. |
| "First CDS equivalent for ERC-3643" | Defensible. Keep. | Kept. |
| "Ninety-three teams. Ninety-two built apps. We built infrastructure." | Strong and honest framing. Keep. | Kept. |
| Any mention of AWS endorsement | Never present — good | No change |
| "Nexus Mutual can't do this" | True directionally; sharpened to be about payout compliance specifically | "Their payout contracts don't check ERC-3643 compliance. They literally cannot pay out to a regulated security token." |

---

## 9. Judge-perceived execution quality — honest read

| Signal | Score | Why |
|---|---|---|
| Depth of build | A+ | 12 contracts, 416 tests, full lifecycle integration test |
| Frontend polish | A- | Claymorphism + dark mode, but 10 pages is surface area to defend |
| Live on-chain evidence | A+ | 25 real TXs, SubrogationNFT minted, verifiable explorer links |
| Category positioning | A+ | Nobody else is building this — defensible "first" |
| Narrative clarity | A (after pitch polish) | Strong with the new script; previous draft had jargon density |
| Commercial framing | B+ | Needs the investor close tightened — done in `INVESTOR_CLOSE.md` |

**Verdict:** Top-3 submission on merit. Whether it places first depends on stage execution, not substance. The polish budget is better spent on rehearsal than code.

---

## 10. One-sentence summary for the pitch director

> CoverFi is the first on-chain Credit Default Swap equivalent for ERC-3643 real-world-asset tokens — 12 production contracts, 416 tests, live on HashKey Chain Testnet, with a soulbound Protection Certificate on one side and a Subrogation NFT on the other, bridging DeFi insurance to real-world legal recovery.
