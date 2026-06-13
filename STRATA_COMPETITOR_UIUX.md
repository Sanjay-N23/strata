# Strata — Competitor UI/UX Notes (Fordefi · Site24x7 · de.fi)
*User-supplied references "closely related to us." Captured from live page fetches (structure, sections, asset inventory). Colors/spacing are inferred from assets + product category — share screenshots for pixel-level matching.*

---

## 1. Fordefi — `fordefi.com/solutions/tokenization`
**What it is:** institutional MPC-wallet platform to *launch & govern tokenized RWAs* — "policy-gated controls, native AML screening, developer-grade automation." This is the closest match to Strata's **Governance / Autonomy** surface.

**Page IA (section flow):** Hero → "Everything Tokenization Teams Need" → **Launch & Manage Tokens Across Chains** (Equities/ETFs · Stablecoins · Private Credit/Funds/Bonds) → **Run RWA Operations at Scale** → **Tokenization Platform** (security) → Customer Stories → CTA.

**Signature UX patterns (the gold here):**
- **Policy-as-thresholds engine** — "Define limits by address, asset, method, and size so routine calls clear automatically while exceptions route to a **three-party quorum** of issuer, manager, and oversight." → This *is* Strata's autonomy boundary, expressed as a rules table.
- **Remove approval bottlenecks** — "Tag low-materiality actions to auto-execute **after simulation**; send high-value transfers to a human quorum." → severity-tiered execution.
- **Pre-sign simulation** — simulate the outcome of every mint/burn/transfer/role-change *before* it's signed.
- **Single exportable audit trail** (AML/KYC + every action). → the immutable timeline.
- **Method-level verification** — rules by contract method, asset, amount, counterparty.
- Asset taxonomy mirrors Strata issuers: Equities/ETFs, Stablecoins, **Private Credit/Funds/Bonds**.

**Visual language:** institutional, restrained; light marketing surface with **dark product-console screenshots** (`manage-*`, `operation-*`, `platform-*` PNGs), blue/black, SOC2/AICPA trust badge, `simulation.svg` motif. Logos shipped in dark+light variants (theme-aware product).

**→ Transferable to Strata:** This is the blueprint for the **deferred Governance page** — a policy/rules table (auto-clear vs route-to-quorum by address/asset/method/size), a **pending-approvals queue** routed to 2-of-3, a **pre-execution simulation** preview, and an exportable audit trail.

---

## 2. Site24x7 — `site24x7.com/cloud-monitoring.html`
**What it is:** enterprise unified cloud-monitoring/observability console (Zoho/ManageEngine). The closest match to Strata's **Overview / monitoring** surface.

**Page IA:** Hero "Unified Cloud Monitoring" → **Eliminate blind spots / full-stack** → **Unified Observability** (Auto Resource Discovery · Seamless Setup · Real-Time Insights) → **Full-Stack Visibility** (Metrics · Logs · Traces · Synthetics — 4 fixed pillars) → **AI-Driven Insights for SRE** → **Cost optimization** → success story → FAQ.

**Signature UX patterns:**
- **Single source of truth** — "one window," auto-discovery of the whole estate, eliminate blind spots.
- **4 consistent observability pillars**: Metrics / Logs / Traces / Synthetics — one vocabulary applied everywhere.
- **AI insights bucket** (this maps cleanly to Strata's AI underwriter): **Anomaly Detection** (spikes/dips + root cause) · **Automated Remediation** (auto-healing, lower MTTR) · **Capacity Planning** (forecast) · **SLO Management** (define & monitor objectives).
- **Best-practice recommendations grouped by priority — high / moderate / low** — an actionable, bucketed recommendations panel.
- Inventory + resource-level dashboards, visual KPIs, custom dashboards; per-service product icons.

**Visual language:** enterprise SaaS, light theme, dense, status-color KPI tiles, per-cloud dashboard screenshots (aws/azure/gcp/oci), heavy icon system.

**→ Transferable to Strata:**
- Reframe the AI underwriter explicitly as **Anomaly Detection → Automated Remediation** (early-warning → autonomous reprice) with **Capacity Planning** (pool runway) and **coverage SLOs**.
- Add a **Recommendations panel grouped High / Moderate / Low** (Strata's reco-first hero → a prioritized worklist).
- "Single source of truth / no blind spots" is the right tagline for Overview.

---

## 3. de.fi — `de.fi`
**What it is:** "Web3 AI SuperApp" — DeFi portfolio tracker **+ crypto security (antivirus)**. Closest match to Strata's **crypto-dashboard + risk** surface.

**Sidebar IA (icon-led, grouped by job):** Home · Address Book · Crypto Market · DeFi Token · Quest | **Safe:** Scanner · Shield | **Transaction Tools:** Send · Swap | **Investment:** Accelerator · Explore Yields · REKT Database · Audits. Footer regroups as **Monitor / Security / Invest / Events / Tools**.

**Signature UX patterns:**
- **Headline scale-stats band**: `$14B TVL · 20K+ contracts · 97 protocols · 14 networks · 983K+ tokens · 3M+ users` — big trust numbers up front.
- **Asset → detailed report drill-down**: "Click on the asset to get a detailed report — price, profit/loss, DeFi summary, transactions history." → validates Strata's leaderboard→issuer-profile drill-down.
- **Risk "antivirus" framing**: Shield (live wallet analysis, **20+ threat detectors**, red-flag approvals), Scanner (rapid contract audit → **exportable audit PDF**), with stats (90k+ scanned, 150k+ critical found).
- **REKT Database** — a browsable registry of past exploits with a **funds-lost tracker** and per-incident vulnerability reports.
- **Audit Database** — searchable archive, API-accessible.
- **Wallet-first** — "Connect Wallet" is the top-left primary action.

**Visual language:** dark crypto theme, icon-led left sidebar, dense, red risk flags, promo banners.

**→ Transferable to Strata:**
- **Group the sidebar by job** (Monitor / Underwrite / Capital / Govern) with section headers — de.fi's Monitor/Security/Invest grouping.
- Add a **scale-stats band** on Overview (issuers · bonded · pool TVL · networks · defaults-flagged).
- **"Scan → flags → exportable report"** for an issuer: turn the issuer profile into a credit "scan" that emits red/amber flags + a downloadable PDF credit memo.
- **Incident/Default registry** (Strata's "REKT Database" equivalent) — a browsable table of past shortfall/default events (the SVB replay is entry #1) with funds-at-risk and the AI-vs-rulebook lead-time per event.

---

## Cross-cutting takeaways (prioritized for Strata)
1. **Governance page = Fordefi policy engine** (rules table → auto-clear vs 2-of-3 quorum → **simulation preview** → audit trail). Highest-value next surface.
2. **Recommendations grouped High/Med/Low** (Site24x7) — upgrade the reco hero into a prioritized worklist.
3. **Issuer profile = "scan → flags → exportable PDF report"** (de.fi) — add red/amber flag chips + report export to the profile we just built.
4. **Default/Incident registry** (de.fi REKT) — a new browsable surface; the Turing/SVB proof becomes incident #1.
5. **Scale-stats band + SLOs** (de.fi + Site24x7) — trust numbers on Overview; coverage SLO framing.
6. **Pre-action simulation** (Fordefi) — simulate a reprice/default-proposal outcome before it executes.

*Note: Strata already ships the patterns these validate — single source of truth, entity drill-down, provenance, autonomy boundary, Live/Replay. The new ideas above are the policy-engine, prioritized recommendations, simulation, exportable reports, and an incident registry.*
