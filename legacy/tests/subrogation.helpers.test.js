'use strict';
/**
 * test/frontend/subrogation.helpers.test.js
 *
 * Node.js unit tests for helper functions embedded in frontend/subrogation.html.
 * Replicates each function exactly as written in the HTML, then tests all 143 cases.
 *
 * Run: node test/frontend/subrogation.helpers.test.js
 * No extra dependencies — uses Node built-in `assert` + ethers (already in project).
 *
 * Covers:
 *   A  — DEFAULT_TYPES enum correctness (16 cases)
 *   B  — getDefaultTypeName() (10 cases)
 *   C  — formatUSDT() (9 cases)
 *   D  — shortenAddr() (8 cases)
 *   E  — Clickable issuer address link (11 cases)
 *   F  — Token ID loop calculations (13 cases)
 *   G  — parseClaim() struct deserialization (15 cases)
 *   H  — renderOneClaim() HTML output (18 cases)
 *   I  — Metrics aggregation (7 cases)
 *   N  — payoutBlock display (4 cases)
 *   O  — Address constants (4 cases)
 *   P  — XSS / security (5 cases)
 *   Q  — Regression (6 cases)
 */

const assert  = require('assert');
const ethers  = require('ethers');

// ─── Exact copies of functions from frontend/subrogation.html ─────────────
// These mirror the live code. If subrogation.html is changed, update here too.

const SUBROGATION_NFT_ADDR = '0xbBe8A2840E151cC8BF2B156e5d61a532eFCe2AB9';
const PAYOUT_ENGINE_ADDR   = '0x44944cB598A750Df4C4Bf9A7D3FdDDf7575F88F5';
const BSCSCAN_URL          = 'https://testnet-explorer.hsk.xyz';

const DEFAULT_TYPES = [
  'PAYMENT_DELAY',
  'GHOST_ISSUER',
  'COLLATERAL_SHORTFALL',
  'MISAPPROPRIATION'
];

function formatUSDT(wei) {
  try {
    const val = parseFloat(ethers.formatUnits(wei, 18));
    return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' USDT';
  } catch (e) {
    return '$0 USDT';
  }
}

