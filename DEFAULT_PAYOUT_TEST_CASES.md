# CoverFi — Default/Payout Feature: Comprehensive Test Cases

**Feature scope:** TIR.sol · DefaultOracle.sol · IssuerBond.sol · PayoutEngine.sol · SubrogationNFT.sol · IssuerRegistry (setDefaulted) · IRSOracle (setScoreToZero)

**Notation:**
- ✅ PASS — tx succeeds, state/events verified
- ❌ REVERT — tx must revert with specified message
- 📋 STATE — read-only state assertion
- 🖥️ UI — frontend behaviour check

---

## CATEGORY A — TIR: Attestor Registration
*Batch A1: Basic Registration*

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| A1.1 | Register CUSTODIAN with exact minimum bond | Fresh TIR | `registerAttestor(CUSTODIAN)` with `value = 5 ether` | ✅ AttestorRegistered emitted, `attestors[wallet].status == ACTIVE` |
| A1.2 | Register below minimum bond | Fresh TIR | `registerAttestor(LEGAL_REP)` with `value = 4.9 ether` | ❌ REVERT `"TIR: bond below minimum"` |
| A1.3 | Register same wallet twice | Wallet already registered | Second `registerAttestor(AUDITOR)` | ❌ REVERT `"TIR: already registered"` |
| A1.4 | All three attestor types register | Three distinct wallets | Each registers a different `AttestorType` | ✅ `getAttestor(w).attestorType` matches type for each wallet |
| A1.5 | Register with excess bond | Fresh TIR | `registerAttestor(CUSTODIAN)` with `value = 10 ether` | ✅ Full 10 ether recorded in `bondBNB`, no refund expected |
| A1.6 | isFastTrackEligible false before 30 days | Newly registered CUSTODIAN | `isFastTrackEligible(wallet)` | 📋 Returns `false` |
| A1.7 | isActiveAttestor returns true after registration | Registered wallet | `isActiveAttestor(wallet)` | 📋 Returns `true` |

---

## CATEGORY B — TIR: 2-of-3 Default Attestation
*Batch B1: Vote Progression*

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| B1.1 | Single CUSTODIAN vote — not yet confirmed | CUSTODIAN registered | `submitDefaultAttestation(token, uid, hash)` | ✅ `DefaultAttestationSubmitted` emitted, `isDefaultConfirmed(token) == false` |
| B1.2 | CUSTODIAN + LEGAL_REP → confirmed | Both registered, CUSTODIAN voted | LEGAL_REP `submitDefaultAttestation` | ✅ `DefaultConfirmed` emitted, `isDefaultConfirmed == true` |
| B1.3 | CUSTODIAN + AUDITOR → confirmed | Both registered, CUSTODIAN voted | AUDITOR `submitDefaultAttestation` | ✅ `DefaultConfirmed` emitted, `isDefaultConfirmed == true` |
| B1.4 | LEGAL_REP + AUDITOR → confirmed | Both registered, LEGAL_REP voted | AUDITOR `submitDefaultAttestation` | ✅ Confirmed after 2nd vote |
| B1.5 | All 3 vote — confirmed on 2nd, 3rd accepted | All registered | Third vote after already confirmed | ✅ 3rd `submitDefaultAttestation` succeeds — note: `isConfirmed` guard blocks further votes |

*Batch B2: Vote Rejection Rules*

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| B2.1 | CUSTODIAN votes twice | CUSTODIAN voted once | Same CUSTODIAN votes again | ❌ REVERT `"TIR: custodian already voted"` |
| B2.2 | LEGAL_REP votes twice | LEGAL_REP voted once | Same LEGAL_REP votes again | ❌ REVERT `"TIR: legal rep already voted"` |
| B2.3 | AUDITOR votes twice | AUDITOR voted once | Same AUDITOR votes again | ❌ REVERT `"TIR: auditor already voted"` |
| B2.4 | Non-active attestor submits | Wallet not registered | `submitDefaultAttestation` from random wallet | ❌ REVERT `"TIR: not active attestor"` |
| B2.5 | Submit after already confirmed | 2 votes confirmed | 3rd vote attempt after `isConfirmed == true` | ❌ REVERT `"TIR: already confirmed"` |
| B2.6 | Slashed attestor cannot vote | Attestor slashed | `submitDefaultAttestation` | ❌ REVERT `"TIR: not active attestor"` |

