# Strata — Information Architecture & UI/UX Blueprint
*Synthesized from teardowns of 25 industry-leading apps across 5 categories. Use this to pick references and direct the redesign.*

Strata's identity: **an autonomous AI credit-underwriting & risk-monitoring terminal for on-chain RWA.** It is simultaneously a credit-risk terminal, a DeFi risk dashboard, a crypto analytics terminal, an RWA lending platform, and an AI-agent governance console. This blueprint takes the strongest pattern from each.

---

## 1. The 10 cross-category patterns that should define Strata

| # | Pattern | Stolen from | Applied to Strata |
|---|---|---|---|
| 1 | **Recommendations-first layout** — lead with the AI's suggested action, evidence below | Gauntlet ("Top Recommendations") | Console hero = "AI Underwriter says: reprice issuer X to 1180bps" before charts |
| 2 | **AI-vs-baseline, side-by-side, with proposal state** | Chaos Labs Risk/Recommendations tabs (proposed → challenge window → active) | The Turing scoreboard: AI score vs static rulebook, each flag tagged *proposed / confirmed* |
| 3 | **Score + outlook + override-able drivers, never a bare number** | Bloomberg DRSK, FICO reason-codes | IRS score shows the 5 driver dims; tweak an input → re-score live |
| 4 | **Term-structure of default probability (a curve, not a %)** | Bloomberg DRSK (1y/3y/5y PD) | PD curve per issuer across tenors |
| 5 | **Entity-profile page as the hub, fixed tab set** | Arkham Profiler, Moody's issuer page | Issuer page tabs: Overview · PD/Score history · Bond & collateral · Exposure · Events |
| 6 | **One headline score, top-left, large badge + sparkline** | Nansen, Token Terminal | IRS/PD badge with R/A/G band + score-over-time sparkline on every issuer |
| 7 | **Time-series risk replay / "Time Machine"** | Chaos Labs Time Machine | The SVB-depeg replay scrubber — scrub any issuer back in time |
| 8 | **Immutable timeline as both live feed and audit log** | Datadog Incident Timeline | Every AI action + human decision = stamped cell (what/who/when) |
| 9 | **Autonomy boundary = severity taxonomy + approval queue** | Splunk (severity×priority) + LangSmith Annotation Queue | auto-execute / notify / **needs-2of3** / blocked, color-coded; gated actions route to a human queue |
| 10 | **Dense, configurable ranking table as the home surface** | DefiLlama protocols table | Landing = sortable issuer leaderboard (IRS, PD, premium, bond%, Δ), deep-links to profiles |

---

## 2. Proposed Strata IA (sitemap / navigation)

Left sidebar, dark, collapsible. Global search bar + `Cmd/Ctrl+K` quick-nav in header (Arkham/Datadog).

```
Strata
├── ⌂ Overview            → KPI strip + issuer leaderboard + live feed (home)
├── 🧠 AI Underwriter      → the console: Turing scoreboard, recommendations, replay
│     ├── Scoreboard       (AI vs rulebook, lead-time, win record)
│     ├── Replay           (SVB-depeg scrubber / Time Machine)
│     └── Autonomy Boundary(what's auto vs human-gated + approval queue)
├── 🏢 Issuers            → issuer leaderboard → issuer profile (entity hub)
├── 💧 Pools              → pool list → pool detail (senior/junior tranches)
├── 🛡 Protection         → policies / certs / claims book
├── 📊 Benchmark          → on-chain AI-vs-static record + agent reputation
├── 🔔 Alerts             → severity-filtered alert center
└── ⚙ Settings / Identity → ERC-8004 agent identity, guardian/pause
```

Footer of sidebar: agent **status pill** (🟢 Active / 🟡 Pending approval / 🔴 Paused) — always visible (Datadog/Splunk).

---

## 3. Per-screen module breakdown (what to build, mapped to references)

### A. Overview (home) — *ref: DefiLlama + Nansen + Datadog*
- **KPI strip** (top): Total bonded value · Pool TVL (sr/jr) · Active issuers · AI wins · Avg lead-time · Open claims.
- **Issuer leaderboard**: sortable table — Issuer · IRS · PD% · Premium bps · Bond% · 7d Δ · sparkline. Configurable columns; row → issuer profile.
- **Live feed** (right rail): streaming events, newest fades in top, pause-on-hover.

