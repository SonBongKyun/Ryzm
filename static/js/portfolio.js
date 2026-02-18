/* static/js/portfolio.js — Portfolio Tracker, Council Accuracy, SSE, Onboarding v2, Trial UI */

// ═══════════════════════════════════════════════
//  1) SSE (Server-Sent Events) Real-time Stream
// ═══════════════════════════════════════════════
const RyzmSSE = (() => {
  let _es = null;
  let _retries = 0;
  const MAX_RETRIES = 10;
  const BASE_DELAY = 2000;

  function connect() {
    if (_es && _es.readyState !== EventSource.CLOSED) return;
    const token = localStorage.getItem('ryzm_token');
    const url = '/api/events' + (token ? '?token=' + encodeURIComponent(token) : '');
    _es = new EventSource(url);
    _es.onopen = () => { _retries = 0; _updateStatus(true); };
    _es.onerror = () => { _es.close(); _updateStatus(false); _scheduleReconnect(); };

    _es.addEventListener('market_snapshot', (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.prices) _mergeLivePrices(d.prices);
      } catch {}
    });
    _es.addEventListener('council_update', (e) => {
      try {
        const d = JSON.parse(e.data);
        if (typeof showToast === 'function')
          showToast('info', 'Council', `New ${d.symbol || ''} analysis available`);
      } catch {}
    });
    _es.addEventListener('price_alert', (e) => {
      try {
        const d = JSON.parse(e.data);
        const arrow = d.direction === 'above' ? '\u25B2' : '\u25BC';
        if (typeof showToast === 'function')
          showToast('warning', '\uD83D\uDD14 Alert Triggered', `${d.symbol} ${arrow} $${Number(d.target_price).toLocaleString()} (now: $${Number(d.current_price).toLocaleString()})`);
        if (typeof playSound === 'function') playSound('alert');
        // Refresh the alert list UI
        if (typeof refreshAlertList === 'function') refreshAlertList();
      } catch {}
    });
    _es.addEventListener('broadcast', (e) => {
      try {
        const d = JSON.parse(e.data);
        if (typeof showToast === 'function')
          showToast('info', 'System', d.message || 'Broadcast received');
      } catch {}
    });

    // ── Real-time Risk Gauge & L/S Ratio via SSE ──
    _es.addEventListener('risk_gauge', (e) => {
      try {
        if (typeof fetchRiskGauge === 'function') fetchRiskGauge();
      } catch {}
    });
    _es.addEventListener('long_short', (e) => {
      try {
        if (typeof fetchLongShortRatio === 'function') fetchLongShortRatio();
      } catch {}
    });
  }

  function _mergeLivePrices(prices) {
    // Update existing price cards if they exist
    if (typeof window._lastSSEPrices === 'undefined') window._lastSSEPrices = {};
    Object.assign(window._lastSSEPrices, prices);
  }

  function _updateStatus(connected) {
    const dot = document.getElementById('sse-status-dot');
    const lbl = document.getElementById('sse-status-label');
    if (dot) dot.className = 'sse-dot ' + (connected ? 'connected' : 'disconnected');
    if (lbl) lbl.textContent = connected ? 'LIVE' : 'RECONNECTING';
  }

  function _scheduleReconnect() {
    if (_retries >= MAX_RETRIES) return;
    _retries++;
    const delay = BASE_DELAY * Math.pow(1.5, _retries);
    setTimeout(connect, Math.min(delay, 30000));
  }

  function disconnect() { if (_es) { _es.close(); _es = null; } }

  return { connect, disconnect };
})();


