# CoverFi Protocol — Complete Test Case Suite

> Generated from full contract audit of all 10 smart contracts.
> Categories: 12 | Batches: 48 | Total Test Cases: 193
> Coverage: Unit, Integration, Edge Case, Security, Frontend UI

---

## LEGEND

| Symbol | Meaning |
|--------|---------|
| ✅ Expected: PASS | Transaction succeeds, state changes correctly |
| ❌ Expected: REVERT | Transaction reverts with given reason |
| 📋 Expected: STATE | No tx, specific state value expected |
| 🖥️ Expected: UI | Frontend behavior |

---

# CATEGORY A — ISSUER REGISTRATION & LIFECYCLE

## Batch A1: Registration Happy Path

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| A1-1 | Standard registration succeeds | Fresh contract, deployer has USDT | `register(token, basUID, custodian, legalRep, auditor, marketCap, false)` | ✅ Issuer status = OBSERVATION, observationEndBlock = block + (60 × 28800) |
| A1-2 | Fast-track registration succeeds | Custodian registered in TIR for 31+ days | `register(token, basUID, custodian, legalRep, auditor, marketCap, true)` | ✅ Issuer status = OBSERVATION, observationEndBlock = block + (14 × 28800) |
| A1-3 | Registration emits IssuerRegistered event | Fresh contract | `register(...)` | ✅ Event: `IssuerRegistered(token, issuerEOA, false, endBlock)` |
| A1-4 | Fast-track sets higher initial IRS (650 vs 600) | Fast-track eligible custodian | Activate both, compare IRS | 📋 Fast-track IRS = 650, standard = 600 |
| A1-5 | Zero address token rejected | Any setup | `register(address(0), ...)` | ❌ "IssuerRegistry: zero address" |

## Batch A2: Registration Failure Cases

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| A2-1 | Duplicate registration rejected | Issuer already registered | `register(sameToken, ...)` | ❌ "IssuerRegistry: already registered" |
| A2-2 | Fast-track rejected if custodian not 30+ days old | Custodian registered 5 days ago | `register(..., true)` | ❌ "IssuerRegistry: custodian not fast-track eligible" |
| A2-3 | Fast-track with unregistered custodian fails | Custodian has no TIR record | `register(..., true)` | ❌ Revert on eligibility check |

## Batch A3: Attestations & Activation

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| A3-1 | Standard activation: 3 attestations + observation period complete | 3 attestations recorded, block past observationEndBlock | `tryActivateCoverage(token)` | ✅ Status → ACTIVE, initialIRS = 600 |
| A3-2 | Activation blocked before observation period ends | 3 attestations, block < observationEndBlock | `tryActivateCoverage(token)` | ❌ "IssuerRegistry: observation not ended" |
| A3-3 | Activation blocked with insufficient attestations | Only 2 attestations, period complete | `tryActivateCoverage(token)` | ❌ "IssuerRegistry: insufficient attestations" |
| A3-4 | Fast-track activation requires only 2 attestations | 2 attestations, fast-track issuer | `tryActivateCoverage(token)` after observation | ✅ Status → ACTIVE |
| A3-5 | Attestation counter increments correctly | OBSERVATION status | `recordAttestation(token)` × 3 | 📋 attestationCount = 3 after 3 calls |
| A3-6 | `recordAttestation` rejected when not in OBSERVATION | ACTIVE status issuer | `recordAttestation(token)` | ❌ "IssuerRegistry: not in observation" |

## Batch A4: State Transitions & Wind-Down

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| A4-1 | ACTIVE issuer can initiate wind-down | ACTIVE status | `initiateWindDown(token, custodianUID, legalUID)` from issuerEOA | ✅ Status → WIND_DOWN, deadline = now + 30 days |
| A4-2 | Non-issuer cannot initiate wind-down | ACTIVE status | `initiateWindDown(token, ...)` from random address | ❌ "IssuerRegistry: not issuer" |
| A4-3 | Wind-down blocked if issuer is in MONITORING | MONITORING status | `initiateWindDown(token, ...)` | ❌ "IssuerRegistry: not active" |
| A4-4 | Wind-down finalize before deadline blocked | WIND_DOWN status, deadline not reached | `finalizeWindDown(token)` | ❌ "IssuerRegistry: deadline not passed" |
| A4-5 | DEFAULTED state blocks further operations | DEFAULTED status | `depositSenior(token, ...)` | ❌ Pool.isActive check will fail |
| A4-6 | `forceActivateForDemo` skips observation | OBSERVATION status | `forceActivateForDemo(token)` by owner | ✅ Status → ACTIVE immediately |

---

# CATEGORY B — IRS SCORE & PREMIUM PRICING