### B. AI Underwriter Console — *ref: Gauntlet + Chaos Labs + Arize*
- **Recommendations panel** (hero): AI's current suggested actions as cards w/ rationale + Accept/Hold.
- **Turing scoreboard**: AI vs static, lead-time (+3 epochs), win/loss record, "✓ passed Turing Test" banner.
- **Replay scrubber**: multi-line time-series (score, PD, sentiment, collateral) with a playhead; ▶ plays the SVB depeg; AI alarm fires visibly N epochs before static.
- **Agent run / decision trace** (Arize/LangSmith): step tree — signal in → PD model → Z.AI memo → action — each step expandable to inputs/outputs.

### C. Issuer Profile (entity hub) — *ref: Arkham + Moody's + Goldfinch*
Fixed tabs: **Overview · PD & Score history · Bond & Collateral · Exposure · Events**.
- Top-left: large **IRS badge** (R/A/G band) + outlook arrow + score sparkline.
- **PD curve** across tenors (DRSK).
- **Driver breakdown**: the 5 IRS dims as bars, override-able for scenario.
- **Credit-quality badges** (Goldfinch): bond %, repayment record, default rate, attestations.

### D. Pools — *ref: Centrifuge + Maple*
- Pool list = named strategy cards (APY, TVL, capacity bar, utilization).
- Pool detail: **senior/junior tranche widget** (stacked bar — jr first-loss/higher yield, sr protected/lower) + per-position book (Maple loan-book module).
- Persistent right-rail deposit/redeem (capacity filled vs remaining).

### E. Protection / Claims — *ref: Ondo proof-of-reserves*
- Policy/cert book (per-policy rows).
- **Attestation panel**: collateral/coverage breakdown + dated 3rd-party attestation (TIR 2-of-3 proof).

### F. Autonomy Boundary + Approval Queue — *ref: Splunk + LangSmith*
- Two-column: 🟢 **Automated** (reversible: reprice, early-warning) vs 🔴 **Human-gated** (default confirmation, 2-of-3).
- **Approval queue**: gated actions as a worklist, each with owner, inline approve/reject, evidence link.

### G. Alerts Center — *ref: Chaos Labs*
- Filterable by severity / type / issuer / date.
- Detail overlay panels that preserve filter context.

---

## 4. Visual language (the design system direction)

**Consensus across all 25 apps:** dark-first, high density, monospace numerics, semantic risk color.

- **Theme:** dark default (Bloomberg/Nansen/Splunk/Datadog idiom). Optional light for reports.
- **Color semantics:** 🟢 green = healthy / auto / score↑ · 🟡 amber = watch / pending-approval · 🔴 red = distress / default-boundary / blocked. Red dotted threshold line on risk charts (Gauntlet HF=1 → Strata PD/score threshold).
- **Typography:** clean sans for chrome, **monospace tabular** for all numbers/addresses; large display numerals for the one headline score.
- **Density:** tight data tables, sortable, configurable columns, definition tooltips on every metric.
- **Charts:** area/line time-series + sparklines; scatter (health vs recency, bubble=exposure); histograms (score buckets); stacked bars (tranches, positions); span bars (agent trace).
- **Signature hero chart (steal from Gauntlet Account Explorer):** scatter — x = IRS/health, y = recency, bubble = exposure, red line at default threshold; synced filterable table below defaulted to surface riskiest issuers.

---

## 5. Best-in-class reference per Strata module (go look at these)

| Strata module | Look at this first | URL |
|---|---|---|
| Home leaderboard | DefiLlama protocols table | defillama.com |
| AI recommendations | Gauntlet dashboards | dashboards.gauntlet.xyz |
| AI-vs-baseline + proposal state | Chaos Labs Risk Portal | chaoslabs.xyz |
| Hero risk scatter | Gauntlet Account Explorer | gauntlet.xyz/resources/account-explorer-is-live |
| Time-series replay | Chaos Labs "Time Machine" | community.chaoslabs.xyz |
| Issuer profile / entity hub | Arkham Profiler | arkhamintelligence.com |
| Score + drivers + PD curve | Bloomberg DRSK (function guides/screenshots) | search "Bloomberg DRSK" |
| Credit badges / manager profile | Goldfinch Prime | goldfinch.finance |
| Senior/junior tranches | Centrifuge (DROP/TIN) | centrifuge.io |
| Pool detail + loan book | Maple Finance | app.maple.finance |
| Proof-of-reserves / attestation | Ondo Finance Trust & Transparency | ondo.finance |
| Agent run / decision trace | LangSmith / Arize | docs.langchain.com/langsmith · arize.com |
| Timeline audit + severity | Datadog Incident + Splunk Incident Review | datadoghq.com · splunk.com |
| Live tail feed | Grafana Explore | grafana.com |