*Batch B3: Vote Count State*

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| B3.1 | getVoteCount after 1 vote | CUSTODIAN voted | `getVoteCount(token)` | 📋 `(1, 0, 0)` |
| B3.2 | getVoteCount after 2 votes | CUSTODIAN + LEGAL voted | `getVoteCount(token)` | 📋 `(1, 1, 0)` |
| B3.3 | Confirmation block recorded | 2-of-3 confirmed | `getDefaultConfirmation(token).confirmationBlock` | 📋 Equals current `block.number` |

---

## CATEGORY C — TIR: Force Default & Admin
*Batch C1: Force Default*

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| C1.1 | forceConfirmDefault by owner | Fresh state | `forceConfirmDefault(token)` | ✅ `DefaultConfirmed` emitted, `isDefaultConfirmed(token) == true` |
| C1.2 | forceConfirmDefault by non-owner | Non-owner wallet | `forceConfirmDefault(token)` | ❌ REVERT Ownable `"Ownable: caller is not the owner"` |
| C1.3 | resetDefaultConfirmation clears state | Confirmed token | `resetDefaultConfirmation(token)` | ✅ `isDefaultConfirmed(token) == false`, votes cleared |
| C1.4 | resetDefaultConfirmation by non-owner | Non-owner wallet | `resetDefaultConfirmation(token)` | ❌ REVERT `"Ownable: caller is not the owner"` |
| C1.5 | forceConfirm already confirmed | Already confirmed | `forceConfirmDefault(token)` again | ✅ No revert — sets `isConfirmed = true` again, `DefaultConfirmed` re-emitted |

---

## CATEGORY D — TIR: Attestor Slashing
*Batch D1: Slash Mechanics*

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| D1.1 | Slash active attestor | Attestor registered with 5 ether | `slashAttestor(wallet, "fraud")` | ✅ `AttestorSlashed` emitted, `bondBNB = 0`, status = `SLASHED`, owner receives 5 ether |
| D1.2 | Slash non-active attestor | Attestor not registered | `slashAttestor(wallet, "reason")` | ❌ REVERT `"TIR: not active"` |
| D1.3 | Slash by non-owner | Non-owner | `slashAttestor(attestorAddr, "reason")` | ❌ REVERT `"Ownable: caller is not the owner"` |
| D1.4 | Slashed attestor's status | After slash | `getAttestor(wallet).status` | 📋 `SLASHED`, `slashCount == 1` |

---

## CATEGORY E — DefaultOracle: Flag & Grace Periods
*Batch E1: Event Types & Grace Periods*

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| E1.1 | Flag PAYMENT_DELAY | Active issuer | `flagDefaultEvent(token, PAYMENT_DELAY)` | ✅ `DefaultEventFlagged` emitted, `graceExpiryBlock = block.number + 57600` |
| E1.2 | Flag GHOST_ISSUER | Active issuer | `flagDefaultEvent(token, GHOST_ISSUER)` | ✅ `graceExpiryBlock = block.number + 86400` (72h) |
| E1.3 | Flag COLLATERAL_SHORTFALL | Active issuer | `flagDefaultEvent(token, COLLATERAL_SHORTFALL)` | ✅ `graceExpiryBlock = block.number + 201600` (7 days) |
| E1.4 | Flag MISAPPROPRIATION — no grace | Active issuer | `flagDefaultEvent(token, MISAPPROPRIATION)` | ✅ `graceExpiryBlock = block.number` (immediate) |
| E1.5 | Monitoring activated on flag | Fresh state | After `flagDefaultEvent` | 📋 `isInMonitoring(token) == true`, `eventTypeFlags` set correctly |
| E1.6 | Flag already confirmed (REVERT) | `defaultConfirmed[token] == true` | `flagDefaultEvent` | ❌ REVERT `"DefaultOracle: already confirmed"` |
| E1.7 | flagDefaultEvent by non-owner | Non-owner | `flagDefaultEvent(token, PAYMENT_DELAY)` | ❌ REVERT `"Ownable: caller is not the owner"` |
| E1.8 | clearMonitoring removes event data | Flagged token | `clearMonitoring(token)` | ✅ `isInMonitoring(token) == false`, `getActiveEvent(token)` returns empty |

