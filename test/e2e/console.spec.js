// @ts-check
/**
 * ============================================================================
 *  frontend/console.html — AI Underwriter Console (Playwright E2E)
 * ============================================================================
 *  Tests the page's in-browser logic (BVA/EP on the pure scoring functions) and
 *  its rendered DOM (scoreboard, feed, replay scrubber, autonomy, live config).
 *  Runs against file:// (no server). The in-page functions (staticScore, aiScore,
 *  premiumBps) + consts (DATA, aiLead, stLead) are global to the page script and
 *  reachable via page.evaluate.
 * ============================================================================
 */
const { test, expect } = require('@playwright/test');

const PAGE = 'console.html';

// The in-page scoring fns expect a COMPLETE signal object (they don't null-coalesce,
// since the console only ever passes full ROWS rows). Build full objects for evaluate.
const S = (o = {}) => ({ nav: 0, att: 0, rep: 0, col: 0, act: 0, sent: 0, ...o });

/* ── M0 · page loads & key elements present ─────────────────────────────── */
test.describe('M0 · page structure', () => {
  test('loads with the expected title and core panels', async ({ page }) => {
    await page.goto(PAGE);
    await expect(page).toHaveTitle(/Strata.*AI Underwriter Console/);
    await expect(page.locator('#aiLead')).toHaveCount(1);
    await expect(page.locator('#feedBody')).toHaveCount(1);
    await expect(page.locator('#scrub')).toHaveCount(1);
    await expect(page.locator('#verdict')).toHaveCount(1);
  });
});

/* ── M1 · staticScore (BVA/EP) ──────────────────────────────────────────── */
test.describe('M1 · staticScore', () => {
  test('all-max → 1000; truncation 3→0 / 4→1', async ({ page }) => {
    await page.goto(PAGE);
    expect(await page.evaluate((o) => staticScore(o), S({ nav: 1000, att: 1000, rep: 1000, col: 10000, act: 1000 }))).toBe(1000);
    expect(await page.evaluate((o) => staticScore(o), S({ nav: 3 }))).toBe(0);
    expect(await page.evaluate((o) => staticScore(o), S({ nav: 4 }))).toBe(1);
  });
  test('collateral bps scale (1000→15, 10000→150) + cap', async ({ page }) => {
    await page.goto(PAGE);
    expect(await page.evaluate((o) => staticScore(o), S({ col: 1000 }))).toBe(15);
    expect(await page.evaluate((o) => staticScore(o), S({ col: 10000 }))).toBe(150);
    expect(await page.evaluate((o) => staticScore(o), S({ col: 20000 }))).toBe(150);
  });
  test('sentiment is ignored by the static arm', async ({ page }) => {
    await page.goto(PAGE);
    const a = await page.evaluate((o) => staticScore(o), S({ nav: 400, sent: 0 }));
    const b = await page.evaluate((o) => staticScore(o), S({ nav: 400, sent: 1000 }));
    expect(a).toBe(b);
  });
});

/* ── M2 · premiumBps (BVA) ──────────────────────────────────────────────── */
test.describe('M2 · premiumBps', () => {
  test('0→1600, 1000→400, monotonic', async ({ page }) => {
    await page.goto(PAGE);
    expect(await page.evaluate(() => premiumBps(0))).toBe(1600);
    expect(await page.evaluate(() => premiumBps(1000))).toBe(400);
    const lo = await page.evaluate(() => premiumBps(200));
    const hi = await page.evaluate(() => premiumBps(800));
    expect(lo).toBeGreaterThan(hi);
  });
});

/* ── M3 · aiScore (BVA on sentiment branches) ───────────────────────────── */
test.describe('M3 · aiScore', () => {
  test('sent 349 → override 250; 350 → haircut > 250', async ({ page }) => {
    await page.goto(PAGE);
    const strong = { nav: 1000, att: 1000, rep: 1000, col: 10000, act: 1000 };
    expect(await page.evaluate((s) => aiScore({ ...s, sent: 349 }).score, strong)).toBe(250);
    expect(await page.evaluate((s) => aiScore({ ...s, sent: 350 }).score, strong)).toBeGreaterThan(250);
  });
  test('USDC-SVB epoch-3 row → AI 250 (parity with pdModel)', async ({ page }) => {
    await page.goto(PAGE);
    const s = { nav: 935, att: 910, rep: 945, col: 9900, act: 700, sent: 330 };
    expect(await page.evaluate((x) => aiScore(x).score, s)).toBe(250);
  });
});

/* ── M4 · lead computation (parity with on-chain benchmark) ─────────────── */
test.describe('M4 · lead computation', () => {
  test('aiFirst=3, stFirst=6, aiLead=3, stLead=0', async ({ page }) => {
    await page.goto(PAGE);
    const r = await page.evaluate(() => ({ aiFirst, stFirst, aiLead, stLead, rows: DATA.length }));
    expect(r.rows).toBe(9);
    expect(r.aiFirst).toBe(3);
    expect(r.stFirst).toBe(6);
    expect(r.aiLead).toBe(3);
    expect(r.stLead).toBe(0);
  });
});

/* ── M5 · scoreboard DOM ────────────────────────────────────────────────── */
test.describe('M5 · scoreboard', () => {
  test('shows AI +3, rulebook 0, AI 1 win', async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.locator('#aiLead')).toHaveText('+3');
    await expect(page.locator('#stLead')).toHaveText('+0');
    await expect(page.locator('#aiWins')).toHaveText('1');
    await expect(page.locator('#avgLead')).toHaveText('+3');
    await expect(page.locator('#verdict')).toContainText('Turing Test');
  });
});

/* ── M6 · feed rendering ────────────────────────────────────────────────── */
test.describe('M6 · feed', () => {
  test('renders 9 epoch rows; epoch-3 shows AI 250 / static 926 / DISTRESS', async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.locator('#feedBody tr')).toHaveCount(9);
    const ep3 = page.locator('#feedBody tr').nth(3);
    await expect(ep3).toContainText('250');
    await expect(ep3).toContainText('926');
    await expect(ep3).toContainText('DISTRESS');
  });
});

/* ── M7 · replay scrubber ───────────────────────────────────────────────── */
test.describe('M7 · replay scrubber', () => {
  test('scrubbing to epoch 3 updates the current-epoch label + memo', async ({ page }) => {
    await page.goto(PAGE);
    await page.locator('#scrub').fill('3');
    await expect(page.locator('#epochNow')).toContainText('epoch 3');
    await expect(page.locator('#memoTxt')).toContainText('250'); // AI score in the memo
  });
});

/* ── M8 · autonomy boundary ─────────────────────────────────────────────── */
test.describe('M8 · autonomy', () => {
  test('RED default proposal appears during distress', async ({ page }) => {
    await page.goto(PAGE);
    await page.locator('#scrub').fill('4'); // acute fear → proposed
    await expect(page.locator('#redState')).toContainText('proposed');
  });
  test('2-of-3 human attestation shown at the event epoch', async ({ page }) => {
    await page.goto(PAGE);
    await page.locator('#scrub').fill('6'); // event epoch → humans confirm
    await expect(page.locator('#attChips .chip.voted')).toHaveCount(2);
  });
});

/* ── M9 · live config wiring ────────────────────────────────────────────── */
test.describe('M9 · live config', () => {
  test('loads STRATA_CONFIG (net tag + replay pill present)', async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.locator('#netTag')).toContainText('5003');
    await expect(page.locator('#livePill')).toContainText('REPLAY');
  });
});
