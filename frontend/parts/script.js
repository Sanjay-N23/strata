/* ============================================================
   Strata  --  AI Underwriter & Credit Protection Dashboard
   Complete Frontend JavaScript
   ============================================================ */

// --------------- Global State --------------------------------
let walletAddress = null;
let isConnected = false;

// --------------- Mantle Sepolia Testnet Config -----------------
const MANTLE = {
  chainId: '0x138b', // 5003
  chainName: 'Mantle Sepolia Testnet',
  nativeCurrency: { name: 'Mantle', symbol: 'MNT', decimals: 18 },
  rpcUrls: ['https://rpc.sepolia.mantle.xyz'],
  blockExplorerUrls: ['https://explorer.sepolia.mantle.xyz']
};

// =============================================================
//  1. WALLET CONNECTION
// =============================================================
async function connectWallet() {
  if (!window.ethereum) {
    showToast('error', 'No wallet detected. Please install MetaMask or a compatible wallet.');
    return;
  }

  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (!accounts || accounts.length === 0) {
      showToast('error', 'Wallet connection was rejected.');
      return;
    }

    const chainId = await window.ethereum.request({ method: 'eth_chainId' });

    if (chainId !== MANTLE.chainId) {
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: MANTLE.chainId }]
        });
      } catch (switchErr) {
        if (switchErr.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [MANTLE]
          });
        } else {
          showToast('error', 'Failed to switch to Mantle Sepolia.');
          return;
        }
      }
    }

    walletAddress = accounts[0];
    isConnected = true;

    const short = walletAddress.slice(0, 6) + '...' + walletAddress.slice(-4);
    const btn = document.getElementById('connectWalletBtn');
    if (btn) {
      btn.textContent = short;
      btn.classList.add('connected');
    }

    showToast('success', 'Wallet connected: ' + short);
  } catch (err) {
    showToast('error', 'Connection failed: ' + (err.message || 'Unknown error'));
  }
}

// =============================================================
//  2. PREMIUM CALCULATOR
// =============================================================
function updatePremium() {
  const issuerSelect = document.getElementById('issuerSelect');
  const coverageAmount = document.getElementById('coverageAmount');
  const coverageDuration = document.getElementById('coverageDuration');
  const premiumRate = document.getElementById('premiumRate');
  const premiumAmount = document.getElementById('premiumAmount');

  if (!issuerSelect || !coverageAmount || !coverageDuration) return;

  const irs = parseInt(issuerSelect.value, 10) || 0;
  const amount = parseFloat(coverageAmount.value) || 0;
  const days = parseInt(coverageDuration.value, 10) || 0;

  const bps = Math.round(1600 * Math.exp(-0.001386 * irs));
  const annualPremium = amount * bps / 10000;
  const actualPremium = annualPremium * days / 365;

  if (premiumRate) {
    premiumRate.textContent = bps + ' bps (' + (bps / 100).toFixed(2) + '%)';
  }
  if (premiumAmount) {
    premiumAmount.textContent = '$' + formatNumber(actualPremium.toFixed(2));
  }
}