---

## CATEGORY F — DefaultOracle: processConfirmation
*Batch F1: Confirmation Routing*

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| F1.1 | processConfirmation by owner | Active event flagged | `processConfirmation(token)` by owner | ✅ `DefaultEventConfirmed` emitted, `isDefaultConfirmed(token) == true` |
| F1.2 | processConfirmation by TIR contract | TIR set as `tir` address | Call from TIR contract address | ✅ Confirmation recorded |
| F1.3 | processConfirmation by unauthorized | Random wallet | `processConfirmation(token)` | ❌ REVERT `"DefaultOracle: unauthorized"` |
| F1.4 | processConfirmation twice | Already confirmed | Second `processConfirmation` | ❌ REVERT `"DefaultOracle: already confirmed"` |
| F1.5 | Confirmation block recorded | After confirmation | `getDefaultConfirmationBlock(token)` | 📋 Returns correct `block.number` |

---

## CATEGORY G — IssuerBond: Deposit
*Batch G1: Bond Deposit*

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| G1.1 | Deposit valid bond | USDT approved | `deposit(token, 5e18, 100e18)` | ✅ `BondDeposited` emitted, `bonds[token].bondAmount == 5e18` |
| G1.2 | Deposit zero amount | Any state | `deposit(token, 0, 100e18)` | ❌ REVERT `"IssuerBond: zero amount"` |
| G1.3 | Deposit when bond exists | Bond already deposited | Second `deposit(token, 5e18, 100e18)` | ❌ REVERT `"IssuerBond: bond exists"` |
| G1.4 | Bond record fields stored | After deposit | `getBondRecord(token)` | 📋 `bondAmount=5e18`, `marketCapAtDeposit=100e18`, `liquidated=false`, `released=false`, `depositBlock` set |

---

## CATEGORY H — IssuerBond: Liquidation
*Batch H1: Liquidate*

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| H1.1 | Liquidate by PayoutEngine | Bond deposited, caller = payoutEngine | `liquidate(token)` | ✅ `BondLiquidated` emitted, PayoutEngine receives `5e18 USDT` |
| H1.2 | Liquidate by non-PayoutEngine | Any other caller | `liquidate(token)` | ❌ REVERT `"IssuerBond: only PayoutEngine"` |
| H1.3 | Liquidate with no bond | No bond deposited | `liquidate(token)` | ❌ REVERT `"IssuerBond: no bond"` |
| H1.4 | Liquidate already liquidated | `liquidated == true` | `liquidate(token)` | ❌ REVERT `"IssuerBond: already liquidated"` |
| H1.5 | Liquidate already released | `released == true` | `liquidate(token)` | ❌ REVERT `"IssuerBond: already released"` |
| H1.6 | Bond record after liquidation | After liquidate | `getBondRecord(token)` | 📋 `liquidated == true`, `bondAmount == 0` |

---

## CATEGORY I — IssuerBond: Release on Wind-Down
*Batch I1: Release*

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| I1.1 | Release by IssuerRegistry | Bond deposited, caller = issuerRegistry | `release(token, issuerEOA)` | ✅ `BondReleased` emitted, issuer gets `99.5%`, treasury gets `0.5%` |
| I1.2 | Release by non-IssuerRegistry | Any other caller | `release(token, issuerEOA)` | ❌ REVERT `"IssuerBond: only IssuerRegistry"` |
| I1.3 | Release with no bond | No bond deposited | `release(token, eoa)` | ❌ REVERT `"IssuerBond: no bond"` |
| I1.4 | Release already liquidated | `liquidated == true` | `release(token, eoa)` | ❌ REVERT `"IssuerBond: was liquidated"` |
| I1.5 | Release already released | `released == true` | `release(token, eoa)` | ❌ REVERT `"IssuerBond: already released"` |
| I1.6 | Fee calculation precision | Bond = 1000e18 | `release(token, eoa)` | 📋 Fee = `5e18` (0.5%), returned = `995e18` |

