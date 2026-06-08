# FINAL_PITCH_SCRIPT.md

**Event:** HashKey Chain Horizon Hackathon — Final Demo Day
**Venue:** AWS Office, Hong Kong
**Date:** April 22, 2026
**Duration:** 7 minutes (primary) · 5 minutes (emergency) · 3 minutes (ultra-compressed)
**Format:** Three-person demo

---

## Role assignments

| Role | Who | What they do | Speaks? |
|---|---|---|---|
| **D** | Voice #1 — the **technical anchor** | Problem framing · IRS score · money shot reveal · ROI calculator driver · moat proof points | ✅ Yes |
| **P** | Voice #2 — the **commercial narrator** | Category introduction · pool architecture · subrogation emotional beat · business model · SWOT · close | ✅ Yes |
| **B** | Hands — the **operator** | Drives the laptop. Every click, scroll, tab switch | ❌ Never |

### Why split the voice

- Two speakers break listener fatigue at minute 4, when a single voice starts to feel monotone.
- D and P have different natural cadences — contrast keeps the room awake.
- Each owns half the runtime, so neither loses their line during stage nerves.
- Visible teamwork signals execution maturity to investor-type judges.

### Physical staging

- **D stands screen-left.** P stands screen-right. B sits at the laptop.
- **D and P never speak over each other.** Each finishes their line before the other starts.
- **Neither D nor P looks at the screen.** Eye contact is with the back row.
- **B never speaks.** Not to correct, not to cover, not to narrate. Only hands.
- **Headphones for everyone** if two laptops are used (prevents echo).

---

## How to read this script

Each block is structured as:

```
[TIMESTAMP] SECTION NAME
────────────────────────
D:  ...D's exact spoken line...
P:  ...P's exact spoken line...
B:  ...exact on-screen action...
```

**Pause markers:** `[beat]` = 1 sec · `[hold]` = 2 sec · `[slow]` = slow next line.
Never skip holds. They are the script.

---

# 🎯 7-MINUTE PRIMARY SCRIPT

## ACT 1 — THE $26.6 BILLION HOLE (0:00 → 0:50)

### [0:00] Cold open. No greeting.

```
B:  Landing page (index.html) on screen. Cursor parked.
D:  "Twenty-six point six billion dollars."
    [hold 2]
```

```
P:  "That's the amount of tokenized real-world assets sitting on
    public blockchains right now. Treasury bills. Private credit.
    Real estate. All tokenized as ERC-3643 security tokens."
B:  Slow scroll down one viewport.
```

```
D:  "If any one of those issuers defaults tomorrow, every single
    holder loses everything. No automated protection. No circuit
    breaker. No insurance. Nothing."
B:  Cursor still.
    [hold 2 after "Nothing"]
```

### [0:30] The knife twist

```
P:  "Nexus Mutual. Risk Harbor. Neptune. They insure smart contract
    bugs. But their payout contracts don't check compliance. They
    literally cannot pay out to a regulated security token."
B:  Scroll back to top.
```

```
D:  "Twenty-six billion dollars. Zero credit-default protection.
    That is the hole we filled."
    [hold 2]
```

---

## ACT 2 — INTRODUCING COVERFI (0:50 → 1:40)

### [0:50]

```
P:  "CoverFi is the first on-chain Credit Default Swap equivalent
    for ERC-3643 tokens. Live today on HashKey Chain."
B:  Click Launch App → dashboard.html loads.
```

### [1:05] Three innovations

```
D:  "Three innovations. I'll prove all three in ninety seconds."
B:  Click Connect Wallet → MetaMask pops → Confirm. Chain 133.
```

```
P:  "One. Every issuer posts a five-percent bond in USDT before they
    can be insured. Skin in the game. If they default, their money
    burns before any pool capital moves."
B:  Cursor on Issuer Registry card.
```

```
D:  "Two. An on-chain behavioral credit score — the IRS. Zero to a
    thousand, across five dimensions. Premium is exponential.
    Well-behaved issuer pays four percent; a bad one pays sixteen.
    Continuous credit scoring — the category Moody's occupies
    off-chain — running entirely on-chain."
B:  Hover IRS score card → move to pool-stats card.
```

```
P:  "Three. ERC-3643 compliance-native payouts. Every payout checks
    isVerified and isFrozen before one dollar moves. No competitor
    we've found has built this."
    [beat]
```

---