// =============================================================
//  3. PURCHASE COVERAGE
// =============================================================
function purchaseCoverage() {
  if (!isConnected) {
    showToast('info', 'Please connect your wallet first.');
    connectWallet();
    return;
  }

  const issuerSelect = document.getElementById('issuerSelect');
  const coverageAmount = document.getElementById('coverageAmount');
  const coverageDuration = document.getElementById('coverageDuration');
  const premiumRate = document.getElementById('premiumRate');
  const premiumAmount = document.getElementById('premiumAmount');

  const issuerName = issuerSelect ? issuerSelect.options[issuerSelect.selectedIndex].text : 'N/A';
  const amount = coverageAmount ? coverageAmount.value : '0';
  const days = coverageDuration ? coverageDuration.value : '0';
  const rate = premiumRate ? premiumRate.textContent : 'N/A';
  const premium = premiumAmount ? premiumAmount.textContent : '$0.00';
  const nftType = parseFloat(amount) >= 5000 ? 'Senior Tranche' : 'Junior Tranche';

  const detailHTML = ''
    + '<div class="modal-detail-row"><span class="detail-label">Issuer</span><span class="detail-value">' + issuerName + '</span></div>'
    + '<div class="modal-detail-row"><span class="detail-label">Coverage</span><span class="detail-value">$' + formatNumber(amount) + ' / ' + days + ' days</span></div>'
    + '<div class="modal-detail-row"><span class="detail-label">Premium Rate</span><span class="detail-value">' + rate + '</span></div>'
    + '<div class="modal-detail-row"><span class="detail-label">Premium Due</span><span class="detail-value">' + premium + '</span></div>'
    + '<div class="modal-detail-row"><span class="detail-label">NFT Tranche</span><span class="detail-value">' + nftType + '</span></div>';

  let modal = document.getElementById('purchaseModal');
  if (!modal) {
    document.body.insertAdjacentHTML('beforeend', createPurchaseModal());
    modal = document.getElementById('purchaseModal');
  }

  const detailContainer = modal.querySelector('.modal-details');
  if (detailContainer) {
    detailContainer.innerHTML = detailHTML;
  }

  modal.classList.add('show');
  showToast('success', 'Coverage purchased successfully. ProtectionCert NFT minted.');
}

// =============================================================
//  4. COUNT-UP ANIMATION
// =============================================================
function animateCountUp() {
  const counters = document.querySelectorAll('[data-target]');
  if (counters.length === 0) return;

  const duration = 1500;

  counters.forEach(function (el) {
    const target = parseFloat(el.getAttribute('data-target')) || 0;
    const prefix = el.getAttribute('data-prefix') || '';
    const suffix = el.getAttribute('data-suffix') || '';
    const decimals = parseInt(el.getAttribute('data-decimals'), 10) || 0;
    const isDollar = prefix === '$' || el.hasAttribute('data-dollar');

    let startTime = null;

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = eased * target;

      let display;
      if (isDollar) {
        display = '$' + formatNumber(current.toFixed(decimals));
      } else {
        display = prefix + formatNumber(current.toFixed(decimals)) + suffix;
      }

      el.textContent = display;

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    }

    requestAnimationFrame(step);
  });
}

// =============================================================
//  5. SCROLL REVEAL (IntersectionObserver)
// =============================================================
function initScrollReveal() {
  var revealElements = document.querySelectorAll('.reveal');
  if (revealElements.length === 0) return;

  if (!('IntersectionObserver' in window)) {
    revealElements.forEach(function (el) { el.classList.add('revealed'); });
    return;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        var el = entry.target;
        var parent = el.parentElement;
        var siblings = parent ? Array.from(parent.querySelectorAll('.reveal')) : [];
        var idx = siblings.indexOf(el);
        var delay = idx >= 0 ? idx * 120 : 0;

        setTimeout(function () {
          el.classList.add('revealed');
        }, delay);

        observer.unobserve(el);
      }
    });
  }, { threshold: 0.1 });

  revealElements.forEach(function (el) {
    observer.observe(el);
  });
}

