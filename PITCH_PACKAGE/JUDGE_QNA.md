# JUDGE_QNA.md

**Purpose:** Every anticipated question with a defensible answer. Rehearse these out loud — not just read them — until you can deliver them without thinking.

**Rules:**
- Never start an answer with "great question."
- Never say "actually" or "so basically."
- If you don't know, say: "I don't have that number in front of me — I'll follow up."
- Answer in 2 sentences if possible. 4 sentences maximum.

---

## A. Category + Positioning

### Q1. "How are you different from Nexus Mutual / Risk Harbor / Neptune?"

> Nexus and peers insure smart-contract bugs. Their payout contracts don't check compliance — they cannot pay out to a regulated ERC-3643 security token without violating the rules that made the token regulated in the first place. We are the first protocol that checks `isVerified` and `isFrozen` at payout. That's the category gap we filled.

### Q2. "Isn't this just a CDS?"

> It's the on-chain equivalent of a Credit Default Swap — but native to ERC-3643 tokens, with a soulbound Protection Certificate on the buyer side and a SubrogationNFT on the recovery side. Neither primitive exists in the traditional CDS market. So: same intent, different architecture, different capabilities.

### Q3. "Why hasn't anyone built this before?"

> Two reasons. ERC-3643 adoption only crossed institutional credibility in the last 18 months, and the compliance-native payout primitive requires writing identity-registry checks into the payout contract itself. That's not a trivial change — it's an architectural decision we made on day one.

### Q4. "Is this really 'the first'?"

> On the specific claim — a payout protocol that respects ERC-3643 compliance at the contract level — we haven't found a competitor that has shipped this. If one exists that we missed, we'd want to know. What's defensibly true is that we're shipping the combination — bond + credit score + compliance-native payout + subrogation NFT — and the combination is the category.

---

## B. Technical credibility

### Q5. "How does the IRS scoring actually work?"

> Five dimensions on a zero-to-one-thousand scale. NAV punctuality, attestation accuracy, repayment history, Chainlink-verified collateral health, and protocol activity — each weighted and written on-chain through a time-weighted average cache. Premium is a continuous exponential curve — 1600 times e to the negative 0.001386 times IRS, in basis points. An IRS of 1000 pays 4%. An IRS of 0 pays 16%. It's computed in ABDKMath fixed-point, on-chain, every time the score updates.

### Q6. "Is the protocol pausable?"

> Pause-guarding is Phase 1 post-audit — OpenZeppelin Pausable with a 24-hour admin timelock. We deliberately kept the MVP minimal to reduce attack surface, not out of omission. 416 tests, CEI pattern throughout, OpenZeppelin base contracts. Full audit April through July.

### Q7. "What happens if an attestor goes offline or colludes?"

> Two-of-three threshold with slashing. If a bonded attestor signs falsely, their bond is slashed. Phase 1 raises the bond size to the commercially material threshold for mainnet — current MVP bonds are sized for testnet. The threshold model is the same one used by EigenLayer and Symbiotic for operator trust.

### Q8. "How is the payout atomic?"

> One transaction. Four contracts. Bond liquidation, pool liquidation, subrogation mint, issuer state lock — either all four events execute or the entire transaction reverts. This is important because partial execution is how waterfalls get exploited. You can see the four events in the logs tab of the payout TX on the explorer.

### Q9. "What about oracle manipulation?"

> Chainlink Proof of Reserve for collateral health. Mock on testnet — real feed on mainnet. The IRS update cycle is rate-limited and uses time-weighted averages — a single oracle glitch can't swing the score. Default events require 2-of-3 bonded human attestors, not an oracle alone.

### Q10. "Gas economics — does this work at scale?"

> Average gas per coverage purchase is 611k — that's roughly $1.10 at current BSC-comparable gas prices. Payout is 546k. Deposit is 173k. The waterfall contract is optimized with viaIR. We expect HashKey Chain to reduce those costs further at mainnet.

### Q11. "Smart contract safety — what's your audit plan?"

> External audit is Phase 1 — April to July window. The code uses only OpenZeppelin base contracts, follows CEI pattern throughout, has 416 passing tests including a full-lifecycle integration test plus 40 edge-case tests for yield and hardcore scenarios. We're not claiming audit-grade — we're claiming audit-ready.

---

## C. Business / Commercial

### Q12. "What's your business model?"

> 5% protocol fee on every premium payment, routed to the treasury. Governance-token value capture on SubrogationNFT recoveries. Tranche management fees at the senior/junior LP layer. The base unit economics work even at 1% market penetration of the tokenized-RWA market.

### Q13. "How do you make money day one?"

> Premium flow. Every policy written routes 5% of the annualized premium to protocol treasury. At testnet scale it's noise; at $1B of insured TVL at a 696 bps premium at 5% take, it's $350k of annual protocol revenue per billion insured. Scale is the driver.

### Q14. "What's your go-to-market?"

> Two-sided. Issuer side: RWA tokenization platforms that want to differentiate by offering insurable tokens. Capital side: institutional allocators who currently cannot take RWA token exposure without unhedged issuer risk. First five conversations on each side are already open.

### Q15. "Who are your first customers?"

> We are positioned for two cohorts on mainnet: regulated RWA issuers on HashKey's ecosystem, and institutional underwriters looking for an ERC-3643-compliant insurance yield product. We're not announcing names yet — we're in the audit-runway phase.

### Q16. "What does mainnet launch look like?"

> Phase 1 — audit runway (April–July), Chainlink PoR live integration, attestor bond scaling, Pausable + timelock guard. Phase 2 — mainnet beta with a cohort of 3–5 issuers, TVL target $10M in the senior tranche. Phase 3 — open issuer onboarding with governance-owned IRS scoring.