---

## CATEGORY J — PayoutEngine: Coverage Purchase
*Batch J1: purchaseCoverage*

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| J1.1 | Purchase coverage for active issuer | Pool active, USDT approved | `purchaseCoverage(token, 1000e18)` | ✅ `CoveragePurchased` emitted, holder registered, ProtectionCert minted |
| J1.2 | Purchase zero coverage | Any state | `purchaseCoverage(token, 0)` | ❌ REVERT `"PayoutEngine: zero amount"` |
| J1.3 | Purchase when already insured | Holder already insured | Second `purchaseCoverage(token, ...)` | ❌ REVERT `"PayoutEngine: already insured"` |
| J1.4 | Multiple distinct holders purchase | Pool active | 3 different wallets purchase | ✅ `insuredHolders[token].length == 3`, each has an `InsuredPosition` |
| J1.5 | estimatedPayoutPct calculation | Pool has $10 TVL, $100 insured | After purchase | 📋 `estimatedPct = (10000 * 10000) / (100 + newCoverage)` |
| J1.6 | addInsuredAmount called on pool | Pool active | After `purchaseCoverage` | 📋 `pool.totalInsuredAmount` increases by covered amount |

---

## CATEGORY K — PayoutEngine: executePayout Core
*Batch K1: Authorization & State*

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| K1.1 | executePayout by owner | Bond + pool funded, 1 holder | `executePayout(token)` by owner | ✅ All 4 contracts called, `PayoutComplete` emitted |
| K1.2 | executePayout by defaultOracle | defaultOracle address set | `executePayout(token)` from defaultOracle | ✅ Succeeds — oracle is authorized caller |
| K1.3 | executePayout by unauthorized | Random wallet | `executePayout(token)` | ❌ REVERT `"PayoutEngine: unauthorized"` |
| K1.4 | executePayout with 0 holders | Bond + pool funded, no holders | `executePayout(token)` | ✅ Runs without distribution loop, `PayoutComplete(totalPayout, 0)` emitted |
| K1.5 | ProtectionCert burned after payout | Holder has cert | After `executePayout` | 📋 `protectionCert.balanceOf(holder) == 0`, `certId` burned |
| K1.6 | pos.paid = true after payout | Holder position created | After `executePayout` | 📋 `positions[token][holder].paid == true` |
| K1.7 | Already paid position skipped | `pos.paid == true` | Re-run executePayout (if possible) | 📋 `pos.coveredAmount == 0` or `pos.paid == true` guard skips the entry |
| K1.8 | PayoutExecuted event per holder | 3 holders in pool | `executePayout` | ✅ 3 `PayoutExecuted` events emitted, one per holder |

---

## CATEGORY L — PayoutEngine: Loss Waterfall
*Batch L1: Waterfall Absorption*

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| L1.1 | Bond covers all losses | Bond $10, covered amount $10, pool empty | `executePayout` | 📋 `juniorLiquidated == 0`, `seniorLiquidated == 0`, full bond paid out |
| L1.2 | Bond + junior covers losses | Bond $5, junior $5, total insured $9 | `executePayout` | 📋 `seniorLiquidated == 0` |
| L1.3 | Bond + junior + senior all needed | Bond $5, junior $3, senior $7, insured $20 | `executePayout` | 📋 All 3 liquidated, `totalPayout == 15`, holder gets pro-rata |
| L1.4 | totalPayout = sum of 3 sources | Bond=$5, junior=$3, senior=$2 | After `executePayout` | 📋 SubrogationNFT `totalPayoutAmount == 10e18` |
| L1.5 | Pro-rata: 2 holders equal amounts | Holder1=$500, Holder2=$500, totalPayout=$800 | After `executePayout` | 📋 Each receives `400 USDT` exactly |
| L1.6 | Pro-rata: 2 holders unequal | Holder1=$200, Holder2=$800, totalPayout=$500 | After `executePayout` | 📋 Holder1 gets `$100`, Holder2 gets `$400` |
| L1.7 | Zero coveredAmount holder skipped | One holder has `coveredAmount == 0` | `executePayout` | 📋 Zero-amount holder's `share == 0`, loop continues without USDT transfer |

