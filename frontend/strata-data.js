/* ============================================================
   Strata — unified data layer
   - Lazy ethers (CDN) only when a live read is requested.
   - Promise.allSettled reads with last-known cache + RPC health-check.
   - Single IRS score store; every datum carries {source:'chain'|'ai'|'replay'}.
   - Emits state events: 'loading' | 'ok' | 'empty' | 'error' | 'stale'.
   Depends on: strata-config.js (window.STRATA_CONFIG), strata-scoring.js.
   ============================================================ */
(function () {
  var CFG = window.STRATA_CONFIG || {};
  var SC = window.StrataScoring || {};

  // ---------- tiny event bus ----------
  var subs = {};
  function on(ev, cb) { (subs[ev] = subs[ev] || []).push(cb); return cb; }
  function emit(ev, payload) { (subs[ev] || []).forEach(function (cb) { try { cb(payload); } catch (e) {} }); }
  function state(scope, st, detail) { emit('state', { scope: scope, state: st, detail: detail || null }); }

  // ---------- in-memory + localStorage cache ----------
  var mem = {};
  function cacheGet(key) {
    if (mem[key]) return mem[key];
    try { var raw = localStorage.getItem('strata.' + key); if (raw) { mem[key] = JSON.parse(raw); return mem[key]; } } catch (e) {}
    return null;
  }
  function cacheSet(key, val) {
    mem[key] = val;
    try { localStorage.setItem('strata.' + key, JSON.stringify(val)); } catch (e) {}
  }

  // ---------- lazy ethers ----------
  var ethersP = null;
  function loadEthers() {
    if (typeof ethers !== 'undefined') return Promise.resolve();
    if (ethersP) return ethersP;
    ethersP = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/ethers@6.13.4/dist/ethers.umd.min.js';
      s.onload = res; s.onerror = function () { rej(new Error('ethers CDN load failed')); };
      document.head.appendChild(s);
    });
    return ethersP;
  }
  var _provider = null;
  function provider() {
    if (!CFG.rpc) throw new Error('no RPC configured');
    if (!_provider) _provider = new ethers.JsonRpcProvider(CFG.rpc);
    return _provider;
  }

  // ---------- health check ----------
  var health = { ok: null, latencyMs: null, at: null };
  async function healthCheck() {
    state('rpc', 'loading');
    try {
      await loadEthers();
      var t0 = Date.now();
      await provider().getBlockNumber();
      health = { ok: true, latencyMs: Date.now() - t0, at: Date.now() };
      state('rpc', 'ok', health);
    } catch (e) {
      health = { ok: false, latencyMs: null, at: Date.now(), error: e.shortMessage || e.message };
      state('rpc', 'error', health);
    }
    return health;
  }

  // ---------- on-chain: TuringBenchmark.tally() ----------
  async function getTally() {
    var key = 'tally';
    state(key, 'loading');
    if (!CFG.addresses || !CFG.addresses.TuringBenchmark) {
      var c0 = cacheGet(key);
      state(key, c0 ? 'stale' : 'empty');
      return c0 || null;
    }
    try {
      await loadEthers();
      var bench = new ethers.Contract(CFG.addresses.TuringBenchmark,
        ['function tally() view returns (uint256,uint256,int256)'], provider());
      var r = await bench.tally();
      var out = { ai: Number(r[0]), st: Number(r[1]), avg: Number(r[2]), source: 'chain', at: Date.now() };
      cacheSet(key, out);
      state(key, 'ok', out);
      return out;
    } catch (e) {
      var c = cacheGet(key);
      state(key, c ? 'stale' : 'error', e.shortMessage || e.message);
      return c || null;
    }
  }

  // ---------- issuer leaderboard ----------
  // Seed = AI-computed credit book. The USDC row is the live SVB replay subject.
  // (Leaderboard is provenance 'ai'/'replay'; only tally + reputation are on-chain.)
  function clampD(x, lo, hi) { return SC.clamp ? SC.clamp(x, lo, hi) : Math.max(lo, Math.min(hi, x)); }
  function synthComponents(irs) {
    return {
      nav: Math.round(clampD(irs + 10, 0, 1000)),
      att: Math.round(clampD(irs - 15, 0, 1000)),
      rep: Math.round(clampD(irs + 25, 0, 1000)),
      col: Math.round(clampD(irs * 12, 0, 12000)),
      act: Math.round(clampD(irs - 60, 0, 1000)),
      sent: Math.round(clampD(irs + 5, 0, 1000))
    };
  }
  function usdcRow() {
    var D = (SC.DATA && SC.DATA.length) ? SC.DATA[SC.DATA.length - 1] : { ai: 640, pd: 3600, prem: 660, col: 9950 };
    var spark = (SC.DATA || []).map(function (d) { return d.ai; });
    return { id: 'usdc', token: '0xA0b8…6eB48', label: 'USDC · Circle', sector: 'Stablecoin / T-bill',
      irs: D.ai, pd: D.pd, premium: D.prem, bond: 5.0, delta7d: -18.4, recency: 0.2,
      exposure: 4200000, spark: spark, source: 'replay',
      components: { nav: D.nav, att: D.att, rep: D.rep, col: D.col, act: D.act, sent: D.sent } };
  }
  function seedIssuers() {
    var rows = [
      { id: 'maple',      token: '0x7f2C…91Ae', label: 'Maple · BlueChip', sector: 'Private credit', irs: 812, bond: 7.5, delta7d: 1.2, recency: 0.4, exposure: 9100000 },
      { id: 'centrifuge', token: '0x3De1…77b0', label: 'Centrifuge · Anemoy', sector: 'T-bill fund', irs: 774, bond: 6.0, delta7d: 0.6, recency: 1.1, exposure: 6300000 },
      { id: 'goldfinch',  token: '0x91F7…2c4d', label: 'Goldfinch · Prime', sector: 'Fund of funds', irs: 690, bond: 5.5, delta7d: -2.1, recency: 0.8, exposure: 5400000 },
      { id: 'clearpool',  token: '0xB104…dE22', label: 'Clearpool · Auralis', sector: 'Institutional', irs: 540, bond: 5.0, delta7d: -6.8, recency: 2.3, exposure: 2200000 },
      { id: 'ondo',       token: '0x55aa…0F19', label: 'Ondo · OUSG', sector: 'Treasuries', irs: 858, bond: 8.0, delta7d: 0.3, recency: 0.5, exposure: 12500000 }
    ];
    rows.forEach(function (r) {
      r.pd = Math.round(10000 * (1 - r.irs / 1000));
      r.premium = SC.premiumBps ? SC.premiumBps(r.irs) : 800;
      r.source = 'ai';
      r.spark = mkSpark(r.irs, r.delta7d);
      r.components = synthComponents(r.irs);
    });
    rows.unshift(usdcRow());
    return rows;
  }
  function mkSpark(end, delta) {
    var pts = [], start = SC.clamp ? SC.clamp(end - delta * 4, 0, 1000) : end - delta * 4;
    for (var i = 0; i < 9; i++) {
      var t = i / 8, base = start + (end - start) * t;
      var wob = Math.sin(i * 1.7) * 9; // deterministic, no Math.random
      pts.push(Math.round(Math.max(0, Math.min(1000, base + wob))));
    }
    pts[pts.length - 1] = end;
    return pts;
  }

  var _issuers = null;
  function getIssuers() {
    state('issuers', 'loading');
    if (!_issuers) _issuers = seedIssuers();
    // single score store
    _issuers.forEach(function (r) { mem['score.' + r.token] = r.irs; });
    state('issuers', _issuers.length ? 'ok' : 'empty');
    return _issuers;
  }
  function getIssuerScore(token) { return mem['score.' + token]; } // single source of truth
  function getIssuer(id) {
    var list = getIssuers();
    return list.filter(function (r) { return r.id === id; })[0] || list[0];
  }

  // ---------- KPI roll-up ----------
  function getKPIs(tally) {
    var iss = getIssuers();
    var bonded = iss.reduce(function (a, r) { return a + r.exposure * (r.bond / 100); }, 0);
    var tvl = iss.reduce(function (a, r) { return a + r.exposure; }, 0);
    return {
      bonded: bonded, tvl: tvl, issuers: iss.length,
      aiWins: tally ? tally.ai : (SC.aiLead > SC.stLead ? 1 : 0),
      avgLead: tally ? tally.avg : (SC.aiLead - SC.stLead),
      openClaims: 1,
      bondedSource: 'ai', tvlSource: 'ai',
      aiWinsSource: tally && tally.source === 'chain' ? 'chain' : 'ai',
      avgLeadSource: tally && tally.source === 'chain' ? 'chain' : 'replay'
    };
  }

  window.StrataData = {
    on: on, emit: emit,
    loadEthers: loadEthers, healthCheck: healthCheck, health: function () { return health; },
    getTally: getTally, getIssuers: getIssuers, getIssuer: getIssuer, getIssuerScore: getIssuerScore, getKPIs: getKPIs,
    fmtUSD: function (n) {
      if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
      if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
      return '$' + Math.round(n);
    }
  };
})();
