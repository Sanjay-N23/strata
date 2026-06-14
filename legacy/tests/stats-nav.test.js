/**
 * Stats Nav Link — Automated Test Suite
 *
 * Runs all DETERMINISTIC test cases from the test plan:
 *   Category A — Static Structure & Presence (17 cases)
 *   Category C — Active State (partial, 6 cases)
 *   Category I — Regression (partial, 8 cases)
 *   Category K — Encoding (3 cases)
 *
 * Skipped (require browser / Playwright):
 *   Category B routing, D visual layout, E hover, F responsive,
 *   G accessibility, H cross-browser, J deploy pipeline, K1 runtime
 *
 * Run:  node test/frontend/stats-nav.test.js
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const FRONTEND = path.join(__dirname, '..', '..', 'frontend');
const APP_PAGES = [
  'dashboard.html', 'issuers.html', 'pool.html',
  'coverage.html', 'subrogation.html', 'stats.html'
];
const OUT_OF_SCOPE = ['register.html', 'attestor.html', 'issuer-dashboard.html'];
const HOME = 'index.html';

let passed = 0, failed = 0;
const failures = [];

function test(id, desc, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${id.padEnd(8)} ${desc}`);
  } catch (e) {
    failed++;
    failures.push({ id, desc, error: e.message });
    console.log(`  ✗ ${id.padEnd(8)} ${desc}\n      → ${e.message}`);
  }
}

function section(title) {
  console.log(`\n━━━ ${title} ━━━`);
}

function read(file) {
  return fs.readFileSync(path.join(FRONTEND, file), 'utf8');
}

function readRaw(file) {
  return fs.readFileSync(path.join(FRONTEND, file));
}

// ═══════════════════════════════════════════════════════════════
// Category A — Static Structure & Presence
// ═══════════════════════════════════════════════════════════════

section('Category A1 — Link existence (7 pages)');

APP_PAGES.forEach((file, i) => {
  test(`A1.${i + 1}`, `${file} contains Stats link inside .dash-nav-links`, () => {
    const html = read(file);
    // Find the dash-nav-links block and check Stats link is inside
    const navBlockMatch = html.match(/<div class="dash-nav-links">([\s\S]*?)<\/div>/);
    assert.ok(navBlockMatch, 'dash-nav-links block not found');
    assert.ok(/href="stats\.html"/.test(navBlockMatch[1]),
      'Stats link (href="stats.html") not found inside dash-nav-links');
  });
});

test('A1.7', `${HOME} contains Stats link inside nav-links <ul>`, () => {
  const html = read(HOME);
  const navBlockMatch = html.match(/<ul class="nav-links"[^>]*>([\s\S]*?)<\/ul>/);
  assert.ok(navBlockMatch, 'nav-links <ul> block not found');
  assert.ok(/href="stats\.html"/.test(navBlockMatch[1]),
    'Stats link not found inside <ul class="nav-links">');
});

// ═══════════════════════════════════════════════════════════════
section('Category A2 — HTML integrity & regression protection');

[...APP_PAGES, HOME].forEach((file, i) => {
  test(`A2.1.${i + 1}`, `${file}: exactly ONE href="stats.html" in nav block`, () => {
    const html = read(file);
    // Extract nav block only
    const navBlock = (html.match(/<div class="dash-nav-links">([\s\S]*?)<\/div>/) ||
                      html.match(/<ul class="nav-links"[^>]*>([\s\S]*?)<\/ul>/) || [])[1] || '';
    const matches = (navBlock.match(/href="stats\.html"/g) || []).length;
    assert.strictEqual(matches, 1,
      `Expected 1 Stats link in nav, found ${matches}`);
  });
});

[...APP_PAGES, HOME].forEach((file, i) => {
  test(`A2.2.${i + 1}`, `${file}: Subrogation link still present (sed didn't overwrite)`, () => {
    const html = read(file);
    assert.ok(/href="subrogation\.html"/.test(html),
      'Subrogation link was removed or corrupted');
  });
});

test('A2.3', 'All Stats <a> tags are properly closed', () => {
  [...APP_PAGES, HOME].forEach(file => {
    const html = read(file);
    // Match Stats link open tag and verify closing
    const matches = html.match(/<a[^>]*href="stats\.html"[^>]*>Stats<\/a>/g) ||
                    html.match(/<a[^>]*href="stats\.html"[^>]*>Stats<\/a>/g);
    assert.ok(matches && matches.length > 0,
      `${file}: Stats link not properly formed as <a>Stats</a>`);
  });
});

test('A2.5', 'No stray \\n or literal escape sequences in nav blocks', () => {
  APP_PAGES.forEach(file => {
    const html = read(file);
    const navBlock = (html.match(/<div class="dash-nav-links">([\s\S]*?)<\/div>/) || [])[1] || '';
    // Check no literal backslash-n sequences (as opposed to real newlines)
    assert.ok(!/\\n/.test(navBlock),
      `${file}: literal "\\n" found in nav (sed artifact)`);
  });
});

// ═══════════════════════════════════════════════════════════════
section('Category A3 — Attribute correctness');

APP_PAGES.filter(f => f !== 'stats.html').forEach((file, i) => {
  test(`A3.1.${i + 1}`, `${file}: Stats has class="dash-nav-link" (no active)`, () => {
    const html = read(file);
    const match = html.match(/<a href="stats\.html" class="([^"]+)">Stats<\/a>/);
    assert.ok(match, 'Stats link not found in expected format');
    assert.strictEqual(match[1], 'dash-nav-link',
      `Expected class="dash-nav-link", got class="${match[1]}"`);
  });
});

test('A3.2', 'stats.html: Stats link has class="dash-nav-link active"', () => {
  const html = read('stats.html');
  const match = html.match(/<a href="stats\.html" class="([^"]+)">Stats<\/a>/);
  assert.ok(match, 'Stats link not found in stats.html');
  assert.ok(match[1].includes('dash-nav-link'), 'Missing dash-nav-link class');
  assert.ok(match[1].includes('active'), 'Missing active class on current page');
});

test('A3.3', 'index.html: Stats wrapped in <li>, uses nav-feature-link class', () => {
  const html = read(HOME);
  const match = html.match(/<li>\s*<a href="stats\.html" class="([^"]+)">Stats<\/a>\s*<\/li>/);
  assert.ok(match, 'Stats link in index.html missing <li> wrapper or wrong class');
  assert.strictEqual(match[1], 'nav-feature-link');
});

test('A3.4', 'Link text is exactly "Stats" (no trailing space, no "Statistics")', () => {
  [...APP_PAGES, HOME].forEach(file => {
    const html = read(file);
    assert.ok(/>Stats<\/a>/.test(html), `${file}: link text is not exactly "Stats"`);
    assert.ok(!/>Statistics<\/a>/.test(html.match(/<a[^>]*href="stats\.html"[^>]*>[^<]+<\/a>/)?.[0] || ''),
      `${file}: found "Statistics" instead of "Stats"`);
  });
});

test('A3.5', 'href is exactly "stats.html" (no leading slash or ./)', () => {
  [...APP_PAGES, HOME].forEach(file => {
    const html = read(file);
    assert.ok(/href="stats\.html"/.test(html), `${file}: href incorrect`);
    assert.ok(!/href="\/stats\.html"/.test(html), `${file}: leading slash on href`);
    assert.ok(!/href="\.\/stats\.html"/.test(html), `${file}: ./ on href`);
  });
});

// ═══════════════════════════════════════════════════════════════
// Category C — Active State (static/CSS-verifiable portions)
// ═══════════════════════════════════════════════════════════════
section('Category C — Active state');

test('C1.3', '.active rule is CSS-only (no JS required)', () => {
  const html = read('stats.html');
  // Check for CSS rule targeting .active — should exist in <style>
  const hasActiveRule = /\.dash-nav-link\.active\s*\{[^}]*color:\s*#F0B90B/i.test(html);
  assert.ok(hasActiveRule, '.dash-nav-link.active CSS rule not found or not gold');
});

test('C1.4', 'Dark mode .active rule exists and is gold', () => {
  const html = read('stats.html');
  const hasDarkRule = /\[data-theme="dark"\]\s*\.dash-nav-link\.active[^{]*\{[^}]*#F0B90B/i.test(html);
  assert.ok(hasDarkRule, 'Dark mode active rule missing or wrong color');
});

APP_PAGES.filter(f => f !== 'stats.html').forEach((file, i) => {
  test(`C2.1.${i + 1}`, `${file}: Stats link is NOT marked active`, () => {
    const html = read(file);
    const match = html.match(/<a href="stats\.html" class="([^"]+)">Stats<\/a>/);
    assert.ok(match, 'Stats link missing');
    assert.ok(!match[1].includes('active'),
      `${file} incorrectly has active class on Stats link`);
  });
});

test('C2.4', 'stats.html: ONLY Stats has active class (not Dashboard/Issuers/etc)', () => {
  const html = read('stats.html');
  const navBlock = (html.match(/<div class="dash-nav-links">([\s\S]*?)<\/div>/) || [])[1] || '';
  const activeLinks = (navBlock.match(/class="[^"]*\bactive\b[^"]*"/g) || []).length;
  assert.strictEqual(activeLinks, 1,
    `Expected exactly 1 active link on stats.html, found ${activeLinks}`);
});

// ═══════════════════════════════════════════════════════════════
// Category I — Regression (static verifiable portions)
// ═══════════════════════════════════════════════════════════════
section('Category I — Regression checks');

test('I1.2', 'Grid layout "1fr auto 1fr" still on .dash-nav-inner (all 6 app pages)', () => {
  APP_PAGES.forEach(file => {
    const html = read(file);
    assert.ok(/grid-template-columns:\s*1fr\s+auto\s+1fr/i.test(html),
      `${file}: 1fr auto 1fr grid template missing`);
  });
});

test('I1.3', 'Role dropdown HTML structure intact in dashboard.html', () => {
  const html = read('dashboard.html');
  assert.ok(/id="roleDropdown"/.test(html), 'roleDropdown element missing');
  assert.ok(/id="roleDropdownMenu"/.test(html), 'roleDropdownMenu element missing');
  assert.ok(/toggleRoleDropdown\(\)/.test(html), 'toggleRoleDropdown handler missing');
});

test('I1.4', 'HashKey badge has white-space: nowrap (all 9 pages with nav)', () => {
  [...APP_PAGES, ...OUT_OF_SCOPE].forEach(file => {
    const html = read(file);
    const badgeBlock = html.match(/\.badge-testnet\s*\{[^}]+\}/);
    if (badgeBlock) {
      assert.ok(/white-space:\s*nowrap/.test(badgeBlock[0]),
        `${file}: badge-testnet missing white-space: nowrap`);
    }
  });
});

test('I1.5', 'Subrogation link routes correctly from all 7 pages', () => {
  [...APP_PAGES, HOME].forEach(file => {
    const html = read(file);
    assert.ok(/href="subrogation\.html"/.test(html),
      `${file}: Subrogation link missing`);
  });
});

test('I3.1', 'register.html nav unchanged (still no Stats — expected out of scope)', () => {
  const html = read('register.html');
  // Stats should NOT have been added to register.html
  const navMatch = html.match(/<div class="dash-nav-links">([\s\S]*?)<\/div>/);
  if (navMatch) {
    assert.ok(!/href="stats\.html"/.test(navMatch[1]),
      'register.html unexpectedly has Stats link (should be out of scope)');
  }
});

test('I3.2', 'attestor.html nav unchanged (still no Stats — expected)', () => {
  const html = read('attestor.html');
  const navMatch = html.match(/<div class="dash-nav-links">([\s\S]*?)<\/div>/);
  if (navMatch) {
    assert.ok(!/href="stats\.html"/.test(navMatch[1]),
      'attestor.html unexpectedly has Stats link');
  }
});

test('I3.3', 'issuer-dashboard.html nav unchanged (still no Stats — expected)', () => {
  const html = read('issuer-dashboard.html');
  const navMatch = html.match(/<div class="dash-nav-links">([\s\S]*?)<\/div>/);
  if (navMatch) {
    assert.ok(!/href="stats\.html"/.test(navMatch[1]),
      'issuer-dashboard.html unexpectedly has Stats link');
  }
});

test('I2.1 (proxy)', 'executePurchase isInsured pre-check still present in dashboard.html', () => {
  const html = read('dashboard.html');
  assert.ok(/isInsured\s*\(\s*tokenAddress\s*,\s*userAddress\s*\)/.test(html),
    'isInsured pre-check removed from executePurchase');
});

test('I2.5 (proxy)', 'parseContractError still handles "already insured"', () => {
  const html = read('dashboard.html');
  assert.ok(/already insured/.test(html),
    '"already insured" string removed from parseContractError');
});

// ═══════════════════════════════════════════════════════════════
// Category K — Encoding
// ═══════════════════════════════════════════════════════════════
section('Category K2 — Encoding integrity');

test('K2.1', 'All 7 modified files are valid UTF-8', () => {
  [...APP_PAGES, HOME].forEach(file => {
    const buf = readRaw(file);
    // Try to decode as UTF-8 strictly
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch (e) {
      throw new Error(`${file} is not valid UTF-8: ${e.message}`);
    }
  });
});

test('K2.2', 'No UTF-8 BOM introduced by sed in any modified file', () => {
  [...APP_PAGES, HOME].forEach(file => {
    const buf = readRaw(file);
    assert.ok(!(buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF),
      `${file}: UTF-8 BOM found (should not be present)`);
  });
});

test('K2.3', '"Stats" text is pure ASCII (no smart quotes / unicode tricks)', () => {
  [...APP_PAGES, HOME].forEach(file => {
    const html = read(file);
    const match = html.match(/<a[^>]*href="stats\.html"[^>]*>([^<]+)<\/a>/);
    assert.ok(match, 'Stats link not found');
    // Each char must be ASCII
    [...match[1]].forEach(ch => {
      assert.ok(ch.charCodeAt(0) < 128,
        `${file}: non-ASCII char "${ch}" (code ${ch.charCodeAt(0)}) in link text`);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(60)}`);
console.log(`  STATS NAV TEST SUITE`);
console.log(`${'═'.repeat(60)}`);
console.log(`  Total:  ${passed + failed}`);
console.log(`  Passed: ${passed} ✓`);
console.log(`  Failed: ${failed}${failed > 0 ? ' ✗' : ''}`);

if (failed > 0) {
  console.log(`\n  Failures:`);
  failures.forEach(f => console.log(`    ${f.id}: ${f.desc}\n      → ${f.error}`));
  process.exit(1);
}
console.log(`\n  ✓ All automated tests passed.`);
console.log(`\n  Manual/browser tests to run separately:`);
console.log(`    - Category B (routing — click through)`);
console.log(`    - Category D (visual layout at 1920/1440/1366/1280 viewports)`);
console.log(`    - Category E (hover states, dark mode rendering)`);
console.log(`    - Category F (responsive at ≤768px)`);
console.log(`    - Category G (keyboard nav, screen reader)`);
console.log(`    - Category H (Chrome/Firefox/Safari matrix)`);
console.log(`    - Category J (Vercel production deploy smoke)\n`);