---

## 6. How to direct me next
Pick one of:
1. **Name a primary reference** ("make the console feel like Gauntlet + Arkham") → I build to that.
2. **Send a Dribbble/screenshot** of a look you like → I match it.
3. Say **"use this blueprint as-is"** → I'll implement the IA in §2–4 directly.

I'll then redesign page-by-page, verifying each in the live preview.

---

# v2 — Architect's Revision (senior-design critique)

> §1–5 above is a strong *reference catalogue*. Built literally it produces a beautiful but confusing dashboard ("looks like a dashboard, not an app"). This revision adds the missing connective tissue: persona, provenance, state, and auth.

## R1. Rating
- As research / inspiration: **8.5/10**
- As a build-ready architecture: **5/10** (parts catalogue, not a building)
- Net for the shipped app: **~6/10 as-is → 9/10 with this revision**

## R2. The 8 flaws
1. **No persona** — fuses DefiLlama+Gauntlet+Maple, which serve *different* users; flat 8-item nav serves all of them badly. (Root cause of "not an app".)
2. **Hero moment buried** — the SVB Turing proof (the whole pitch) sits 2 clicks deep.
3. **No data-provenance model** — on-chain vs AI-computed vs replay data are visually indistinguishable (trust killer in a risk app).
4. **No global Live⇄Replay state** — replay numbers can read as live positions.
5. **No read/write + wallet/network model** — browse vs act not separated; no connect-wallet, wrong-network (must=5003), or pending-tx UX.
6. **8 nav items, overlapping** — Overview≈Issuers leaderboard; Benchmark≈Scoreboard; Alerts is cross-cutting, not a peer.
7. **No empty/loading/error/stale states** — every surface is RPC-dependent; unspecified failure = feels broken.
8. **Score-consistency hazard** — one IRS value feeds many pages; read per-page → numbers drift and disagree.

## R3. Reshaped architecture
- **a) Persona modes (one shell):** **Desk** (operator/analyst — console, issuers, governance) · **Capital** (LP — pools, tranches, deposit) · **Judge/Demo** (front-door that auto-runs the Turing proof, then drops into Desk).
- **b) Nav collapsed to 5:** `Overview · Underwriter · Issuers · Capital · Governance`. Alerts → global bell. Settings/Identity → avatar menu. Benchmark folds into Underwriter.
- **c) 3-layer provenance badges everywhere:** ⛓ on-chain · 🧠 AI · ⏪ replay.
- **d) Global Live⇄Replay state machine** that visibly tints every surface in replay.
- **e) Auth layer:** read-only by default; writes (deposit, 2-of-3 confirm, pause) gated by connect-wallet + network-guard (5003) + pending-tx states.
- **f) Single IRS store:** read once, fan out — never per-page.
- **g) Spec 4 states** (loading / empty / error / stale) for every data surface.

## R4. Flow paths (the 4 journeys)
1. **Judge:** Demo door → ▶ replay auto-plays → AI alarms epoch 3 → scoreboard → "verify on-chain" → Explorer.
2. **Risk analyst:** Overview leaderboard → red issuer → Issuer profile (PD curve + driver bars) → AI recommendation → route to approval.
3. **Depositor:** Capital → pool detail → pick senior/junior tranche → connect wallet → deposit → position.
4. **Attestor/Guardian:** Alert → gated action → approval queue → connect wallet → sign 2-of-3.

## R5. Data flow & interdependencies
- **Sources:** Mantle Sepolia (19 contracts, read) · AI agent off-chain (writes `submitScore()` back to chain) · replay JSON (drives mode).
- **App layer:** `strata-config.js` → ethers adapter → IRS store + Live/Replay switch → surfaces; wallet guard fronts all writes.
- **3 dependencies that will bite UX:**
  1. **`strata-config.js` + RPC = single points of failure** → health-check on load, skeletons, last-known cache.
  2. **IRS score fan-out** (Overview, Issuer, Pool-pricing, Governance) → one store or numbers disagree.
  3. **Replay is global state** → must tint every surface or demo data reads as live money.

*(See the data-flow / dependency diagram generated alongside this revision.)*