## Batch B1: Score Initialization & Bounds

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| B1-1 | Score initialized at correct value | Fresh token | `initializeScore(token, 600)` | 📋 `getScore(token)` = 600 |
| B1-2 | Score proportionally distributed across 5 dimensions | `initializeScore(token, 1000)` | Read all 5 components | 📋 navPunctuality=250, repayment=300, etc. (max values) |
| B1-3 | Double initialization rejected | Score already initialized | `initializeScore(token, 500)` | ❌ "IRSOracle: score already initialized" |
| B1-4 | Score cannot exceed MAX (1000) | Max score issuer | `setScoreForTest(token, 1001)` | ❌ "IRSOracle: exceeds max" |
| B1-5 | Only owner can initialize score | Non-owner | `initializeScore(token, 600)` | ❌ OwnableUnauthorizedAccount |

## Batch B2: Score Dimension Updates

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| B2-1 | On-time NAV update increases navPunctuality | Score initialized | `recordNAVUpdate(token, true, 0)` | 📋 navPunctuality increases by +5 |
| B2-2 | NAV update 1-3 days late penalizes slightly | Score initialized | `recordNAVUpdate(token, false, 2)` | 📋 navPunctuality decreases by -5 |
| B2-3 | NAV update 7+ days late penalizes heavily | Score initialized | `recordNAVUpdate(token, false, 8)` | 📋 navPunctuality decreases by -25 |
| B2-4 | On-time repayment increases repaymentHistory | Score initialized | `recordRepaymentEvent(token, true, 0)` | 📋 repaymentHistory increases by +15 |
| B2-5 | Repayment 15+ days late causes heavy penalty | Score initialized | `recordRepaymentEvent(token, false, 16)` | 📋 repaymentHistory decreases by -80 |
| B2-6 | Healthy collateral (≥150%) increases score | Score initialized | `recordCollateralHealth(token, 15000)` | 📋 collateralHealth increases |
| B2-7 | Sub-70% collateral decreases score | Score initialized | `recordCollateralHealth(token, 6999)` | 📋 collateralHealth decreases |
| B2-8 | Score floors at 0, never goes negative | Score near 0 | Multiple penalty events | 📋 `getScore(token)` >= 0 always |

## Batch B3: Premium Formula & EWS

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| B3-1 | IRS=1000 gives ~400 bps premium (4%) | `setScoreForTest(token, 1000)` | `getPremiumRateBPS(token)` | 📋 Result ≈ 400 bps (within 5% tolerance) |
| B3-2 | IRS=0 gives 1600 bps premium (16%) | `setScoreForTest(token, 0)` | `getPremiumRateBPS(token)` | 📋 Result = 1600 bps (MAX_PREMIUM_BPS) |
| B3-3 | IRS=500 gives ~11% premium | `setScoreForTest(token, 500)` | `getPremiumRateBPS(token)` | 📋 Result ≈ 1100 bps |
| B3-4 | EWS fires on 50+ point drop in 24h | Score = 700 | Multiple rapid penalty events dropping score by 55 | 📋 `EarlyWarningFired` event emitted |
| B3-5 | EWS does NOT fire on 49-point drop | Score = 700 | Events dropping score by 49 | 📋 No `EarlyWarningFired` event |
| B3-6 | Premium clamped to MIN_PREMIUM_BPS (400) | IRS=1000 | Force premium calculation | 📋 Result >= 400 always |
| B3-7 | Only keeper/owner can update score dimensions | Random address | `recordNAVUpdate(token, true, 0)` | ❌ "IRSOracle: not keeper" |

---

# CATEGORY C — INSURANCE POOL DEPOSITS

## Batch C1: Junior Deposits

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| C1-1 | Junior deposit mints jrCVR 1:1 | Pool active, USDT approved | `depositJunior(token, 100 USDT)` | ✅ jrCVR balance increases by 100, USDT transferred |
| C1-2 | Junior deposit updates pool.juniorTVL | Pool active | `depositJunior(token, 50 USDT)` | 📋 `getPoolState(token).juniorTVL` increases by 50 |
| C1-3 | Zero USDT junior deposit blocked | Pool active | `depositJunior(token, 0)` | ❌ ERC20 / amount check |
| C1-4 | Junior deposit emits JuniorDeposited event | Pool active | `depositJunior(token, 100 USDT)` | ✅ Event: `JuniorDeposited(deployer, token, 100, 100)` |
| C1-5 | Junior deposit blocked when pool inactive | Pool NOT activated | `depositJunior(token, 100 USDT)` | ❌ "InsurancePool: pool not active" |

## Batch C2: Senior Deposits & Junior Ratio

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| C2-1 | Senior deposit when ratio is healthy (>25% junior) | juniorTVL=$30, seniorTVL=$70 | `depositSenior(token, 10 USDT)` | ✅ Succeeds, srCVR minted at exchange rate |
| C2-2 | Senior deposit blocked when no junior exists | Pool has zero junior TVL | `depositSenior(token, 100 USDT)` | ❌ "InsurancePool: junior ratio too low" |
| C2-3 | Senior deposit blocked when it would push ratio below 25% | juniorTVL=$25, seniorTVL=$75 | `depositSenior(token, 200 USDT)` | ❌ "junior ratio too low" |
| C2-4 | Senior deposit mints srCVR at current exchange rate | Exchange rate = 1.05 | `depositSenior(token, 105 USDT)` | 📋 srCVR minted = 100 (105/1.05) |
| C2-5 | Senior deposit blocked when redemption gate active | Gate activated | `depositSenior(token, 100 USDT)` | ❌ "InsurancePool: redemption gate active" |
| C2-6 | Multiple depositors maintain correct TVL | 3 different wallets each deposit | Sum all deposits | 📋 seniorTVL = sum of all senior deposits |