---

## CATEGORY M — PayoutEngine: ERC-3643 Compliance
*Batch M1: isVerified + isFrozen Checks*

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| M1.1 | Verified + not frozen → direct payout | `isVerified = true`, `isFrozen = false` | `executePayout` | ✅ Holder receives USDT, `PayoutExecuted` emitted |
| M1.2 | Not verified → escrow | `isVerified = false` | `executePayout` | 📋 `pos.inEscrow == true`, `escrows[holder].amount == share`, `PayoutHeld` emitted |
| M1.3 | Verified but frozen → escrow | `isVerified = true`, `isFrozen = true` | `executePayout` | 📋 Same as M1.2 — `PayoutHeld` with `"COMPLIANCE_HOLD"` |
| M1.4 | IdentityRegistry call reverts → treated as compliant | `identityRegistry()` reverts | `executePayout` | ✅ Holder treated as compliant, direct payout |
| M1.5 | `isVerified` call reverts → treated as compliant | Registry exists but `isVerified` reverts | `executePayout` | ✅ Assumes compliant, direct payout |
| M1.6 | `isFrozen` call reverts → treated as not frozen | `isFrozen` reverts | `executePayout` | ✅ Assumes not frozen, direct payout |

---

## CATEGORY N — PayoutEngine: Escrow Management
*Batch N1: releaseEscrow*

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| N1.1 | releaseEscrow after holder becomes compliant | Holder in escrow, now `isVerified = true, !frozen` | `releaseEscrow(holder)` | ✅ `EscrowReleased` emitted, holder receives USDT, `escrows[holder].amount == 0` |
| N1.2 | releaseEscrow with no escrow record | Holder has no escrow | `releaseEscrow(holder)` | ❌ REVERT `"PayoutEngine: no escrow"` |
| N1.3 | releaseEscrow while still non-compliant | Holder `isVerified = false` | `releaseEscrow(holder)` | ❌ REVERT `"PayoutEngine: still non-compliant"` |
| N1.4 | Escrow amount zeroed after release | After `releaseEscrow` | `getEscrowRecord(holder).amount` | 📋 `== 0` |
| N1.5 | Escrow expiry block set correctly | After `executePayout` | `escrows[holder].escrowExpiry` | 📋 `== escrowStartBlock + 5_184_000` (~180 days) |
| N1.6 | Two holders in escrow — independent release | Holder A and Holder B both in escrow | Release Holder A only | ✅ Holder A paid, Holder B escrow unchanged |

---

## CATEGORY O — SubrogationNFT
*Batch O1: Minting & Data*

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| O1.1 | Mint by PayoutEngine → all fields stored | PayoutEngine authorised | `mint(foundation, token, 0, 10e18, 5e18, 3e18, 2e18, 1)` | ✅ `SubrogationClaimed` emitted, `nextTokenId` incremented |
| O1.2 | Mint by non-authorized | Random caller | `mint(...)` | ❌ REVERT `"SubrogationNFT: unauthorized"` |
| O1.3 | getClaimData returns all 8 fields | After mint | `getClaimData(1)` | 📋 `issuerToken`, `defaultType`, `totalPayoutAmount`, `bondLiquidated`, `juniorLiquidated`, `seniorLiquidated`, `insuredHolderCount`, `payoutBlock` all correct |
| O1.4 | getClaimByIssuer returns tokenId | After mint for `token` | `getClaimByIssuer(token)` | 📋 Returns `1` |
| O1.5 | Non-foundation cannot transfer NFT | NFT minted to foundation | Transfer from non-foundation wallet | ❌ REVERT `"SubrogationNFT: only foundation can transfer"` |
| O1.6 | Foundation can transfer | NFT minted to foundation | Foundation calls `safeTransferFrom` | ✅ NFT transferred to new owner |
| O1.7 | nextTokenId increments per mint | 2 defaults minted | `nextTokenId` | 📋 Returns `3` (starts at 1, increments to 2 after first, 3 after second) |