// ═══════════════════════════════════════════════
//  2) Portfolio Tracker
// ═══════════════════════════════════════════════
const RyzmPortfolio = (() => {
  let _holdings = [];

  async function load() {
    try {
      const data = await apiFetch('/api/portfolio', { silent: true });
      _holdings = data.holdings || [];
      render();
    } catch (e) {
      if (e.status === 401) renderLoginPrompt();
    }
  }

  async function addHolding() {
    const symbol = document.getElementById('pf-symbol')?.value?.toUpperCase().trim();
    const amount = parseFloat(document.getElementById('pf-amount')?.value);
    const avgPrice = parseFloat(document.getElementById('pf-avg-price')?.value);
    if (!symbol || isNaN(amount) || amount <= 0) {
      if (typeof showToast === 'function') showToast('warning', 'Portfolio', 'Enter a valid symbol and amount');
      return;
    }
    try {
      await apiFetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, amount, avg_price: avgPrice || 0 })
      });
      document.getElementById('pf-symbol').value = '';
      document.getElementById('pf-amount').value = '';
      document.getElementById('pf-avg-price').value = '';
      await load();
      if (typeof showToast === 'function') showToast('success', 'Portfolio', `${symbol} added`);
    } catch (e) {
      if (typeof showToast === 'function') showToast('error', 'Portfolio', e.data?.detail || 'Failed to add');
    }
  }

  async function removeHolding(symbol) {
    if (!confirm(`Remove ${symbol}?`)) return;
    try {
      await apiFetch(`/api/portfolio/${encodeURIComponent(symbol)}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      if (typeof showToast === 'function') showToast('error', 'Portfolio', 'Failed to remove');
    }
  }

  function render() {
    const container = document.getElementById('portfolio-holdings');
    const summary = document.getElementById('portfolio-summary');
    if (!container) return;

    if (_holdings.length === 0) {
      container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;font-size:0.75rem;">No holdings yet. Add your first position above.</div>';
      if (summary) summary.style.display = 'none';
      return;
    }

    let totalValue = 0, totalCost = 0;
    const rows = _holdings.map(h => {
      const val = h.value || 0;
      const cost = h.amount * h.avg_price;
      const pnl = h.pnl || 0;
      const pnlPct = h.pnl_pct || 0;
      totalValue += val;
      totalCost += cost;
      const pnlColor = pnl >= 0 ? 'var(--neon-green)' : 'var(--neon-red)';
      const pnlSign = pnl >= 0 ? '+' : '';
      return `<tr>
        <td style="font-weight:600;color:var(--neon-cyan);">${escapeHtml(h.symbol)}</td>
        <td>${h.amount.toFixed(4)}</td>
        <td>$${h.avg_price.toLocaleString()}</td>
        <td>$${h.current_price ? h.current_price.toLocaleString() : '—'}</td>
        <td>$${val.toLocaleString(undefined, {maximumFractionDigits:0})}</td>
        <td style="color:${pnlColor};font-weight:600;">${pnlSign}$${pnl.toLocaleString(undefined, {maximumFractionDigits:0})} (${pnlSign}${pnlPct.toFixed(1)}%)</td>
        <td style="color:var(--text-muted);">${h.weight_pct ? h.weight_pct.toFixed(1) + '%' : '—'}</td>
        <td><button onclick="RyzmPortfolio.removeHolding('${escapeHtml(h.symbol)}')" style="background:none;border:none;color:var(--neon-red);cursor:pointer;font-size:0.7rem;">✕</button></td>
      </tr>`;
    }).join('');

    container.innerHTML = `<table class="pf-table"><thead><tr>
      <th>Symbol</th><th>Amount</th><th>Avg Price</th><th>Current</th><th>Value</th><th>PnL</th><th>Weight</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table>`;

    const totalPnl = totalValue - totalCost;
    const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost * 100) : 0;
    if (summary) {
      summary.style.display = 'flex';
      const tpColor = totalPnl >= 0 ? 'var(--neon-green)' : 'var(--neon-red)';
      const tpSign = totalPnl >= 0 ? '+' : '';
      summary.innerHTML = `
        <div class="pf-stat"><span class="pf-stat-label">Total Value</span><span class="pf-stat-val">$${totalValue.toLocaleString(undefined,{maximumFractionDigits:0})}</span></div>
        <div class="pf-stat"><span class="pf-stat-label">Total PnL</span><span class="pf-stat-val" style="color:${tpColor};">${tpSign}$${totalPnl.toLocaleString(undefined,{maximumFractionDigits:0})} (${tpSign}${totalPnlPct.toFixed(1)}%)</span></div>
        <div class="pf-stat"><span class="pf-stat-label">Positions</span><span class="pf-stat-val">${_holdings.length}</span></div>
      `;
    }
  }

  function renderLoginPrompt() {
    const container = document.getElementById('portfolio-holdings');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;font-size:0.78rem;">Sign in to track your portfolio.<br><button onclick="toggleAuthModal()" style="margin-top:8px;background:var(--gradient-premium);color:#000;border:none;border-radius:6px;padding:6px 16px;cursor:pointer;font-weight:600;font-size:0.75rem;">Sign In</button></div>';
  }

  return { load, addHolding, removeHolding, render };
})();


// ═══════════════════════════════════════════════
//  3) Council Accuracy Dashboard
// ═══════════════════════════════════════════════
const RyzmAccuracy = (() => {
  async function load() {
    try {
      const data = await apiFetch('/api/council/accuracy', { silent: true });
      render(data);
    } catch (e) {
      renderEmpty();
    }
  }

  function render(data) {
    const container = document.getElementById('accuracy-content');
    if (!container) return;

    const overall = data.summary || {};
    const horizonsRaw = data.horizons || {};
    const horizons = Object.entries(horizonsRaw).map(([key, val]) => ({
      horizon: key,
      hit_rate: val.accuracy_pct != null ? val.accuracy_pct / 100 : null,
      total: val.evaluated || 0
    }));
    const rate = overall.accuracy_pct != null ? overall.accuracy_pct.toFixed(1) : '—';
    const total = overall.total_evaluated || 0;
    const correct = overall.total_hits || 0;

    // Accuracy ring (SVG gauge)
    const pct = overall.accuracy_pct != null ? overall.accuracy_pct : 0;
    const circumference = 2 * Math.PI * 36;
    const offset = circumference - (pct / 100) * circumference;
    const ringColor = pct >= 60 ? 'var(--neon-green)' : pct >= 40 ? 'var(--neon-cyan)' : 'var(--neon-red)';

    let horizonHTML = '';
    if (horizons.length > 0) {
      horizonHTML = '<div class="acc-horizons">' + horizons.map(h => {
        const hr = h.hit_rate != null ? (h.hit_rate * 100).toFixed(0) : '—';
        const hColor = h.hit_rate >= 0.6 ? 'var(--neon-green)' : h.hit_rate >= 0.4 ? 'var(--neon-cyan)' : 'var(--neon-red)';
        return `<div class="acc-horizon-item">
          <span class="acc-h-label">${escapeHtml(h.horizon)}</span>
          <span class="acc-h-rate" style="color:${hColor};">${hr}%</span>
          <span class="acc-h-count">${h.total} calls</span>
        </div>`;
      }).join('') + '</div>';
    }

    container.innerHTML = `
      <div class="acc-ring-wrap">
        <svg class="acc-ring" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="6"/>
          <circle cx="40" cy="40" r="36" fill="none" stroke="${ringColor}" stroke-width="6"
            stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
            stroke-linecap="round" transform="rotate(-90 40 40)" style="transition:stroke-dashoffset 1s ease;"/>
          <text x="40" y="38" text-anchor="middle" fill="var(--text-main)" font-size="16" font-weight="700" font-family="var(--font-head)">${rate}%</text>
          <text x="40" y="50" text-anchor="middle" fill="var(--text-muted)" font-size="7">hit rate</text>
        </svg>
        <div class="acc-stats">
          <div><span class="acc-label">Total Calls</span><span class="acc-val">${total}</span></div>
          <div><span class="acc-label">Correct</span><span class="acc-val" style="color:var(--neon-green);">${correct}</span></div>
          <div><span class="acc-label">Wrong</span><span class="acc-val" style="color:var(--neon-red);">${total - correct}</span></div>
        </div>
      </div>
      ${horizonHTML}
    `;
  }

  function renderEmpty() {
    const container = document.getElementById('accuracy-content');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;font-size:0.75rem;">Not enough data yet. Council predictions will be tracked automatically.</div>';
  }

  return { load };
})();


// ═══════════════════════════════════════════════
//  4) Enhanced Onboarding Funnel (Multi-step)
// ═══════════════════════════════════════════════
const RyzmOnboarding = (() => {
  const STEPS = [
    {
      title: 'Welcome to Ryzm Terminal',
      desc: 'Real-time crypto intelligence powered by AI.<br>Market data, on-chain analytics, and neural council decisions — all in one terminal.',
      icon: '🚀'
    },
    {
      title: 'AI Council',
      desc: 'Our 5-framework analysis engine evaluates market conditions from Macro, Technical, On-Chain, Sentiment, and Risk perspectives.',
      icon: '🧠',
      highlight: 'council-section'
    },
    {
      title: 'Portfolio Tracker',
      desc: 'Track your holdings, monitor real-time PnL, and see portfolio weight distribution.',
      icon: '📊',
      highlight: 'portfolio-section'
    },
    {
      title: 'Real-time Data',
      desc: 'Live prices via WebSocket, whale alerts, on-chain metrics, and news feed — streaming in real-time.',
      icon: '⚡',
      highlight: 'prices-section'
    },
    {
      title: 'Get Started',
      desc: 'Create a free account to unlock Signal Journal, Price Alerts, and more.<br><strong>Pro users</strong> get unlimited AI Council, advanced panels, and priority data.',
      icon: '✨',
      cta: true
    }
  ];
  let _step = 0;

  function shouldShow() {
    return !localStorage.getItem('ryzm_onboarded_v2');
  }

  function show() {
    if (!shouldShow()) return;
    setTimeout(() => _render(), 1200);
  }

  function _render() {
    let overlay = document.getElementById('onboarding-v2');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'onboarding-v2';
      overlay.className = 'onboarding-v2-overlay';
      document.body.appendChild(overlay);
    }
    const s = STEPS[_step];
    const isLast = _step === STEPS.length - 1;
    const isFirst = _step === 0;

    overlay.innerHTML = `
      <div class="onboarding-v2-card">
        <div class="onboarding-v2-progress">
          ${STEPS.map((_, i) => `<div class="ob-dot ${i === _step ? 'active' : i < _step ? 'done' : ''}"></div>`).join('')}
        </div>
        <div class="onboarding-v2-icon">${s.icon}</div>
        <h2 class="onboarding-v2-title">${s.title}</h2>
        <p class="onboarding-v2-desc">${s.desc}</p>
        <div class="onboarding-v2-actions">
          ${!isFirst ? '<button class="ob-btn ob-btn-secondary" onclick="RyzmOnboarding.prev()">Back</button>' : '<button class="ob-btn ob-btn-skip" onclick="RyzmOnboarding.skip()">Skip</button>'}
          ${isLast
            ? '<button class="ob-btn ob-btn-primary" onclick="RyzmOnboarding.finish()">Enter Terminal</button>'
            : '<button class="ob-btn ob-btn-primary" onclick="RyzmOnboarding.next()">Next</button>'}
        </div>
        <div class="onboarding-v2-step">${_step + 1} / ${STEPS.length}</div>
      </div>
    `;
    overlay.style.display = 'flex';

    // Highlight target element
    if (s.highlight) {
      document.querySelectorAll('.ob-highlight').forEach(el => el.classList.remove('ob-highlight'));
      const target = document.getElementById(s.highlight);
      if (target) {
        target.classList.add('ob-highlight');
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  function next() { if (_step < STEPS.length - 1) { _step++; _render(); _saveStep(); } }
  function prev() { if (_step > 0) { _step--; _render(); } }
  function skip() { finish(); }
  function finish() {
    localStorage.setItem('ryzm_onboarded_v2', '1');
    const overlay = document.getElementById('onboarding-v2');
    if (overlay) overlay.remove();
    document.querySelectorAll('.ob-highlight').forEach(el => el.classList.remove('ob-highlight'));
    // Also set old flag to prevent old overlay
    localStorage.setItem('ryzm_onboarded', '1');
  }
  function _saveStep() {
    const token = localStorage.getItem('ryzm_token');
    if (token) {
      apiFetch('/api/onboarding/step', {
        method: 'POST', silent: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: _step })
      }).catch(() => {});
    }
  }

  return { show, next, prev, skip, finish };
})();


// ═══════════════════════════════════════════════
//  5) 7-Day Trial UI
// ═══════════════════════════════════════════════
function initTrialUI() {
  // Inject trial button into upgrade modal if user is eligible
  const cta = document.getElementById('upgrade-cta-btn');
  if (!cta) return;

  // Check if user can start trial
  const token = localStorage.getItem('ryzm_token');
  if (!token) return;

  apiFetch('/api/auth/profile', { silent: true }).then(user => {
    if (user && user.tier === 'free' && !user.trial_used) {
      const trialBtn = document.createElement('button');
      trialBtn.className = 'trial-cta-btn';
      trialBtn.innerHTML = '🎁 Start 7-Day Free Trial';
      trialBtn.onclick = startFreeTrial;
      cta.parentNode.insertBefore(trialBtn, cta);

      const divider = document.createElement('div');
      divider.style.cssText = 'font-size:0.65rem;color:var(--text-muted);margin:8px 0;';
      divider.textContent = 'or';
      cta.parentNode.insertBefore(divider, cta);
    }
  }).catch(() => {});
}

async function startFreeTrial() {
  try {
    const data = await apiFetch('/api/payments/start-trial', { method: 'POST' });
    if (typeof showToast === 'function')
      showToast('success', 'Trial', data.message || 'Pro trial activated!');
    closeUpgradeModal();
    // Refresh user state
    setTimeout(() => location.reload(), 1500);
  } catch (e) {
    if (typeof showToast === 'function')
      showToast('error', 'Trial', e.data?.detail || 'Could not start trial');
  }
}


// ═══════════════════════════════════════════════
//  6) PWA Push Notifications
// ═══════════════════════════════════════════════
const RyzmPush = (() => {
  async function requestPermission() {
    if (!('Notification' in window)) return false;
    const perm = await Notification.requestPermission();
    return perm === 'granted';
  }

  async function subscribe() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      if (typeof showToast === 'function')
        showToast('warning', 'Push', 'Push notifications not supported in this browser.');
      return;
    }
    const granted = await requestPermission();
    if (!granted) {
      if (typeof showToast === 'function')
        showToast('warning', 'Push', 'Notification permission denied.');
      return;
    }
    // For now, use the browser Notification API directly via SSE events
    // Full Web Push with VAPID keys would require server-side configuration
    localStorage.setItem('ryzm_push_enabled', '1');
    if (typeof showToast === 'function')
      showToast('success', 'Push', 'Push notifications enabled! You\'ll receive alerts via SSE.');
    _updateToggle(true);
  }

  function unsubscribe() {
    localStorage.removeItem('ryzm_push_enabled');
    if (typeof showToast === 'function')
      showToast('info', 'Push', 'Push notifications disabled.');
    _updateToggle(false);
  }

  function isEnabled() {
    return localStorage.getItem('ryzm_push_enabled') === '1';
  }

  function showNotification(title, body) {
    if (!isEnabled() || Notification.permission !== 'granted') return;
    try {
      new Notification(title, {
        body,
        icon: '/static/og-ryzm.png',
        badge: '/static/og-ryzm.png',
        tag: 'ryzm-' + Date.now()
      });
    } catch {}
  }

  function _updateToggle(enabled) {
    const btn = document.getElementById('push-toggle-btn');
    if (btn) {
      btn.textContent = enabled ? '🔔 Notifications ON' : '🔕 Notifications OFF';
      btn.className = 'push-toggle ' + (enabled ? 'push-on' : 'push-off');
    }
  }

  function initToggle() {
    _updateToggle(isEnabled());
  }

  return { subscribe, unsubscribe, isEnabled, showNotification, initToggle };
})();


// ═══════════════════════════════════════════════
//  7) Initialize all new features
// ═══════════════════════════════════════════════
function initNewFeatures() {
  try {
    // SSE connection
    RyzmSSE.connect();

    // Portfolio — load for everyone (handles 401 by showing login prompt)
    RyzmPortfolio.load();

    // Council Accuracy — public data, load for ALL users
    RyzmAccuracy.load();

    // Trial button in upgrade modal
    initTrialUI();

    // Push notification toggle
    RyzmPush.initToggle();

    // Onboarding v2
    RyzmOnboarding.show();

    // Periodic refresh
    const token = localStorage.getItem('ryzm_token');
    if (token) {
      setInterval(() => { RyzmPortfolio.load(); }, 60000);
    }
    // Accuracy refresh for everyone (every 5 min)
    setInterval(() => { RyzmAccuracy.load(); }, 300000);
  } catch (e) {
    console.error('[Ryzm] initNewFeatures error:', e);
  }
}

// Hook into DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNewFeatures);
} else {
  initNewFeatures();
}