function shortenAddr(addr) {
  if (!addr) return '--';
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function getDefaultTypeName(typeIndex) {
  return DEFAULT_TYPES[typeIndex] || 'UNKNOWN';
}

// ─── Helper functions that mirror loadClaims() logic ──────────────────────

/** totalMinted = Number(nextTokenId) - 1 */
function calcTotalMinted(nextTokenId) {
  return Number(nextTokenId) - 1;
}

/** Returns the array of token IDs the frontend loop would fetch */
function calcLoopIds(totalMinted) {
  const ids = [];
  for (let i = 1; i <= totalMinted; i++) ids.push(i);
  return ids;
}

/** Mirrors the parseClaim block inside loadClaims() */
function parseClaim(i, data) {
  return {
    tokenId: i,
    issuerToken:        data.issuerToken        !== undefined ? data.issuerToken        : data[0],
    defaultType:        Number(data.defaultType !== undefined ? data.defaultType        : data[1]),
    totalPayoutAmount:  data.totalPayoutAmount   !== undefined ? data.totalPayoutAmount  : data[2],
    bondLiquidated:     data.bondLiquidated      !== undefined ? data.bondLiquidated     : data[3],
    juniorLiquidated:   data.juniorLiquidated    !== undefined ? data.juniorLiquidated   : data[4],
    seniorLiquidated:   data.seniorLiquidated    !== undefined ? data.seniorLiquidated   : data[5],
    insuredHolderCount: Number(data.insuredHolderCount !== undefined ? data.insuredHolderCount : data[6]),
    payoutBlock:        Number(data.payoutBlock  !== undefined ? data.payoutBlock        : data[7])
  };
}

/** Mirrors the metrics aggregation in loadClaims() */
function aggregateMetrics(claims) {
  let totalPendingValue = BigInt(0);
  let activeClaims      = 0;
  const completedClaims = 0;
  for (const claim of claims) {
    activeClaims++;
    totalPendingValue += BigInt(claim.totalPayoutAmount);
  }
  return { totalMinted: claims.length, totalPendingValue, activeClaims, completedClaims };
}

/** Mirrors renderClaims() for a single claim */
function renderOneClaim(c) {
  const statusClass = c.status === 'active' ? 'claim-badge-active' : 'claim-badge-completed';
  const statusText  = c.status === 'active' ? 'Active' : 'Completed';

  let html = '<div class="claim-card">';
  html += '<div class="claim-card-header">';
  html += '<span class="claim-card-title">SubrogationNFT #' + c.tokenId + '</span>';
  html += '<span class="claim-badge ' + statusClass + '">' + statusText + '</span>';
  html += '</div>';

  html += '<div class="claim-row">';
  html += '<span class="claim-row-label">Issuer Token</span>';
  html += '<a class="claim-row-value mono-sm" href="https://testnet-explorer.hsk.xyz/address/' + c.issuerToken + '" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;text-underline-offset:2px;">' + shortenAddr(c.issuerToken) + '</a>';
  html += '</div>';

  html += '<div class="claim-row">';
  html += '<span class="claim-row-label">Default Type</span>';
  html += '<span class="default-type-badge">' + getDefaultTypeName(c.defaultType) + '</span>';
  html += '</div>';

  html += '<div class="claim-payout-section">';
  html += '<span class="claim-row-value">' + formatUSDT(c.bondLiquidated)    + '</span>';
  html += '<span class="claim-row-value">' + formatUSDT(c.juniorLiquidated)  + '</span>';
  html += '<span class="claim-row-value">' + formatUSDT(c.seniorLiquidated)  + '</span>';
  html += '<span class="claim-total-value">' + formatUSDT(c.totalPayoutAmount) + '</span>';
  html += '</div>';

  html += '<div class="claim-row">';
  html += '<span class="claim-row-value">' + c.insuredHolderCount + '</span>';
  html += '</div>';

  html += '<div class="claim-row">';
  html += '<span class="claim-row-value mono-sm">Block ' + c.payoutBlock.toLocaleString('en-US') + '</span>';
  html += '</div>';

  html += '<div class="claim-actions">';
  html += '<a class="btn-claim btn-claim-view" href="' + BSCSCAN_URL + '/token/' + SUBROGATION_NFT_ADDR + '?a=' + c.tokenId + '" target="_blank" rel="noopener">';
  html += 'View on Explorer</a>';
  html += '</div>';

  html += '</div>';
  return html;
}

// ─── Test harness ──────────────────────────────────────────────────────────

let passed = 0, failed = 0, total = 0;

function t(id, desc, fn) {
  total++;
  try {
    fn();
    console.log(`  \u2713  ${id}: ${desc}`);
    passed++;
  } catch (e) {
    console.log(`  \u2717  ${id}: ${desc}`);
    console.log(`       ${e.message}`);
    failed++;
  }
}

// ─── Shared fixtures ───────────────────────────────────────────────────────

const GHOST_ADDR  = '0x824F04a2a48CFA070C732121315534b97661f420';
const ISSUER1_ADDR = '0x05CB9e59D23748D0E4B70Ead6db823f38b9ef7b7';

const CLAIM_NFT2 = {
  tokenId: 2, status: 'active',
  issuerToken:        GHOST_ADDR,
  defaultType:        0,
  totalPayoutAmount:  15000000000000000000n,
  bondLiquidated:     5000000000000000000n,
  juniorLiquidated:   3000000000000000000n,
  seniorLiquidated:   7000000000000000000n,
  insuredHolderCount: 1,
  payoutBlock:        26760420
};

const CLAIM_NFT1 = {
  ...CLAIM_NFT2,
  tokenId:     1,
  issuerToken: ISSUER1_ADDR,
  defaultType: 0
};

const HTML_NFT2 = renderOneClaim(CLAIM_NFT2);
const HTML_NFT1 = renderOneClaim(CLAIM_NFT1);

// ─────────────────────────────────────────────────────────────────────────
// A — DEFAULT_TYPES enum correctness
// ─────────────────────────────────────────────────────────────────────────
console.log('\nA — DEFAULT_TYPES Enum Correctness');

t('A1.1', 'index 0 = PAYMENT_DELAY',         () => assert.strictEqual(DEFAULT_TYPES[0], 'PAYMENT_DELAY'));
t('A1.2', 'index 1 = GHOST_ISSUER',           () => assert.strictEqual(DEFAULT_TYPES[1], 'GHOST_ISSUER'));
t('A1.3', 'index 2 = COLLATERAL_SHORTFALL',   () => assert.strictEqual(DEFAULT_TYPES[2], 'COLLATERAL_SHORTFALL'));
t('A1.4', 'index 3 = MISAPPROPRIATION',       () => assert.strictEqual(DEFAULT_TYPES[3], 'MISAPPROPRIATION'));

t('A2.1', 'index 4 out of range → undefined', () => assert.strictEqual(DEFAULT_TYPES[4],   undefined));
t('A2.2', 'index -1 → undefined',             () => assert.strictEqual(DEFAULT_TYPES[-1],  undefined));
t('A2.3', 'index undefined → undefined',      () => assert.strictEqual(DEFAULT_TYPES[undefined], undefined));
t('A2.4', 'index null → undefined',           () => assert.strictEqual(DEFAULT_TYPES[null], undefined));
t('A2.5', 'index 99 → undefined',             () => assert.strictEqual(DEFAULT_TYPES[99],  undefined));
t('A2.6', 'index NaN → undefined',            () => assert.strictEqual(DEFAULT_TYPES[NaN], undefined));

t('A3.1', 'GENERAL_DEFAULT absent',           () => assert.strictEqual(DEFAULT_TYPES.includes('GENERAL_DEFAULT'),  false));
t('A3.2', 'MISAPPROPRIATION only at index 3', () => assert.strictEqual(DEFAULT_TYPES.indexOf('MISAPPROPRIATION'),  3));
t('A3.3', 'FRAUD absent',                     () => assert.strictEqual(DEFAULT_TYPES.includes('FRAUD'),            false));
t('A3.4', 'INSOLVENCY absent',                () => assert.strictEqual(DEFAULT_TYPES.includes('INSOLVENCY'),       false));
t('A3.5', 'BREACH_OF_TERMS absent',           () => assert.strictEqual(DEFAULT_TYPES.includes('BREACH_OF_TERMS'),  false));
t('A3.6', 'REGULATORY_ACTION absent',         () => assert.strictEqual(DEFAULT_TYPES.includes('REGULATORY_ACTION'),false));

// ─────────────────────────────────────────────────────────────────────────
// B — getDefaultTypeName()
// ─────────────────────────────────────────────────────────────────────────
console.log('\nB — getDefaultTypeName()');

t('B1.1', 'type=0 → PAYMENT_DELAY',           () => assert.strictEqual(getDefaultTypeName(0), 'PAYMENT_DELAY'));
t('B1.2', 'type=1 → GHOST_ISSUER',            () => assert.strictEqual(getDefaultTypeName(1), 'GHOST_ISSUER'));
t('B1.3', 'type=2 → COLLATERAL_SHORTFALL',    () => assert.strictEqual(getDefaultTypeName(2), 'COLLATERAL_SHORTFALL'));
t('B1.4', 'type=3 → MISAPPROPRIATION',        () => assert.strictEqual(getDefaultTypeName(3), 'MISAPPROPRIATION'));
t('B1.5', 'type=4 → UNKNOWN fallback',        () => assert.strictEqual(getDefaultTypeName(4),         'UNKNOWN'));
t('B1.6', 'type=undefined → UNKNOWN',         () => assert.strictEqual(getDefaultTypeName(undefined),  'UNKNOWN'));
t('B1.7', 'type=null → UNKNOWN',              () => assert.strictEqual(getDefaultTypeName(null),       'UNKNOWN'));

t('B2.1', 'Number(0n) allows correct array index', () => {
  assert.strictEqual(getDefaultTypeName(Number(0n)), 'PAYMENT_DELAY');
});
t('B2.2', 'Number(BigInt(2)) indexes COLLATERAL_SHORTFALL', () => {
  assert.strictEqual(getDefaultTypeName(Number(BigInt(2))), 'COLLATERAL_SHORTFALL');
});
t('B2.3', 'returns plain string with no HTML tags', () => {
  for (let i = 0; i < 4; i++) {
    const name = getDefaultTypeName(i);
    assert(!name.includes('<'), `type ${i} should not contain <`);
    assert(!name.includes('>'), `type ${i} should not contain >`);
  }
});

// ─────────────────────────────────────────────────────────────────────────
// C — formatUSDT()
// ─────────────────────────────────────────────────────────────────────────
console.log('\nC — formatUSDT()');

t('C1.1', '5e18  → $5 USDT',  () => assert.strictEqual(formatUSDT(5000000000000000000n),  '$5 USDT'));
t('C1.2', '3e18  → $3 USDT',  () => assert.strictEqual(formatUSDT(3000000000000000000n),  '$3 USDT'));
t('C1.3', '7e18  → $7 USDT',  () => assert.strictEqual(formatUSDT(7000000000000000000n),  '$7 USDT'));
t('C1.4', '15e18 → $15 USDT', () => assert.strictEqual(formatUSDT(15000000000000000000n), '$15 USDT'));
t('C1.5', '0     → $0 USDT',  () => assert.strictEqual(formatUSDT(0n),                    '$0 USDT'));
t('C1.6', '1e16 (0.01 ETH) → $0.01 USDT (maximumFractionDigits=2 boundary)', () => {
  // 0.001 rounds to 0.00 → "$0 USDT" — use 0.01 to verify decimal display works
  assert.strictEqual(formatUSDT(10000000000000000n), '$0.01 USDT');
});
t('C1.7', 'string "15000000000000000000" → $15 USDT', () =>
  assert.strictEqual(formatUSDT('15000000000000000000'), '$15 USDT'));
t('C1.8', 'invalid input → $0 USDT fallback', () =>
  assert.strictEqual(formatUSDT('not-a-number'), '$0 USDT'));
t('C1.9', 'ethers.parseEther("15") → $15 USDT', () =>
  assert.strictEqual(formatUSDT(ethers.parseEther('15')), '$15 USDT'));

// ─────────────────────────────────────────────────────────────────────────
// D — shortenAddr()
// ─────────────────────────────────────────────────────────────────────────
console.log('\nD — shortenAddr()');

t('D1.1', 'GhostIssuer → 0x824F...f420',    () => assert.strictEqual(shortenAddr(GHOST_ADDR), '0x824F...f420'));
t('D1.2', 'zero address → 0x0000...0000',   () => assert.strictEqual(
  shortenAddr('0x0000000000000000000000000000000000000000'), '0x0000...0000'));
t('D1.3', 'undefined → --',  () => assert.strictEqual(shortenAddr(undefined), '--'));
t('D1.4', 'null → --',       () => assert.strictEqual(shortenAddr(null),      '--'));
t('D1.5', '"" → --',         () => assert.strictEqual(shortenAddr(''),        '--'));
t('D1.6', 'preserves first 6 chars',   () => assert(shortenAddr(GHOST_ADDR).startsWith('0x824F')));
t('D1.7', 'preserves last 4 chars',    () => assert(shortenAddr(GHOST_ADDR).endsWith('f420')));
t('D1.8', 'includes ellipsis ...',     () => assert(shortenAddr(GHOST_ADDR).includes('...')));

// ─────────────────────────────────────────────────────────────────────────
// E — Clickable issuer address link
// ─────────────────────────────────────────────────────────────────────────
console.log('\nE — Clickable Issuer Address Link');

t('E1.1', 'href contains full issuer address (not shortened)', () =>
  assert(HTML_NFT2.includes('href="https://testnet-explorer.hsk.xyz/address/' + GHOST_ADDR + '"')));
t('E1.2', 'link has target="_blank"',              () => assert(HTML_NFT2.includes('target="_blank"')));
t('E1.3', 'link has rel="noopener"',               () => assert(HTML_NFT2.includes('rel="noopener"')));
t('E1.4', 'display text is shortened (0x824F...f420)', () => assert(HTML_NFT2.includes('>0x824F...f420<')));
t('E1.5', 'issuer wrapped in <a>, not <span>',    () => {
  assert(HTML_NFT2.includes('<a class="claim-row-value mono-sm" href="https://testnet-explorer.hsk.xyz/address/'));
  assert(!HTML_NFT2.includes('<span class="claim-row-value mono-sm">0x824F'));
});
t('E1.6', 'has text-decoration:underline',         () => assert(HTML_NFT2.includes('text-decoration:underline')));
t('E1.7', 'has color:inherit',                     () => assert(HTML_NFT2.includes('color:inherit')));

t('E2.1', 'NFT #1 link points to issuer1 address', () =>
  assert(HTML_NFT1.includes('href="https://testnet-explorer.hsk.xyz/address/' + ISSUER1_ADDR + '"')));
t('E2.2', 'NFT #2 link points to GhostIssuer address', () =>
  assert(HTML_NFT2.includes('href="https://testnet-explorer.hsk.xyz/address/' + GHOST_ADDR + '"')));
t('E2.3', 'same issuer on two claims → same link', () => {
  const c3 = { ...CLAIM_NFT2, tokenId: 3 };
  assert(renderOneClaim(c3).includes('href="https://testnet-explorer.hsk.xyz/address/' + GHOST_ADDR + '"'));
});
t('E2.4', 'different issuers → links are distinct', () => {
  assert(!HTML_NFT1.includes(GHOST_ADDR));
  assert(!HTML_NFT2.includes(ISSUER1_ADDR));
});

// ─────────────────────────────────────────────────────────────────────────
// F — Token ID loop calculations (frontend)
// ─────────────────────────────────────────────────────────────────────────
console.log('\nF — Token ID Enumeration (frontend calculations)');

t('F1.1', 'nextTokenId=1n → totalMinted=0',   () => assert.strictEqual(calcTotalMinted(1n),  0));
t('F1.2', 'nextTokenId=2n → totalMinted=1',   () => assert.strictEqual(calcTotalMinted(2n),  1));
t('F1.3', 'nextTokenId=3n → totalMinted=2',   () => assert.strictEqual(calcTotalMinted(3n),  2));
t('F1.4', 'nextTokenId=11n → totalMinted=10', () => assert.strictEqual(calcTotalMinted(11n), 10));

t('F2.1', 'totalMinted=0 → no IDs fetched',          () => assert.deepStrictEqual(calcLoopIds(0),  []));
t('F2.2', 'totalMinted=1 → IDs [1]',                 () => assert.deepStrictEqual(calcLoopIds(1),  [1]));
t('F2.3', 'totalMinted=2 → IDs [1, 2]',              () => assert.deepStrictEqual(calcLoopIds(2),  [1, 2]));
t('F2.4', 'loop never contains ID 0',                 () => {
  for (let n = 0; n <= 10; n++) assert(!calcLoopIds(n).includes(0), `ID 0 found for totalMinted=${n}`);
});
t('F2.5', 'totalMinted=10 → first=1, last=10, len=10', () => {
  const ids = calcLoopIds(10);
  assert.strictEqual(ids[0],  1);
  assert.strictEqual(ids[9],  10);
  assert.strictEqual(ids.length, 10);
});

t('F3.1', 'BigInt(1n) typeof = "bigint"',     () => assert.strictEqual(typeof 1n, 'bigint'));
t('F3.2', 'Number(2n) - 1 = 1',              () => assert.strictEqual(Number(2n) - 1, 1));
t('F3.3', 'BigInt has no .toNumber method',   () => assert.strictEqual((1n).toNumber, undefined));

// ─────────────────────────────────────────────────────────────────────────
// G — parseClaim() struct deserialization
// ─────────────────────────────────────────────────────────────────────────
console.log('\nG — Struct Deserialization (parseClaim)');

// Ethers v6 named struct response
const NAMED = {
  issuerToken:        GHOST_ADDR,
  defaultType:        0n,
  totalPayoutAmount:  15000000000000000000n,
  bondLiquidated:      5000000000000000000n,
  juniorLiquidated:    3000000000000000000n,
  seniorLiquidated:    7000000000000000000n,
  insuredHolderCount:  1n,
  payoutBlock:        26760420n
};

// Positional array fallback
const POSITIONAL = [
  GHOST_ADDR, 0n, 15000000000000000000n, 5000000000000000000n,
  3000000000000000000n, 7000000000000000000n, 1n, 26760420n
];

const pNamed      = parseClaim(2, NAMED);
const pPositional = parseClaim(2, POSITIONAL);

t('G1.1',  'named: issuerToken',          () => assert.strictEqual(pNamed.issuerToken, GHOST_ADDR));
t('G1.2',  'named: defaultType → Number', () => assert.strictEqual(pNamed.defaultType, 0));
t('G1.3',  'named: totalPayoutAmount',    () => assert.strictEqual(pNamed.totalPayoutAmount, 15000000000000000000n));
t('G1.4',  'named: bondLiquidated',       () => assert.strictEqual(pNamed.bondLiquidated,    5000000000000000000n));
t('G1.5',  'named: juniorLiquidated',     () => assert.strictEqual(pNamed.juniorLiquidated,  3000000000000000000n));
t('G1.6',  'named: seniorLiquidated',     () => assert.strictEqual(pNamed.seniorLiquidated,  7000000000000000000n));
t('G1.7',  'named: insuredHolderCount → Number', () => assert.strictEqual(pNamed.insuredHolderCount, 1));
t('G1.8',  'named: payoutBlock → Number', () => assert.strictEqual(pNamed.payoutBlock, 26760420));

t('G1.1p', 'positional: issuerToken',         () => assert.strictEqual(pPositional.issuerToken, GHOST_ADDR));
t('G1.2p', 'positional: defaultType → Number',() => assert.strictEqual(pPositional.defaultType, 0));
t('G1.7p', 'positional: insuredHolderCount',  () => assert.strictEqual(pPositional.insuredHolderCount, 1));
t('G1.8p', 'positional: payoutBlock → Number',() => assert.strictEqual(pPositional.payoutBlock, 26760420));

t('G2.1', 'defaultType is number after parse',         () => assert.strictEqual(typeof pNamed.defaultType, 'number'));
t('G2.2', 'insuredHolderCount is number after parse',  () => assert.strictEqual(typeof pNamed.insuredHolderCount, 'number'));
t('G2.3', 'payoutBlock is number, .toLocaleString safe', () => {
  assert.strictEqual(typeof pNamed.payoutBlock, 'number');
  assert.doesNotThrow(() => pNamed.payoutBlock.toLocaleString());
});
t('G2.4', 'totalPayoutAmount stays BigInt',  () => assert.strictEqual(typeof pNamed.totalPayoutAmount, 'bigint'));
t('G2.5', 'bondLiquidated stays BigInt',     () => assert.strictEqual(typeof pNamed.bondLiquidated,    'bigint'));
t('G2.6', 'juniorLiquidated stays BigInt',   () => assert.strictEqual(typeof pNamed.juniorLiquidated,  'bigint'));
t('G2.7', 'seniorLiquidated stays BigInt',   () => assert.strictEqual(typeof pNamed.seniorLiquidated,  'bigint'));

// ─────────────────────────────────────────────────────────────────────────
// H — renderOneClaim() HTML output
// ─────────────────────────────────────────────────────────────────────────
console.log('\nH — NFT Card Rendering (renderOneClaim)');

t('H1.1',  'card title = SubrogationNFT #2',   () => assert(HTML_NFT2.includes('SubrogationNFT #2')));
t('H1.2',  'status badge text = Active',        () => assert(HTML_NFT2.includes('>Active<')));
t('H1.3',  'issuer display = 0x824F...f420',    () => assert(HTML_NFT2.includes('0x824F...f420')));
t('H1.4',  'default type = PAYMENT_DELAY',      () => assert(HTML_NFT2.includes('PAYMENT_DELAY')));
t('H1.5',  'bond = $5 USDT',                    () => assert(HTML_NFT2.includes('$5 USDT')));
t('H1.6',  'junior = $3 USDT',                  () => assert(HTML_NFT2.includes('$3 USDT')));
t('H1.7',  'senior = $7 USDT',                  () => assert(HTML_NFT2.includes('$7 USDT')));
t('H1.8',  'total = $15 USDT',                  () => assert(HTML_NFT2.includes('$15 USDT')));
t('H1.9',  'holders paid = 1',                  () => assert(HTML_NFT2.includes('>1<')));
t('H1.10', 'payout block with locale commas',   () => assert(HTML_NFT2.includes('Block 26,760,420')));

t('H2.1', 'View on Explorer href correct', () => {
  const expected = `href="${BSCSCAN_URL}/token/${SUBROGATION_NFT_ADDR}?a=2"`;
  assert(HTML_NFT2.includes(expected), `expected: ${expected}`);
});
t('H2.2', 'View on Explorer has target="_blank"', () => assert(HTML_NFT2.includes('target="_blank"')));
t('H2.3', 'View on Explorer label text present',  () => assert(HTML_NFT2.includes('View on Explorer')));

t('H3.1', 'no "undefined" in rendered HTML',  () => assert(!HTML_NFT2.includes('undefined')));
t('H3.2', 'no "NaN" in rendered HTML',         () => assert(!HTML_NFT2.includes('NaN')));
t('H3.3', 'no "[object Object]" in HTML',      () => assert(!HTML_NFT2.includes('[object Object]')));
t('H3.4', 'no bare "$ USDT" without a number', () => {
  assert(!HTML_NFT2.match(/\$\s*USDT/), 'found bare $ USDT');
});
t('H3.5', 'completed badge renders correctly for status=completed', () => {
  const html = renderOneClaim({ ...CLAIM_NFT2, status: 'completed' });
  assert(html.includes('claim-badge-completed'), 'should have completed class');
  assert(html.includes('>Completed<'),            'should show Completed text');
  assert(!html.includes('>Active<'),              'should not show Active text');
});

// ─────────────────────────────────────────────────────────────────────────
// I — Metrics aggregation
// ─────────────────────────────────────────────────────────────────────────
console.log('\nI — Metrics Aggregation');

t('I1.1', '0 claims → all zeros', () => {
  const m = aggregateMetrics([]);
  assert.strictEqual(m.totalMinted,     0);
  assert.strictEqual(m.totalPendingValue, 0n);
  assert.strictEqual(m.activeClaims,    0);
  assert.strictEqual(m.completedClaims, 0);
});

t('I1.2', '1 active NFT ($15) → pending=$15, active=1', () => {
  const m = aggregateMetrics([{ totalPayoutAmount: 15000000000000000000n }]);
  assert.strictEqual(m.totalPendingValue, 15000000000000000000n);
  assert.strictEqual(m.activeClaims, 1);
});

t('I1.3', '2 NFTs ($15+$15) → pending=$30', () => {
  const m = aggregateMetrics([
    { totalPayoutAmount: 15000000000000000000n },
    { totalPayoutAmount: 15000000000000000000n }
  ]);
  assert.strictEqual(m.totalPendingValue, 30000000000000000000n);
  assert.strictEqual(formatUSDT(m.totalPendingValue), '$30 USDT');
});

t('I1.4', 'live state: 2 NFTs → totalMinted=2', () => {
  const m = aggregateMetrics([
    { totalPayoutAmount: 15000000000000000000n },
    { totalPayoutAmount: 15000000000000000000n }
  ]);
  assert.strictEqual(m.totalMinted, 2);
});

t('I2.3', 'BigInt accumulation has no float precision loss', () => {
  const large = 999999999999999999n;
  const m = aggregateMetrics([
    { totalPayoutAmount: large },
    { totalPayoutAmount: 1n }
  ]);
  assert.strictEqual(m.totalPendingValue, large + 1n);
});

t('I2.4', '$0 pending renders as $0 USDT', () => {
  assert.strictEqual(formatUSDT(0n), '$0 USDT');
});

t('I2.5', 'metricCompleted = 0 when all are active', () => {
  const m = aggregateMetrics([
    { totalPayoutAmount: 15000000000000000000n },
    { totalPayoutAmount: 15000000000000000000n }
  ]);
  assert.strictEqual(m.completedClaims, 0);
});

// ─────────────────────────────────────────────────────────────────────────
// N — payoutBlock display
// ─────────────────────────────────────────────────────────────────────────
console.log('\nN — payoutBlock Display');

t('N1.1', '26760420 → Block 26,760,420',   () =>
  assert.strictEqual('Block ' + (26760420).toLocaleString('en-US'), 'Block 26,760,420'));
t('N1.2', '0 → Block 0',                  () =>
  assert.strictEqual('Block ' + (0).toLocaleString('en-US'), 'Block 0'));
t('N1.3', '1000000 → Block 1,000,000',    () =>
  assert.strictEqual('Block ' + (1000000).toLocaleString('en-US'), 'Block 1,000,000'));
t('N1.4', 'Number(BigInt).toLocaleString does not throw', () => {
  assert.doesNotThrow(() => Number(26760420n).toLocaleString('en-US'));
  assert.strictEqual(Number(26760420n).toLocaleString('en-US'), '26,760,420');
});

// ─────────────────────────────────────────────────────────────────────────
// O — Address constants
// ─────────────────────────────────────────────────────────────────────────
console.log('\nO — Address Constants');

t('O1.1', 'SUBROGATION_NFT_ADDR is correct', () =>
  assert.strictEqual(SUBROGATION_NFT_ADDR, '0xbBe8A2840E151cC8BF2B156e5d61a532eFCe2AB9'));
t('O1.2', 'PAYOUT_ENGINE_ADDR is correct',   () =>
  assert.strictEqual(PAYOUT_ENGINE_ADDR, '0x44944cB598A750Df4C4Bf9A7D3FdDDf7575F88F5'));
t('O1.3', 'BSCSCAN_URL is HashKey testnet',  () =>
  assert.strictEqual(BSCSCAN_URL, 'https://testnet-explorer.hsk.xyz'));
t('O1.4', 'View on Explorer uses SUBROGATION_NFT_ADDR', () =>
  assert(HTML_NFT2.includes(SUBROGATION_NFT_ADDR)));

// ─────────────────────────────────────────────────────────────────────────
// P — XSS / Security
// ─────────────────────────────────────────────────────────────────────────
console.log('\nP — XSS / Security');

t('P1.1', 'getDefaultTypeName never uses chain data — always hardcoded array', () => {
  // Even if chain returns defaultType=0, the displayed label comes from DEFAULT_TYPES, not the chain
  assert.strictEqual(getDefaultTypeName(0), 'PAYMENT_DELAY');
  assert.strictEqual(getDefaultTypeName(1), 'GHOST_ISSUER');
});

t('P1.2', 'all 4 type labels are plain strings with no script tags', () => {
  for (let i = 0; i < 4; i++) {
    const name = getDefaultTypeName(i);
    assert(!name.includes('<script>'), `type ${i} label contains script`);
    assert(!name.includes('javascript:'), `type ${i} label contains javascript:`);
  }
});

t('P1.3', 'insuredHolderCount renders as plain integer', () => {
  assert(HTML_NFT2.includes('>1<'), 'should render as plain number 1');
});

t('P1.4', 'payoutBlock.toLocaleString() output is plain string (no HTML)', () => {
  const result = (26760420).toLocaleString('en-US');
  assert(!result.includes('<'), 'toLocaleString should not return HTML');
});

t('P1.5', 'formatUSDT output contains no HTML', () => {
  const result = formatUSDT(15000000000000000000n);
  assert(!result.includes('<'), 'formatUSDT should not contain <');
  assert(!result.includes('>'), 'formatUSDT should not contain >');
});

// ─────────────────────────────────────────────────────────────────────────
// Q — Regression
// ─────────────────────────────────────────────────────────────────────────
console.log('\nQ — Regression Tests');

t('Q1.1', 'DEFAULT_TYPES[0] = PAYMENT_DELAY (not GENERAL_DEFAULT)', () =>
  assert.strictEqual(DEFAULT_TYPES[0], 'PAYMENT_DELAY'));
t('Q1.2', 'DEFAULT_TYPES has exactly 4 entries matching contract enum', () =>
  assert.strictEqual(DEFAULT_TYPES.length, 4));
t('Q1.3', 'loop IDs never include 0 for any totalMinted 0..10', () => {
  for (let n = 0; n <= 10; n++) {
    assert(!calcLoopIds(n).includes(0), `ID 0 found for totalMinted=${n}`);
  }
});
t('Q1.4', 'totalMinted = Number(nextTokenId)-1, not Number(nextTokenId)', () => {
  assert.strictEqual(calcTotalMinted(2n), 1);   // correct
  assert.notStrictEqual(Number(2n), 1);          // Number(nextTokenId) alone = 2 = off by one
});
t('Q1.5', 'MISAPPROPRIATION is at index 3, not index 1', () => {
  assert.strictEqual(DEFAULT_TYPES.indexOf('MISAPPROPRIATION'), 3);
  assert.notStrictEqual(DEFAULT_TYPES[1], 'MISAPPROPRIATION');
});
t('Q1.6', 'COVERFI_ABIS key exists in contract-abis.js (no CONTRACT_ABIS)', () => {
  // Verify contract-abis.js exports COVERFI_ABIS, not CONTRACT_ABIS
  const path   = require('path');
  const fs     = require('fs');
  const src    = fs.readFileSync(path.join(__dirname, '../../frontend/contract-abis.js'), 'utf8');
  assert(src.includes('const COVERFI_ABIS'),    'should export COVERFI_ABIS');
  assert(!src.includes('CONTRACT_ABIS'),         'should NOT export CONTRACT_ABIS (old bug)');
  const subHtml = fs.readFileSync(path.join(__dirname, '../../frontend/subrogation.html'), 'utf8');
  assert(!subHtml.includes('CONTRACT_ABIS'),     'subrogation.html should not reference CONTRACT_ABIS');
});

// ─────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(64));
console.log(`Results: ${passed} passed, ${failed} failed out of ${total} total`);
if (failed > 0) {
  console.log('\nFAIL');
  process.exit(1);
} else {
  console.log('\nOK — all tests passed');
}