---

## CATEGORY P — IssuerRegistry: Default Status
*Batch P1: setDefaulted & Post-Default Restrictions*

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| P1.1 | setDefaulted changes status | Active issuer | `issuerRegistry.setDefaulted(token)` | 📋 `getStatus(token) == DEFAULTED (3)` |
| P1.2 | setDefaulted by unauthorized | Non-PayoutEngine caller | `setDefaulted(token)` | ❌ REVERT (only payoutEngine or owner authorized) |
| P1.3 | Cannot purchaseCoverage for defaulted issuer | Status = DEFAULTED | `payoutEngine.purchaseCoverage(token, amount)` | ❌ REVERT (pool not active or issuer not active check) |
| P1.4 | Cannot depositSenior for defaulted issuer | Status = DEFAULTED, redemption gate active | `insurancePool.depositSenior(token, amount)` | ❌ REVERT `"InsurancePool: gate active"` or `"InsurancePool: pool not active"` |

---

## CATEGORY Q — IRSOracle: Score Zeroing on Default
*Batch Q1: setScoreToZero*

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| Q1.1 | setScoreToZero called by executePayout | IRS score = 720 | `executePayout(token)` | 📋 `irsOracle.getScore(token) == 0` after payout |
| Q1.2 | Score = 0 gives maximum premium | After setScoreToZero | `getPremiumRateBPS(token)` | 📋 Returns `1600` bps (16% APR, the maximum) |
| Q1.3 | setScoreToZero by unauthorized | Non-oracle, non-owner | `irsOracle.setScoreToZero(token)` | ❌ REVERT unauthorized |

---

## CATEGORY R — InsurancePool: liquidateForPayout
*Batch R1: Liquidation Mechanics*

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| R1.1 | Junior fully absorbs losses | Junior TVL > loss needed | `liquidateForPayout(token)` | 📋 `seniorLiquidated == 0`, `juniorLiquidated == loss`, junior TVL → 0 |
| R1.2 | Junior + senior both needed | Junior TVL < total loss | `liquidateForPayout(token)` | 📋 Both liquidated, senior absorbs remainder |
| R1.3 | Both tranches go to zero | Total loss > senior+junior | `liquidateForPayout(token)` | 📋 Full available `juniorLiquidated + seniorLiquidated` returned, pool TVL → 0 |
| R1.4 | Redemption gate activates on liquidation | Pool active before | After `liquidateForPayout` | 📋 `pool.redemptionGateActive == true` |
| R1.5 | liquidateForPayout by non-PayoutEngine | Random caller | `liquidateForPayout(token)` | ❌ REVERT unauthorized |

---

## CATEGORY S — Integration: Full Single Issuer Default Lifecycle
*Batch S1: End-to-End Happy Path*

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| S1.1 | Full lifecycle: register → deposit → coverage → confirm → payout | Fresh deployment | Run all steps in order | ✅ All events emitted, SubrogationNFT minted, holder paid, IRS=0, status=DEFAULTED |
| S1.2 | 2-of-3 TIR → DefaultOracle → PayoutEngine chain | Real attestors registered | CUSTODIAN + LEGAL_REP vote, DefaultOracle confirms, PayoutEngine executes | ✅ No owner bypass needed, full path works |
| S1.3 | SubrogationNFT data matches liquidation amounts | After full flow | `getClaimData(1)` | 📋 `bondLiquidated + juniorLiquidated + seniorLiquidated == totalPayoutAmount` |
| S1.4 | Deployer USDT balance correct after payout | 1 holder with $100 coverage | After payout | 📋 Deployer receives `≤ $100` USDT depending on pool size |
| S1.5 | After default: dashboard TVL drops to $0 | Pool had $25 TVL | After payout | 📋 `pool.seniorTVL == 0`, `pool.juniorTVL == 0` |

