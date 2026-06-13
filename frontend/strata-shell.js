/* ============================================================
   Strata — App Shell (sidebar + topbar) renderer
   Usage on a page:
     <body data-page="console" data-mode="replay" data-theme="dark">
       <aside class="stx-side" id="stxSide"></aside>
       <div class="stx-content">
         <header class="stx-top" id="stxTop"></header>
         <div class="stx-replay-banner">...optional, auto-managed...</div>
         <main class="stx-main"> ...page content... </main>
       </div>
       <script src="strata-config.js"></script>
       <script src="strata-shell.js"></script>
   Exposes window.Strata: { mode, setMode(), onMode(cb), config }.
   ============================================================ */
(function () {
  var CFG = window.STRATA_CONFIG || {};
  var MANTLE = {
    chainId: '0x138b', // 5003
    chainName: 'Mantle Sepolia Testnet',
    nativeCurrency: { name: 'Mantle', symbol: 'MNT', decimals: 18 },
    rpcUrls: ['https://rpc.sepolia.mantle.xyz'],
    blockExplorerUrls: ['https://explorer.sepolia.mantle.xyz']
  };

  var NAV = [
    { id: 'overview',   label: 'Overview',     href: 'overview.html', icon: 'grid' },
    { id: 'underwriter',label: 'Underwriter',  href: 'console.html',  icon: 'cpu' },
    { id: 'issuers',    label: 'Issuers',      href: 'issuers.html',  icon: 'building' },
    { id: 'capital',    label: 'Capital',      href: 'pool.html',     icon: 'layers' },
    { id: 'governance', label: 'Governance',   href: 'governance.html', icon: 'shield' },
    { id: 'incidents',  label: 'Incidents',    href: 'incidents.html',  icon: 'alert' }
  ];

  var ICONS = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    cpu: '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
    building: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 8h.01M15 8h.01M9 12h.01M15 12h.01M9 16h.01M15 16h.01"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 12l9 5 9-5M3 16l9 5 9-5"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>',
    bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    bolt: '<path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/>',
    alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'
  };
  function svg(name, cls) {
    return '<svg viewBox="0 0 24 24" ' + (cls ? 'class="' + cls + '" ' : '') +
      'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      (ICONS[name] || '') + '</svg>';
  }
  function short(a) { return a ? a.slice(0, 6) + '…' + a.slice(-4) : '—'; }

  // ---------- global mode bus ----------
  var listeners = [];
  var body = document.body;
  var Strata = {
    config: CFG,
    short: short,
    get mode() { return body.getAttribute('data-mode') || 'replay'; },
    setMode: function (m) {
      if (m !== 'live' && m !== 'replay') return;
      body.setAttribute('data-mode', m);
      syncModeUI();
      listeners.forEach(function (cb) { try { cb(m); } catch (e) {} });
    },
    onMode: function (cb) { listeners.push(cb); return cb; }
  };
  window.Strata = Strata;

  // ---------- render sidebar ----------
  function renderSide() {
    var side = document.getElementById('stxSide');
    if (!side) return;
    var page = body.getAttribute('data-page') || '';
    var logo = '<svg class="lg" viewBox="0 0 32 32"><rect x="5" y="20" width="22" height="4" rx="1" fill="#F0B90B"/>' +
      '<rect x="7" y="14" width="18" height="4" rx="1" fill="#5B8DEF"/><rect x="9" y="8" width="14" height="4" rx="1" fill="#16C784"/></svg>';
    var items = NAV.map(function (n) {
      var active = n.id === page ? ' class="active"' : '';
      return '<a href="' + n.href + '"' + active + '>' + svg(n.icon) +
        '<span>' + n.label + '</span>' + (n.tag ? '<span class="tagx">' + n.tag + '</span>' : '') + '</a>';
    }).join('');
    side.innerHTML =
      '<div class="stx-brand">' + logo + '<div>Strata<small>AI Underwriter</small></div></div>' +
      '<nav class="stx-nav"><div class="sec">Desk</div>' + items + '</nav>' +
      '<div class="stx-side-foot"><div class="stx-agent"><span class="dot" id="stxAgentDot"></span>' +
      '<span>Agent <b>#1</b> · <span id="stxAgentState">active</span></span></div></div>';
  }

  // ---------- render topbar ----------
  function pageTitle() {
    var page = body.getAttribute('data-page') || '';
    var n = NAV.filter(function (x) { return x.id === page; })[0];
    return n ? n.label : (document.title || 'Strata');
  }
  function renderTop() {
    var top = document.getElementById('stxTop');
    if (!top) return;
    top.innerHTML =
      '<button class="stx-burger" id="stxBurger">' + svg('menu') + '</button>' +
      '<div class="crumb">Strata <i>/</i>' + pageTitle() + '</div>' +
      '<div class="stx-search" id="stxSearch">' + svg('search') + '<span>Search issuer, address, pool…</span><kbd>⌘K</kbd></div>' +
      '<div class="stx-top-r">' +
        '<div class="stx-prov" title="Data provenance"><span><i class="c1"></i>On-chain</span><span><i class="c2"></i>AI</span><span><i class="c3"></i>Replay</span></div>' +
        '<div class="stx-mode" id="stxMode"><button data-m="live">LIVE</button><button data-m="replay">REPLAY</button></div>' +
        '<button class="stx-ic" id="stxBell" title="Alerts">' + svg('bell') + '<span class="n">2</span></button>' +
        '<button class="stx-wallet" id="stxWallet"><span class="dot"></span><span id="stxWalletTxt">Connect wallet</span></button>' +
      '</div>';
    // inject the replay banner right after the topbar if not present
    var content = top.parentNode;
    if (content && !content.querySelector('.stx-replay-banner')) {
      var b = document.createElement('div');
      b.className = 'stx-replay-banner';
      b.innerHTML = svg('bolt') + ' REPLAY MODE — figures below are a historical re-enactment (USDC–SVB, Mar 2023), not live positions.';
      top.insertAdjacentElement('afterend', b);
    }
  }

  // ---------- mode UI sync ----------
  function syncModeUI() {
    var m = Strata.mode;
    var wrap = document.getElementById('stxMode');
    if (wrap) wrap.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-m') === m);
    });
  }

  // ---------- wallet ----------
  var wallet = { addr: null, connected: false, wrongNet: false };
  var activeProvider = null;
  var eip6963 = []; // discovered { info:{uuid,name,icon,rdns}, provider }

  // EIP-6963 multi-injected-provider discovery (MetaMask, Brave, OKX, Coinbase, Rabby…)
  function discoverWallets() {
    try {
      window.addEventListener('eip6963:announceProvider', function (e) {
        var d = e.detail;
        if (d && d.info && d.provider && !eip6963.some(function (p) { return p.info.uuid === d.info.uuid; })) {
          eip6963.push(d);
          var m = document.getElementById('stxWalletModal');
          if (m && m.classList.contains('open')) renderWalletList();
        }
      });
      window.dispatchEvent(new Event('eip6963:requestProvider'));
    } catch (e) {}
  }

  function paintWallet() {
    var el = document.getElementById('stxWallet');
    var txt = document.getElementById('stxWalletTxt');
    if (!el || !txt) return;
    el.classList.toggle('connected', wallet.connected && !wallet.wrongNet);
    el.classList.toggle('wrongnet', wallet.wrongNet);
    txt.textContent = wallet.wrongNet ? 'Wrong network' : (wallet.connected ? short(wallet.addr) : 'Connect wallet');
  }

  async function connectWithProvider(provider, label) {
    provider = provider || window.ethereum;
    if (!provider) { window.open('https://ethereum.org/en/wallets/find-wallet/', '_blank', 'noopener'); return; }
    try {
      var accounts = await provider.request({ method: 'eth_requestAccounts' });
      if (!accounts || !accounts.length) return;
      activeProvider = provider;
      wallet.addr = accounts[0]; wallet.connected = true; wallet.label = label || '';
      var chainId = await provider.request({ method: 'eth_chainId' });
      if (chainId !== MANTLE.chainId) {
        try {
          await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: MANTLE.chainId }] });
          wallet.wrongNet = false;
        } catch (switchErr) {
          if (switchErr && switchErr.code === 4902) {
            await provider.request({ method: 'wallet_addEthereumChain', params: [MANTLE] });
            wallet.wrongNet = false;
          } else { wallet.wrongNet = true; }
        }
      } else { wallet.wrongNet = false; }
      watchProvider(provider);
      closeWalletModal();
      paintWallet();
    } catch (err) { /* user rejected */ }
  }

  function watchProvider(p) {
    if (!p || !p.on) return;
    p.on('chainChanged', function (cid) { wallet.wrongNet = wallet.connected && cid !== MANTLE.chainId; paintWallet(); });
    p.on('accountsChanged', function (a) {
      if (!a || !a.length) { wallet.connected = false; wallet.addr = null; }
      else wallet.addr = a[0];
      paintWallet();
    });
  }

  // curated wallets shown under "Recommended" when not already installed
  var RECOMMENDED = [
    { name: 'MetaMask',        rdns: 'io.metamask',       url: 'https://metamask.io/download',      color: '#F6851B', glyph: 'M' },
    { name: 'OKX Wallet',      rdns: 'com.okex.wallet',   url: 'https://www.okx.com/web3',          color: '#111111', glyph: 'O' },
    { name: 'Coinbase Wallet', rdns: 'com.coinbase.wallet',url:'https://www.coinbase.com/wallet',    color: '#0052FF', glyph: 'C' },
    { name: 'Rabby',           rdns: 'io.rabby',          url: 'https://rabby.io',                  color: '#7084FF', glyph: 'R' },
    { name: 'Trust Wallet',    rdns: 'com.trustwallet.app',url:'https://trustwallet.com/download',   color: '#3375BB', glyph: 'T' }
  ];
  function glyphAvatar(g, c) { return '<span class="stx-wglyph" style="background:' + c + '">' + g + '</span>'; }

  function renderWalletList() {
    var el = document.getElementById('stxWalletList'); if (!el) return;
    var html = '', installed = {};
    if (eip6963.length) {
      html += '<div class="stx-wsec">Installed</div>';
      eip6963.forEach(function (p) {
        installed[p.info.rdns] = true;
        html += '<button class="stx-wrow" data-act="connect" data-uuid="' + p.info.uuid + '">' +
          '<span class="stx-wicon"><img src="' + p.info.icon + '" alt=""/></span>' +
          '<span class="stx-wname">' + p.info.name + '</span></button>';
      });
    } else if (window.ethereum) {
      html += '<div class="stx-wsec">Installed</div>' +
        '<button class="stx-wrow" data-act="injected"><span class="stx-wicon">' + glyphAvatar('◆', 'var(--ai)') +
        '</span><span class="stx-wname">Browser Wallet</span></button>';
    }
    var rec = RECOMMENDED.filter(function (r) { return !installed[r.rdns]; });
    if (rec.length) {
      html += '<div class="stx-wsec">Recommended</div>';
      rec.forEach(function (r) {
        html += '<button class="stx-wrow" data-act="install" data-url="' + r.url + '">' +
          '<span class="stx-wicon">' + glyphAvatar(r.glyph, r.color) + '</span>' +
          '<span class="stx-wname">' + r.name + '</span><span class="stx-wtag">Get ↗</span></button>';
      });
    }
    el.innerHTML = html;
  }

  function buildWalletModal() {
    if (document.getElementById('stxWalletModal')) { renderWalletList(); return; }
    var m = document.createElement('div');
    m.className = 'stx-wmodal'; m.id = 'stxWalletModal';
    m.innerHTML =
      '<div class="stx-wpanel">' +
        '<div class="stx-wleft">' +
          '<div class="stx-whead">Connect a Wallet</div>' +
          '<div class="stx-wlist" id="stxWalletList"></div>' +
          '<div class="stx-wnote">Connect to act on <b>Mantle Sepolia</b>. Browsing stays read-only.</div>' +
        '</div>' +
        '<div class="stx-wright">' +
          '<button class="stx-wclose" id="stxWalletClose" aria-label="Close">×</button>' +
          '<div class="stx-wq">What is a Wallet?</div>' +
          '<div class="stx-winfo"><span class="ic">' + svg('layers') + '</span>' +
            '<div><b>A home for your assets</b><p>A wallet holds the keys you use to sign on-chain actions — like Strata’s <i>submitScore</i> and the 2-of-3 default gate.</p></div></div>' +
          '<div class="stx-winfo"><span class="ic">' + svg('shield') + '</span>' +
            '<div><b>A new way to log in</b><p>No accounts or passwords — just connect your wallet.</p></div></div>' +
          '<a class="stx-btn gold stx-wget" href="https://ethereum.org/en/wallets/find-wallet/" target="_blank" rel="noopener">Get a Wallet</a>' +
          '<a class="stx-wlearn" href="https://ethereum.org/en/wallets/" target="_blank" rel="noopener">Learn More</a>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);
    m.addEventListener('click', function (e) {
      if (e.target === m || e.target.closest('#stxWalletClose')) { closeWalletModal(); return; }
      var row = e.target.closest('.stx-wrow'); if (!row) return;
      var act = row.getAttribute('data-act');
      if (act === 'connect') {
        var found = eip6963.filter(function (p) { return p.info.uuid === row.getAttribute('data-uuid'); })[0];
        if (found) connectWithProvider(found.provider, found.info.name);
      } else if (act === 'injected') {
        connectWithProvider(window.ethereum, 'Browser Wallet');
      } else if (act === 'install') {
        window.open(row.getAttribute('data-url'), '_blank', 'noopener');
      }
    });
    renderWalletList();
  }
  function openWalletModal() { buildWalletModal(); document.getElementById('stxWalletModal').classList.add('open'); }
  function closeWalletModal() { var m = document.getElementById('stxWalletModal'); if (m) m.classList.remove('open'); }

  // ---------- wire ----------
  function wire() {
    var modeWrap = document.getElementById('stxMode');
    if (modeWrap) modeWrap.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (b) Strata.setMode(b.getAttribute('data-m'));
    });
    var w = document.getElementById('stxWallet');
    if (w) w.addEventListener('click', openWalletModal);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeWalletModal(); });
    var burger = document.getElementById('stxBurger');
    if (burger) burger.addEventListener('click', function () {
      document.getElementById('stxSide').classList.toggle('open');
    });
    var bell = document.getElementById('stxBell');
    if (bell) bell.addEventListener('click', function () {
      alert('Alerts — 2 open:\n• AI proposed COLLATERAL_SHORTFALL (awaiting 2-of-3)\n• Issuer sentiment < 350 (USDC replay)');
    });
    var search = document.getElementById('stxSearch');
    if (search) search.addEventListener('click', function () { /* stub for ⌘K palette */ });
  }

  function init() {
    // Embed mode (?embed=1): strip the chrome so the page can be used as a clean
    // live preview inside an <iframe> (landing "Inside the desk" gallery).
    try { if (new URLSearchParams(location.search).has('embed')) { document.documentElement.classList.add('stx-embed'); return; } } catch (e) {}
    renderSide();
    renderTop();
    syncModeUI();
    paintWallet();
    discoverWallets();
    wire();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