## Batch C3: Pool Activation & Gate

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| C3-1 | Only owner can activate pool | Non-owner | `activatePool(token)` | ❌ OwnableUnauthorizedAccount |
| C3-2 | Pool activation emits PoolActivated event | Inactive pool | `activatePool(token)` by owner | ✅ Event: `PoolActivated(token)` |
| C3-3 | Only defaultOracle or owner can activate gate | Random address | `activateRedemptionGate(token)` | ❌ "InsurancePool: unauthorized" |
| C3-4 | Gate blocks all deposits and withdrawals | Gate active | `depositJunior`, `initiateWithdrawalSenior` | ❌ All blocked when gate active |
| C3-5 | Gate can be deactivated, restoring access | Gate active → deactivate | `depositJunior(token, 100)` | ✅ Succeeds after deactivation |

---

# CATEGORY D — WITHDRAWALS & LOCK PERIODS

## Batch D1: Withdrawal Initiation

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| D1-1 | Senior withdrawal initiation creates request | srCVR holder | `initiateWithdrawalSenior(token, amount)` | ✅ Returns requestId, request stored with lockBlocks=864000 |
| D1-2 | Junior withdrawal initiation creates request | jrCVR holder | `initiateWithdrawalJunior(token, amount)` | ✅ Returns requestId, lockBlocks=403200 |
| D1-3 | Initiation blocked when gate active | Gate active | `initiateWithdrawalSenior(token, amount)` | ❌ "InsurancePool: redemption gate active" |
| D1-4 | Cannot initiate with zero amount | srCVR holder | `initiateWithdrawalSenior(token, 0)` | ❌ Amount check / ERC20 failure |
| D1-5 | Initiation blocked if no srCVR balance | Empty wallet | `initiateWithdrawalSenior(token, 1)` | ❌ Insufficient balance |

## Batch D2: Withdrawal Execution

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| D2-1 | Senior withdrawal executes after 30-day lock | Request created, fast-forward 864001 blocks | `executeWithdrawal(requestId, token)` | ✅ USDT returned, srCVR burned |
| D2-2 | Junior withdrawal executes after 14-day lock | Request created, fast-forward 403201 blocks | `executeWithdrawal(requestId, token)` | ✅ USDT returned at pro-rata rate |
| D2-3 | Withdrawal blocked before lock expires | Request just created, no block advance | `executeWithdrawal(requestId, token)` | ❌ "InsurancePool: lock period not expired" |
| D2-4 | Only original depositor can execute their withdrawal | Request from Alice | Bob calls `executeWithdrawal(aliceRequestId, token)` | ❌ "InsurancePool: not your request" |
| D2-5 | Same request cannot be executed twice | Executed request | `executeWithdrawal(requestId, token)` again | ❌ "InsurancePool: already executed" |
| D2-6 | Junior withdrawal returns correct pro-rata amount | juniorRate = 1.1 (10% yield) | Execute 100 jrCVR withdrawal | 📋 Receives 110 USDT |

---

# CATEGORY E — PREMIUM PAYMENTS & YIELD ACCRUAL

## Batch E1: Premium Distribution

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| E1-1 | Premium correctly split: 5% fee, 70% senior, 30% junior | Pool active | `payPremium(token, 1000 USDT)` | 📋 Protocol gets 50, senior pool gets 665 (70% of 950), junior gets 285 (30% of 950) |
| E1-2 | Premium payment advances junior epoch | Pool active | `payPremium(token, 100)` | 📋 `currentEpoch` increments by 1 |
| E1-3 | Senior exchange rate increases after premium | exchangeRate starts at 1.0 | `payPremium(token, 950 USDT)` with 700 srCVR supply | 📋 exchangeRate > 1.0 after payment |
| E1-4 | Junior poolUnderlying increases after premium | Pool active | `payPremium(token, 1000 USDT)` | 📋 `jrCVR.getPoolUnderlying(token)` increases by 285 (30% of 950) |
| E1-5 | Zero premium payment blocked | Pool active | `payPremium(token, 0)` | ❌ Amount validation or no-op |