---

## CATEGORY T — Integration: Multi-Holder Payout
*Batch T1: Distribution Correctness*

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| T1.1 | 3 holders equal amounts — each gets equal share | Holders A=$333, B=$333, C=$334 | `executePayout` with $500 total | 📋 Each gets ~$166-167, sum == $500 |
| T1.2 | 1 compliant + 1 non-compliant | A=verified, B=frozen | `executePayout` | ✅ A paid directly, B in escrow, B later releases after unfreeze |
| T1.3 | Holder with 0 coveredAmount in list | Holder registered but coveredAmount=0 | `executePayout` | ✅ Zero-amount holder skipped, others paid correctly |
| T1.4 | Very large holder list (gas) | 20 holders registered | `executePayout` | ✅ Completes without OOG; all 20 receive pro-rata |
| T1.5 | B releases escrow after compliance remediation | B in escrow, B passes KYC later | `releaseEscrow(B)` | ✅ B receives their share, `EscrowReleased` emitted |

---

## CATEGORY U — Integration: Multi-Issuer Isolation
*Batch U1: Independent State*

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| U1.1 | Default on issuerA does not affect issuerB pool | Both pools funded | `executePayout(issuerA)` | 📋 `pool.seniorTVL(issuerB)` and `pool.juniorTVL(issuerB)` unchanged |
| U1.2 | IRS score of issuerB unaffected by issuerA default | Both have scores | After `setScoreToZero(issuerA)` | 📋 `irsOracle.getScore(issuerB)` still returns original value |
| U1.3 | SubrogationNFT for issuerA ≠ issuerB | Two defaults executed | `getClaimByIssuer(issuerA)` vs `getClaimByIssuer(issuerB)` | 📋 Different tokenIds, `nextTokenId == 3` |
| U1.4 | Coverage purchase on issuerB works after issuerA defaults | issuerA DEFAULTED, issuerB ACTIVE | `purchaseCoverage(issuerB, amount)` | ✅ Succeeds — pools are independent |

---

## CATEGORY V — Security & Reentrancy
*Batch V1: Reentrancy Guards*

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| V1.1 | Reentrant executePayout via malicious ERC20 | Mock USDT re-enters `executePayout` in `transfer` | `executePayout(token)` | ❌ REVERT from `ReentrancyGuard` |
| V1.2 | Reentrant releaseEscrow via malicious ERC20 | USDT re-enters `releaseEscrow` on transfer | `releaseEscrow(holder)` | ❌ REVERT from `ReentrancyGuard` |
| V1.3 | Reentrant liquidate (IssuerBond) | USDT transfer re-enters `liquidate` | `liquidate(token)` | ❌ REVERT from `ReentrancyGuard` |
| V1.4 | executePayout without IssuerBond set | `issuerBond == address(0)` | `executePayout(token)` | ❌ Reverts or call to zero address fails (implementation-dependent) |
| V1.5 | executePayout without subrogationNFT set | `subrogationNFT == address(0)` | `executePayout(token)` | ✅ SubrogationNFT mint skipped (code checks `if (subrogationNFT != address(0))`) |
| V1.6 | executePayout without irsOracle set | `irsOracle == address(0)` | `executePayout(token)` | ✅ IRS zeroing skipped (`if (irsOracle != address(0))`) |
| V1.7 | executePayout without issuerRegistry set | `issuerRegistry == address(0)` | `executePayout(token)` | ✅ Registry update skipped (`if (issuerRegistry != address(0))`) |

---