## ACT 3 — LIVE DEMO (1:40 → 5:00)

### [1:40] Establish that everything is real

```
D:  "Everything you're about to see is live. HashKey Chain Testnet.
    Chain ID one-three-three. Not a simulation. Not a mock. Every
    number on this screen came from a smart contract read in the
    last three seconds."
B:  Dashboard showing live TVL, IRS, pool stats.
Backup (if data laggy): D continues "Real RPC latency — reading
    contracts, not a cache." No apology.
```

---

### [2:00] STOP 1 — The IRS Score

```
B:  Navigate to stats.html.
D:  "This is a live issuer credit score. Five dimensions — NAV
    punctuality, attestation accuracy, repayment history,
    Chainlink-verified collateral health, and protocol activity."
B:  Cursor on IRS radar chart.
```

```
D:  "This issuer is at six-hundred. Premium: six-point-nine-six
    percent APR."
B:  Move cursor to premium curve, hover the Demo Issuer dot.
```

```
P:  "If the score drops fifty points, the system fires an early-
    warning alert — by design, hours before any human could confirm
    a default. That is the structural moat."
    [beat]
```

---

### [2:30] STOP 2 — Buy Coverage · THE MONEY SHOT

```
B:  Navigate to dashboard. Click Get Coverage. Modal opens.
P:  "A user wants to insure a hundred dollars of this RWA token
    against issuer default."
B:  Select issuer from dropdown. Type 100 in coverage amount.
```

```
D:  "The premium updates instantly — six-point-nine-six percent,
    right there. Computed on-chain from an exponential formula
    written in ABDKMath fixed-point."
B:  Cursor on premium field.
```

```
P:  "Let's confirm."
B:  Click Purchase Coverage → USDT approve → Confirm → Purchase →
    Confirm.
    [hold — TX propagates ~3-5 sec. DO NOT fill silence yet.]
```

```
D (after ~2s of silence):
    "Three things are happening right now. USDT approval. A
    compliance check against the identity registry. And the mint of
    a soulbound Protection Certificate — ERC-5192 — non-transferable,
    bound to the wallet forever."
B:  Green toast. Click Coverage nav → coverage.html.
```

```
P:  "There it is. On-chain. Verifiable."
B:  Click the TX hash → HashKey explorer opens in new tab.
D:  "And that's the transaction — live, HashKey Chain, right now."
Backup if TX hangs > 8s:
  D: "I've got the confirmed version — let me show you that one."
  B: paste fallback hash 0xca3ac579...
```

---

### [3:30] STOP 3 — The Default · THE JAW-DROPPER

```
B:  Close explorer tab (Ctrl+W). Navigate to subrogation.html.
    SubrogationNFT #1 visible.
P (voice drops half a tone — [slow]):
    "Now imagine the issuer defaults. In our testnet scenario —
    they did. Thirty days past due."
```

```
P:  "Three bonded professionals — a custodian, a legal representative,
    an auditor — each submitted a default attestation. Two-of-three
    threshold met. The DefaultOracle confirmed the credit event."
```

```
D:  "The PayoutEngine executed. It checked ERC-3643 compliance —
    isVerified, isFrozen — then released fifteen USDT to the
    investor. And it minted this NFT. A SubrogationNFT. To the
    CoverFi Foundation."
B:  Cursor walks claim-data fields: totalPayoutAmount → bondLiquidated
    → juniorLiquidated.
```

```
P:  "That NFT is the legal right to pursue recovery against the
    defaulted issuer."
    [hold 2]
```

```
P:  "This is the bridge between on-chain insurance and off-chain
    legal reality. No one else has built this primitive."
B:  Switch to pre-opened HashKey explorer tab (Payout TX logs).
```

```
D:  "One transaction. Four events. Bond liquidated. Pool liquidated.
    Subrogation claimed. Issuer defaulted. Atomic — all of it
    executes, or none of it does."
B:  Cursor traces the four event names in the logs panel.
    [beat after last event name]
```

---

## ACT 4 — THE INVESTOR CASE (5:00 → 6:30) — pitch.html tour

This replaces the old "moat + stats" recital. We show, not tell.

### [5:00] Transition

```
B:  Close explorer tab. Open pitch.html tab (pre-loaded T8).
P:  "That's the protocol. Now the business."
    [beat — B clicks Business Model in sidebar]
```

---

### [5:05] Business Model

