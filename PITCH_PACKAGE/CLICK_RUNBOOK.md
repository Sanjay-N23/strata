# CLICK_RUNBOOK.md — Person B Only

This is the operator's guide. You drive. You do not speak. Your job is to make the screen match **D's and P's** voices perfectly — no searching, no hesitation, no surprises.

**The voices alternate** — Voice D handles problem + IRS + money shot + ROI calculator; Voice P handles introduction + subrogation + business model + SWOT + close. You react to whoever spoke last. The trigger table below lists every phrase that cues a click.

**Print this. Tape it to the laptop bezel. Refer to it during the pitch.**

---

## Pre-Stage Setup (do this 15 minutes before your slot)

### 1. Browser state
- Chrome. One window. Dark theme globally.
- Zoom: **110%** on every tab.
- Clear cache (`Ctrl+Shift+Delete` → "Cached images and files" → Clear).

### 2. Tab order (exact — left to right)

| # | URL | Purpose |
|---|---|---|
| T1 | `https://coverfi-protocol.vercel.app/` | Landing — cold open |
| T2 | `https://coverfi-protocol.vercel.app/dashboard.html` | Main app — connect wallet, get coverage |
| T3 | `https://coverfi-protocol.vercel.app/stats.html` | IRS + premium curve |
| T4 | `https://coverfi-protocol.vercel.app/pool.html` | Senior/junior tranches + waterfall |
| T5 | `https://coverfi-protocol.vercel.app/coverage.html` | User's ProtectionCert NFT |
| T6 | `https://coverfi-protocol.vercel.app/subrogation.html` | SubrogationNFT #1 (the emotional beat) |
| T7 | `https://testnet-explorer.hsk.xyz/tx/0xe938fa9a13d7d9583475f923478e0d0dc4b34642c34658f668534d9c46426d22` | Payout TX logs (for the reveal) |
| T8 | `https://coverfi-protocol.vercel.app/pitch.html` | **pitch deck** — Business Model · ROI Calculator · SWOT (Act 4) |

**Pre-load each tab at setup time so RPC reads are warm.** If a tab shows "Loading…" past 5 seconds, refresh it once now, not on stage.

### 3. MetaMask state
- Extension pinned in toolbar.
- Connected to **HashKey Chain Testnet (Chain ID 133)**.
- Demo wallet selected: `0xce220d9eD9527f9997c8045844210637F3A42fb3`.
- Balance confirmed: **at least 0.5 HSK** for gas.
- Auto-lock timer extended (Settings → Security & privacy → 30 min).

### 4. Browser window sizing
- Full screen (F11) is fine. OR maximized with a clean menu bar. Pick one and stay.
- If you use F11, disable screen-saver and auto-sleep now.

### 5. Sticky note on the laptop bezel (write these 3 hashes)

```
Coverage purchase fallback:
  0xca3ac579eeffd138e02849203f76f95ec958552cfd117aad65d1ac48a9a1727e

Payout execution:
  0xe938fa9a13d7d9583475f923478e0d0dc4b34642c34658f668534d9c46426d22

Default confirmation:
  0xe8ec0a2966278590661ea248d270748f6f06be43260bf9b4ec1a42a2753dd86e
```

---

## On-Stage Click Sequence

Follow this exactly. Every row has an **expected cursor state** and a **trigger** — the moment Person A says a specific phrase that tells you to move.

### ACT 1 — Problem (0:00 → 0:50)

| Trigger (A says…) | You do… | Target |
|---|---|---|
| (Silence. Script begins.) | Stand still. T1 (landing) visible. Cursor parked in the center. | — |
| "…sitting on public blockchains right now." | Slow scroll down one viewport. | Scroll wheel, not arrow keys. |
| "…no circuit breaker. No insurance. Nothing." | Stop scrolling. Cursor still. | — |
| "…literally cannot pay out…" | Slow scroll back to top. | Hero visible again. |

### ACT 2 — Introduction (0:50 → 1:40)

