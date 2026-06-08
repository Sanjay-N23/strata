# 🎬 COVERFI — 7-MINUTE FINAL DEMO SCRIPT

**Event:** HashKey Chain Horizon Hackathon 2026 — Final Round
**Format:** One speaker · One mouse operator
**Total duration:** 7:00 (strict)

---

## SECTION 1 — PPT PITCH (0:00 → 4:00)

---

### [0:00 – 0:10] · SLIDE 1 — Title

**SCREEN / MOUSE:** Open PPT on Slide 1 (CoverFi cover). Cursor hidden.

**SPEAKER:**
> "Twenty-six point six billion dollars sit on-chain as tokenized real-world assets right now. And not a single dollar of it is protected if the issuer defaults tomorrow. *(2-second hold.)* My name is Sanjay. This is CoverFi."

---

### [0:10 – 0:45] · SLIDES 2–3 — The Problem & Why It Matters

**SCREEN / MOUSE:** Advance to Slide 2. After 15 seconds, advance to Slide 3.

**SPEAKER:**
> "Treasury bills. Private credit. Real estate. All of it tokenized as ERC-3643 security tokens — held by institutions, by funds, by accredited investors. And every one of those holders carries one hundred percent unhedged issuer default risk. There is no automated protection. There is no circuit breaker. If the issuer disappears, the holder's only option is multi-year cross-jurisdiction litigation. That is not a missing feature. That is a structural hole in the entire on-chain RWA economy — and it is the single biggest reason institutional capital still hesitates to come on-chain at scale."

---

### [0:45 – 1:15] · SLIDE 4 — Why Existing Solutions Cannot Solve This

**SCREEN / MOUSE:** Advance to Slide 4 (competitor logos / coverage matrix).

**SPEAKER:**
> "And before you ask — Nexus Mutual, Risk Harbor, InsurAce, Neptune — none of them solve this. They were built to insure smart-contract bugs, not credit events. Their payout contracts do not check compliance. They literally cannot pay out to a regulated security token holder without breaking securities law. So the largest insurance protocols in DeFi are structurally blocked from the largest opportunity in DeFi. That is the gap we built CoverFi to close."

---

### [1:15 – 1:35] · SLIDES 5–6 — Our Solution

**SCREEN / MOUSE:** Advance to Slide 5, then quickly to Slide 6 (3-innovations overview).

**SPEAKER:**
> "CoverFi is the first on-chain Credit Default Swap equivalent for ERC-3643 tokenized assets — live today on HashKey Chain. It runs on three innovations. Each one is novel. Each one is patentable. Together, they make this category."

---

### [1:35 – 2:05] · SLIDE 7 — Innovation 1: Mandatory Issuer Bond

**SCREEN / MOUSE:** Advance to Slide 7. Cursor highlights the "5%" graphic.

**SPEAKER:**
> "Innovation one. Every issuer that wants coverage must first lock five percent of their token market capitalization as USDT first-loss capital. Their money burns first — before any LP loses a cent. This is structural skin-in-the-game, enforced by the protocol, not by a contract clause. No traditional bond market does this. We made it the entry ticket."

---

### [2:05 – 2:45] · SLIDE 8 — Innovation 2: IRS Score

**SCREEN / MOUSE:** Advance to Slide 8 (IRS formula + radar chart).

**SPEAKER:**
> "Innovation two. The Issuer Reputation Score — a continuous credit rating from zero to one thousand, computed entirely on-chain across five behavioral dimensions: NAV punctuality, attestation accuracy, repayment history, Chainlink-verified collateral health, and protocol activity. The premium is then priced through an exponential curve — *premium equals sixteen hundred times e to the negative zero point zero zero one three eight six times IRS*. A well-behaved issuer pays four percent. A failing one pays sixteen. This is the on-chain equivalent of what Moody's and S&P do off-chain — and we are the first to bring it on-chain in real time."

---

### [2:45 – 3:15] · SLIDE 9 — Innovation 3: ERC-3643 Compliance-Native Payout

**SCREEN / MOUSE:** Advance to Slide 9. Cursor highlights `isVerified()` and `isFrozen()` code lines.