### Q17. "What about regulatory risk?"

> CoverFi is not itself regulated — it's infrastructure. The insurance wrapper of a given jurisdiction is a Phase 2+ question we'll answer with local counsel per market. The token layer we integrate with — ERC-3643 — is specifically designed to respect KYC/AML per jurisdiction. We are building for a world where compliance is enforced at the token level, which is where the industry is going.

---

## D. Why HashKey / Why now

### Q18. "Why HashKey Chain specifically?"

> HashKey Chain's roadmap prioritizes regulated on-chain finance and compliance primitives. That is the exact market our protocol serves. We want to be chain-native infrastructure on the chain most institutional RWA issuers will deploy on.

### Q19. "Why not Ethereum mainnet?"

> We can deploy on Ethereum — the contracts are EVM-compatible. We chose HashKey as the launch venue because the chain's positioning aligns with our protocol's target user. Ethereum is a later expansion, not a first deployment.

### Q20. "Why now, versus a year from now?"

> Tokenized RWA issuance has crossed institutional credibility in the last 18 months — BlackRock BUIDL, Franklin FOBXX, Ondo, Centrifuge, Maple. The credit-protection primitive is the missing piece. We want to be the one that exists when the next wave of issuers comes online, not the one that gets built in response to the first big default.

---

## E. Team + Execution

### Q21. "How did you build this in the hackathon window?"

> Twelve contracts, 416 tests, 10 frontend pages, all deployed and verified on HashKey Chain Testnet. The hackathon window compressed what would have been a three-month build into focused sprints. The architecture decisions — compliance-native payouts, the dual tranche, the subrogation primitive — were locked in week one. Execution was the rest.

### Q22. "What happens after the hackathon?"

> Audit runway starts immediately. Mainnet beta targeted late Q3. We're raising a pre-audit bridge to cover the audit cost and extend the mainnet runway. Ecosystem introductions from HashKey and partners in this room are the highest-leverage thing we can get out of today.

### Q23. "Is this a solo build or a team?"

> *(answer honestly based on your actual team structure — if solo, say so and frame as a positive: "Solo build. That's why the architecture is coherent — there were no committee compromises.")*

### Q24. "Why should we believe this becomes real?"

> Twelve deployed contracts, verified on-chain, with 416 passing tests and a live SubrogationNFT on HashKey Testnet — that's what we shipped in the hackathon window. The commercial wedge is defensible, the architecture is production-shaped, and the category is open. You don't have to believe us — the on-chain evidence is already there. What you're funding from here is the runway between testnet and mainnet.

---

## F. Curveballs (uncommon but possible)

### Q25. "Why only $10 TVL?"

> Testnet. We seeded with real USDT because we wanted every number on the dashboard to come from a real contract read. The architecture is scale-invariant — tranche ratios, premium curve, payout logic are identical at ten dollars and ten million.

### Q26. "What if the issuer never posts a bond?"

> Then they cannot be registered as an issuer in the system — full stop. The registration function fails without the bond deposit. It's enforced at the contract level, not at the UI level.

### Q27. "What if the insurance pool runs dry?"

> The senior tranche has a redemption gate that activates if the pool can't meet a drawdown. Policyholders are protected up to the pool + bond available. Beyond that, the SubrogationNFT represents the legal claim — it's the out-of-protocol recovery path.

### Q28. "Couldn't an issuer game the IRS score?"

> Single dimensions are gameable — cumulative five-dimension scoring across NAV, attestation, repayment, collateral, and activity is much harder. Long-con gaming still requires real collateral posting and real attestation behavior. If an issuer plays the long con and still defaults, the bond seizure + SubrogationNFT cover the loss. We don't claim the IRS is unbeatable — we claim it's better than the zero-signal status quo.

### Q29. "What if a judge says 'this is just a demo'?"

> Respectful disagreement. Twelve contracts deployed and verified. 416 passing tests. A SubrogationNFT minted from a real testnet default two days ago — we can show it on the explorer right now. This is not a demo in the sense of a slide deck with mock UI; this is a live protocol. What it lacks today is mainnet TVL. That's what comes next.

### Q30. "What's the one thing you're most worried about?"

> Execution on the mainnet-launch timeline, specifically the audit phase. We think the architecture is right and the category is open — but a bug discovered in audit could push mainnet by a quarter. That's what a pre-audit bridge round is designed to de-risk.

---

## G. When you are stuck

If you genuinely don't know an answer:

> "I don't have that number in front of me — I can follow up with you right after the session."

This is **stronger** than a bluff. Judges remember confident "I'll follow up" responses more positively than rambling guesses.

---

## H. Tone notes

- **Investor judge:** Emphasize category and monetization. Use the phrase "primitive" often.
- **Technical judge:** Emphasize the compliance-native payout path, ABDKMath, CEI pattern, test count, and the atomic waterfall.
- **Business / HR judge:** Emphasize clarity, team execution, the "infrastructure not application" framing.
- **Ecosystem judge (HashKey, DoraHacks):** Emphasize chain-native positioning, ecosystem utility, and the commercial wedge for institutional RWA on HashKey specifically.

---

## I. The one question you want them to ask

Engineer the pitch so the judge's first question is:

> "Who are the first issuers going to be?"

This means the technical credibility is already assumed. If they are asking about customers, you have won the technical segment of the judging and are now in the commercial conversation. Your answer (Q15) is ready.

If their first question is technical (Q5, Q7, Q11) — answer it, then steer back to commercial in the last sentence. Example:

> "…416 passing tests and CEI pattern throughout. Happy to go deeper on any specific contract. On the commercial side, the audit runway starts next week."

Always close the loop back to "here is what comes next commercially." That is how infrastructure pitches are won.