| Trigger | You do… | Target |
|---|---|---|
| "…Live today on HashKey Chain." | Click **Launch App** in hero. | Opens T2 (dashboard) in same tab. |
| Dashboard begins loading. | Wait. Do nothing. Cursor on the "Connect Wallet" button. | — |
| "I'll prove all three in ninety seconds." | Click **Connect Wallet**. | MetaMask pops. |
| MetaMask pops. | Click **Next → Connect** in MetaMask. | Confirm Chain 133 in the header. |
| "…skin in the game…" | Hover cursor over the "Issuer Registry" card. | — |
| "…a well-behaved issuer pays four percent…" | Move cursor to the IRS score card. Hover. | — |
| "…pays sixteen…" | Move cursor to the pool-TVL number. Hover. | — |
| "…before one dollar moves." | Cursor rests. No motion. | — |

### ACT 3 — Demo (1:40 → 5:30)

**STOP 1 — Stats page (2:00 → 2:30)**

| Trigger | You do… | Target |
|---|---|---|
| "Everything you're about to see is live." | Stay on T2. Cursor on the TVL readout. | — |
| "This is a live issuer credit score." | Switch to T3 (stats). **Ctrl+Tab → T3** or click Stats in the nav. | — |
| "Five dimensions: NAV punctuality…" | Cursor on the IRS radar chart center. Hover the 5 axis labels as A names them. | — |
| "Premium: six-point-nine-six percent APR." | Move cursor to the premium curve chart. Hover the Demo Issuer dot. | — |
| "…early-warning alert — by design, hours before…" | Cursor still. | — |

**STOP 2 — Pool page (2:30 → 3:10)**

| Trigger | You do… | Target |
|---|---|---|
| "The insurance pool has two tranches." | Switch to T4 (pool). | — |
| "Senior — srCVR — seventy percent…" | Cursor on the Senior tranche card. | — |
| "Junior — jrCVR — thirty percent…" | Cursor slides to the Junior card. | — |
| "Three layers of protection before…" | Cursor on the waterfall diagram — **top layer** (bond). | — |
| "…the issuer's five-percent bond." | Cursor on middle layer (junior). | — |
| "Then junior." | — | — |
| "Then senior." | Cursor on bottom layer (senior). | — |
| "Ten dollars in the pool. Testnet." | Cursor on the TVL total readout. Rest. | — |

**STOP 3 — Buy Coverage (3:10 → 4:20) — THE MONEY SHOT**

| Trigger | You do… | Target |
|---|---|---|
| "A user wants to insure a hundred dollars…" | Switch to T2 (dashboard). Click **Get Coverage**. | Modal opens. |
| (Modal open) | Select issuer from dropdown (the registered demo issuer is first). Type `100` in coverage amount. | — |
| "The premium updates instantly…" | Cursor on the premium calculation field. | — |
| "Let's confirm." | Click **Purchase Coverage**. | MetaMask pops (USDT approval). |
| MetaMask #1 | Click **Confirm** in MetaMask. | Wait for approval TX. |
| MetaMask #2 pops (purchase) | Click **Confirm**. | Wait ~3-5 sec. |
| Green toast appears | Click the **Coverage** nav link. | T5 (coverage.html) loads. |
| "There it is. On-chain. Verifiable." | Cursor on the ProtectionCert NFT card. | — |
| "And that's the transaction…" | Click the TX hash link on the NFT card. | Opens HashKey explorer in new tab. |

> **If MetaMask #1 or #2 doesn't pop within 3 seconds:** click the MetaMask extension icon in the toolbar to manually bring it forward. Do not re-click the Purchase button.

> **If the TX fails or the UI shows an error for > 8 seconds:** close the error toast, switch to T7 (pre-loaded explorer tab). A will cover with "I've got the confirmed version — let me show you that one." Paste the fallback hash if T7 isn't already on the right TX.

**STOP 4 — Default + SubrogationNFT (4:20 → 5:30) — THE JAW-DROPPER**