## Batch E2: Yield Calculation Precision

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| E2-1 | Exchange rate correctly calculated: (totalUnderlying × 1e18) / totalSupply | Deposit $700 senior, pay $350 premium to senior | Read `getCurrentExchangeRate()` | 📋 Rate = (1050 × 1e18) / 700 = 1.5 × 1e18 |
| E2-2 | Junior redemption pro-rata: (jrAmount × poolUnderlying) / poolSupply | Deposit $300 junior, accrue $150 to junior | Redeem 300 jrCVR | 📋 Receive 450 USDT |
| E2-3 | Late depositor (after yield accrual) does not get phantom yield | 700 USDT deposited senior, $350 premium accrued, THEN Alice deposits $100 | Alice immediately redeems | 📋 Alice receives exactly $100, not $100 + phantom yield |
| E2-4 | Epoch yield tracks per-epoch amounts | 3 premium payments of $100 each | Read `epochYield(0)`, `epochYield(1)`, `epochYield(2)` | 📋 Each epochYield = 30 (30% of $100) |
| E2-5 | Exchange rate after liquidation reflects reduced underlying | Pool liquidated for payout | `getCurrentExchangeRate()` | 📋 Rate < 1.0 if losses exceeded senior yield |

---

# CATEGORY F — COVERAGE PURCHASE & PROTECTION CERT NFT

## Batch F1: Coverage Purchase Happy Path

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| F1-1 | Coverage purchase mints ProtectionCert NFT | Issuer ACTIVE, USDT approved | `purchaseCoverage(token, 1000 USDT)` | ✅ NFT minted, `balanceOf(buyer)` = 1 |
| F1-2 | Coverage records correct position data | Pool has $10,000 TVL, $5,000 total insured before | `purchaseCoverage(token, 1000 USDT)` | 📋 `estimatedPayoutPct` = (10000 / 6000) × 10000 bps |
| F1-3 | Coverage purchase emits CoveragePurchased event | ACTIVE issuer | `purchaseCoverage(token, 1000)` | ✅ Event: `CoveragePurchased(buyer, token, 1000, certId, estimatedPct)` |
| F1-4 | Coverage purchase adds to pool's totalInsuredAmount | Pool state before | `purchaseCoverage(token, 500)` | 📋 `totalInsuredAmount` increases by 500 |
| F1-5 | ProtectionCert has correct metadata | After purchase | `getCertMetadata(certId)` | 📋 issuerToken, holder, coveredAmount all match purchase params |

## Batch F2: Coverage Purchase Failure Cases

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| F2-1 | Duplicate coverage purchase blocked | Already insured for this token | `purchaseCoverage(token, 500)` again | ❌ "PayoutEngine: already insured" |
| F2-2 | Zero coverage amount blocked | ACTIVE issuer | `purchaseCoverage(token, 0)` | ❌ "PayoutEngine: zero amount" |
| F2-3 | Soulbound: ProtectionCert transfer blocked | NFT held by Alice | `transferFrom(alice, bob, tokenId)` | ❌ "Soulbound: non-transferable" |
| F2-4 | `burnByHolder` works for NFT owner | Alice owns certId | Alice calls `burnByHolder(certId)` | ✅ NFT burned, balanceOf = 0 |
| F2-5 | Non-owner cannot burn others' cert | Alice owns certId | Bob calls `burnByHolder(certId)` | ❌ "ProtectionCert: not owner" |

---

# CATEGORY G — DEFAULT DETECTION & DEFAULT ORACLE

## Batch G1: Flagging Default Events

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| G1-1 | PAYMENT_DELAY sets 48-hour grace | ACTIVE issuer | `flagDefaultEvent(token, PAYMENT_DELAY)` | 📋 graceExpiryBlock = block + 57600 |
| G1-2 | GHOST_ISSUER sets 72-hour grace | ACTIVE issuer | `flagDefaultEvent(token, GHOST_ISSUER)` | 📋 graceExpiryBlock = block + 86400 |
| G1-3 | COLLATERAL_SHORTFALL sets 7-day grace | ACTIVE issuer | `flagDefaultEvent(token, COLLATERAL_SHORTFALL)` | 📋 graceExpiryBlock = block + 201600 |
| G1-4 | MISAPPROPRIATION has ZERO grace period | ACTIVE issuer | `flagDefaultEvent(token, MISAPPROPRIATION)` | 📋 graceExpiryBlock = current block (immediate) |
| G1-5 | Default flagging blocked if already confirmed | Default already confirmed | `flagDefaultEvent(token, PAYMENT_DELAY)` | ❌ "DefaultOracle: already confirmed" |
| G1-6 | Only owner can flag default events | Random address | `flagDefaultEvent(token, PAYMENT_DELAY)` | ❌ OwnableUnauthorizedAccount |

## Batch G2: Monitoring & Clearing

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| G2-1 | Clear monitoring before grace expires resets state | Default flagged, within grace period | `clearMonitoring(token)` | 📋 `isInMonitoring(token)` = false |
| G2-2 | IssuerRegistry status returns to ACTIVE after clear | Moved to MONITORING | `clearMonitoring(token)` | 📋 issuer status = ACTIVE |
| G2-3 | processConfirmation succeeds after grace period | Past grace, TIR confirmed | `processConfirmation(token)` | ✅ `defaultConfirmed[token]` = true |
| G2-4 | Only TIR or owner can process confirmation | Random address | `processConfirmation(token)` | ❌ "DefaultOracle: unauthorized" |

---

# CATEGORY H — TIR ATTESTOR SYSTEM