// =============================================================
//  6. RUN FULL DEMO
// =============================================================
async function runFullDemo() {
  let modal = document.getElementById('demoModal');
  if (!modal) {
    document.body.insertAdjacentHTML('beforeend', createDemoModal());
    modal = document.getElementById('demoModal');
  }

  var icon = modal.querySelector('.demo-icon');
  var title = modal.querySelector('.demo-title');
  var desc = modal.querySelector('.demo-desc');
  var details = modal.querySelector('.demo-details');
  var closeBtn = modal.querySelector('.demo-close-btn');

  if (closeBtn) {
    closeBtn.disabled = true;
    closeBtn.textContent = 'Running...';
  }

  modal.classList.add('show');

  // --- Step 1: IRS Oracle Updated ---
  if (icon) icon.textContent = '[1/3]';
  if (title) title.textContent = 'IRS Oracle Updated';
  if (desc) desc.textContent = 'The Issuer Risk Score oracle has been updated with the latest assessment data.';
  if (details) {
    details.innerHTML = ''
      + '<div class="modal-detail-row"><span class="detail-label">Issuer</span><span class="detail-value">TradeFlow Capital</span></div>'
      + '<div class="modal-detail-row"><span class="detail-label">IRS Score</span><span class="detail-value">600</span></div>'
      + '<div class="modal-detail-row"><span class="detail-label">Premium Rate</span><span class="detail-value">696 bps</span></div>'
      + '<div class="modal-detail-row"><span class="detail-label">Status</span><span class="detail-value">Oracle Confirmed</span></div>';
  }

  await sleep(2000);

  // --- Step 2: Coverage Purchased ---
  if (icon) icon.textContent = '[2/3]';
  if (title) title.textContent = 'Coverage Purchased';
  if (desc) desc.textContent = 'Investors have deposited into both tranches and coverage has been underwritten.';
  if (details) {
    details.innerHTML = ''
      + '<div class="modal-detail-row"><span class="detail-label">Senior Tranche</span><span class="detail-value">$7,000</span></div>'
      + '<div class="modal-detail-row"><span class="detail-label">Junior Tranche</span><span class="detail-value">$3,000</span></div>'
      + '<div class="modal-detail-row"><span class="detail-label">Coverage Amount</span><span class="detail-value">$15,000</span></div>'
      + '<div class="modal-detail-row"><span class="detail-label">NFT Issued</span><span class="detail-value">ProtectionCert #3</span></div>';
  }

  await sleep(2000);

  // --- Step 3: Default & Payout ---
  if (icon) icon.textContent = '[3/3]';
  if (title) title.textContent = 'Default Event & Payout';
  if (desc) desc.textContent = 'A default has been triggered. Payout processed and subrogation rights transferred.';
  if (details) {
    details.innerHTML = ''
      + '<div class="modal-detail-row"><span class="detail-label">Default Type</span><span class="detail-value">MISAPPROPRIATION</span></div>'
      + '<div class="modal-detail-row"><span class="detail-label">Confirmed By</span><span class="detail-value">Custodian + Auditor</span></div>'
      + '<div class="modal-detail-row"><span class="detail-label">Payout</span><span class="detail-value">$15,000</span></div>'
      + '<div class="modal-detail-row"><span class="detail-label">Subrogation NFT</span><span class="detail-value">SubrogationNFT #1</span></div>'
      + '<div class="modal-detail-row"><span class="detail-label">Issuer IRS</span><span class="detail-value">0 (Blacklisted)</span></div>';
  }

  await sleep(1500);

  // --- Final State ---
  if (icon) icon.textContent = '[OK]';
  if (title) title.textContent = 'Demo Complete!';
  if (desc) desc.textContent = 'All protocol stages executed successfully. Explore the dashboard to learn more.';
  if (details) {
    details.innerHTML = ''
      + '<div class="modal-detail-row"><span class="detail-label">Oracle</span><span class="detail-value">Updated</span></div>'
      + '<div class="modal-detail-row"><span class="detail-label">Coverage</span><span class="detail-value">Underwritten</span></div>'
      + '<div class="modal-detail-row"><span class="detail-label">Default</span><span class="detail-value">Processed</span></div>'
      + '<div class="modal-detail-row"><span class="detail-label">Subrogation</span><span class="detail-value">Transferred</span></div>';
  }

  if (closeBtn) {
    closeBtn.disabled = false;
    closeBtn.textContent = 'Close';
  }
}

// =============================================================
//  7. UTILITY FUNCTIONS
// =============================================================
function showDeposit(tranche) {
  showToast('info', 'Connect wallet to deposit into ' + tranche + ' tranche');
}

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function closeModal(id) {
  var modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('show');
  }
}

function scrollTo(id) {
  var target = document.getElementById(id);
  if (target) {
    target.scrollIntoView({ behavior: 'smooth' });
  }
}