**SPEAKER:**
> "Innovation three. Every single payout in CoverFi runs an ERC-3643 compliance check before one dollar moves — *isVerified* and *isFrozen* on the identity registry. If the recipient fails, funds are routed to a compliance escrow, not lost, not blocked. We are the first insurance protocol in DeFi designed to be regulator-compatible from the contract layer up. That is what makes this institutional-grade."

---

### [3:15 – 3:40] · SLIDES 10–12 — Architecture, Lifecycle, SubrogationNFT

**SCREEN / MOUSE:** Advance to Slide 10. Pause 3 seconds. Advance to Slide 11. Pause 3 seconds. Advance to Slide 12.

**SPEAKER:**
> "Twelve smart contracts across eight architectural layers. A two-of-three multisig of bonded Custodian, Legal-Representative, and Auditor attestors confirms every default — across four precisely defined event types. And after payout, the protocol mints a SubrogationNFT to the CoverFi Foundation — the legal right to pursue recovery against the defaulted issuer in the real world. That single primitive is the bridge between on-chain insurance and off-chain legal reality. Nobody else has built it."

---

### [3:40 – 4:00] · SLIDES 13–16 — Tech Stack · HashKey · Roadmap · Close

**SCREEN / MOUSE:** Quick advance through Slides 13, 14, 15, landing on Slide 16. ~5 seconds per slide.

**SPEAKER:**
> "Twelve contracts. Four hundred sixteen tests passing. Sixteen contracts deployed live on HashKey Chain Testnet — chain ID one-three-three. Built on HashKey because it's the only chain combining EVM compatibility, low gas, and a regulated-finance posture that matches institutional RWA. Now — let me show you it actually works."

---

## SECTION 2 — APP SHOWCASE (4:00 → 7:00)

---

### PART A — pitch.html · The Investor Layer (4:00 → 5:30)

---

### [4:00 – 4:10] · Transition

**SCREEN / MOUSE:** Close PPT. Switch tab to **pitch.html** (pre-loaded). Land on the Overview page.

**SPEAKER:**
> "This is CoverFi as an investor sees it. Everything I'm about to show you is interactive — and it's the part that doesn't fit on a slide."

---

### [4:10 – 4:35] · Waterfall Algorithm

**SCREEN / MOUSE:** Click sidebar → **"Waterfall"**. Cursor traces the cascade top-to-bottom: Issuer Bond → Junior Tranche → Senior Tranche.

**SPEAKER:**
> "When a default happens, claims cascade through three layers — strictly in order. The issuer's five percent bond gets liquidated first. Then the Junior tranche absorbs the next loss — they get higher yield, twenty to twenty-eight percent APR, because they sit closer to risk. Senior LPs are last to be touched, and first to be made whole. This is the same waterfall structure used by Centrifuge, by traditional structured credit — applied to insurance for the first time."

---

### [4:35 – 5:00] · Money Flow

**SCREEN / MOUSE:** Click sidebar → **"Money Flow"**. Cursor circles each of the 5 actors clockwise: Issuer · Investor · Senior LP · Junior LP · Foundation.

**SPEAKER:**
> "Five actors. Premiums flow up from the investor. Bond capital and LP liquidity flow in from the sides. Yield flows out continuously. And on default, payout flows down through the waterfall. Every arrow on this diagram is a real on-chain function call — not a slide animation."

---

### [5:00 – 5:30] · ROI Calculator (the closer for investors)

**SCREEN / MOUSE:** Click sidebar → **"ROI Calculator"**. Cursor lands on the **5% TAM** preset (already active). Pause on big "Annual Protocol Revenue" number.

**SPEAKER:**
> "And here is why this scales. At just five percent market penetration of a twenty-six-point-six billion dollar TAM — the protocol generates four-point-six million dollars in annual revenue. *(Operator clicks "10% TAM" preset.)* At ten percent — over nine million. *(Operator clicks "1% TAM".)* Even at one percent — nearly a million dollars a year. The market is not the question. The protocol is."

---

### PART B — Live Product Demo (5:30 → 7:00)

---

### [5:30 – 5:40] · Open the live app

**SCREEN / MOUSE:** Switch to dashboard.html tab (pre-loaded, wallet already connected to HashKey Chain 133).

**SPEAKER:**
> "Now the live protocol. HashKey Chain Testnet. Wallet connected. Every number you see was read from a contract three seconds ago."

---

### [5:40 – 6:00] · Show the IRS Score live

