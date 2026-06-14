# Strata — Landing-Page Design Notes (ref: designmonks.co)
*User liked designmonks.co and asked to note its motion, photography, stack, and overall landing design. This is a marketing **landing-page** reference (front door), distinct from the dark **app** dashboards (overview/console/issuer) we already built.*

> Scope note: the redesigned **app pages have design** (dark terminal). What's still "blank/old" is the **marketing landing page** (`index.html`). designmonks is the reference for *that* page.

## Stack (detected from assets)
- **Built on Webflow** — every asset is on `cdn.prod.website-files.com` (Webflow CDN). Motion = **Webflow Interactions (IX2)** + likely GSAP/smooth-scroll.
- **Imagery:** project thumbnails as **.avif** (modern, tiny, sharp); responsive **PNG** variants (`-p-500/800/1080/1600/2000`) for hero art; **SVG** for icons, logos, textures.
- **Hero has a muted autoplay background video** (there's a `mute icon.svg` toggle).
- For Strata (hand-coded HTML/CSS/JS) we'd reproduce the motion with **IntersectionObserver + CSS transitions** (or GSAP/Lenis), not Webflow.

## Motion / animation patterns (what to replicate)
1. **Hero background video/loop**, muted autoplay, with a textured SVG overlay; bold headline animates in on load.
2. **Display headings with accent words** — big bold heading where 2–3 words are *italic/colored* ("Success **Stories** That **Inspire Us**", "Smarter Design, **Supercharged by AI**"). Signature look.
3. **Scroll-triggered reveals** — each section fades/slides up as it enters the viewport (IX2 scroll-into-view).
4. **Infinite horizontal marquee** — a continuously scrolling row of capability tags (Framer · Branding · Dashboard · Logos · Webflow · Slide Decks · Mobile Apps · Figma · Social Media), repeated seamlessly.
5. **Auto-scrolling testimonial wall** — multiple columns of cards drifting vertically/horizontally (dozens of quotes).
6. **Mono logo wall** — greyscale client logos (`_mono.svg`: Goldman Sachs, Y Combinator, Backpack…) in a grid, often with a subtle marquee.
7. **Case-study cards** — avif project thumbnails with hover **lift + image reveal**; clickable into project pages.
8. **Sticky nav** with mega-menu (Services/Industry) + persistent "Book a Call" CTA; smooth-scroll; **scroll-to-top arrow** (`ArrowCircleUp`).
9. **FAQ accordion**, **pricing cards**, **comparison table** with row criteria.

## Landing-page IA (section order)
1. Sticky nav (Projects · Services▾ · Industry▾ · About · Blog · Contact) + **Book a Call**.
2. **Hero** — rating chip (4.9★) → big headline + subhead → primary CTA → background video.
3. **Social proof** — client success stories / testimonials.
4. **Feature grid** — "Supercharged by AI": 6 benefit cards (icon + title w/ accent + 1-liner).
5. **Portfolio / "Why Us"** — case-study thumbnails.
6. **Services** — 4 big service cards ("See More").
7. **Why Choose Us** — value props (Unlimited Revisions, Lifetime Support…).
8. **Capability marquee** (infinite scroll).
9. **Pricing** — 3 tier cards + bonuses.
10. **Comparison table** — us vs alternatives across criteria.
11. **Logo wall** — "Trusted by / Chosen by Brands".
12. **Testimonial wall** (auto-scroll).
13. **FAQ** accordion.
14. **Final CTA** — free consultation + contact card + Book a Call.
15. Footer — services, industries, socials, legal.

## Visual language
- Clean, **lots of whitespace**, light surfaces; color comes from **vibrant project imagery** and accent words.
- **Rounded cards**, soft shadows, generous padding, large type scale.
- Star ratings, country/region chips, avatar+role on testimonials.
- Modern, premium, "studio" feel — motion is the differentiator, content is calm.

## How to apply to a **Strata landing page** (`index.html` rebuild)
Keep Strata's dark-terminal brand, but borrow designmonks' *motion + structure*:
1. **Hero** — headline "The autonomous AI underwriting desk for RWA credit risk" + accent words; subhead; CTAs **"Launch App" → overview.html** and **"Watch the Turing proof"**; background = a **looping, muted screen-capture of the console replay** (or an animated SVG of the AI-vs-rulebook chart) instead of a generic video.
2. **Metrics band** (designmonks rating → Strata scale): *Live on Mantle Sepolia · 19 contracts · AI +3 epochs lead · 978 tests*.
3. **Feature grid** — 3 Strata innovations + AI layer as accent-word cards (Issuer Bond · IRS score · Compliance-native payout · AI underwriter).
4. **"How it works"** — scroll-reveal steps (signals → AI score → autonomy gate → payout).
5. **The Turing proof** — a highlight section animating the SVB replay (AI alarms 3 epochs early) — our signature moment.
6. **Capability marquee** — chains/sponsors/standards (Mantle · ERC-3643 · ERC-8004 · Z.AI · Chainlink).
7. **Logo/trust wall** — sponsors/standards in mono.
8. **CTA** — "Launch the console" + GitHub + live explorer links.
9. Motion via **IntersectionObserver fade-up**, a CSS **marquee**, hero **video/loop**, sticky nav + smooth scroll — all hand-coded, dark theme, reusing `strata-theme.css` tokens.

## Decision (recorded — build deferred)
- **Status:** NOT building yet — notes only, per user. Build is a future phase.
- **Chosen visual direction:** **Hybrid** — light hero/marketing sections at the top → transition into **dark "product" showcase** (the console/replay preview) → light CTA at the bottom. Switches to the dark app on "Launch App".
- When we build: new `index.html`, hybrid light→dark→light, motion hand-coded (IntersectionObserver fade-up, CSS marquee, hero loop), reusing `strata-theme.css` tokens for the dark product sections.