| Trigger | You do… | Target |
|---|---|---|
| "Now imagine the issuer defaults…" | Close the explorer tab you just opened (**Ctrl+W**). Switch to T6 (subrogation). | — |
| (Page loaded, NFT #1 visible) | Cursor on the SubrogationNFT #1 card. | — |
| "…two-of-three threshold met…" | Still on the card. No motion. | — |
| "…`isVerified`, `isFrozen`…" | Slowly point cursor at each claim-data field as A names it: `totalPayoutAmount` → `bondLiquidated` → `juniorLiquidated`. | — |
| "…the legal right to pursue recovery…" | Rest cursor on the `subrogationHolder` field (= CoverFi Foundation). | — |
| "This is the bridge between on-chain insurance…" | Still. Rest. | — |
| "One transaction. Four events…" | Switch to T7 (pre-loaded payout TX on explorer). | — |
| (Explorer showing) | Scroll to the **Logs** tab if not already there. | — |
| "Bond liquidated." | Cursor trace to event #1 in logs. | `BondLiquidated` |
| "Pool liquidated." | Event #2. | `PoolLiquidated` |
| "Subrogation claimed." | Event #3. | `SubrogationClaimed` |
| "Issuer defaulted." | Event #4. | `IssuerDefaulted` |
| "…atomic…" | Cursor rests on the TX status: "Success". | — |

### ACT 4 — The Moat (5:30 → 6:30)

| Trigger | You do… | Target |
|---|---|---|
| "Let me be precise about what we built." | Switch back to T2 (dashboard). Cursor still. | — |
| "Twelve smart contracts. Four-hundred-sixteen…" | Still. Do not look at the screen. Face Person A's direction. | — |
| "We did three things no one else has done." | Still. | — |
| "One…" / "Two…" / "Three…" | No motion needed. Let the voice carry. | — |

### ACT 5 — The Close (6:30 → 7:00)

| Trigger | You do… | Target |
|---|---|---|
| "Ninety-three teams submitted…" | Still. | — |
| "We built infrastructure." | Still. | — |
| "Thank you." | Cursor still. Wait 2 seconds. Then discreet hands-to-side posture. | — |

---

## Things you never do

| Don't | Why |
|---|---|
| Don't click "Register Issuer" or any writing flow not in the script | Unscripted TX = risk |
| Don't switch MetaMask networks mid-demo | 50/50 chance the UI loses state |
| Don't refresh the page to "fix" a slow load | You lose the connected-wallet state; unrecoverable |
| Don't speak | You are the hands, not the voice |
| Don't flick the cursor around | Every movement is a cue to the judges; keep motion purposeful |
| Don't open DevTools | Ever |
| Don't check email / Slack / phone | Laptop is locked to demo function |

---

## Recovery playbook

| Symptom | Recovery |
|---|---|
| Page stuck on "Loading…" > 5 sec | Do nothing. Person A's next sentence covers the delay. Do NOT refresh. |
| MetaMask frozen | Click the extension icon in the toolbar to force it forward. |
| Wrong network warning banner | Click the banner → MetaMask → switch to HashKey 133. Should take 2 sec. |
| TX reverts | Switch to T7. Paste fallback hash. A covers: "Confirmed version here." |
| Entire app throws a JS error (console red) | Switch to any pre-loaded read-only tab (T3/T4/T6). A pivots to the moat segment early. |
| Chrome crashes | Re-launch. Chrome restores tabs. Budget 10 sec of silence while A ad-libs. Start from wherever you were. |
| Wi-Fi dies completely | All read-only pages already loaded their data. Continue the read-only narrative (Stops 1, 2, 4). Skip the live purchase in Stop 3 — use fallback TX only. |

---

## The two keyboard shortcuts that matter

- **`Ctrl+Tab`** — cycle tabs forward (T1 → T2 → T3 → …)
- **`Ctrl+Shift+Tab`** — cycle tabs backward

Practice these until they're reflexive. You should be able to hit the right tab without looking.

---

## Final reminder

**You are invisible. Your job is to make the software behave so smoothly that nobody in the room notices the clicks. The moment someone's eye follows your cursor is a moment they stopped listening to Person A.**

Make the clicks disappear.