```
B:  pitch.html now on #/business-model.
P:  "CoverFi has one revenue engine that's live today, and three
    more that activate as the protocol scales."
B:  Cursor on the big "5%" hero number.
```

```
D:  "Five percent of every premium routes to the treasury — atomic,
    on-chain, day one of mainnet. No capital raise required to turn
    on revenue. Every policy is a revenue event."
B:  Scroll down to the 4 stream cards. Cursor briefly on each card
    header.
```

```
P:  "Subrogation recovery. IRS scoring as a data product. Attestor
    and governance capture. Four streams. One compounding flywheel."
    [beat]
```

---

### [5:30] ROI Calculator — live interaction

```
B:  Click ROI Calculator in sidebar.
D:  "These are our assumptions — you can move the sliders yourself
    after the demo. Let me show you the model at five percent market
    penetration."
B:  Cursor on the "5% TAM" preset pill (already active). Large
    revenue number visible on the right.
```

```
D:  "Insured TVL: one-point-three-three billion dollars. Gross
    premium volume: ninety-two-and-a-half million annualized. LP
    yield pool: eighty-eight million. Protocol revenue: four-point-
    six million."
B:  Briefly hover the six output cards in order as D names them.
```

```
P:  "And that's at five percent penetration. At ten — over nine
    million a year. At one percent — still nearly a million. The
    market is not the question. The protocol is the only unit that
    works."
B:  Click "10% TAM" preset → revenue number jumps to ~$9.3M. Pause
    1 second. Click "1% TAM" → drops to ~$925K. Pause 1 second.
    Click "5% TAM" to settle.
```

---

### [6:00] SWOT

```
B:  Click SWOT Analysis in sidebar.
P:  "Where we are strong — and where we are honest."
B:  Cursor traces the 4 quadrants in S → W → O → T order.
```

```
D:  "Compliance-native payouts, behavioral credit scoring, and the
    SubrogationNFT — each one alone is defensible. Combined, it's
    the category."
B:  Cursor on Strengths (S).
```

```
P:  "We are pre-audit. That's the weakness we are fixing in Phase
    one. Everything else is timing — the market is unclaimed, the
    standard is aligned, and the chain is positioned."
B:  Cursor moves from W → O.
    [beat]
```

---

## ACT 5 — THE CLOSE (6:30 → 7:00)

### [6:30]

```
B:  Navigate to #/close on pitch.html. The two-line close page
    appears: "This isn't a product. / It's infrastructure."
D:  "Ninety-three teams submitted to this hackathon."
    [beat]
P:  "Ninety-two of them built applications."
    [hold 1]
D:  "We built infrastructure."
    [hold 2]
```

```
P:  "CoverFi is the missing credit-protection primitive that lets
    institutional capital flow into on-chain RWA markets — with
    confidence, with compliance, and with recourse."
```

```
D and P together (matched cadence):
    "Thank you."
    [hold 2] — full stop. Eye contact. Do not taper.
B:  Cursor still. Wait for Q&A.
```

### [7:00] End.

---

# ⏱ TIMING AUDIT

| Act | Duration | Cumulative |
|---|---|---|
| Act 1 — Problem | 0:50 | 0:50 |
| Act 2 — Introduction | 0:50 | 1:40 |
| Act 3 — Live demo (3 stops) | 3:20 | 5:00 |
| Act 4 — Investor case (pitch.html) | 1:30 | 6:30 |
| Act 5 — Close | 0:30 | **7:00** |

**If overrunning at 5:00:** skip the ROI 10%/1% preset clicks in the ROI section — stay on the default 5% frame. Reclaims 20 seconds.

**If 30+ seconds over at 6:00:** skip the SWOT narration; B clicks through the quadrants silently while D/P deliver the closing lines early.

---

# 🔁 DELIVERY RULES (non-negotiable)

1. **Speak to the back row.** Volume up 20%. Pace down 10%.
2. **Hand-offs are silent.** When D finishes, P starts — no "over to P."
3. **Trust the holds.** Silence is the emphasis, not the failure.
4. **Never apologize on stage.** Narrate around problems.
5. **Eye contact, not screen contact.** The app is the prop; D and P are the product.
6. **End on a full stop.** No "so yeah." Say "thank you" and hold two seconds.
7. **B: no talking. Ever.**

---

# 🚨 BACKUP LINES FOR LIVE FAILURES