## CATEGORY W — Edge Cases
*Batch W1: Boundary & Unusual Conditions*

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| W1.1 | executePayout with pool TVL = 0 (no underwriters) | No deposits, only bond | `executePayout` | ✅ `totalPayout == bondLiquidated`, distribution to holders from bond only |
| W1.2 | executePayout with no bond + no pool (totalPayout=0) | Zero bond, empty pool, 1 holder | `executePayout` | ✅ Holder receives $0, SubrogationNFT minted with `totalPayoutAmount=0` |
| W1.3 | Single holder gets 100% | Only 1 holder | `executePayout` | 📋 `share = (coveredAmount * totalPayout) / totalCovered == totalPayout` |
| W1.4 | Dust precision: totalCovered > totalPayout | 100 holders, $100 each insured, only $1 totalPayout | `executePayout` | 📋 Each holder gets `1e18 * 1e18 / 100e18 = 0.01 USDT` — dust amounts; verify no underflow |
| W1.5 | Bond liquidation with minimum possible amount (1 wei) | `bondAmount = 1 wei` | `executePayout` | ✅ `1 wei` sent to PayoutEngine, `BondLiquidated(token, 1)` emitted |
| W1.6 | Two sequential defaults on different tokens | Both issuers ready | `executePayout(A)` then `executePayout(B)` | ✅ Independent, SubrogationNFT tokenIds 1 and 2 minted respectively |
| W1.7 | Coverage purchased then default before any premium paid | No premiums, pool tiny | `executePayout` | ✅ Holder gets pro-rata of tiny pool — no revert |
| W1.8 | forceConfirmDefault then no executePayout — state persists | TIR confirmed | No payout called | 📋 `isDefaultConfirmed == true` remains; no auto-execution; pool stays live |

---

## CATEGORY X — Frontend: Subrogation Page Display
*Batch X1: UI Rendering*

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| X1.1 | Subrogation page loads with 0 NFTs | No default executed | Open `subrogation.html` | 🖥️ "No SubrogationNFTs Found" message, stats show 0 |
| X1.2 | Subrogation page auto-discovers new NFT | 1 SubrogationNFT minted on-chain | Open `subrogation.html` | 🖥️ NFT card renders with issuerToken, defaultType, amounts, holderCount, payoutBlock |
| X1.3 | Subrogation stats update correctly | 1 NFT minted with $10 payout | View stats section | 🖥️ "NFTS MINTED: 1", "RECOVERY PENDING: $10 USDT", "ACTIVE/COMPLETED: 1/0" |
| X1.4 | Contract address shown correctly | `subrogation.html` loaded | View page header | 🖥️ `SubrogationNFT: 0xbBe8...1e73` and `PayoutEngine: 0xD01e...cf6B` displayed |
| X1.5 | Explorer link on TX hash functional | NFT card loaded | Click TX hash link | 🖥️ Opens `testnet-explorer.hsk.xyz/tx/<hash>` in new tab |
| X1.6 | "Start Recovery" button shows Foundation message | NFT card rendered | Click "Start Recovery" | 🖥️ Alert says "requires Foundation multisig authorization" |
| X1.7 | Multiple NFTs show as separate cards | 2 NFTs minted | Open `subrogation.html` | 🖥️ 2 separate NFT cards, each with correct issuerToken and amounts |

---

**Total: 130 test cases across 24 categories and 38 batches**

Coverage map:
- **TIR** (A, B, C, D): Attestor lifecycle, 2-of-3 voting, slashing
- **DefaultOracle** (E, F): Event flagging, grace periods, confirmation routing
- **IssuerBond** (G, H, I): Deposit, liquidation, clean wind-down release
- **PayoutEngine** (J, K, L, M, N): Coverage purchase, waterfall, ERC-3643 compliance, escrow
- **SubrogationNFT** (O): Minting, data integrity, transfer restriction
- **IssuerRegistry** (P): Status transition, post-default restrictions
- **IRSOracle** (Q): Score zeroing
- **InsurancePool** (R): liquidateForPayout, redemption gate
- **Integration** (S, T, U): End-to-end flows, multi-holder, multi-issuer
- **Security** (V): Reentrancy guards, optional address guards
- **Edge Cases** (W): Boundary amounts, empty states, precision
- **Frontend** (X): UI auto-discovery, display correctness
