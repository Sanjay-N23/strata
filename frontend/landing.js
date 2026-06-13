/* ============================================================
   Strata — Landing motion controllers (vanilla)
   Motion patterns inspired by Skiper UI, ported to vanilla CSS/JS.
   Depends on strata-scoring.js (for the hero/proof replay data).
   ============================================================ */
(function () {
  var SC = window.StrataScoring || { DATA: [], ALARM: 300, aiLead: 3, stLead: 0 };
  var DATA = SC.DATA && SC.DATA.length ? SC.DATA : [];
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // ---------- nav: blur on scroll ----------
  function initNav() {
    var nav = $('.ld-nav');
    if (!nav) return;
    var onScroll = function () { nav.classList.toggle('scrolled', window.scrollY > 20); };
    onScroll(); window.addEventListener('scroll', onScroll, { passive: true });
    var burger = $('.ld-burger'), drawer = $('.ld-drawer');
    if (burger && drawer) {
      burger.addEventListener('click', function () {
        var open = burger.classList.toggle('open'); drawer.classList.toggle('open', open);
      });
      $$('a', drawer).forEach(function (a) { a.addEventListener('click', function () { burger.classList.remove('open'); drawer.classList.remove('open'); }); });
    }
  }

  // ---------- scroll reveal ----------
  function inView(el, slack) { var r = el.getBoundingClientRect(); return r.top < (window.innerHeight * (slack || 0.92)) && r.bottom > 0; }
  function initReveal() {
    var els = $$('.ld-reveal, .ld-stagger');
    document.documentElement.classList.add('ld-js'); // enables the hidden->animate states (content is visible without this)
    if (!('IntersectionObserver' in window) || reduce) { els.forEach(function (e) { e.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (e) { if (inView(e)) e.classList.add('in'); else io.observe(e); }); // above-the-fold reveals instantly
  }

  // ---------- count up ----------
  function initCounts() {
    var els = $$('[data-count]');
    if (reduce) { els.forEach(function (e) { e.textContent = e.getAttribute('data-count') + (e.getAttribute('data-suffix') || ''); }); return; }
    var run = function (el) {
      if (el._ran) return; el._ran = true;
      var target = parseFloat(el.getAttribute('data-count')), suffix = el.getAttribute('data-suffix') || '';
      var dec = (el.getAttribute('data-dec') | 0), t0 = null, dur = 1200, fin = target.toFixed(dec) + suffix;
      var failsafe = setTimeout(function () { el.textContent = fin; }, 1400); // shows final even if rAF is throttled
      var step = function (ts) {
        if (!t0) t0 = ts; var p = Math.min((ts - t0) / dur, 1), e = 1 - Math.pow(1 - p, 3);
        el.textContent = (target * e).toFixed(dec) + suffix;
        if (p < 1) requestAnimationFrame(step); else { clearTimeout(failsafe); el.textContent = fin; }
      };
      requestAnimationFrame(step);
    };
    if (!('IntersectionObserver' in window)) { els.forEach(run); return; }
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { run(e.target); io.unobserve(e.target); } }); }, { threshold: 0.6 });
    els.forEach(function (e) { if (inView(e, 1)) run(e); else io.observe(e); }); // in-view counters start immediately
  }

  // ---------- replay chart builder (shared hero + popover) ----------
  function chartSVG(w, h) {
    if (!DATA.length) return '';
    var P = { x0: 38, y0: 14, w: w - 54, h: h - 40 };
    var X = function (e) { return P.x0 + (e / 8) * P.w; };
    var Y = function (v) { return P.y0 + (1 - Math.max(0, Math.min(1000, v)) / 1000) * P.h; };
    var line = function (key) { return DATA.map(function (d) { return X(d.epoch) + ',' + Y(key === 'st' ? d.st : d.ai); }).join(' '); };
    var g = '';
    [0, 250, 500, 750, 1000].forEach(function (v) { var y = Y(v); g += '<line x1="' + P.x0 + '" y1="' + y + '" x2="' + (P.x0 + P.w) + '" y2="' + y + '" stroke="var(--border)"/>'; });
    g += '<line x1="' + P.x0 + '" y1="' + Y(SC.ALARM) + '" x2="' + (P.x0 + P.w) + '" y2="' + Y(SC.ALARM) + '" stroke="var(--red)" stroke-width="1.4" stroke-dasharray="5 4"/>';
    g += '<text x="' + (P.x0 + P.w - 4) + '" y="' + (Y(SC.ALARM) - 5) + '" text-anchor="end" fill="var(--red)" font-family="var(--mono)" font-size="10">distress 300</text>';
    g += '<polyline class="ld-pl ld-pl-st" points="' + line('st') + '" fill="none" stroke="var(--muted)" stroke-width="2" stroke-dasharray="2 3"/>';
    g += '<polyline class="ld-pl ld-pl-ai" points="' + line('ai') + '" fill="none" stroke="var(--ai)" stroke-width="2.6"/>';
    DATA.forEach(function (d) { g += '<circle cx="' + X(d.epoch) + '" cy="' + Y(d.ai) + '" r="2.6" fill="var(--ai)"/>'; });
    return g;
  }
  function drawLoop(svg) {
    if (!svg) return;
    var pls = $$('.ld-pl', svg);
    pls.forEach(function (pl, i) {
      var len = 0; try { len = pl.getTotalLength(); } catch (e) { len = 1200; }
      if (reduce) { pl.style.strokeDasharray = 'none'; return; }
      pl.style.strokeDasharray = len; pl.style.strokeDashoffset = len;
      pl.animate([
        { strokeDashoffset: len, offset: 0 },
        { strokeDashoffset: 0, offset: 0.62 },
        { strokeDashoffset: 0, offset: 1 }
      ], { duration: 4200, iterations: Infinity, delay: i * 350, easing: 'cubic-bezier(.5,0,.2,1)' });
    });
  }

  // ---------- hero figure + popover ----------
  function initHero() {
    var fig = $('#ldHeroChart');
    if (fig) { fig.innerHTML = chartSVG(560, 240); drawLoop(fig); }
    var herofig = $('#ldHerofig'), cursor = $('#ldCursor');
    if (herofig && cursor && !reduce) {
      herofig.addEventListener('pointermove', function (e) {
        var b = herofig.getBoundingClientRect();
        cursor.style.left = (e.clientX - b.left) + 'px'; cursor.style.top = (e.clientY - b.top) + 'px'; cursor.style.opacity = '1';
      });
      herofig.addEventListener('pointerleave', function () { cursor.style.opacity = '0'; });
    }
    var pop = $('#ldPop'), popChart = $('#ldPopChart');
    var open = function () { if (!pop) return; if (popChart && !popChart.innerHTML) { popChart.innerHTML = chartSVG(1040, 560); drawLoop(popChart); } pop.classList.add('open'); document.body.style.overflow = 'hidden'; };
    var close = function () { if (!pop) return; pop.classList.remove('open'); document.body.style.overflow = ''; };
    if (herofig) herofig.addEventListener('click', open);
    $$('[data-watch]').forEach(function (b) { b.addEventListener('click', function (e) { e.preventDefault(); open(); }); });
    if (pop) { $('.ld-pop-bg', pop) && $('.ld-pop-bg', pop).addEventListener('click', close); $('.ld-pop-close', pop) && $('.ld-pop-close', pop).addEventListener('click', close); }
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  }

  // ---------- spine: lime green scroll ribbon ----------
  var SVGNS = 'http://www.w3.org/2000/svg';
  function apexCount(H) { return Math.max(4, Math.round(H / 520)); }
  function ribbonPath(W, H) {
    var segs = apexCount(H), midX = W * 0.5, ya = H / segs, d = 'M ' + midX.toFixed(1) + ' 0';
    for (var i = 1; i <= segs; i++) {
      var nx = (i % 2 === 1) ? W * 0.76 : W * 0.24, y0 = ya * (i - 1), y1 = ya * i;
      d += ' C ' + nx.toFixed(1) + ' ' + (y0 + ya * 0.5).toFixed(1) + ', ' + nx.toFixed(1) + ' ' + (y1 - ya * 0.5).toFixed(1) + ', ' + midX.toFixed(1) + ' ' + y1.toFixed(1);
    }
    return d;
  }
  function initSpine() {
    var spine = $('#ldSpine'), svg = $('#ldSpineSvg'), ribbon = $('#ldRibbon'), bg = $('#ldRibbonBg');
    if (!spine || !ribbon || !svg) return;
    var len = 0, dots = [];
    function build() {
      var W = spine.clientWidth, H = spine.clientHeight;
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.setAttribute('width', W); svg.setAttribute('height', H);
      var d = ribbonPath(W, H);
      ribbon.setAttribute('d', d); bg.setAttribute('d', d);
      try { len = ribbon.getTotalLength(); } catch (e) { len = H * 1.4; }
      ribbon.style.strokeDasharray = len;
      ribbon.style.strokeDashoffset = reduce ? 0 : len;
      dots.forEach(function (c) { if (c.parentNode) c.parentNode.removeChild(c); }); dots = [];
      var segs = apexCount(H);
      for (var i = 1; i < segs; i++) {
        var pt; try { pt = ribbon.getPointAtLength(len * (i / segs)); } catch (e) { pt = { x: W / 2, y: H * i / segs }; }
        var c = document.createElementNS(SVGNS, 'circle');
        c.setAttribute('cx', pt.x); c.setAttribute('cy', pt.y); c.setAttribute('r', 5);
        c.setAttribute('fill', '#C2F84F'); c.setAttribute('class', 'ld-wp');
        c.style.opacity = reduce ? 1 : 0.15; c._frac = i / segs;
        svg.appendChild(c); dots.push(c);
      }
    }
    function onScroll() {
      if (reduce) return;
      var r = spine.getBoundingClientRect(), vh = window.innerHeight;
      var total = r.height - vh * 0.5;
      var p = total > 0 ? Math.max(0, Math.min(1, (vh * 0.55 - r.top) / total)) : 0;
      ribbon.style.strokeDashoffset = len * (1 - p);
      dots.forEach(function (c) { c.style.opacity = p >= c._frac ? 1 : 0.15; });
    }
    build(); onScroll();
    var ticking = false;
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(function () { ticking = false; onScroll(); }); } }, { passive: true });
    var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { build(); onScroll(); }, 150); });
    setTimeout(function () { build(); onScroll(); }, 700); // recompute after fonts/iframes settle
  }

  // ---------- hover-expand gallery ----------
  function initGallery() {
    var strips = $$('.ld-strip');
    if (!strips.length) return;
    var activate = function (s) {
      strips.forEach(function (x) { x.classList.toggle('active', x === s); });
      var fr = $('iframe.frame', s);
      if (fr && !fr.src && fr.getAttribute('data-src')) {
        var sc = +(fr.getAttribute('data-scroll') || 0);
        if (sc) fr.addEventListener('load', function () { try { fr.contentWindow.scrollTo(0, sc); } catch (e) {} });
        fr.src = fr.getAttribute('data-src'); // lazy-load on first activation
      }
    };
    strips.forEach(function (s, i) {
      s.addEventListener('mouseenter', function () { if (!('ontouchstart' in window)) activate(s); });
      s.addEventListener('click', function () { activate(s); });
      if (i === 0) activate(s);
    });
  }

  // ---------- activity feed (scroll-fade list) ----------
  function initFeed() {
    var box = $('#ldFeed'); if (!box) return;
    var ev = [
      ['e8', '<b>AI</b> holds USDC at 660 bps · PD 19%'],
      ['e7', 'Rulebook still reads 350 — AI already alarmed'],
      ['e6', '<b>AI proposed</b> COLLATERAL_SHORTFALL · 2-of-3 pending'],
      ['e5', '<b>AI</b> crossed distress (score 130) — rulebook calm'],
      ['e4', 'Sentiment 200 → caution haircut applied'],
      ['e3', '<b>AI early-warning</b>: sentiment 330, repriced'],
      ['e2', 'Sentiment 520 — divergence from rulebook begins'],
      ['e1', 'NAV/attestation steady; sentiment dips to 740'],
      ['e0', 'Calm. USDC $1.00, reserves healthy — score 810']
    ];
    box.innerHTML = ev.map(function (e) { return '<div class="row"><span class="ts">' + e[0] + '</span><span class="msg">' + e[1] + '</span></div>'; }).join('');
  }

  // ---------- agent-CLI terminal: content + rise-on-scroll ----------
  function initTerm() {
    var body = $('#ldTermBody'); if (!body) return;
    var L = [
      '<span class="c-p">$</span> <span class="c-cmd">NETWORK=mantleSepolia npx ts-node agent/index.ts</span>',
      '<span class="c-mut">Strata agent operator 0xce22…2fb3 on mantleSepolia</span>',
      '<span class="c-mut">Replaying: USDC (Circle) — SVB depeg, Mar 2023</span>',
      '',
      '<span class="c-ai">epoch 0</span>  AI 957 | static 953 | PD  4.3%   <span class="c-mut">fundamentals — calm</span>',
      '<span class="c-ai">epoch 2</span>  AI 646 | static 943 | PD 35.4%   <span class="c-amber">elevated fear → haircut</span>',
      '<span class="c-ai">epoch 3</span>  AI <span class="c-alarm">250</span> | static 926 | PD 75.0%   <span class="c-alarm">⚠ AI ALARMS — rulebook calm</span>',
      '<span class="c-ai">epoch 6</span>  AI 180 | static 180            <span class="c-mut">← USDC depeg (event)</span>',
      '<span class="c-alarm">→ proposeDefault flagged</span> <span class="c-mut">· awaiting 2-of-3 human gate</span>',
      '<span class="c-ok">✓ TuringBenchmark.tally() → AI 1 · static 0 · +3 epochs early</span>'
    ];
    body.innerHTML = L.join('\n');
  }
  function initTermRise() {
    var t = $('#ldTerm'); if (!t) return;
    if (reduce) { t.style.transform = 'none'; t.style.opacity = '1'; return; }
    var frame = function () {
      var r = t.getBoundingClientRect(), vh = window.innerHeight || 800;
      var p = (vh - r.top) / (vh * 0.72); p = Math.max(0, Math.min(1, p));
      t.style.transform = 'perspective(1400px) translateY(' + ((1 - p) * 90).toFixed(1) + 'px) scale(' + (0.92 + p * 0.08).toFixed(3) + ')';
      t.style.opacity = (0.3 + p * 0.7).toFixed(2);
    };
    var ticking = false;
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(function () { ticking = false; frame(); }); } }, { passive: true });
    window.addEventListener('resize', frame);
    frame();
  }

  function init() { initNav(); initReveal(); initCounts(); initHero(); initTerm(); initTermRise(); initSpine(); initGallery(); initFeed(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