**SCREEN / MOUSE:** Click nav → **"Stats"**. Cursor hovers the IRS radar chart, then the Premium Curve dot at IRS 600.

**SPEAKER:**
> "Live issuer credit score — six hundred. Live premium — six point nine six percent APR. Computed on-chain by an exponential function written in ABDKMath fixed-point arithmetic. There is no other protocol doing this."

---

### [6:00 – 6:35] · The Money Shot — Buy Coverage

**SCREEN / MOUSE:** Click nav → **"Coverage"** → **"Get Coverage"** button. Modal opens.
Operator: select issuer from dropdown → type **100** in the Coverage Amount field.

**SPEAKER:**
> "An investor wants to insure a hundred dollars of this RWA token against issuer default. Premium updates instantly — six point nine six percent."

**SCREEN / MOUSE:** Click **"Purchase Coverage"** → MetaMask popup → **Approve USDT** → **Confirm** → **Purchase** → **Confirm**. *(Hold silently 3–4 seconds while TX propagates.)*

**SPEAKER:** *(after 2 seconds of silence)*
> "Three things just executed atomically. USDT approval. A compliance check against the identity registry. And the mint of a soulbound Protection Certificate — ERC-5192 — bound to this wallet, forever non-transferable."

**SCREEN / MOUSE:** Green toast appears. Click the TX hash → HashKey explorer opens in new tab.

**SPEAKER:**
> "Live on HashKey Chain. Verifiable right now."

---

### [6:35 – 6:55] · The Jaw-Dropper — Default & SubrogationNFT

**SCREEN / MOUSE:** Close explorer tab. Click nav → **"Subrogation"**. SubrogationNFT #1 visible on screen.
Cursor walks down the metadata fields: `defaultType` → `totalPayoutAmount` → `bondLiquidated` → `juniorLiquidated`.

**SPEAKER:**
> "And here is what nobody else has built. In our test scenario, the issuer defaulted. Two of three bonded attestors confirmed it. The PayoutEngine ran the compliance check, released USDT to the investor, burned the certificate, and minted this NFT — the legal right to pursue recovery, held by the CoverFi Foundation. One transaction. Four atomic events. The bridge between on-chain insurance and off-chain legal reality."

---

### [6:55 – 7:00] · The Close

**SCREEN / MOUSE:** Switch back to pitch.html → click sidebar → **"The Close"** page.

**SPEAKER:** *(slow, eye contact, no taper)*
> "Other teams built applications. We built infrastructure. CoverFi is the missing primitive that lets institutional capital flow into on-chain RWA — with confidence, with compliance, and with recourse. Thank you."

**SCREEN / MOUSE:** Cursor still. Hold for Q&A.

---

### [7:00] END.

---

## ⏱ TIMING AUDIT

| Section | Duration | Cumulative |
|---|---|---|
| PPT Pitch (Slides 1–16) | 4:00 | 4:00 |
| pitch.html — Waterfall · Money Flow · ROI | 1:30 | 5:30 |
| Live Demo — IRS · Coverage Buy · Subrogation | 1:25 | 6:55 |
| Close | 0:05 | **7:00** |

---

## 🚨 BACKUP LINES (live failure recovery)

| If this happens | Speaker says | Operator does |
|---|---|---|
| Dashboard slow to load | "Real RPC latency — we're reading contracts, not a cache." | Stay on page. Do not refresh. |
| MetaMask won't connect | "Network hiccup — let me show you the confirmed version." | Switch to HashKey explorer tab with prior TX. |
| Coverage TX hangs > 8s | "I have the confirmed version — let me show you that one." | Paste fallback hash `0xca3ac579…` in explorer. |
| Subrogation page blank | "Raw event logs instead." | Open explorer logs for payout TX. |
| pitch.html doesn't load | "Let me walk you through it verbally." | Stay on dashboard. Speaker recites Waterfall + ROI verbally. |

---

## 🎤 DELIVERY RULES

1. **Speak to the back row.** Volume up 20%. Pace down 10%.
2. **Trust the holds.** The 2-second silences are emphasis, not failure.
3. **Never apologize on stage.** Narrate around problems.
4. **Eye contact, not screen contact.** The app is the prop. You are the product.
5. **End on a full stop.** Say "thank you." Hold 2 seconds. Do not taper.