## Batch H1: Attestor Registration

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| H1-1 | Attestor registration with sufficient bond succeeds | Fresh wallet | `registerAttestor(CUSTODIAN)` with 5+ ETH | ✅ Attestor status = ACTIVE |
| H1-2 | Registration without minimum bond rejected | Fresh wallet | `registerAttestor(LEGAL_REP)` with 4.9 ETH | ❌ "TIR: insufficient bond" |
| H1-3 | Same address cannot register twice | Already registered | `registerAttestor(AUDITOR)` again | ❌ "TIR: already registered" |
| H1-4 | Custodian registered 30+ days ago is fast-track eligible | Registered 31 days ago | `isFastTrackEligible(custodian)` | 📋 Returns true |
| H1-5 | Custodian registered 29 days ago is NOT fast-track eligible | Registered 29 days ago | `isFastTrackEligible(custodian)` | 📋 Returns false |

## Batch H2: Default Attestation Voting

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| H2-1 | First attestation (CUSTODIAN) records vote | Issuer in MONITORING | `submitDefaultAttestation(token, uid, hash)` by custodian | ✅ custodianVoted = true, voteCount = 1 |
| H2-2 | Two different-category votes trigger confirmation | Custodian + LegalRep vote | Submit second vote | ✅ `isDefaultConfirmed(token)` = true |
| H2-3 | Two votes from same category do NOT trigger confirmation | Two custodians vote | Both votes from CUSTODIAN | 📋 voteCount = 2 but only 1 unique category → NOT confirmed |
| H2-4 | SLASHED attestor cannot submit attestation | Attestor slashed | `submitDefaultAttestation(token, ...)` | ❌ "TIR: attestor not active" |
| H2-5 | Same attestor cannot vote twice for same token | Custodian already voted | Custodian votes again for same token | ❌ "TIR: already voted" |

## Batch H3: Slashing

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| H3-1 | Slashing confiscates entire bond | Active attestor with 5 ETH bond | `slashAttestor(addr, "fraud")` | ✅ Attestor status = SLASHED, ETH transferred to treasury |
| H3-2 | Slashed attestor cannot be re-registered | Slashed status | `registerAttestor(CUSTODIAN)` | ❌ "TIR: already registered" (SLASHED != UNREGISTERED) |
| H3-3 | Force-confirm bypasses 2-of-3 (demo only) | No votes submitted | `forceConfirmDefault(token)` by owner | ✅ `isDefaultConfirmed(token)` = true |
| H3-4 | Only owner can slash | Random address | `slashAttestor(target, "reason")` | ❌ OwnableUnauthorizedAccount |

---

# CATEGORY I — ISSUER BOND

## Batch I1: Bond Deposit

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| I1-1 | Bond deposit stores correct record | USDT approved | `deposit(token, 5 USDT, 100 USDT marketCap)` | 📋 `bonds[token].bondAmount = 5`, `marketCap = 100` |
| I1-2 | Duplicate bond deposit blocked | Bond already exists | `deposit(token, 5 USDT, 100)` again | ❌ "IssuerBond: bond exists" |
| I1-3 | Zero amount bond deposit blocked | First deposit | `deposit(token, 0, 100)` | ❌ "IssuerBond: zero amount" |
| I1-4 | Bond deposit requires USDT pre-approval | No allowance | `deposit(token, 5 USDT, 100)` | ❌ ERC20 insufficient allowance |
| I1-5 | Bond emits BondDeposited event | USDT approved | `deposit(token, 5, 100)` | ✅ Event: `BondDeposited(token, 5, 100)` |

## Batch I2: Bond Liquidation & Release

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| I2-1 | Only PayoutEngine can liquidate bond | Random address | `liquidate(token)` | ❌ "IssuerBond: only payout engine" |
| I2-2 | Liquidation transfers full bond to PayoutEngine | Bond = 5 USDT | `liquidate(token)` from PayoutEngine | ✅ Returns 5, `isLiquidated = true` |
| I2-3 | Already liquidated bond cannot be liquidated again | isLiquidated = true | `liquidate(token)` | ❌ "IssuerBond: already liquidated" |
| I2-4 | Only IssuerRegistry can release bond | Random address | `release(token, issuerEOA)` | ❌ "IssuerBond: only registry" |
| I2-5 | Release deducts 0.5% protocol fee | Bond = 1000 USDT | `release(token, issuerEOA)` from Registry | 📋 issuerEOA gets 995 USDT, treasury gets 5 USDT |

---

# CATEGORY J — PAYOUT WATERFALL