function showToast(type, msg) {
  var prefixMap = {
    success: '[OK] ',
    error:   '[!] ',
    info:    '[i] ',
    warning: '[!!] '
  };

  var prefix = prefixMap[type] || '';

  var container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  var toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.textContent = prefix + msg;

  container.appendChild(toast);

  requestAnimationFrame(function () {
    toast.classList.add('toast-visible');
  });

  setTimeout(function () {
    toast.classList.remove('toast-visible');
    toast.classList.add('toast-exit');
    setTimeout(function () {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 400);
  }, 3500);
}

function formatNumber(value) {
  var parts = String(value).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

// =============================================================
//  8. PAGE INIT
// =============================================================
document.addEventListener('DOMContentLoaded', function () {
  updatePremium();
  animateCountUp();
  initScrollReveal();

  // Attach calculator listeners
  var issuerSelect = document.getElementById('issuerSelect');
  var coverageAmount = document.getElementById('coverageAmount');
  var coverageDuration = document.getElementById('coverageDuration');

  if (issuerSelect) issuerSelect.addEventListener('change', updatePremium);
  if (coverageAmount) coverageAmount.addEventListener('input', updatePremium);
  if (coverageDuration) coverageDuration.addEventListener('input', updatePremium);

  // Stagger event-item animations
  document.querySelectorAll('.event-item').forEach(function (el, i) {
    el.style.animationDelay = (i * 100) + 'ms';
  });

  // Listen for account/chain changes
  if (window.ethereum) {
    window.ethereum.on('accountsChanged', function (accounts) {
      if (accounts.length === 0) {
        walletAddress = null;
        isConnected = false;
        var btn = document.getElementById('connectWalletBtn');
        if (btn) {
          btn.textContent = 'Connect Wallet';
          btn.classList.remove('connected');
        }
        showToast('warning', 'Wallet disconnected.');
      } else {
        walletAddress = accounts[0];
        var short = walletAddress.slice(0, 6) + '...' + walletAddress.slice(-4);
        var btn = document.getElementById('connectWalletBtn');
        if (btn) btn.textContent = short;
        showToast('info', 'Account changed: ' + short);
      }
    });

    window.ethereum.on('chainChanged', function () {
      window.location.reload();
    });
  }
});

// =============================================================
//  9. MODAL HTML TEMPLATES
// =============================================================

/**
 * Creates the purchase success modal overlay.
 * Returns an HTML string to be inserted into the DOM.
 */
function createPurchaseModal() {
  return ''
    + '<div id="purchaseModal" class="modal-overlay">'
    +   '<div class="modal-card">'
    +     '<div class="modal-header">'
    +       '<span class="modal-icon">[OK]</span>'
    +       '<h3 class="modal-title">Coverage Purchased</h3>'
    +     '</div>'
    +     '<p class="modal-desc">Your credit protection coverage has been successfully underwritten and a ProtectionCert NFT has been minted to your wallet.</p>'
    +     '<div class="modal-details">'
    +       '<!-- Detail rows injected dynamically -->'
    +     '</div>'
    +     '<div class="modal-actions">'
    +       '<button class="btn btn-primary" onclick="closeModal(\'purchaseModal\')">Done</button>'
    +     '</div>'
    +   '</div>'
    + '</div>';
}

/**
 * Creates the demo progress modal overlay.
 * Returns an HTML string to be inserted into the DOM.
 */
function createDemoModal() {
  return ''
    + '<div id="demoModal" class="modal-overlay">'
    +   '<div class="modal-card">'
    +     '<div class="modal-header">'
    +       '<span class="demo-icon modal-icon">[--]</span>'
    +       '<h3 class="demo-title modal-title">Initializing Demo...</h3>'
    +     '</div>'
    +     '<p class="demo-desc modal-desc">Preparing the Strata protocol demonstration.</p>'
    +     '<div class="demo-details modal-details">'
    +       '<!-- Detail rows injected per step -->'
    +     '</div>'
    +     '<div class="modal-actions">'
    +       '<button class="demo-close-btn btn btn-primary" disabled onclick="closeModal(\'demoModal\')">Running...</button>'
    +     '</div>'
    +   '</div>'
    + '</div>';
}
