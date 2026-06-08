# DEMO_PATCH_PLAN.md

**Goal:** Maximize judge perception in the final 24 hours without introducing risk.
**Rule:** No large refactors. No new features. No touching hidden code paths.

---

## Priority legend

- 🔴 **MUST-FIX** — demo blocker or visible-on-stage credibility risk
- 🟡 **SHOULD-FIX** — high-impact polish that sharpens the pitch
- 🟢 **NICE-TO-HAVE** — only if time is genuinely free

---

## 🔴 MUST-FIX — already shipped

All three already pushed to `main` and live on Vercel.

| # | Fix | Commit | Expected judge impact if it had remained |
|---|---|---|---|
| 1 | `dashboard.html` — `depositJunior()` missing `issuerToken` arg | `6ff26cc` | Live LP deposit would revert → "their own app doesn't work" |
| 2 | `stats.html` — premium-curve issuer labels colliding | `2ccc114` | Visual sloppiness on the one chart every judge screenshots |
| 3 | `stats.html` — tranche deposit event rendering address as dollar amount (`$9.58×10⁴⁷`) | `44f735d` | Instant trust collapse on the event feed |

✅ Nothing else in the MUST-FIX column. The demo path is stable.

---

## 🟡 SHOULD-FIX (do these before stage if time permits)

### 1. Fix the chain-ID inconsistency in `FINAL_STATUS.md`

**File:** `D:\COVERFI\FINAL_STATUS.md`
**Line 141:** currently reads `Blockchain | BNB Chain (BSC Testnet, Chain ID 97)` — contracts are actually on HashKey 133.
**Also:** several TX explorer links point to `testnet.bscscan.com` but those TXs exist on HashKey Chain only.

**Why it matters:** Post-pitch, investors and HackQuest / DoraHacks reviewers will open the GitHub repo. An inconsistency between the "deployed to HashKey 133" claim and a BSC 97 line in the tech-stack table = careful-judge red flag. 5-minute fix.

**Impact:** +5 pts credibility with any judge who opens the repo after the demo. 0 risk.

**Command:**
```bash
# In D:\COVERFI\
# Edit FINAL_STATUS.md line 141:  BSC Testnet, Chain ID 97  →  HashKey Chain Testnet, Chain ID 133
# Find/replace all testnet.bscscan.com/tx/ → testnet-explorer.hsk.xyz/tx/
```

### 2. Pre-add HashKey Chain 133 to the demo laptop's MetaMask

**Why it matters:** First-time network-add dialog during live demo = 10 seconds of friction the room will notice.

**Steps for Person B before stage:**
1. Open MetaMask → Settings → Networks → Add Network
2. Name: `HashKey Chain Testnet`
3. RPC URL: `https://testnet.hsk.xyz`
4. Chain ID: `133`
5. Symbol: `HSK`
6. Explorer: `https://testnet-explorer.hsk.xyz`
7. Save. Switch to it. Confirm balance > 0.5 HSK for gas.

**Impact:** Removes 1 fail mode from the live demo. 0 risk.

### 3. Pre-open the 5 browser tabs in exact stage order

**Tabs (left → right):**
1. `coverfi-protocol.vercel.app/` (landing)
2. `coverfi-protocol.vercel.app/dashboard.html`
3. `coverfi-protocol.vercel.app/stats.html`
4. `coverfi-protocol.vercel.app/pool.html`
5. `coverfi-protocol.vercel.app/subrogation.html`
6. `testnet-explorer.hsk.xyz/tx/0xe938fa9a13d7d9583475f923478e0d0dc4b34642c34658f668534d9c46426d22` (the payout TX — for the reveal)

**Browser zoom:** 110% on all tabs. Dark theme enabled globally.

**Impact:** Eliminates "which tab is that" hunting. Person B can jump with `Ctrl+Tab` muscle memory.

### 4. Sticky-note the 3 fallback TX hashes on the laptop bezel

If any live transaction hangs or fails, Person B pastes one of these into the HashKey explorer URL bar:

- **Coverage purchase fallback:** `0xca3ac579eeffd138e02849203f76f95ec958552cfd117aad65d1ac48a9a1727e`
- **Payout execution:** `0xe938fa9a13d7d9583475f923478e0d0dc4b34642c34658f668534d9c46426d22`
- **Default confirmation:** `0xe8ec0a2966278590661ea248d270748f6f06be43260bf9b4ec1a42a2753dd86e`

**Impact:** Converts a hang into a smooth "let me show you the confirmed version" recovery. 0 risk.

### 5. Dashboard TVL — pre-empt the "only $10" optic

No code change needed. Just **memorize the script line** for the moment Person B navigates to the pool:

> "Ten dollars in the pool. Testnet. The architecture scales identically to ten million."

**Impact:** Closes the only obvious optics gap without sounding defensive.

---

## 🟢 NICE-TO-HAVE (skip unless fully rested)

### 1. Stats page — add issuer name hover tooltip
Not needed for the pitch. Premium curve already labels the dots (post-fix).

### 2. Dashboard "Launch App" animation polish
Current is fine.

### 3. Subrogation page — auto-scroll to NFT #1 on load
Judge will see it in-viewport anyway at 110% zoom. Skip.

### 4. Add a short recorded backup video
Recommended earlier in the week. At T-24h, rehearsal time beats recording.

---

## Pre-stage checklist (the literal night-before list)

Do these in order. Each should take under 2 minutes.

- [ ] Fix `FINAL_STATUS.md` chain-ID line + bscscan URLs (🟡 #1)
- [ ] Add HashKey 133 to MetaMask on demo laptop (🟡 #2)
- [ ] Top up deployer wallet `0xce220d…42fb3` — at least 0.5 HSK (must-verify)
- [ ] Open 6 tabs in exact order (🟡 #3). Zoom 110%. Dark theme.
- [ ] Write 3 fallback TX hashes on sticky note (🟡 #4)
- [ ] Clear browser cache (avoids stale wallet state)
- [ ] Run the 7-minute script out loud with a stopwatch — twice
- [ ] Rehearse the two-person handoff points (flagged in `FINAL_PITCH_SCRIPT.md`)
- [ ] Laptop charged. Second USB-C cable in bag. Phone on DND.
- [ ] Sleep.

---

## Expected impact summary

| Category | Current state | After patch plan | Delta |
|---|---|---|---|
| Demo reliability | 95% (3 bugs fixed in last 4h) | 99% | +4 pts |
| Stage credibility | High | Very high | — |
| Repo credibility (post-demo investor check) | Mixed (chain ID mismatch) | Clean | +8 pts |
| Fail-mode recovery readiness | Partial | Complete | +10 pts |

**Bottom line:** The app is demo-ready today. The patch plan is about removing small friction points that would cost nothing to fix but could cost the pitch if left alone.