## Batch J1: Payout Execution — Happy Path

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| J1-1 | Payout follows: Bond → Junior → Senior order | Bond=$5, Junior=$30, Senior=$70, Coverage=$100 | `executePayout(token)` | 📋 Bond liquidated first, then junior, then senior |
| J1-2 | Verified holder receives payout immediately | Alice is KYC-verified, bought $100 coverage | `executePayout(token)` | ✅ Alice receives USDT, certId burned |
| J1-3 | Payout is pro-rata by covered amount | Alice: $100, Bob: $200 coverage, $300 pool | `executePayout(token)` | 📋 Alice gets $100, Bob gets $200 (1:2 ratio) |
| J1-4 | Payout emits PayoutComplete event | 2 holders | `executePayout(token)` | ✅ Event: `PayoutComplete(token, totalPayout, 2)` |
| J1-5 | SubrogationNFT minted to foundation | Payout executed | After `executePayout(token)` | 📋 `subrogationNFT.balanceOf(foundation)` = 1 |
| J1-6 | IRS score zeroed after payout | IRS = 600 before | After `executePayout(token)` | 📋 `getScore(token)` = 0 |
| J1-7 | ProtectionCert burned for each paid holder | Alice held certId=1 | After payout | 📋 `ownerOf(1)` reverts (burned) |

## Batch J2: ERC-3643 Compliance in Payout

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| J2-1 | Non-verified holder payout goes to escrow | Alice not KYC-verified | `executePayout(token)` | 📋 `escrows[alice].amount > 0`, not immediate payout |
| J2-2 | Frozen wallet payout goes to escrow | Bob's wallet is frozen in ERC-3643 | `executePayout(token)` | 📋 `escrows[bob].amount > 0` |
| J2-3 | Escrow release succeeds after compliance restored | Alice completes KYC | `releaseEscrow(alice)` | ✅ Alice receives USDT |
| J2-4 | Escrow release fails if not yet compliant | Alice still non-compliant | `releaseEscrow(alice)` | ❌ Compliance check fails |
| J2-5 | PayoutHeld event emitted for non-compliant holder | Non-compliant holder | `executePayout(token)` | ✅ Event: `PayoutHeld(alice, token, amount, reason)` |
| J2-6 | If ERC-3643 check throws, fallback to compliant | Broken identity registry | `executePayout(token)` | 📋 `_checkCompliance` returns true on error (safe fallback) |

## Batch J3: Payout Failure Cases

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| J3-1 | Only owner or defaultOracle can execute payout | Random address | `executePayout(token)` | ❌ "PayoutEngine: unauthorized" |
| J3-2 | Payout with zero insured holders succeeds without error | No one bought coverage | `executePayout(token)` | ✅ Completes with 0 distributions, SubrogationNFT minted |
| J3-3 | All funds in bond sufficient — junior and senior untouched | Bond=$100, Coverage=$50 | `executePayout(token)` | 📋 Junior and senior TVLs unchanged |
| J3-4 | Junior insufficient alone — senior absorbs remainder | Bond=$5, Junior=$20, Coverage=$100 | Payout | 📋 Junior fully liquidated, $75 taken from senior |

---

# CATEGORY K — SECURITY & ACCESS CONTROL

## Batch K1: onlyOwner Enforcement

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| K1-1 | `InsurancePool.activatePool` non-owner | Non-owner | `activatePool(token)` | ❌ OwnableUnauthorizedAccount |
| K1-2 | `IssuerRegistry.forceActivateForDemo` non-owner | Non-owner | `forceActivateForDemo(token)` | ❌ OwnableUnauthorizedAccount |
| K1-3 | `IRSOracle.initializeScore` non-owner | Non-owner | `initializeScore(token, 600)` | ❌ OwnableUnauthorizedAccount |
| K1-4 | `TIR.slashAttestor` non-owner | Non-owner | `slashAttestor(addr, "r")` | ❌ OwnableUnauthorizedAccount |
| K1-5 | `DefaultOracle.flagDefaultEvent` non-owner | Non-owner | `flagDefaultEvent(token, 0)` | ❌ OwnableUnauthorizedAccount |

## Batch K2: Cross-Contract Authorization

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| K2-1 | Only InsurancePool can call srCVR.mint | Non-pool address | `srCVR.mint(addr, 100, token)` | ❌ "srCVR: only pool" |
| K2-2 | Only InsurancePool can call jrCVR.accrueYield | Non-pool address | `jrCVR.accrueYield(100, token)` | ❌ "jrCVR: only pool" |
| K2-3 | Only PayoutEngine can call InsurancePool.liquidateForPayout | Non-payoutEngine | `liquidateForPayout(token)` | ❌ "InsurancePool: only payout engine" |
| K2-4 | Only IssuerRegistry can call IssuerBond.release | Non-registry | `issuerBond.release(token, addr)` | ❌ "IssuerBond: only registry" |
| K2-5 | Only PayoutEngine or owner can mint ProtectionCert | Random address | `protectionCert.mint(addr, token, 100, 1000, 500)` | ❌ "ProtectionCert: unauthorized" |

## Batch K3: Reentrancy Protection

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| K3-1 | ReentrancyGuard on depositSenior | Malicious USDT contract trying reentrant call | Re-enter `depositSenior` during callback | ❌ "ReentrancyGuard: reentrant call" |
| K3-2 | ReentrancyGuard on executePayout | Malicious holder trying reentrant call during payout | Re-enter `executePayout` during USDT transfer | ❌ "ReentrancyGuard: reentrant call" |
| K3-3 | ReentrancyGuard on IssuerBond.deposit | Re-entry attempt on deposit | Nested `deposit` call | ❌ "ReentrancyGuard: reentrant call" |