| If this happens | Who says | What they say | Person B does |
|---|---|---|---|
| Dashboard doesn't load in 5s | D | "Real RPC latency — we're reading contracts, not a cache." | Stay on page. Do not refresh. |
| MetaMask won't connect | P | "Network hiccup — let me show you the confirmed version." | Switch to HashKey explorer tab. |
| Coverage TX stuck | D | "I've got the confirmed version right here." | Paste `0xca3ac579…` in explorer URL. |
| Payout page blank | D | "Raw event logs instead." | Click the Logs tab manually. |
| ROI slider frozen | P | "The calculator is live — feel free to try it yourselves after." | Skip interactive demo. Keep the default 5% TAM reading visible. |
| pitch.html doesn't load | P | "Let me walk you through it verbally." | Stay on dashboard. D and P recite the 3 business points from memory (5% take rate · 4 streams · SWOT one-liner). |
| Browser crashes | D | "One moment — let me reload." | Relaunch Chrome. D ad-libs the moat; P covers the close. |

---

# ⏩ 5-MINUTE EMERGENCY VERSION

Cut: Act 2 compressed to one sentence. Act 4 compressed to Business Model only (no ROI interaction, no SWOT).

| Time | Segment | Who speaks | Screen |
|---|---|---|---|
| 0:00 – 0:50 | Act 1 | D+P alternate | Landing |
| 0:50 – 1:10 | Act 2 compressed | P | Dashboard · wallet connect |
| 1:10 – 1:40 | Stop 1 — IRS | D | stats.html |
| 1:40 – 2:40 | Stop 2 — Money shot | D+P | dashboard → coverage |
| 2:40 – 3:40 | Stop 3 — Subrogation | P | subrogation.html |
| 3:40 – 4:20 | Business Model (pitch.html) | D+P | pitch.html #/business-model |
| 4:20 – 4:40 | ROI + SWOT — compressed, no interactive slider | D+P | pitch.html tour |
| 4:40 – 5:00 | Close | D+P together | pitch.html #/close |

---

# ⚡ 3-MINUTE ULTRA-COMPRESSED VERSION

Use only if bumped to a lightning round.

```
[0:00] D:  "Twenty-six point six billion in tokenized RWA.
            Zero credit-default protection. That's the hole."
       B:  Landing page.

[0:20] P:  "Nexus, Risk Harbor, Neptune — they can't pay out to
            regulated security tokens. Their contracts don't check
            compliance."
       B:  Click Launch App.

[0:40] P:  "CoverFi fills that gap. First on-chain CDS for
            ERC-3643. Live on HashKey Chain today."
       B:  Dashboard. Connect wallet.

[1:00] D:  "Three innovations. Five-percent issuer bond.
            On-chain credit scoring — exponential premium curve.
            Compliance-native payouts that check isVerified and
            isFrozen."
       B:  Stats → premium curve → dashboard.

[1:30] D:  "Money shot. User buys a hundred dollars of coverage.
            Premium computes on-chain. Soulbound Protection
            Certificate mints to the wallet."
       B:  Get Coverage → 100 → Purchase → Confirm.

[1:55] P:  "Other side — test issuer defaulted. Two-of-three
            attestors confirmed. PayoutEngine executed.
            SubrogationNFT to the Foundation — legal right to
            pursue recovery."
       B:  subrogation.html.

[2:20] D:  "Five percent protocol fee on every premium. At five
            percent market penetration — four-point-six million
            annual revenue. Twelve contracts. Four-hundred-sixteen
            tests. All live."
       B:  pitch.html — flash Business Model then ROI.

[2:45] D:  "Ninety-three teams submitted."
       P:  "We built infrastructure."
       B:  pitch.html #/close.

[2:55] D and P together: "Thank you."
[3:00] STOP.
```

---

# 🎤 REHEARSAL CHECKLIST (night before)

- [ ] Read the 7-min script out loud with a stopwatch. **Twice.**
- [ ] Rehearse every D→P and P→D handoff — no gap, no overlap.
- [ ] Rehearse the ROI slider interaction — practice the exact click sequence on pitch.html.
- [ ] B should know every trigger phrase **before** it's spoken.
- [ ] Run the 5-min version once. The 3-min version once.
- [ ] Practice the backup lines out loud — they must sound calm, not rescue-mode.
- [ ] **D and P lock in who's who tonight.** Do not swap roles at the venue.
- [ ] Headphones charged if remote / two-laptop setup.
- [ ] Sleep.
