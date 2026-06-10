/* ============================================================
   Strata — shared scoring + replay dataset
   Formulas extracted verbatim from the original console.html
   (mirror IRSOracle.computeStaticScore / staticPremiumBps + agent/pdModel).
   One implementation, consumed by console.html and overview.html.
   ============================================================ */
(function () {
  // ── USDC–SVB replay dataset (mirrors agent/data/usdc_svb.json) ──
  var EVENT_EPOCH = 6, ALARM = 300;
  var ROWS = [
    { epoch: 0, date: "2023-03-08",    nav: 960, att: 955, rep: 960, col: 10200, act: 750, sent: 920 },
    { epoch: 1, date: "2023-03-09 AM", nav: 950, att: 950, rep: 955, col: 10100, act: 740, sent: 740 },
    { epoch: 2, date: "2023-03-09 PM", nav: 945, att: 945, rep: 950, col: 10000, act: 720, sent: 520 },
    { epoch: 3, date: "2023-03-10 AM", nav: 935, att: 910, rep: 945, col: 9900,  act: 700, sent: 330 },
    { epoch: 4, date: "2023-03-10 PM", nav: 900, att: 880, rep: 900, col: 9500,  act: 680, sent: 200 },
    { epoch: 5, date: "2023-03-11",    nav: 720, att: 700, rep: 780, col: 8800,  act: 500, sent: 130 },
    { epoch: 6, date: "2023-03-11 PM", nav: 150, att: 150, rep: 150, col: 8700,  act: 200, sent: 110 },
    { epoch: 7, date: "2023-03-12",    nav: 300, att: 350, rep: 350, col: 9000,  act: 300, sent: 220 },
    { epoch: 8, date: "2023-03-13",    nav: 800, att: 820, rep: 850, col: 9950,  act: 600, sent: 640 }
  ];

  var clamp = function (x, lo, hi) { return Math.max(lo, Math.min(hi, x)); };

  function staticScore(s) {
    var nav = Math.floor(s.nav * 250 / 1000), att = Math.floor(s.att * 250 / 1000), rep = Math.floor(s.rep * 300 / 1000);
    var col = Math.floor(Math.min(s.col, 10000) * 150 / 10000), act = Math.floor(s.act * 50 / 1000);
    return Math.min(nav + att + rep + col + act, 1000);
  }
  function premiumBps(score) {
    if (score <= 0) return 1600; if (score >= 1000) return 400;
    return clamp(Math.round(1600 * Math.exp(-0.001386 * score)), 400, 1600);
  }
  function aiScore(s) {
    var n = function (x) { return clamp(x / 1000, 0, 1); }, col = clamp(s.col, 0, 10000) / 10000, sent = n(s.sent);
    var base = 1000 * (0.25 * n(s.nav) + 0.15 * n(s.att) + 0.15 * n(s.rep) + 0.20 * col + 0.25 * sent);
    var score, driver;
    if (sent < 0.35) { score = Math.min(base, 250); driver = "acute confidence collapse (sentiment) → distress override"; }
    else if (sent < 0.60) { score = base * (0.5 + 0.5 * sent); driver = "elevated market fear → caution haircut"; }
    else { score = base; driver = "fundamentals-driven (calm market)"; }
    score = Math.round(clamp(score, 0, 1000));
    return { score: score, pdBps: Math.round(10000 * (1 - score / 1000)), driver: driver };
  }

  // precompute the enriched series
  var DATA = ROWS.map(function (r) {
    var ai = aiScore(r);
    return { epoch: r.epoch, date: r.date, nav: r.nav, att: r.att, rep: r.rep, col: r.col, act: r.act, sent: r.sent,
      ai: ai.score, pd: ai.pdBps, drv: ai.driver, st: staticScore(r), prem: premiumBps(ai.score) };
  });
  function firstAlarm(arm) {
    for (var i = 0; i < DATA.length; i++) { var d = DATA[i];
      if (d.epoch > EVENT_EPOCH) break;
      if ((arm === 'ai' ? d.ai : d.st) < ALARM) return d.epoch; }
    return null;
  }
  var aiFirst = firstAlarm('ai'), stFirst = firstAlarm('st');
  var aiLead = aiFirst === null ? -1 : EVENT_EPOCH - aiFirst;
  var stLead = stFirst === null ? -1 : EVENT_EPOCH - stFirst;

  // band helper: map a 0..1000 score to a risk class
  function band(score) { return score >= 600 ? 'ok' : (score >= 300 ? 'warn' : 'bad'); }

  window.StrataScoring = {
    EVENT_EPOCH: EVENT_EPOCH, ALARM: ALARM,
    ROWS: ROWS, DATA: DATA,
    staticScore: staticScore, aiScore: aiScore, premiumBps: premiumBps,
    clamp: clamp, band: band,
    aiFirst: aiFirst, stFirst: stFirst, aiLead: aiLead, stLead: stLead
  };
})();