---

# CATEGORY L — FRONTEND UI BEHAVIOR

## Batch L1: Wallet Connection & Network

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| L1-1 | Connect wallet on correct network (Chain 133) | MetaMask on HashKey | Click "Connect Wallet" | 🖥️ Wallet address shown, "HashKey Chain Testnet" badge displayed |
| L1-2 | Wrong network triggers switch prompt | MetaMask on Ethereum mainnet | Open dashboard.html | 🖥️ `ensureCorrectNetwork()` called, MetaMask switch prompt appears |
| L1-3 | Reject network switch shows error toast | Switch prompt → deny | Click "Get Coverage" | 🖥️ Toast: "Please switch to HashKey Chain Testnet" |
| L1-4 | Re-connect after disconnect restores state | Wallet connected, then disconnected | Reconnect MetaMask | 🖥️ Balance and position data reloads |

## Batch L2: Dashboard — IRS & Premium Calculator

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| L2-1 | IRS radar chart shows 5 non-zero dimensions | Issuer with IRS=600 | Load dashboard.html | 🖥️ Radar chart renders with navPunctuality, repayment, etc. all visible |
| L2-2 | Premium calculator updates live from contract | IRS = 600 on-chain | Load dashboard | 🖥️ Premium displays 6.96% (696 bps) matching `getPremiumRateBPS()` |
| L2-3 | Pool TVL reads from real contracts | $14,322 senior TVL on-chain | Load dashboard | 🖥️ Displays "$14,322.50" not hardcoded "$0" |
| L2-4 | Your Position section hidden when no deposits | Wallet with no srCVR/jrCVR | Load dashboard | 🖥️ `#userPosition` display = "none" |
| L2-5 | Your Position shows correct yield when deposits exist | Wallet has srCVR with 10% yield | Load dashboard | 🖥️ Shows `"+$X.XX unrealized yield"` computed from exchange rate |

## Batch L3: Coverage Purchase Flow (UI)

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| L3-1 | Coverage form shows validation error on empty amount | Dashboard loaded | Click "Get Coverage" with empty amount field | 🖥️ Form validation error, toast "Please fix the form errors" |
| L3-2 | Confirm modal appears before TX | Form filled correctly | Click "Get Coverage" | 🖥️ Confirm modal shows issuer, amount, premium, duration |
| L3-3 | USDT approval step shown in button | Confirm clicked | MetaMask approval prompt | 🖥️ Button shows "Approving USDT...", then "Purchasing Coverage..." |
| L3-4 | Success toast contains TX hash | Successful purchase | After TX confirmed | 🖥️ Toast: "Coverage purchased! TX: 0x1234..." |
| L3-5 | Error toast shows human-readable message on revert | Contract reverts "already insured" | Attempt second purchase | 🖥️ Toast: "You already have coverage for this issuer" (parseContractError) |

## Batch L4: Register.html — Issuer Registration (UI)

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| L4-1 | USDT balance displays correctly (18 decimals) | Wallet has 10,000 USDT (18 decimals) | Open register.html → bond calculator | 🖥️ Shows "$10,000.00" NOT "$0.00000001" (decimal fix verified) |
| L4-2 | Bond amount = 5% of entered market cap | Enter marketCap = $100,000 | Bond calculator auto-fills | 🖥️ Shows "Required Bond: $5,000.00" |
| L4-3 | "Approve & Deposit Bond" button triggers real TX | Form complete | Click "Approve & Deposit Bond" | 🖥️ MetaMask opens with USDT approval, then bond deposit TX |
| L4-4 | Bond deposit success hides button, shows next step | TX confirmed | After `approveAndDeposit()` success | 🖥️ Bond deposit row hidden, "Next Step" button appears |

## Batch L5: Pool Page (UI)

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| L5-1 | Junior deposit blocked with helpful message when no junior exists | Empty pool | Click "Approve & Deposit Senior" | 🖥️ Toast: "No junior deposits yet. Please deposit to junior tranche first" |
| L5-2 | Exchange rate shows real value (not hardcoded 1.05) | On-chain exchange rate = 1.066 | Load pool.html | 🖥️ Senior exchange rate shows "1.066 USDT/srCVR" |
| L5-3 | Redemption preview uses real exchange rate | Exchange rate = 1.1 | Enter 100 srCVR in redeem field | 🖥️ Preview shows "110.00 USDT" |

---

# CATEGORY M — INTEGRATION & CROSS-CONTRACT FLOWS

## Batch M1: Full Registration → Coverage Flow

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| M1-1 | Full lifecycle: Register → Bond → Activate → Deposit → Buy Coverage | Fresh contracts | Run all steps in sequence | ✅ Each step succeeds, ProtectionCert NFT minted at end |
| M1-2 | Coverage purchase fails before pool activation | Issuer ACTIVE, pool NOT activated | `purchaseCoverage(token, 100)` | ❌ Pool inactive, operation fails |
| M1-3 | Premium payment increases yield for depositors who were already in | Alice deposits before premium, Bob deposits after | Pay premium, both redeem | 📋 Alice gets more than Bob due to exchange rate at deposit time |

## Batch M2: Full Default → Payout Flow

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| M2-1 | Complete default flow: Flag → Confirm → Payout → SubrogationNFT | Issuer with pool and coverage buyers | Run TX3 of demo script | ✅ All steps succeed, holders receive USDT, SubrogationNFT minted to foundation |
| M2-2 | After payout, pool is fully drained | Junior + Senior liquidated | Read pool state after executePayout | 📋 seniorTVL = 0, juniorTVL = 0 |
| M2-3 | Cannot deposit into pool after payout (pool drained) | Pool drained by payout | `depositJunior(token, 100)` | ❌ Pool state invalid or gate active |

---

# CATEGORY N — EXTREME EDGE CASES

## Batch N1: Boundary & Overflow

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| N1-1 | Minimum viable deposit (1 wei USDT) | Pool active | `depositJunior(token, 1)` | ✅ Succeeds, mints 1 jrCVR |
| N1-2 | Very large deposit (uint256 near max) | Pool active, USDT balance sufficient | `depositSenior(token, 1e36)` | ❌ USDT balance check fails (no overflow attempt) |
| N1-3 | Payout with single holder gets 100% | Only 1 coverage buyer | `executePayout(token)` | 📋 Holder receives entire pool balance |
| N1-4 | Payout when pool is completely empty (all withdrawn before default) | All LPs withdrew before default triggered | `executePayout(token)` | ✅ Runs without error, $0 distributed, SubrogationNFT still minted |
| N1-5 | All escrowed (all holders non-compliant) | All coverage buyers non-KYC | `executePayout(token)` | 📋 All USDT goes to escrows, `PayoutHeld` emitted for each |
| N1-6 | Coverage amount larger than entire pool TVL | Coverage = $1,000,000, Pool TVL = $10 | `executePayout(token)` | 📋 Holders receive pro-rata up to available funds (pool drained) |
| N1-7 | IRS score at exact boundary: IRS=999 vs 1000 | Test both | `getPremiumRateBPS(token)` | 📋 Smooth exponential curve, no sudden jump |
| N1-8 | Exchange rate with very small supply (1 token, large underlying) | 1 srCVR token, $1,000,000 underlying | `getCurrentExchangeRate()` | 📋 Returns large but valid rate, no overflow |

## Batch N2: Re-Registration & State Recovery

| ID | Test | Setup | Action | Expected |
|----|------|-------|--------|----------|
| N2-1 | After CLOSED state, token address cannot be re-registered | Issuer status = CLOSED | `register(sameToken, ...)` | ❌ "IssuerRegistry: already registered" |
| N2-2 | New distinct token can always be registered | Any state of other tokens | Register brand new token address | ✅ Succeeds independently |
| N2-3 | Dust attack: many tiny coverage purchases | 100 different wallets buy $1 coverage each | `executePayout(token)` | ✅ All 100 processed; gas scales but does not fail |
| N2-4 | Score initialized at 0 means maximum premium | `initializeScore(token, 0)` | `getPremiumRateBPS(token)` | 📋 Returns 1600 (MAX_PREMIUM_BPS) |

---

## SUMMARY

| Category | Batches | Test Cases |
|----------|---------|------------|
| A — Issuer Registration & Lifecycle | 4 | 19 |
| B — IRS Score & Premium | 3 | 17 |
| C — Insurance Pool Deposits | 3 | 16 |
| D — Withdrawals & Lock Periods | 2 | 11 |
| E — Premium Payments & Yield | 2 | 10 |
| F — Coverage Purchase & NFT | 2 | 10 |
| G — Default Detection | 2 | 10 |
| H — TIR Attestor System | 3 | 12 |
| I — Issuer Bond | 2 | 10 |
| J — Payout Waterfall | 3 | 18 |
| K — Security & Access Control | 3 | 13 |
| L — Frontend UI | 5 | 21 |
| M — Integration Flows | 2 | 6 |
| N — Extreme Edge Cases | 2 | 10 |
| **TOTAL** | **38** | **193** |

---

## IMPLEMENTATION PRIORITY FOR DEMO DAY

**Must test before presenting (live on testnet):**
- F1-1 Coverage purchase mints real NFT
- C1-1 Junior deposit succeeds
- C2-1 Senior deposit succeeds
- E1-1 Premium splits 70/30 correctly
- L2-2 Premium calculator matches contract
- L4-1 USDT balance displays correctly (decimals fix)

**Contract-level (show on explorer, not UI):**
- J1-1 Payout waterfall order
- J2-1 Non-compliant → escrow
- J1-5 SubrogationNFT minted

**Mention as architecture (no live demo needed):**
- K1-* Access control
- K3-* Reentrancy protection
- N1-5 All escrowed scenario
