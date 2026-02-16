/* ─── Toast Notification System ─── */
function showToast(type, title, message) {
  // Remove existing toast
  const existingToast = document.querySelector('.toast');
  if (existingToast) existingToast.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : '⚠';

  // PR-3: XSS-safe — use textContent instead of innerHTML for user-facing strings
  const iconDiv = document.createElement('div');
  iconDiv.className = 'toast-icon';
  iconDiv.textContent = icon;

  const msgDiv = document.createElement('div');
  msgDiv.className = 'toast-message';
  const strong = document.createElement('strong');
  strong.textContent = title;
  const br = document.createElement('br');
  const msgText = document.createTextNode(message);
  msgDiv.appendChild(strong);
  msgDiv.appendChild(br);
  msgDiv.appendChild(msgText);

  toast.appendChild(iconDiv);
  toast.appendChild(msgDiv);

  document.body.appendChild(toast);

  // Auto-remove after 4 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/* ─── Enhanced Kimchi Premium Display ─── */
// Kimchi display is now unified in data.js fetchKimchi() — no duplicate needed.

/* ═══════════════════════════════════════
   UI/UX ENHANCEMENTS v2.0
   ═══════════════════════════════════════ */

/* ─── Quick Actions Toolbar ─── */
document.addEventListener('DOMContentLoaded', () => {
  initQuickActions();
  initStatusBar();
  initPulseIndicators();
  initSectionNav();
});

/* ─── Section Navigation (scroll-to + active highlight) ─── */
function initSectionNav() {
  const nav = document.getElementById('section-nav');
  if (!nav) return;

  const items = [...nav.querySelectorAll('.snav-item')];
  const sections = [];
  items.forEach(item => {
    const el = document.getElementById(item.dataset.target);
    if (el) sections.push({ item, el });
  });

  /* Click → smooth scroll to section */
  let _navClicking = false;
  let _navClickTimer = null;

  items.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.getElementById(item.dataset.target);
      if (!target) return;

      _navClicking = true;
      clearTimeout(_navClickTimer);

      items.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      // Scroll nav track to show the active item
      item.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });

      const headerH = document.querySelector('.header')?.offsetHeight || 56;
      const navH = nav.offsetHeight || 34;
      const y = target.getBoundingClientRect().top + window.scrollY - headerH - navH - 8;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });

      _navClickTimer = setTimeout(() => { _navClicking = false; }, 1200);
    });
  });

  /* Scroll → auto-highlight nearest section in viewport */
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (_navClicking || ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const offset = (nav.getBoundingClientRect().bottom || 120) + 40;
      let best = null;
      let bestDist = Infinity;

      for (const s of sections) {
        const rect = s.el.getBoundingClientRect();
        // Section should be near/above the trigger line and still partially visible
        if (rect.bottom > 0 && rect.top < offset + 300) {
          const dist = Math.abs(rect.top - offset);
          if (dist < bestDist) { bestDist = dist; best = s; }
        }
      }
      if (best) {
        const alreadyActive = best.item.classList.contains('active');
        if (!alreadyActive) {
          items.forEach(i => i.classList.remove('active'));
          best.item.classList.add('active');
          best.item.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      }
      ticking = false;
    });
  }, { passive: true });
}

function initQuickActions() {
  // Refresh All Data
  const btnRefresh = document.getElementById('btn-refresh-all');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', async () => {
      playSound('click');
      btnRefresh.classList.add('scanning');
      const icon = btnRefresh.querySelector('i');
      icon.style.animation = 'spin 1s linear infinite';

      await refreshAllData();

      icon.style.animation = '';
      btnRefresh.classList.remove('scanning');
      showToast('success', '✓ Refreshed', 'All market data updated successfully!');
    });
  }

  // Fullscreen Toggle
  const btnFullscreen = document.getElementById('btn-fullscreen');
  if (btnFullscreen) {
    btnFullscreen.addEventListener('click', () => {
      playSound('click');
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
        showToast('success', '⛶ Fullscreen', 'Entered fullscreen mode');
      } else {
        document.exitFullscreen();
        showToast('success', '⛶ Windowed', 'Exited fullscreen mode');
      }
    });
  }

  // Notification Settings
  const btnNotifications = document.getElementById('btn-notifications');
  if (btnNotifications) {
    btnNotifications.addEventListener('click', () => {
      playSound('click');
      showToast('warning', '🔔 Coming Soon', 'Notification settings will be available in v2.0!');
    });
  }
}

/* ─── Refresh All Data ─── */

/* ── Alpha Scanner ── */
async function fetchScanner() {
  try {
    const data = await apiFetch('/api/scanner', { silent: true });
    const feed = document.getElementById('scanner-feed');
    if (!feed) return;

    if (data.alerts && data.alerts.length > 0) {
      // Animate live dot
      const dot = document.querySelector('.scanner-live-dot');
      if (dot) dot.classList.add('active');
      setTimeout(() => { if (dot) dot.classList.remove('active'); }, 3000);

      feed.innerHTML = data.alerts.map(a => {
        const typeLabel = {
          'PUMP_ALERT': t('scanner_pump'),
          'OVERSOLD_BOUNCE': t('scanner_bounce'),
          'VOL_SPIKE': t('scanner_vol')
        }[a.type] || escapeHtml(a.type);

        const icon = a.type === 'PUMP_ALERT' ? '🚀' : a.type === 'OVERSOLD_BOUNCE' ? '🎯' : '💥';

        return `<div class="scanner-alert" style="border-left-color:${safeColor(a.color)};">
          <div class="scanner-alert-left">
            <span class="scanner-symbol">${icon} ${escapeHtml(a.symbol)}</span>
            <span class="scanner-type" style="color:${safeColor(a.color)};">${typeLabel}</span>
          </div>
          <div class="scanner-alert-right">
            <span class="scanner-msg">${escapeHtml(a.msg)}</span>
            <span class="scanner-change" style="color:${a.change >= 0 ? 'var(--neon-green)' : 'var(--neon-red)'}">${a.change >= 0 ? '+' : ''}${escapeHtml(String(a.change))}%</span>
          </div>
        </div>`;
      }).join('');

      // Play alert sound for high priority
      if (data.alerts.some(a => a.type === 'PUMP_ALERT' || a.type === 'OVERSOLD_BOUNCE')) {
        playSound('alert');
      }
    } else {
      feed.innerHTML = `<div class="scanner-empty">${t('scanner_calm')}</div>`;
    }
  } catch (e) {
    console.error('Scanner Error:', e);
  }
}

/* ── Regime Detector ── */
async function fetchRegime() {
  try {
    const data = await apiFetch('/api/regime', { silent: true });
    const badge = document.getElementById('regime-badge');
    if (!badge) return;
    if (data.regime) {
      const labels = {
        BTC_SEASON: t('regime_btc'), ALT_SEASON: t('regime_alt'),
        RISK_OFF: t('regime_risk_off'), FULL_BULL: t('regime_bull'),
        ROTATION: t('regime_rotation')
      };
      badge.textContent = labels[data.regime] || data.regime;
      badge.style.background = data.color || '#666';
      badge.style.color = '#000';
      badge.title = data.advice || '';
    } else {
      badge.textContent = '--';
      badge.style.background = '#333';
    }
  } catch (e) { console.error('Regime Error:', e); }
}

/* ── Correlation Matrix ── */
async function fetchCorrelation() {
  try {
    const data = await apiFetch('/api/correlation', { silent: true });
    const el = document.getElementById('corr-matrix');
    if (!el || !data.matrix) return;

    const assets = data.assets || Object.keys(data.matrix);
    let html = '<table class="corr-table"><thead><tr><th></th>';
    assets.forEach(a => html += `<th>${escapeHtml(a)}</th>`);
    html += '</tr></thead><tbody>';

    assets.forEach(row => {
      html += `<tr><td class="corr-label">${escapeHtml(row)}</td>`;
      assets.forEach(col => {
        const v = data.matrix[row]?.[col];
        const val = v !== undefined ? v.toFixed(2) : '--';
        const intensity = v !== undefined ? Math.abs(v) : 0;
        let bg;
        if (v === undefined) bg = 'transparent';
        else if (v >= 0.7) bg = `rgba(5,150,105,${0.3 + intensity * 0.5})`;
        else if (v >= 0.3) bg = `rgba(5,150,105,${0.1 + intensity * 0.3})`;
        else if (v <= -0.3) bg = `rgba(220,38,38,${0.1 + intensity * 0.3})`;
        else if (v <= -0.7) bg = `rgba(220,38,38,${0.3 + intensity * 0.5})`;
        else bg = 'rgba(128,128,128,0.1)';
        html += `<td class="corr-cell" style="background:${bg};" title="${escapeHtml(row)}↔${escapeHtml(col)}: ${val}">${val}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
  } catch (e) { console.error('Correlation Error:', e); }
}

/* ── Whale Wallet Tracker ── */
async function fetchWhaleWallets() {
  try {
    const data = await apiFetch('/api/whale-wallets', { silent: true });
    const feed = document.getElementById('whale-wallet-feed');
    if (!feed) return;

    if (data.transactions && data.transactions.length > 0) {
      feed.innerHTML = data.transactions.map(tx => {
        const icon = tx.type === 'INFLOW' ? '📥' : '📤';
        const color = tx.type === 'INFLOW' ? 'var(--neon-green)' : 'var(--neon-red)';
        return `<div class="whale-tx-item">
          <span class="whale-tx-icon">${icon}</span>
          <span class="whale-tx-amount" style="color:${color}">${(Number(tx.btc) || 0).toFixed(2)} BTC</span>
          <span class="whale-tx-usd">≈ $${(Number(tx.usd || 0)/1e6).toFixed(1)}M</span>
          <span class="whale-tx-time">${new Date(tx.time * 1000).toLocaleTimeString()}</span>
        </div>`;
      }).join('');
    } else {
      feed.innerHTML = `<div style="text-align:center;padding:12px;color:var(--text-muted);font-size:0.72rem;">${t('no_whale_wallets')}</div>`;
    }
  } catch (e) { console.error('Whale Wallets Error:', e); }
}

/* ── Liquidation Kill Zone ── */
async function fetchLiqZones() {
  try {
    const data = await apiFetch('/api/liq-zones', { silent: true });
    const el = document.getElementById('liq-zones');
    if (!el) return;

    if (data.current_price && data.zones) {
      const price = data.current_price;
      let html = `<div class="liq-current-price">BTC: $${price.toLocaleString()}</div>`;
      html += `<div class="liq-bias" style="color:${data.bias_color || '#888'};">${data.bias || ''}</div>`;
      html += '<div class="liq-bar-container">';

      data.zones.forEach(z => {
        // Long liq (price drop) — show as green bar below
        const longDist = ((z.long_liq_price - price) / price * 100).toFixed(1);
        const longWidth = Math.min(Math.abs(longDist) * 3, 80);
        // Short liq (price rise) — show as red bar above
        const shortDist = ((z.short_liq_price - price) / price * 100).toFixed(1);
        const shortWidth = Math.min(Math.abs(shortDist) * 3, 80);

        html += `<div class="liq-zone-row" style="display:flex; align-items:center; gap:4px; margin-bottom:3px;">
          <span class="liq-lev" style="width:32px; text-align:right; font-size:0.7rem; color:var(--text-muted);">${z.leverage}</span>
          <div style="flex:1; display:flex; gap:2px;">
            <div class="liq-bar-track" style="flex:1; position:relative; height:14px; background:rgba(255,255,255,0.03); border-radius:2px; overflow:hidden;">
              <div style="width:${longWidth}%; height:100%; background:var(--neon-green); opacity:0.7; border-radius:2px;"></div>
            </div>
            <div class="liq-bar-track" style="flex:1; position:relative; height:14px; background:rgba(255,255,255,0.03); border-radius:2px; overflow:hidden;">
              <div style="width:${shortWidth}%; height:100%; background:var(--neon-red); opacity:0.7; border-radius:2px;"></div>
            </div>
          </div>
          <span style="width:120px; font-size:0.65rem; color:var(--text-secondary); text-align:right;">
            $${z.long_liq_price.toLocaleString()} / $${z.short_liq_price.toLocaleString()}
          </span>
        </div>`;
      });

      html += '</div>';
      el.innerHTML = html;
    }
  } catch (e) { console.error('LiqZones Error:', e); }
}

/* ── Chart Modal (Price Card Click) ── */
let _modalChart = null;
let _modalResizeObserver = null;

function initTradingViewModal() {
  const modal = document.getElementById('tv-modal');
  const closeBtn = document.getElementById('tv-modal-close');
  if (!modal || !closeBtn) return;

  const destroyModal = () => {
    modal.style.display = 'none';
    if (_modalResizeObserver) { _modalResizeObserver.disconnect(); _modalResizeObserver = null; }
    if (_modalChart) { _modalChart.remove(); _modalChart = null; }
    document.getElementById('tv-chart-container').innerHTML = '';
  };

  closeBtn.addEventListener('click', destroyModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) destroyModal(); });

  // Attach click to price cards
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.price-card');
    if (!card) return;
    const symbol = card.querySelector('.coin-name')?.textContent?.trim();
    if (!symbol) return;
    openRyzmModalChart(symbol);
  });
}

function openRyzmModalChart(symbol) {
  const modal = document.getElementById('tv-modal');
  const title = document.getElementById('tv-modal-title');
  const container = document.getElementById('tv-chart-container');
  if (!modal || !container) return;

  const binanceSymbol = `${symbol.toUpperCase()}USDT`;
  title.textContent = `${symbol}/USDT`;
  modal.style.display = 'flex';
  container.innerHTML = '';

  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const t = isDark ? {
    bg: 'rgba(5, 8, 18, 0)', text: 'rgba(140, 160, 190, 0.65)',
    grid: 'rgba(30, 45, 70, 0.35)', cross: 'rgba(6, 182, 212, 0.35)',
    border: 'rgba(30, 45, 70, 0.5)', up: '#06d6a0', down: '#ef476f',
  } : {
    bg: 'rgba(250, 250, 252, 0)', text: 'rgba(70, 80, 100, 0.65)',
    grid: 'rgba(0, 0, 0, 0.06)', cross: 'rgba(6, 100, 150, 0.25)',
    border: 'rgba(0, 0, 0, 0.08)', up: '#059669', down: '#dc2626',
  };

  _modalChart = LightweightCharts.createChart(container, {
    width: container.clientWidth, height: container.clientHeight,
    layout: {
      background: { type: 'solid', color: t.bg }, textColor: t.text,
      fontFamily: "'Share Tech Mono', monospace", fontSize: 11,
    },
    grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
    crosshair: {
      vertLine: { color: t.cross, labelBackgroundColor: 'rgba(6,182,212,0.9)' },
      horzLine: { color: t.cross, labelBackgroundColor: 'rgba(6,182,212,0.9)' },
    },
    rightPriceScale: { borderColor: t.border },
    timeScale: { borderColor: t.border, timeVisible: true, secondsVisible: false },
    watermark: { visible: true, fontSize: 36, horzAlign: 'center', vertAlign: 'center',
      color: isDark ? 'rgba(6,182,212,0.06)' : 'rgba(0,0,0,0.03)', text: `${symbol}/USDT` },
  });

  const candleSeries = _modalChart.addCandlestickSeries({
    upColor: t.up, downColor: t.down, wickUpColor: t.up, wickDownColor: t.down, borderVisible: false,
  });
  const volSeries = _modalChart.addHistogramSeries({
    priceFormat: { type: 'volume' }, priceScaleId: 'vol',
  });
  _modalChart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

  // Fetch 1h klines for modal
  extFetch(`https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=1h&limit=300`, { timeoutMs: 10000 })
    .then(data => {
      const candles = data.map(k => ({
        time: Math.floor(k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4],
      }));
      const vols = data.map(k => ({
        time: Math.floor(k[0] / 1000), value: +k[5],
        color: +k[4] >= +k[1]
          ? (isDark ? 'rgba(6,214,160,0.18)' : 'rgba(5,150,105,0.15)')
          : (isDark ? 'rgba(239,71,111,0.18)' : 'rgba(220,38,38,0.15)'),
      }));
      candleSeries.setData(candles);
      volSeries.setData(vols);
      _modalChart.timeScale().fitContent();
    })
    .catch(err => console.error('[RyzmModal] kline fetch error:', err));

  // Resize on window resize
  if (_modalResizeObserver) _modalResizeObserver.disconnect();
  _modalResizeObserver = new ResizeObserver(() => {
    if (_modalChart) _modalChart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
  });
  _modalResizeObserver.observe(container);
}

/* ── PWA Service Worker Registration ── */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js', { updateViaCache: 'none' })
      .then(reg => {
        console.log('SW registered:', reg.scope);
        // Force check for updates on every page load
        reg.update().catch(() => {});
      })
      .catch(err => console.warn('SW registration failed:', err));
  }
}

/* ── Mini Heatmap (Upgraded) ── */
let _hmPeriod = '24h';
let _hmLastData = null;

function _hmGetChange(c, period) {
  if (period === '7d') return c.change_7d ?? c.change_24h ?? 0;
  return c.change_24h ?? 0;
}

function _hmColor(pct) {
  const abs = Math.abs(pct);
  if (pct > 8)  return { bg: '#059669', clr: '#fff' };
  if (pct > 3)  return { bg: `rgba(5,150,105,${Math.min(0.85, 0.3 + abs * 0.06)})`, clr: '#fff' };
  if (pct > 0)  return { bg: `rgba(5,150,105,${0.12 + abs * 0.06})`, clr: '#a7f3d0' };
  if (pct < -8) return { bg: '#dc2626', clr: '#fff' };
  if (pct < -3) return { bg: `rgba(220,38,38,${Math.min(0.85, 0.3 + abs * 0.06)})`, clr: '#fff' };
  if (pct < 0)  return { bg: `rgba(220,38,38,${0.12 + abs * 0.06})`, clr: '#fca5a5' };
  return { bg: 'rgba(100,100,120,0.25)', clr: '#94a3b8' };
}

function _hmColorSolid(pct) {
  if (pct > 0) return '#34d399';
  if (pct < 0) return '#f87171';
  return '#64748b';
}

function _hmFmtMcap(v) {
  if (!v) return '—';
  if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T';
  if (v >= 1e9)  return '$' + (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6)  return '$' + (v / 1e6).toFixed(1) + 'M';
  return '$' + (v / 1e3).toFixed(0) + 'K';
}

function _hmFmtVol(v) {
  if (!v) return '—';
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
  return '$' + (v / 1e3).toFixed(0) + 'K';
}

/* Squarify-lite treemap layout */
function _hmSquarify(items, W, H) {
  if (!items.length) return [];
  const total = items.reduce((s, i) => s + i.weight, 0);
  if (total <= 0) return [];
  const rects = [];
  let x = 0, y = 0, w = W, h = H;

  function layoutRow(row, rowArea, isHoriz) {
    const side = isHoriz ? h : w;
    const rowLen = rowArea / side;
    let pos = isHoriz ? y : x;
    row.forEach(item => {
      const itemLen = (item.weight / total) * (W * H) / rowLen;
      if (isHoriz) {
        rects.push({ ...item, rx: x, ry: pos, rw: rowLen, rh: itemLen });
        pos += itemLen;
      } else {
        rects.push({ ...item, rx: pos, ry: y, rw: itemLen, rh: rowLen });
        pos += itemLen;
      }
    });
    if (isHoriz) { x += rowLen; w -= rowLen; }
    else { y += rowLen; h -= rowLen; }
  }

  function worst(row, rowArea, side) {
    const s2 = side * side;
    let rMax = 0, rMin = Infinity;
    row.forEach(r => { rMax = Math.max(rMax, r.weight); rMin = Math.min(rMin, r.weight); });
    const ra2 = rowArea * rowArea;
    return Math.max((s2 * rMax) / ra2, ra2 / (s2 * rMin));
  }

  const sorted = items.map(it => ({ ...it, weight: (it.weight / total) * W * H })).sort((a, b) => b.weight - a.weight);
  let row = [], rowArea = 0;

  for (const item of sorted) {
    const isHoriz = w >= h;
    const side = isHoriz ? h : w;
    const newRow = [...row, item];
    const newArea = rowArea + item.weight;
    if (row.length === 0 || worst(newRow, newArea, side) <= worst(row, rowArea, side)) {
      row = newRow;
      rowArea = newArea;
    } else {
      layoutRow(row, rowArea, isHoriz);
      row = [item];
      rowArea = item.weight;
    }
  }
  if (row.length) layoutRow(row, rowArea, w >= h);
  return rects;
}

function _hmRenderTreemap(coins, period) {
  const grid = document.getElementById('heatmap-grid');
  if (!grid) return;

  const items = coins.map(c => ({
    ...c,
    weight: Math.max(c.mcap || 1, 1)
  }));

  const treemapEl = grid.querySelector('.hm-treemap') || document.createElement('div');
  treemapEl.className = 'hm-treemap';
  if (!grid.contains(treemapEl)) { grid.innerHTML = ''; grid.appendChild(treemapEl); }

  const W = treemapEl.offsetWidth || 320;
  const H = treemapEl.offsetHeight || 180;
  const rects = _hmSquarify(items, W, H);

  treemapEl.innerHTML = rects.map(r => {
    const pct = _hmGetChange(r, period);
    const { bg, clr } = _hmColor(pct);
    const c1h = r.change_1h ?? 0;
    const c24 = r.change_24h ?? 0;
    const showLabels = r.rw > 32 && r.rh > 28;
    const showTf = r.rw > 44 && r.rh > 38;

    return `<div class="heatmap-cell" data-symbol="${escapeHtml(r.symbol)}" data-name="${escapeHtml(r.name)}" data-price="${r.price||0}" data-c1h="${c1h}" data-c24="${c24}" data-c7d="${r.change_7d||0}" data-mcap="${r.mcap||0}" data-vol="${r.volume||0}" style="left:${r.rx.toFixed(1)}px;top:${r.ry.toFixed(1)}px;width:${r.rw.toFixed(1)}px;height:${r.rh.toFixed(1)}px;background:${safeColor(bg)};color:${safeColor(clr)};">
      ${showLabels ? `<span class="hm-symbol">${escapeHtml(r.symbol)}</span><span class="hm-pct">${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%</span>` : ''}
      ${showTf ? `<div class="hm-tf-bar"><span style="background:${safeColor(_hmColorSolid(c1h))}"></span><span style="background:${safeColor(_hmColorSolid(c24))}"></span></div>` : ''}
    </div>`;
  }).join('');
}

function _hmRenderDominance(data) {
  const domFill = document.getElementById('hm-btc-dom-fill');
  const domVal = document.getElementById('hm-btc-dom-val');
  const mcapEl = document.getElementById('hm-total-mcap');
  if (domFill && data.btc_dominance != null) {
    domFill.style.width = data.btc_dominance.toFixed(1) + '%';
  }
  if (domVal && data.btc_dominance != null) {
    domVal.textContent = data.btc_dominance.toFixed(1) + '%';
  }
  if (mcapEl && data.total_mcap) {
    mcapEl.textContent = _hmFmtMcap(data.total_mcap);
  }
}

function _hmRenderMovers(coins, period) {
  const sorted = [...coins].sort((a, b) => _hmGetChange(b, period) - _hmGetChange(a, period));
  const gainers = sorted.slice(0, 3);
  const losers = sorted.slice(-3).reverse();

  const gList = document.getElementById('hm-gainers-list');
  const lList = document.getElementById('hm-losers-list');
  if (gList) {
    gList.innerHTML = gainers.map(c => {
      const p = _hmGetChange(c, period);
      return `<span class="hm-mover-chip gain">${escapeHtml(c.symbol)} +${p.toFixed(1)}%</span>`;
    }).join('');
  }
  if (lList) {
    lList.innerHTML = losers.map(c => {
      const p = _hmGetChange(c, period);
      return `<span class="hm-mover-chip loss">${escapeHtml(c.symbol)} ${p.toFixed(1)}%</span>`;
    }).join('');
  }
}

function _hmInitTooltip() {
  const panel = document.getElementById('heatmap-section');
  const tip = document.getElementById('hm-tooltip');
  if (!panel || !tip || panel._hmTipInit) return;
  panel._hmTipInit = true;

  panel.addEventListener('mouseover', e => {
    const cell = e.target.closest('.heatmap-cell');
    if (!cell) { tip.classList.remove('show'); return; }
    const d = cell.dataset;
    const c1h = parseFloat(d.c1h) || 0;
    const c24 = parseFloat(d.c24) || 0;
    const c7d = parseFloat(d.c7d) || 0;
    const price = parseFloat(d.price) || 0;
    const mcap = parseFloat(d.mcap) || 0;
    const vol = parseFloat(d.vol) || 0;

    const fmtPct = v => `<span class="hm-tt-val ${v > 0 ? 'pos' : v < 0 ? 'neg' : 'neutral'}">${v >= 0 ? '+' : ''}${v.toFixed(2)}%</span>`;

    tip.innerHTML = `
      <div class="hm-tt-name">${escapeHtml(d.name)} (${escapeHtml(d.symbol?.toUpperCase())})</div>
      <div class="hm-tt-row"><span class="hm-tt-label">Price</span><span class="hm-tt-val neutral">$${price < 1 ? price.toPrecision(4) : price.toLocaleString(undefined, {maximumFractionDigits: 2})}</span></div>
      <div class="hm-tt-row"><span class="hm-tt-label">1H</span>${fmtPct(c1h)}</div>
      <div class="hm-tt-row"><span class="hm-tt-label">24H</span>${fmtPct(c24)}</div>
      <div class="hm-tt-row"><span class="hm-tt-label">7D</span>${fmtPct(c7d)}</div>
      <div class="hm-tt-row"><span class="hm-tt-label">MCap</span><span class="hm-tt-val neutral">${_hmFmtMcap(mcap)}</span></div>
      <div class="hm-tt-row"><span class="hm-tt-label">Vol 24h</span><span class="hm-tt-val neutral">${_hmFmtVol(vol)}</span></div>
    `;
    tip.classList.add('show');

    const rect = panel.getBoundingClientRect();
    const cr = cell.getBoundingClientRect();
    let tx = cr.left - rect.left + cr.width + 6;
    let ty = cr.top - rect.top;
    if (tx + 180 > rect.width) tx = cr.left - rect.left - 180;
    if (ty + 160 > rect.height) ty = rect.height - 165;
    tip.style.left = tx + 'px';
    tip.style.top = ty + 'px';
  });

  panel.addEventListener('mouseleave', () => tip.classList.remove('show'));
}

function _hmInitPeriodToggle() {
  const wrap = document.getElementById('hm-period-toggle');
  if (!wrap || wrap._hmInit) return;
  wrap._hmInit = true;
  wrap.addEventListener('click', e => {
    const btn = e.target.closest('.hm-period-btn');
    if (!btn || btn.classList.contains('active')) return;
    wrap.querySelectorAll('.hm-period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    _hmPeriod = btn.dataset.period;
    if (_hmLastData) {
      _hmRenderTreemap(_hmLastData.coins, _hmPeriod);
      _hmRenderMovers(_hmLastData.coins, _hmPeriod);
    }
  });
}

async function fetchHeatmap() {
  try {
    const data = await apiFetch('/api/heatmap', { silent: true });
    if (!data || !data.coins || data.coins.length === 0) return;
    _hmLastData = data;

    _hmInitTooltip();
    _hmInitPeriodToggle();
    _hmRenderDominance(data);
    _hmRenderMovers(data.coins, _hmPeriod);
    _hmRenderTreemap(data.coins, _hmPeriod);
  } catch (e) { console.error('Heatmap Error:', e); }
}

/* ── Health Check / Connection Status ── */
async function fetchHealthCheck() {
  try {
    const data = await apiFetch('/api/health-check', { silent: true });
    const dot = document.getElementById('connection-status');
    const srcEl = document.getElementById('data-sources');
    const tooltip = document.getElementById('source-tooltip');

    if (dot) {
      const ok = data.sources.filter(s => s.status === 'ok').length;
      const total = data.sources.length;
      dot.className = ok === total ? 'status-dot dot-green' : ok > total/2 ? 'status-dot dot-yellow' : 'status-dot dot-red';
    }
    if (srcEl) {
      const ok = data.sources.filter(s => s.status === 'ok').length;
      srcEl.textContent = `${ok}/${data.sources.length} Sources`;
    }
    if (tooltip) {
      tooltip.innerHTML = data.sources.map(s => {
        const icon = s.status === 'ok' ? '🟢' : '🔴';
        return `<div class="src-row">${icon} ${escapeHtml(s.name)}</div>`;
      }).join('');
    }
  } catch(e) {
    const dot = document.getElementById('connection-status');
    if (dot) dot.className = 'status-dot dot-red';
    console.error('HealthCheck Error:', e);
  }
}

let _refreshDebounce = false;
async function refreshAllData() {
  if (_refreshDebounce) return;
  _refreshDebounce = true;
  setTimeout(() => { _refreshDebounce = false; }, 5000);

  try {
    // Delegate to central scheduler for dedup/backoff
    if (typeof RyzmScheduler !== 'undefined') {
      await RyzmScheduler.triggerAll();
    } else {
      // Fallback if scheduler not loaded yet
      await Promise.allSettled([
        fetchMacroTicker(),
        fetchNews(),
        fetchRealtimePrices(),
        fetchLongShortRatio(),
        fetchFundingRate(),
        fetchWhaleFeed(),
        fetchCalendar(),
        fetchRiskGauge(),
        fetchHeatmap(),
        fetchFearGreedChart(),
        fetchMultiTimeframe(),
        fetchOnChainData(),
        fetchScanner(),
        fetchRegime(),
        fetchCorrelation(),
        fetchWhaleWallets(),
        fetchLiqZones(),
        fetchKimchi(),
        fetchHealthCheck()
      ]);
    }

    // Trigger pulse indicators
    pulsePanels(['pulse-narratives', 'pulse-kimchi']);

    // Update last refresh time
    updateLastRefreshTime();

    showToast('success', '✓ Refreshed', 'All panels updated');
  } catch (e) {
    console.error('Refresh error:', e);
    showToast('error', '⚠ Refresh Failed', 'Could not update data sources');
  }
}

/* ─── Pulse Indicators ─── */
function initPulseIndicators() {
  // Auto-pulse when data updates
  setInterval(() => {
    const indicators = ['pulse-narratives', 'pulse-kimchi'];
    indicators.forEach(id => {
      const el = document.getElementById(id);
      if (el && Math.random() > 0.7) { // 30% chance to pulse
        el.classList.add('updating');
        setTimeout(() => el.classList.remove('updating'), 800);
      }
    });
  }, 15000); // Every 15 seconds
}

function pulsePanels(panelIds) {
  panelIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add('updating');
      setTimeout(() => el.classList.remove('updating'), 800);
    }
  });
}

/* ─── Status Bar Updates ─── */
function initStatusBar() {
  updateConnectionStatus();
  updateLastRefreshTime();
  setInterval(updateConnectionStatus, 5000);
}

function updateConnectionStatus() {
  const statusDot = document.getElementById('connection-status');
  if (!statusDot) return;

  // Use lightweight /health endpoint instead of /api/market
  apiFetch('/health', { silent: true, timeoutMs: 5000, retries: 0 })
    .then(() => {
      statusDot.classList.remove('offline');
    })
    .catch(() => {
      statusDot.classList.add('offline');
    });
}

/* updateLastRefreshTime — see "Live Time Ago" section at bottom */

/* ─── Add spin animation keyframe ─── */
if (!document.getElementById('spin-animation-style')) {
  const style = document.createElement('style');
  style.id = 'spin-animation-style';
  style.textContent = `
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}

/* ─── Keyboard Shortcuts ─── */
document.addEventListener('keydown', (e) => {
  // Ctrl/Cmd + R: Refresh all data
  if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
    e.preventDefault();
    document.getElementById('btn-refresh-all')?.click();
  }

  // Ctrl/Cmd + /: Open chat
  if ((e.ctrlKey || e.metaKey) && e.key === '/') {
    e.preventDefault();
    document.getElementById('chat-float-btn')?.click();
  }

  // ? key: Show shortcuts modal
  if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
    e.preventDefault();
    toggleShortcutsModal();
  }

  // D key: Toggle dark mode (when not in input)
  if (e.key === 'd' && !e.ctrlKey && !e.metaKey) {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
    toggleTheme();
  }

  // F key: Fullscreen toggle (when not in input)
  if (e.key === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
    e.preventDefault();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      showToast('success', '⛶ Fullscreen', 'Press F or F11 to exit');
    } else {
      document.exitFullscreen();
    }
  }

  // F11: Fullscreen (browser default, but we show toast)
  if (e.key === 'F11') {
    setTimeout(() => {
      const isFullscreen = !!document.fullscreenElement;
      if (isFullscreen) {
        showToast('success', '⛶ Fullscreen', 'Press F or F11 to exit');
      }
    }, 100);
  }

  // 1, 2, 3: Scroll to panel & flash
  if (['1', '2', '3'].includes(e.key) && !e.ctrlKey && !e.metaKey) {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
    const panelIds = { '1': 'panel-left', '2': 'panel-center', '3': 'panel-right' };
    const panel = document.getElementById(panelIds[e.key]);
    if (panel) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      panel.classList.add('panel-focus-flash');
      panel.addEventListener('animationend', () => panel.classList.remove('panel-focus-flash'), { once: true });
    }
  }

  // Escape: Close modals
  if (e.key === 'Escape') {
    const chatOverlay = document.getElementById('chat-overlay');
    if (chatOverlay && chatOverlay.classList.contains('active')) {
      chatOverlay.classList.remove('active');
      return;
    }
    const shortcutsEl = document.querySelector('.shortcuts-overlay');
    if (shortcutsEl) {
      shortcutsEl.remove();
      return;
    }
  }
});

/* ─── AI Council Prediction History ─── */
async function fetchCouncilHistory() {
  try {
    const data = await apiFetch('/api/council/history?limit=30', { silent: true });
    renderCouncilHistory(data);
  } catch (e) {
    console.error('[CouncilHistory]', e);
  }
}

function renderCouncilHistory(data) {
  const { records, stats, score_vs_btc, accuracy_by_horizon } = data;

  // Stats boxes
  const elTotal = document.getElementById('ch-total');
  const elAccuracy = document.getElementById('ch-accuracy');
  const elHits = document.getElementById('ch-hits');
  if (elTotal) elTotal.textContent = stats.total_sessions;
  if (elAccuracy) {
    elAccuracy.textContent = stats.accuracy_pct !== null ? `${stats.accuracy_pct}%` : '—';
    if (stats.accuracy_pct !== null) {
      elAccuracy.style.color = stats.accuracy_pct >= 60 ? 'var(--neon-green)' :
        stats.accuracy_pct >= 40 ? 'var(--neon-cyan)' : 'var(--neon-red)';
    }
  }
  if (elHits) elHits.textContent = `${stats.hits}/${stats.evaluated}`;

  // Multi-horizon accuracy pills (with coverage & confidence)
  if (accuracy_by_horizon) {
    for (const [key, hz] of Object.entries(accuracy_by_horizon)) {
      const mins = key.replace('min', '');
      const el = document.getElementById(`ch-hz-${mins}`);
      if (el) {
        if (hz.accuracy_pct !== null && hz.evaluated > 0) {
          el.textContent = `${hz.accuracy_pct}%`;
          el.style.color = hz.accuracy_pct >= 60 ? 'var(--neon-green)' :
            hz.accuracy_pct >= 40 ? 'var(--neon-cyan)' : 'var(--neon-red)';
          const covStr = hz.coverage_pct !== null ? ` | cov ${hz.coverage_pct}%` : '';
          const highConf = hz.by_confidence && hz.by_confidence.HIGH;
          const highStr = highConf && highConf.accuracy_pct !== null
            ? ` | HIGH: ${highConf.accuracy_pct}% (${highConf.hits}/${highConf.evaluated})`
            : '';
          el.title = `${hz.hits}/${hz.evaluated} hits` +
            (hz.avg_return_pct !== null ? ` | avg ${hz.avg_return_pct > 0 ? '+' : ''}${hz.avg_return_pct}%` : '') +
            covStr + highStr;
        } else {
          el.textContent = '—';
          el.title = 'Not enough data';
        }
      }
    }
  }

  // Score sparkline chart
  drawCouncilSparkline(records.slice().reverse());

  // Score vs BTC Overlay Chart
  drawScoreVsBtcOverlay(records.slice().reverse());

  // PR-5: Cumulative return curve
  drawEquityCurve(records.slice().reverse());

  // PR-5: Regime performance badges
  renderRegimeBadges(records, score_vs_btc);

  // Score vs BTC Stats
  if (score_vs_btc) {
    const bullAvg = document.getElementById('ch-bull-avg');
    const bearAvg = document.getElementById('ch-bear-avg');
    if (bullAvg) {
      if (score_vs_btc.bull_zone_avg !== null) {
        const sign = score_vs_btc.bull_zone_avg > 0 ? '+' : '';
        bullAvg.textContent = `${sign}${score_vs_btc.bull_zone_avg.toFixed(2)}%`;
        bullAvg.title = `${score_vs_btc.samples_bull} samples`;
      } else {
        bullAvg.textContent = 'N/A';
      }
    }
    if (bearAvg) {
      if (score_vs_btc.bear_zone_avg !== null) {
        const sign = score_vs_btc.bear_zone_avg > 0 ? '+' : '';
        bearAvg.textContent = `${sign}${score_vs_btc.bear_zone_avg.toFixed(2)}%`;
        bearAvg.title = `${score_vs_btc.samples_bear} samples`;
      } else {
        bearAvg.textContent = 'N/A';
      }
    }
  }

  // Records list
  const container = document.getElementById('ch-records');
  if (!container || !records.length) return;

  container.innerHTML = records.slice(0, 15).map(r => {
    const scoreColor = r.consensus_score > 60 ? 'var(--neon-green)' :
      r.consensus_score < 40 ? 'var(--neon-red)' : 'var(--text-main)';
    const hitIcon = r.hit === 1 ? '<span class="ch-hit">✓</span>' :
      r.hit === 0 ? '<span class="ch-miss">✗</span>' :
      '<span class="ch-pending">⏳</span>';
    const time = r.timestamp ? r.timestamp.split(' ')[1] || r.timestamp : '—';
    return `<div class="ch-record-row">
      <span class="ch-record-time">${escapeHtml(time)}</span>
      <span class="ch-record-score" style="color:${scoreColor}">${parseInt(r.consensus_score) || 0}</span>
      <span class="ch-record-vibe">${escapeHtml(r.vibe_status || '—')}</span>
      <span class="ch-record-hit">${hitIcon}</span>
    </div>`;
  }).join('');
}

/* ═══ Council Score vs BTC Price Overlay Chart ═══ */
function drawScoreVsBtcOverlay(records) {
  const canvas = document.getElementById('ch-overlay-canvas');
  if (!canvas || !records.length) return;

  // Filter records with valid btc_price
  const valid = records.filter(r => r.btc_price && r.btc_price > 0);
  if (valid.length < 2) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = { top: 8, right: 36, bottom: 14, left: 24 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;

  ctx.clearRect(0, 0, w, h);

  const scores = valid.map(r => r.consensus_score || 50);
  const prices = valid.map(r => r.btc_price);

  const minPrice = Math.min(...prices) * 0.998;
  const maxPrice = Math.max(...prices) * 1.002;

  const step = cw / Math.max(valid.length - 1, 1);
  const yScore = (v) => pad.top + ch * (1 - v / 100);
  const yPrice = (v) => pad.top + ch * (1 - (v - minPrice) / (maxPrice - minPrice));

  // Bull/Bear zone backgrounds
  ctx.fillStyle = 'rgba(5,150,105,0.04)';
  ctx.fillRect(pad.left, yScore(100), cw, yScore(70) - yScore(100));
  ctx.fillStyle = 'rgba(220,38,38,0.04)';
  ctx.fillRect(pad.left, yScore(30), cw, yScore(0) - yScore(30));

  // 70 and 30 threshold lines
  ctx.strokeStyle = 'rgba(5,150,105,0.2)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(pad.left, yScore(70));
  ctx.lineTo(pad.left + cw, yScore(70));
  ctx.stroke();
  ctx.strokeStyle = 'rgba(220,38,38,0.2)';
  ctx.beginPath();
  ctx.moveTo(pad.left, yScore(30));
  ctx.lineTo(pad.left + cw, yScore(30));
  ctx.stroke();
  ctx.setLineDash([]);

  // BTC Price line (right axis — orange)
  ctx.beginPath();
  prices.forEach((p, i) => {
    const x = pad.left + i * step;
    const y = yPrice(p);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.7;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Council Score line (left axis — cyan)
  ctx.beginPath();
  scores.forEach((s, i) => {
    const x = pad.left + i * step;
    const y = yScore(s);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Score dots with bull/bear coloring
  valid.forEach((r, i) => {
    const x = pad.left + i * step;
    const y = yScore(r.consensus_score || 50);
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = (r.consensus_score >= 70) ? '#059669' :
                    (r.consensus_score <= 30) ? '#dc2626' : '#0284c7';
    ctx.fill();
  });

  // Left Y-axis labels (Score)
  ctx.font = '7px monospace';
  ctx.fillStyle = '#0284c7';
  ctx.textAlign = 'right';
  [0, 30, 50, 70, 100].forEach(v => {
    ctx.fillText(v.toString(), pad.left - 3, yScore(v) + 3);
  });

  // Right Y-axis labels (BTC Price)
  ctx.fillStyle = '#f59e0b';
  ctx.textAlign = 'left';
  const priceSteps = 4;
  for (let i = 0; i <= priceSteps; i++) {
    const p = minPrice + (maxPrice - minPrice) * (i / priceSteps);
    const label = p >= 1000 ? `${(p / 1000).toFixed(1)}k` : p.toFixed(0);
    ctx.fillText(label, pad.left + cw + 3, yPrice(p) + 3);
  }

  // Legend
  ctx.font = '6px sans-serif';
  ctx.fillStyle = '#0284c7';
  ctx.textAlign = 'left';
  ctx.fillRect(pad.left + 2, pad.top, 8, 2);
  ctx.fillText('Score', pad.left + 12, pad.top + 3);
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(pad.left + 42, pad.top, 8, 2);
  ctx.fillText('BTC', pad.left + 52, pad.top + 3);
}

function drawCouncilSparkline(records) {
  const canvas = document.getElementById('ch-canvas');
  if (!canvas || !records.length) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = 4;

  ctx.clearRect(0, 0, w, h);

  // Draw 50-line (neutral)
  const mid = pad + (h - 2 * pad) * (1 - 50 / 100);
  ctx.strokeStyle = 'rgba(100,116,139,0.3)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(pad, mid);
  ctx.lineTo(w - pad, mid);
  ctx.stroke();
  ctx.setLineDash([]);

  const scores = records.map(r => r.consensus_score || 50);
  const step = (w - 2 * pad) / Math.max(scores.length - 1, 1);

  // Gradient fill
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, 'rgba(5,150,105,0.2)');
  gradient.addColorStop(0.5, 'rgba(2,132,199,0.08)');
  gradient.addColorStop(1, 'rgba(220,38,38,0.2)');

  ctx.beginPath();
  ctx.moveTo(pad, h - pad);
  scores.forEach((s, i) => {
    const x = pad + i * step;
    const y = pad + (h - 2 * pad) * (1 - s / 100);
    if (i === 0) ctx.lineTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(pad + (scores.length - 1) * step, h - pad);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Line
  ctx.beginPath();
  scores.forEach((s, i) => {
    const x = pad + i * step;
    const y = pad + (h - 2 * pad) * (1 - s / 100);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--neon-cyan').trim() || '#0284c7';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Dots with hit/miss color
  records.forEach((r, i) => {
    const x = pad + i * step;
    const y = pad + (h - 2 * pad) * (1 - (r.consensus_score || 50) / 100);
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = r.hit === 1 ? '#059669' : r.hit === 0 ? '#dc2626' : '#94a3b8';
    ctx.fill();
  });
}

// Load council history on page load
setTimeout(() => fetchCouncilHistory(), 3000);


/* ─── Page Visibility API - Pause/Resume polling via RyzmScheduler ─── */
let isPageVisible = true;
document.addEventListener('visibilitychange', () => {
  isPageVisible = !document.hidden;
  if (typeof RyzmScheduler === 'undefined') return;
  if (isPageVisible) {
    console.log('[Visibility] Page visible — resuming scheduler');
    RyzmScheduler.resumeAll();
  } else {
    console.log('[Visibility] Page hidden — pausing scheduler');
    RyzmScheduler.pauseAll();
  }
});

/* ─── Performance Monitor (Debug Only) ─── */
// Disabled in production. Uncomment for debugging:
// if (window.performance && window.performance.memory) {
//   setInterval(() => {
//     const memory = window.performance.memory;
//     const used = (memory.usedJSHeapSize / 1048576).toFixed(2);
//     const total = (memory.totalJSHeapSize / 1048576).toFixed(2);
//     console.log(`Memory: ${used}MB / ${total}MB`);
//   }, 60000);
// }

/* ═══════════════════════════════════════
   #3 Fear & Greed Index (Upgraded v2)
   ═══════════════════════════════════════ */

// ── Helpers ──

/** Score → zone color */
function _fgColor(score) {
  if (score < 25) return '#dc2626';
  if (score < 45) return '#f97316';
  if (score < 55) return '#eab308';
  if (score < 75) return '#06b6d4';
  return '#059669';
}

/** Score → emoji + short comment (EN / KO) */
function _fgMood(score, lang) {
  const moods = [
    { max: 12, emoji: '😱', en: 'Extreme panic. Blood on the streets.',      ko: '극도의 패닉. 시장이 공포에 빠졌어요.' },
    { max: 25, emoji: '😰', en: 'Heavy fear lingers in the market.',         ko: '강한 공포가 시장을 지배합니다.' },
    { max: 40, emoji: '😟', en: 'Traders remain cautious and uneasy.',       ko: '불안감이 퍼져 있는 상태입니다.' },
    { max: 55, emoji: '😐', en: 'Market sentiment is balanced, neutral.',    ko: '중립적 분위기. 관망세가 이어지네요.' },
    { max: 70, emoji: '🙂', en: 'Optimism is building slowly.',              ko: '낙관론이 서서히 고개를 듭니다.' },
    { max: 85, emoji: '🤑', en: 'Greed is rising — stay vigilant.',          ko: '탐욕이 퍼지고 있어요. 경계하세요.' },
    { max: 101, emoji: '🚀', en: 'Extreme greed! Possible overheating.',     ko: '극단적 탐욕! 과열 신호입니다.' }
  ];
  const m = moods.find(m => score < m.max) || moods[moods.length - 1];
  return { emoji: m.emoji, comment: lang === 'ko' ? m.ko : m.en };
}

/** Persistent state for period toggle */
let _fgPeriod = 7;
let _fgLastData = null;

/** Draw semicircle arc gauge */
function _drawFGGauge(score) {
  const canvas = document.getElementById('fg-gauge-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = 180, H = 110;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const cx = W / 2, cy = H - 10, r = 72;
  const startAngle = Math.PI;
  const endAngle = 2 * Math.PI;
  const lineW = 14;

  // Background track
  ctx.beginPath();
  ctx.arc(cx, cy, r, startAngle, endAngle);
  ctx.strokeStyle = 'rgba(100,116,139,0.15)';
  ctx.lineWidth = lineW;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Color arc segments (gradient stops)
  const segs = [
    { from: 0,    to: 0.25,  color: '#dc2626' },
    { from: 0.25, to: 0.45,  color: '#f97316' },
    { from: 0.45, to: 0.55,  color: '#eab308' },
    { from: 0.55, to: 0.75,  color: '#06b6d4' },
    { from: 0.75, to: 1,     color: '#059669' }
  ];
  segs.forEach(s => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle + s.from * Math.PI, startAngle + s.to * Math.PI);
    ctx.strokeStyle = s.color;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = lineW;
    ctx.lineCap = 'butt';
    ctx.stroke();
    ctx.globalAlpha = 1;
  });

  // Active arc (0→score)
  const pct = Math.min(Math.max(score / 100, 0), 1);
  const activeEnd = startAngle + pct * Math.PI;
  const activeGrad = ctx.createConicGradient(startAngle, cx, cy);
  activeGrad.addColorStop(0, '#dc2626');
  activeGrad.addColorStop(0.25, '#f97316');
  activeGrad.addColorStop(0.45, '#eab308');
  activeGrad.addColorStop(0.65, '#06b6d4');
  activeGrad.addColorStop(1, '#059669');

  ctx.beginPath();
  ctx.arc(cx, cy, r, startAngle, activeEnd);
  ctx.strokeStyle = _fgColor(score);
  ctx.lineWidth = lineW;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Needle dot
  const nx = cx + r * Math.cos(activeEnd);
  const ny = cy + r * Math.sin(activeEnd);
  ctx.beginPath();
  ctx.arc(nx, ny, 5, 0, 2 * Math.PI);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(nx, ny, 3, 0, 2 * Math.PI);
  ctx.fillStyle = _fgColor(score);
  ctx.fill();

  // Min / Max labels
  ctx.font = '600 9px sans-serif';
  ctx.fillStyle = 'rgba(100,116,139,0.6)';
  ctx.textAlign = 'left';
  ctx.fillText('0', cx - r - 4, cy + 14);
  ctx.textAlign = 'right';
  ctx.fillText('100', cx + r + 4, cy + 14);
}

/** Enhanced history chart with zone colors + date labels + hover tooltip */
function _drawFGHistoryChart(history, period) {
  const canvas = document.getElementById('fg-canvas');
  if (!canvas || !history.length) return;

  // Filter by period
  const slice = history.slice(0, period).reverse(); // oldest first
  if (!slice.length) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width, h = rect.height;
  const padT = 6, padB = 20, padL = 6, padR = 6;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  ctx.clearRect(0, 0, w, h);

  // Zone backgrounds
  const zones = [
    { lo: 75, hi: 100, color: 'rgba(5,150,105,0.08)' },
    { lo: 55, hi: 75,  color: 'rgba(6,182,212,0.06)' },
    { lo: 45, hi: 55,  color: 'rgba(234,179,8,0.06)' },
    { lo: 25, hi: 45,  color: 'rgba(249,115,22,0.06)' },
    { lo: 0,  hi: 25,  color: 'rgba(220,38,38,0.08)' }
  ];
  zones.forEach(z => {
    const y1 = padT + chartH * (1 - z.hi / 100);
    const y2 = padT + chartH * (1 - z.lo / 100);
    ctx.fillStyle = z.color;
    ctx.fillRect(padL, y1, chartW, y2 - y1);
  });

  // 50-line
  const midY = padT + chartH * 0.5;
  ctx.strokeStyle = 'rgba(100,116,139,0.25)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(padL, midY);
  ctx.lineTo(w - padR, midY);
  ctx.stroke();
  ctx.setLineDash([]);

  const values = slice.map(h => h.value);
  const step = chartW / Math.max(values.length - 1, 1);

  // Gradient fill
  const grad = ctx.createLinearGradient(0, padT, 0, padT + chartH);
  grad.addColorStop(0, 'rgba(5,150,105,0.22)');
  grad.addColorStop(0.5, 'rgba(234,179,8,0.08)');
  grad.addColorStop(1, 'rgba(220,38,38,0.22)');
  ctx.beginPath();
  ctx.moveTo(padL, padT + chartH);
  values.forEach((v, i) => {
    ctx.lineTo(padL + i * step, padT + chartH * (1 - v / 100));
  });
  ctx.lineTo(padL + (values.length - 1) * step, padT + chartH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = padL + i * step;
    const y = padT + chartH * (1 - v / 100);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#eab308';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Dots
  values.forEach((v, i) => {
    const x = padL + i * step;
    const y = padT + chartH * (1 - v / 100);
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = _fgColor(v);
    ctx.fill();
  });

  // Last value label
  const last = values[values.length - 1];
  const lx = padL + (values.length - 1) * step;
  const ly = padT + chartH * (1 - last / 100);
  ctx.font = 'bold 9px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'right';
  ctx.fillText(last, lx - 4, ly - 5);

  // Date labels on x-axis
  ctx.font = '500 8px sans-serif';
  ctx.fillStyle = 'rgba(100,116,139,0.6)';
  ctx.textAlign = 'center';
  const labelCount = Math.min(slice.length, 5);
  const every = Math.max(1, Math.floor((slice.length - 1) / (labelCount - 1)));
  for (let i = 0; i < slice.length; i += every) {
    const ts = slice[i].ts;
    const d = new Date(typeof ts === 'number' ? (ts > 1e12 ? ts : ts * 1000) : ts);
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    ctx.fillText(label, padL + i * step, h - 4);
  }
  // Always draw last date
  if ((slice.length - 1) % every !== 0) {
    const ts = slice[slice.length - 1].ts;
    const d = new Date(typeof ts === 'number' ? (ts > 1e12 ? ts : ts * 1000) : ts);
    ctx.fillText(`${d.getMonth() + 1}/${d.getDate()}`, padL + (slice.length - 1) * step, h - 4);
  }

  // Setup hover tooltip
  _setupFGChartTooltip(canvas, slice, padL, padT, chartW, chartH, step);
}

/** Hover tooltip for chart */
function _setupFGChartTooltip(canvas, sliceData, padL, padT, chartW, chartH, step) {
  // Remove any existing tooltip
  let tooltip = canvas.parentElement.querySelector('.fg-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'fg-tooltip';
    canvas.parentElement.style.position = 'relative';
    canvas.parentElement.appendChild(tooltip);
  }

  // Remove old listeners
  const newCanvas = canvas; // same element, remove via named handler
  newCanvas._fgMove && newCanvas.removeEventListener('mousemove', newCanvas._fgMove);
  newCanvas._fgLeave && newCanvas.removeEventListener('mouseleave', newCanvas._fgLeave);

  newCanvas._fgMove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const idx = Math.round((mx - padL) / step);
    if (idx < 0 || idx >= sliceData.length) { tooltip.classList.remove('visible'); return; }
    const item = sliceData[idx];
    const d = new Date(typeof item.ts === 'number' ? (item.ts > 1e12 ? item.ts : item.ts * 1000) : item.ts);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    tooltip.innerHTML = `<span style="color:${_fgColor(item.value)};font-weight:700">${item.value}</span> <span style="opacity:0.6">${dateStr}</span>`;
    tooltip.classList.add('visible');
    const tx = padL + idx * step;
    const ty = padT + chartH * (1 - item.value / 100);
    tooltip.style.left = `${Math.min(tx, rect.width - 90)}px`;
    tooltip.style.top = `${ty - 28}px`;
  };
  newCanvas._fgLeave = () => { tooltip.classList.remove('visible'); };
  newCanvas.addEventListener('mousemove', newCanvas._fgMove);
  newCanvas.addEventListener('mouseleave', newCanvas._fgLeave);
}

/** Main fetch + render */
async function fetchFearGreedChart() {
  try {
    const data = await apiFetch('/api/fear-greed', { silent: true });
    _fgLastData = data;
    const score = data.score ?? 0;
    const lang = (typeof _currentLang !== 'undefined') ? _currentLang : 'en';

    // 1) Gauge
    _drawFGGauge(score);

    // 2) Score + label
    const scoreEl = document.getElementById('fg-score-big');
    const labelEl = document.getElementById('fg-label-big');
    if (scoreEl) { scoreEl.textContent = score; scoreEl.style.color = _fgColor(score); }
    if (labelEl && data.label) labelEl.textContent = data.label;

    // 3) Emoji + comment
    const mood = _fgMood(score, lang);
    const emojiEl = document.getElementById('fg-emoji');
    const commentEl = document.getElementById('fg-comment');
    if (emojiEl) emojiEl.textContent = mood.emoji;
    if (commentEl) commentEl.textContent = mood.comment;

    // 4) Delta
    const deltaEl = document.getElementById('fg-delta');
    const arrowEl = document.getElementById('fg-delta-arrow');
    const valEl = document.getElementById('fg-delta-val');
    if (deltaEl && data.delta !== undefined && data.delta !== null) {
      const d = data.delta;
      deltaEl.className = 'fg-delta ' + (d > 0 ? 'up' : d < 0 ? 'down' : 'flat');
      if (arrowEl) arrowEl.textContent = d > 0 ? '▲' : d < 0 ? '▼' : '─';
      if (valEl) valEl.textContent = (d > 0 ? '+' : '') + d;
    }

    // 5) Stats bar
    const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.textContent = v; };
    set('fg-avg-7d', data.avg_7d ?? '--');
    set('fg-avg-14d', data.avg_14d ?? '--');
    set('fg-avg-30d', data.avg_30d ?? '--');
    if (data.min_30d != null && data.max_30d != null) set('fg-range-30d', `${data.min_30d}–${data.max_30d}`);

    // 6) Chart
    if (data.history && data.history.length > 0) {
      _drawFGHistoryChart(data.history, _fgPeriod);
    }
  } catch (e) {
    console.error('[FG]', e);
  }
}

/** Period toggle click handler — attached once via event delegation */
(function _initFGPeriodTabs() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.fg-period-btn');
    if (!btn) return;
    const period = parseInt(btn.dataset.period, 10);
    if (!period || period === _fgPeriod) return;
    _fgPeriod = period;
    btn.closest('.fg-period-tabs').querySelectorAll('.fg-period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (_fgLastData && _fgLastData.history) {
      _drawFGHistoryChart(_fgLastData.history, period);
    }
  });
})();

/* ═══════════════════════════════════════
   #4 Multi-Timeframe Analysis
   ═══════════════════════════════════════ */
async function fetchMultiTimeframe() {
  try {
    const data = await apiFetch('/api/multi-timeframe', { silent: true });
    renderMultiTimeframe(data);
  } catch (e) {
    console.error('[MTF]', e);
  }
}

function renderMultiTimeframe(data) {
  const symbolEl = document.getElementById('mtf-symbol');
  const tbody = document.getElementById('mtf-tbody');
  if (!tbody) return;

  if (symbolEl && data.symbol) symbolEl.textContent = data.symbol;

  const tf = data.timeframes || {};
  const order = ['1h', '4h', '1d', '1w'];
  const labels = { '1h': '1H', '4h': '4H', '1d': '1D', '1w': '1W' };

  tbody.innerHTML = order.map(key => {
    const d = tf[key];
    if (!d) return '';

    const rsiColor = d.rsi > 70 ? '#dc2626' : d.rsi < 30 ? '#059669' : 'var(--text-main)';
    const emaStatus = d.ema20 > d.ema50 ? '🟢' : d.ema20 < d.ema50 ? '🔴' : '⚪';

    const signalColors = {
      'BUY': '#059669', 'SELL': '#dc2626', 'HOLD': '#eab308', 'N/A': 'var(--text-muted)'
    };
    const signalEmoji = {
      'BUY': '▲', 'SELL': '▼', 'HOLD': '—', 'N/A': '?'
    };
    const sc = signalColors[d.signal] || 'var(--text-muted)';

    return `<tr>
      <td style="font-weight:700;font-family:var(--font-mono);">${labels[key]}</td>
      <td style="color:${rsiColor};font-family:var(--font-mono);">${d.rsi}</td>
      <td>${emaStatus} <span style="font-size:0.65rem;color:var(--text-muted);">${d.ema20 > d.ema50 ? 'Bull' : d.ema20 < d.ema50 ? 'Bear' : '—'}</span></td>
      <td style="color:${sc};font-weight:700;">${signalEmoji[d.signal] || ''} ${d.signal}</td>
    </tr>`;
  }).join('');
}

/* ═══════════════════════════════════════
   #8 On-Chain Data Panel
   ═══════════════════════════════════════ */
async function fetchOnChainData() {
  try {
    const data = await apiFetch('/api/onchain', { silent: true });
    renderOnChainData(data);
  } catch (e) {
    console.error('[OnChain]', e);
  }
}

function renderOnChainData(data) {
  _renderOI(data);
  _renderFunding(data);
  _renderMempool(data);
  _renderHashrate(data);
  _renderLiqZones(data);
  _initOCSectionToggles();
}

/* --- OI with 24h change bar --- */
function _renderOI(data) {
  const oiGrid = document.getElementById('oc-oi');
  if (!oiGrid || !data.open_interest || !data.open_interest.length) return;
  oiGrid.innerHTML = data.open_interest.map(o => {
    const oiStr = o.oi_usd >= 1e9 ? `$${(o.oi_usd/1e9).toFixed(2)}B` : `$${(o.oi_usd/1e6).toFixed(0)}M`;
    const chg = o.change_pct || 0;
    const dir = chg > 0 ? 'up' : chg < 0 ? 'down' : 'flat';
    const arrow = chg > 0 ? '▲' : chg < 0 ? '▼' : '—';
    const barW = Math.min(Math.abs(chg) * 5, 100);
    const barColor = dir === 'up' ? 'var(--neon-green)' : dir === 'down' ? 'var(--neon-red)' : 'var(--text-muted)';
    return `<div class="oc-oi-item">
      <span class="oc-oi-sym">${o.symbol}</span>
      <span class="oc-oi-val">${oiStr}</span>
      <span class="oc-oi-change ${dir}">${arrow} ${Math.abs(chg).toFixed(1)}%</span>
      <div class="oc-oi-bar"><div class="oc-oi-bar-fill" style="width:${barW}%;background:${barColor}"></div></div>
    </div>`;
  }).join('');
}

/* --- Funding Rates --- */
function _renderFunding(data) {
  const el = document.getElementById('oc-funding');
  if (!el) return;
  const rates = data.funding_rates;
  if (!rates || !rates.length) {
    el.innerHTML = '<span style="font-size:0.7rem;color:var(--text-muted)">No data</span>';
    return;
  }
  el.innerHTML = rates.map(r => {
    const cls = r.rate > 0.01 ? 'positive' : r.rate < -0.01 ? 'negative' : 'neutral';
    const sign = r.rate > 0 ? '+' : '';
    return `<div class="oc-funding-item">
      <span class="oc-funding-sym">${r.symbol}</span>
      <span class="oc-funding-rate ${cls}">${sign}${r.rate.toFixed(4)}%</span>
      <span class="oc-funding-mark">$${r.mark.toLocaleString()}</span>
    </div>`;
  }).join('');
}

/* --- Mempool + congestion gauge --- */
function _renderMempool(data) {
  if (!data.mempool) return;
  const fm = data.mempool;
  const elFast = document.getElementById('oc-fee-fast');
  const el30m = document.getElementById('oc-fee-30m');
  const el1h = document.getElementById('oc-fee-1h');
  const elEco = document.getElementById('oc-fee-eco');
  if (elFast) elFast.textContent = fm.fastest || '—';
  if (el30m) el30m.textContent = fm.half_hour || '—';
  if (el1h) el1h.textContent = fm.hour || '—';
  if (elEco) elEco.textContent = fm.economy || '—';

  // Congestion bar
  const fill = document.getElementById('oc-congestion-fill');
  const label = document.getElementById('oc-congestion-label');
  if (fill && label) {
    const cong = fm.congestion || 'low';
    const pct = cong === 'high' ? 90 : cong === 'medium' ? 55 : 25;
    const color = cong === 'high' ? '#dc2626' : cong === 'medium' ? '#f59e0b' : '#059669';
    const txt = cong === 'high' ? 'HIGH CONGESTION' : cong === 'medium' ? 'MODERATE' : 'LOW';
    fill.style.width = pct + '%';
    fill.style.background = `linear-gradient(90deg, ${color}cc, ${color})`;
    label.textContent = txt;
  }
}

/* --- Hashrate + sparkline --- */
function _renderHashrate(data) {
  const hrEl = document.getElementById('oc-hashrate');
  if (hrEl && data.hashrate) {
    hrEl.textContent = `${data.hashrate.value} ${data.hashrate.unit}`;
  }
  // Sparkline
  const canvas = document.getElementById('oc-hashrate-spark');
  if (!canvas || !data.hashrate_spark || data.hashrate_spark.length < 2) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const w = rect.width, h = rect.height;
  const vals = data.hashrate_spark;
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const range = mx - mn || 1;
  const step = w / (vals.length - 1);
  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  vals.forEach((v, i) => {
    const x = i * step;
    const y = h - 2 - ((v - mn) / range) * (h - 4);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--neon-cyan').trim() || '#06b6d4';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // fill
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = 'rgba(6,182,212,0.1)';
  ctx.fill();
}

/* --- Liquidation Zones summary card --- */
function _renderLiqZones(data) {
  const el = document.getElementById('oc-liq-summary');
  if (!el) return;
  const lz = data.liq_zones;
  if (!lz || !lz.zones || !lz.zones.length) {
    el.innerHTML = '<span style="font-size:0.7rem;color:var(--text-muted)">No liquidation data</span>';
    return;
  }
  const fmtUsd = v => v >= 1e9 ? `$${(v/1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v/1e6).toFixed(0)}M` : `$${v.toLocaleString()}`;
  const biasLabel = lz.bias === 'LONG_HEAVY' ? '🔴 LONG HEAVY' : lz.bias === 'SHORT_HEAVY' ? '🟢 SHORT HEAVY' : '⚖ BALANCED';
  let html = `<div class="oc-liq-header">
    <span class="oc-liq-price">BTC $${lz.current_price?.toLocaleString() || '—'}</span>
    <span class="oc-liq-bias" style="background:${lz.bias_color || '#888'}22;color:${lz.bias_color || '#888'}">${biasLabel}</span>
  </div>`;
  html += lz.zones.slice(0, 4).map(z => `<div class="oc-liq-zone-row">
    <span class="oc-liq-lev">${z.leverage}</span>
    <span class="oc-liq-long">L $${z.long_liq_price?.toLocaleString()}</span>
    <span class="oc-liq-short">S $${z.short_liq_price?.toLocaleString()}</span>
    <span class="oc-liq-vol">${fmtUsd(z.est_volume_usd)}</span>
  </div>`).join('');
  el.innerHTML = html;
}

/* --- Section collapse/expand toggle --- */
let _ocTogglesInited = false;
function _initOCSectionToggles() {
  if (_ocTogglesInited) return;
  _ocTogglesInited = true;
  document.querySelectorAll('[data-oc-toggle]').forEach(hdr => {
    hdr.addEventListener('click', () => {
      const section = hdr.closest('.oc-section');
      if (!section) return;
      section.classList.toggle('collapsed');
      const key = section.dataset.ocSection;
      if (key) {
        const collapsed = JSON.parse(localStorage.getItem('ryzm_oc_collapsed') || '{}');
        collapsed[key] = section.classList.contains('collapsed');
        localStorage.setItem('ryzm_oc_collapsed', JSON.stringify(collapsed));
      }
      try { lucide.createIcons(); } catch(e) {}
    });
  });
  // Restore saved state
  const saved = JSON.parse(localStorage.getItem('ryzm_oc_collapsed') || '{}');
  Object.entries(saved).forEach(([key, isCollapsed]) => {
    if (isCollapsed) {
      const sec = document.querySelector(`[data-oc-section="${key}"]`);
      if (sec) sec.classList.add('collapsed');
    }
  });
}

/* ═══════════════════════════════════════
   #11 Panel Drag & Drop Customization
   ═══════════════════════════════════════ */
function initPanelDragDrop() {
  const panels = ['panel-left', 'panel-center', 'panel-right'];

  panels.forEach(panelId => {
    const container = document.getElementById(panelId);
    if (!container || typeof Sortable === 'undefined') return;

    // Restore saved order — only reorder children that actually belong to this container
    const savedOrder = JSON.parse(localStorage.getItem(`ryzm_panel_order_${panelId}`) || '[]');
    if (savedOrder.length > 0) {
      const childMap = {};
      Array.from(container.children).forEach(child => {
        if (child.classList.contains('glass-panel') || child.classList.contains('council-container') || child.tagName === 'BUTTON') {
          const key = child.id || child.className.split(' ').slice(0, 2).join('_');
          childMap[key] = child;
        }
      });
      savedOrder.forEach(key => {
        // Only reorder if the element is ALREADY a child of this container
        if (childMap[key] && childMap[key].parentElement === container) {
          container.appendChild(childMap[key]);
        }
      });
    }

    Sortable.create(container, {
      animation: 200,
      ghostClass: 'drag-ghost',
      chosenClass: 'drag-chosen',
      dragClass: 'drag-active',
      handle: '.panel-title',
      filter: '.chart-container, .council-container, .ai-scan-btn',
      preventOnFilter: false,
      group: { name: panelId, pull: false, put: false }, // prevent cross-panel drag
      onEnd: () => {
        // Save order locally
        const order = Array.from(container.children)
          .filter(c => c.classList.contains('glass-panel') || c.classList.contains('council-container') || c.tagName === 'BUTTON')
          .map(c => c.id || c.className.split(' ').slice(0, 2).join('_'));
        localStorage.setItem(`ryzm_panel_order_${panelId}`, JSON.stringify(order));
        // Sync all panel orders to server
        _syncLayoutToServer();
      }
    });
  });
}

/* ═══════════════════════════════════════
   #12 Multi-Language Support (i18n)
   ═══════════════════════════════════════ */
const _translations = {
  en: {
    // Header
    market_vibe: "MARKET VIBE:",
    // Panel titles  
    risk_gauge: "Systemic Risk Gauge",
    museum_scars: "Museum of Scars",
    fg_chart: "Fear & Greed Index",
    mtf_analysis: "Multi-TF Analysis",
    kimchi_premium: "Kimchi Premium",
    econ_calendar: "Economic Calendar",
    realtime_prices: "Realtime Prices",
    long_short: "Long/Short Ratio",
    whale_alert: "Whale Alert",
    onchain_radar: "On-Chain Radar",
    live_wire: "Live Wire",
    ai_tracker: "AI Prediction Tracker",
    market_heatmap: "Market Heatmap",
    hm_total_mcap: "Total MCap",
    hm_top_gainers: "Top Gainers",
    hm_top_losers: "Top Losers",
    // Buttons
    execute_analysis: "EXECUTE ANALYSIS PROTOCOL",
    copy_report: "COPY REPORT FOR X",
    export_snapshot: "EXPORT SNAPSHOT",
    refresh_all: "Refresh All",
    fullscreen: "Fullscreen",
    notifications: "Notifications",
    re_run: "RE-RUN ANALYSIS",
    // Status
    system_online: "SYSTEM ONLINE",
    last_update: "Last Update",
    sources: "Sources",
    // Chat
    ask_ryzm: "Ask Ryzm",
    chat_placeholder: "Ask anything about the market...",
    // MTF table
    tf: "TF", rsi: "RSI", ema: "EMA", signal: "Signal",
    // On-chain
    open_interest: "Open Interest",
    funding_rates: "Funding Rates",
    mempool_fees: "BTC Mempool Fees (sat/vB)",
    network_hashrate: "Network Hashrate",
    liq_zones: "Liquidation Zones",
    // Council stats
    sessions: "SESSIONS", hit_rate: "HIT RATE", hits: "HITS",
    // Strategic narrative
    strategic_narrative: "STRATEGIC NARRATIVE",
    // Risk gauge component labels
    rc_sentiment: "SENTIMENT",
    rc_volatility: "VOLATILITY",
    rc_leverage: "LEVERAGE",
    rc_funding: "FUNDING",
    rc_kimchi: "KIMCHI P.",
    rc_oi: "OI",
    rc_stablecoin: "USDT DOM",
    // Section nav
    snav_risk: "Risk", snav_fg: "F&G", snav_mtf: "MTF",
    snav_council: "Council", snav_chart: "Chart", snav_validator: "Validator",
    snav_tracker: "Tracker", snav_heatmap: "Heatmap",
    snav_prices: "Prices", snav_ls: "L/S", snav_scanner: "Scanner",
    snav_whale: "Whale", snav_onchain: "On-Chain", snav_news: "News",
    // L/S
    ls_long: "LONG", ls_short: "SHORT",
    // Funding
    fr_label: "FUNDING:",
    // KP
    arb_low: "Arb Opportunity: LOW",
    arb_medium: "Arb Opportunity: MEDIUM",
    arb_high: "Arb Opportunity: HIGH",
    // Council history
    council_run_msg: "Run Council to start tracking...",
    // Briefing
    briefing: "BRIEFING",
    // Misc
    loading: "Loading...",
    heatmap_loading: "Loading heatmap...",
    no_whale: "No whale activity detected",
    no_events: "No upcoming events",
    connection_failed: "CONNECTION FAILED",
    summoning: "SUMMONING AGENTS...",
    accessing: "ACCESSING NEURAL NET...",
    // Scanner
    alpha_scanner: "Alpha Scanner (15m)",
    scanner_pump: "PUMP ALERT",
    scanner_bounce: "OVERSOLD BOUNCE",
    scanner_vol: "VOL SPIKE",
    scanner_calm: "No anomalies detected. Market is calm.",
    scanner_scanning: "Scanning markets...",
    // Regime Detector
    regime_detector: "Regime Detector",
    regime_btc: "BTC SEASON",
    regime_alt: "ALT SEASON",
    regime_risk_off: "RISK OFF",
    regime_bull: "FULL BULL",
    regime_rotation: "ROTATION",
    // Correlation
    correlation_matrix: "Correlation Matrix (30D)",
    // Liquidation
    liq_heatmap: "Liquidation Kill Zone",
    // Whale Wallets
    whale_wallets: "Whale Wallets (BTC)",
    no_whale_wallets: "No large transactions detected",
    // Trade Validator
    trade_validator: "Trade Validator",
    validate_trade: "VALIDATE TRADE",
    val_no_credits: "Upgrade to Premium for unlimited validations!",
    val_invalid_input: "Please fill all fields correctly!",
    val_scanning: "SCANNING...",
    val_complete: "Validation Complete",
    val_failed: "Validation Failed"
  },
  ko: {
    market_vibe: "시장 분위기:",
    risk_gauge: "시스템 리스크 게이지",
    museum_scars: "상흔의 박물관",
    fg_chart: "공포 & 탐욕 지수",
    mtf_analysis: "멀티 타임프레임 분석",
    kimchi_premium: "김치 프리미엄",
    econ_calendar: "경제 캘린더",
    realtime_prices: "실시간 시세",
    long_short: "롱/숏 비율",
    whale_alert: "고래 알림",
    onchain_radar: "온체인 레이더",
    live_wire: "뉴스 피드",
    ai_tracker: "AI 예측 추적기",
    market_heatmap: "시장 히트맵",
    hm_total_mcap: "총 시가총액",
    hm_top_gainers: "상승 TOP",
    hm_top_losers: "하락 TOP",
    execute_analysis: "분석 프로토콜 실행",
    copy_report: "X용 리포트 복사",
    export_snapshot: "스냅샷 내보내기",
    refresh_all: "전체 새로고침",
    fullscreen: "전체화면",
    notifications: "알림",
    re_run: "분석 재실행",
    system_online: "시스템 온라인",
    last_update: "마지막 업데이트",
    sources: "데이터 소스",
    ask_ryzm: "Ryzm에게 물어보기",
    chat_placeholder: "시장에 대해 무엇이든 물어보세요...",
    tf: "주기", rsi: "RSI", ema: "EMA", signal: "시그널",
    open_interest: "미결제약정",
    funding_rates: "펀딩비율",
    mempool_fees: "BTC 멤풀 수수료 (sat/vB)",
    network_hashrate: "네트워크 해시레이트",
    liq_zones: "청산 존",
    sessions: "세션", hit_rate: "적중률", hits: "적중",
    strategic_narrative: "전략적 내러티브",
    rc_sentiment: "심리지수",
    rc_volatility: "변동성",
    rc_leverage: "레버리지",
    rc_funding: "펀딩비",
    rc_kimchi: "김프",
    rc_oi: "미결제약정",
    rc_stablecoin: "USDT 점유",
    // Section nav
    snav_risk: "리스크", snav_fg: "탐욕/공포", snav_mtf: "MTF",
    snav_council: "카운슬", snav_chart: "차트", snav_validator: "검증",
    snav_tracker: "트래커", snav_heatmap: "히트맵",
    snav_prices: "시세", snav_ls: "롱/숏", snav_scanner: "스캐너",
    snav_whale: "고래", snav_onchain: "온체인", snav_news: "뉴스",
    ls_long: "롱", ls_short: "숏",
    fr_label: "펀딩비:",
    arb_low: "차익 기회: 낮음",
    arb_medium: "차익 기회: 보통",
    arb_high: "차익 기회: 높음",
    council_run_msg: "분석을 실행하면 추적이 시작됩니다...",
    briefing: "브리핑",
    loading: "로딩 중...",
    heatmap_loading: "히트맵 로딩 중...",
    no_whale: "고래 활동이 감지되지 않았습니다",
    no_events: "예정된 이벤트가 없습니다",
    connection_failed: "연결 실패",
    summoning: "에이전트 소환 중...",
    accessing: "뉴럴넷 접속 중...",
    // Scanner
    alpha_scanner: "알파 스캐너 (15분)",
    scanner_pump: "급등 포착",
    scanner_bounce: "과매도 반등",
    scanner_vol: "거래량 폭발",
    scanner_calm: "이상 감지되지 않음. 시장이 안정적입니다.",
    scanner_scanning: "시장 스캐닝 중...",
    // Regime Detector
    regime_detector: "레짐 감지기",
    regime_btc: "BTC 시즌",
    regime_alt: "알트 시즌",
    regime_risk_off: "리스크 오프",
    regime_bull: "풀 상승장",
    regime_rotation: "순환매",
    // Correlation
    correlation_matrix: "상관관계 매트릭스 (30일)",
    // Liquidation
    liq_heatmap: "청산 킬존",
    // Whale Wallets
    whale_wallets: "고래 지갑 추적기 (BTC)",
    no_whale_wallets: "대규모 거래가 감지되지 않았습니다",
    // Trade Validator
    trade_validator: "트레이드 검증기",
    validate_trade: "트레이드 검증",
    val_no_credits: "무제한 검증은 프리미엄으로 업그레이드하세요!",
    val_invalid_input: "모든 필드를 올바르게 입력하세요!",
    val_scanning: "스캐닝 중...",
    val_complete: "검증 완료",
    val_failed: "검증 실패"
  }
};

let _currentLang = 'en';

function initI18n() {
  _currentLang = localStorage.getItem('ryzm_lang') || 'en';
  applyTranslations(_currentLang);
  updateLangToggle();

  const btn = document.getElementById('lang-toggle');
  if (btn) {
    btn.addEventListener('click', () => {
      _currentLang = _currentLang === 'en' ? 'ko' : 'en';
      localStorage.setItem('ryzm_lang', _currentLang);
      applyTranslations(_currentLang);
      updateLangToggle();
      playSound('click');
    });
  }
}

function updateLangToggle() {
  const label = document.getElementById('lang-label');
  if (label) label.textContent = _currentLang === 'en' ? 'KO' : 'EN';
}

function t(key) {
  return (_translations[_currentLang] && _translations[_currentLang][key]) || (_translations['en'][key]) || key;
}

function applyTranslations(lang) {
  const dict = _translations[lang] || _translations['en'];

  // 1) Panel titles with data-i18n (preserve Lucide icons + collapse icon)
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (!dict[key]) return;
    // Collect leading icon(s) (not collapse-icon)
    const leadIcons = [];
    el.querySelectorAll('i:not(.collapse-icon)').forEach(ic => leadIcons.push(ic.outerHTML));
    const hasCollapse = el.querySelector('.collapse-icon');
    const collapseHTML = hasCollapse ? ' <i data-lucide="chevron-down" class="collapse-icon" style="width:14px;height:14px;"></i>' : '';
    el.innerHTML = (leadIcons.length ? leadIcons.join(' ') + ' ' : '') + dict[key] + collapseHTML;
  });

  // 2) Simple text elements with data-i18n-text
  document.querySelectorAll('[data-i18n-text]').forEach(el => {
    const key = el.getAttribute('data-i18n-text');
    if (!dict[key]) return;
    // If element has child icons, preserve them
    const icons = el.querySelectorAll('i');
    if (icons.length > 0) {
      const iconHTML = Array.from(icons).map(i => i.outerHTML).join(' ');
      el.innerHTML = iconHTML + ' ' + dict[key];
    } else {
      el.textContent = dict[key];
    }
  });

  // 3) Prefix elements (e.g. "Last Update: 14:30")
  document.querySelectorAll('[data-i18n-prefix]').forEach(el => {
    const key = el.getAttribute('data-i18n-prefix');
    if (!dict[key]) return;
    const txt = el.textContent;
    const colonIdx = txt.indexOf(':');
    const suffix = colonIdx !== -1 ? txt.substring(colonIdx + 1) : '';
    el.textContent = dict[key] + ':' + suffix;
  });

  // 4) Risk gauge component labels
  const rcLabels = {
    'rc-fg-bar': 'rc_sentiment',
    'rc-vix-bar': 'rc_volatility',
    'rc-ls-bar': 'rc_leverage',
    'rc-fr-bar': 'rc_funding',
    'rc-kp-bar': 'rc_kimchi'
  };
  Object.entries(rcLabels).forEach(([barId, tKey]) => {
    const bar = document.getElementById(barId);
    if (!bar) return;
    const row = bar.closest('.rc-row');
    if (!row) return;
    const label = row.querySelector('.rc-label');
    if (label && dict[tKey]) label.textContent = dict[tKey];
  });

  // 4) L/S Ratio labels  
  const longLabel = document.querySelector('.ls-indicator.long-ind .ls-ind-label');
  const shortLabel = document.querySelector('.ls-indicator.short-ind .ls-ind-label');
  if (longLabel && dict.ls_long) longLabel.textContent = dict.ls_long;
  if (shortLabel && dict.ls_short) shortLabel.textContent = dict.ls_short;

  // 5) Funding rate label
  const frLabel = document.querySelector('.fr-label');
  if (frLabel && dict.fr_label) frLabel.textContent = dict.fr_label;

  // 6) MTF table header
  const mtfTh = document.querySelectorAll('.mtf-table thead th');
  if (mtfTh.length >= 4) {
    mtfTh[0].textContent = dict.tf || 'TF';
    mtfTh[1].textContent = dict.rsi || 'RSI';
    mtfTh[2].textContent = dict.ema || 'EMA';
    mtfTh[3].textContent = dict.signal || 'Signal';
  }

  // 7) On-chain subtitles
  const ocSubs = document.querySelectorAll('.oc-subtitle');
  if (ocSubs[0]) ocSubs[0].textContent = dict.open_interest || 'Open Interest';
  if (ocSubs[1]) ocSubs[1].textContent = dict.funding_rates || 'Funding Rates';
  if (ocSubs[2]) ocSubs[2].textContent = dict.mempool_fees || 'BTC Mempool Fees (sat/vB)';
  if (ocSubs[3]) ocSubs[3].textContent = dict.network_hashrate || 'Network Hashrate';
  if (ocSubs[4]) ocSubs[4].textContent = dict.liq_zones || 'Liquidation Zones';

  // 8) Council stat labels
  const statLabels = document.querySelectorAll('.ch-stat-label');
  if (statLabels[0]) statLabels[0].textContent = dict.sessions || 'SESSIONS';
  if (statLabels[1]) statLabels[1].textContent = dict.hit_rate || 'HIT RATE';
  if (statLabels[2]) statLabels[2].textContent = dict.hits || 'HITS';

  // 9) Chat placeholder
  const chatInput = document.getElementById('chat-input');
  if (chatInput) chatInput.placeholder = dict.chat_placeholder || 'Ask anything about the market...';

  // 10) Refresh all Lucide icons after innerHTML changes
  try { lucide.createIcons(); } catch (e) {}
}

/* ═══════════════════════════════════════
   Keyboard Shortcuts Modal
   ═══════════════════════════════════════ */
function initKeyboardShortcutsModal() {
  // No-op, the keydown handler above handles ? key
}

function toggleShortcutsModal() {
  const existing = document.querySelector('.shortcuts-overlay');
  if (existing) {
    existing.remove();
    return;
  }

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const mod = isMac ? '⌘' : 'Ctrl';

  const shortcuts = [
    { keys: [mod, 'R'], label: _currentLang === 'ko' ? '전체 새로고침' : 'Refresh all data' },
    { keys: [mod, '/'], label: _currentLang === 'ko' ? '채팅 열기' : 'Open Ryzm Chat' },
    { keys: ['D'], label: _currentLang === 'ko' ? '다크/라이트 모드 전환' : 'Toggle dark/light mode' },
    { keys: ['F'], label: _currentLang === 'ko' ? '전체화면 토글' : 'Toggle fullscreen' },
    { keys: ['1'], label: _currentLang === 'ko' ? '좌측 패널 포커스' : 'Focus left panel' },
    { keys: ['2'], label: _currentLang === 'ko' ? '중앙 패널 포커스' : 'Focus center panel' },
    { keys: ['3'], label: _currentLang === 'ko' ? '우측 패널 포커스' : 'Focus right panel' },
    { keys: ['Esc'], label: _currentLang === 'ko' ? '모달/채팅 닫기' : 'Close modals' },
    { keys: ['?'], label: _currentLang === 'ko' ? '이 도움말 표시' : 'Show this help' },
  ];

  const overlay = document.createElement('div');
  overlay.className = 'shortcuts-overlay';
  overlay.innerHTML = `
    <div class="shortcuts-modal">
      <div class="shortcuts-title"><i data-lucide="keyboard" style="width:18px;height:18px;"></i> ${_currentLang === 'ko' ? '키보드 단축키' : 'Keyboard Shortcuts'}</div>
      <div class="shortcuts-list">
        ${shortcuts.map(s => `
          <div class="shortcut-row">
            <span class="shortcut-label">${s.label}</span>
            <span class="shortcut-keys">${s.keys.map(k => `<span class="shortcut-key">${k}</span>`).join('<span style="color:var(--text-muted);font-size:0.65rem;">+</span>')}</span>
          </div>
        `).join('')}
      </div>
      <div class="shortcuts-footer">${_currentLang === 'ko' ? '아무 키나 누르면 닫힙니다' : 'Press any key to close'}</div>
    </div>
  `;

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
  try { lucide.createIcons(); } catch (e) {}
  playSound('click');
}

/* ═══════════════════════════════════════
   Market Open/Close Status
   ═══════════════════════════════════════ */
function initMarketStatus() {
  updateMarketStatus();
  setInterval(updateMarketStatus, 60000); // Update every minute
}

function updateMarketStatus() {
  const now = new Date();
  
  // Crypto: Always open
  const cryptoEl = document.getElementById('mkt-crypto');
  if (cryptoEl) {
    cryptoEl.className = 'market-dot open';
    cryptoEl.textContent = 'CRYPTO 24/7';
  }

  // NYSE: Mon-Fri, 9:30-16:00 ET (14:30-21:00 UTC)
  const nyseEl = document.getElementById('mkt-nyse');
  if (nyseEl) {
    const utcH = now.getUTCHours();
    const utcM = now.getUTCMinutes();
    const utcMin = utcH * 60 + utcM;
    const day = now.getUTCDay();
    const isWeekday = day >= 1 && day <= 5;
    // NYSE: 14:30-21:00 UTC (9:30-16:00 ET)
    const nyseOpen = isWeekday && utcMin >= 14 * 60 + 30 && utcMin < 21 * 60;
    nyseEl.className = `market-dot ${nyseOpen ? 'open' : 'closed'}`;
    nyseEl.textContent = nyseOpen ? 'NYSE' : 'NYSE';
  }

  // Forex: Sun 22:00 UTC - Fri 22:00 UTC
  const forexEl = document.getElementById('mkt-forex');
  if (forexEl) {
    const day = now.getUTCDay();
    const utcH = now.getUTCHours();
    const forexOpen = !((day === 6) || (day === 0 && utcH < 22) || (day === 5 && utcH >= 22));
    forexEl.className = `market-dot ${forexOpen ? 'open' : 'closed'}`;
    forexEl.textContent = forexOpen ? 'FOREX' : 'FOREX';
  }
}

/* ═══════════════════════════════════════
   Live "Time Ago" Status Bar Update
   ═══════════════════════════════════════ */
let _lastDataUpdate = Date.now();

function updateLastRefreshTime() {
  _lastDataUpdate = Date.now();
  _updateTimeAgo();
}

function _updateTimeAgo() {
  const el = document.getElementById('last-update');
  if (!el) return;
  const diff = Math.floor((Date.now() - _lastDataUpdate) / 1000);
  let text, cls;
  if (diff < 5) {
    text = _currentLang === 'ko' ? '방금 전' : 'Just now';
    cls = 'time-ago';
  } else if (diff < 60) {
    text = _currentLang === 'ko' ? `${diff}초 전` : `${diff}s ago`;
    cls = 'time-ago';
  } else if (diff < 300) {
    const m = Math.floor(diff / 60);
    text = _currentLang === 'ko' ? `${m}분 전` : `${m}m ago`;
    cls = 'time-ago stale';
  } else {
    text = _currentLang === 'ko' ? '연결 확인 중...' : 'Checking...';
    cls = 'time-ago offline';
  }
  el.innerHTML = `${t('last_update')}: <span class="${cls}">${text}</span>`;
}

// Update time-ago every 5 seconds
setInterval(_updateTimeAgo, 5000);


/* ═══════════════════════════════════════
   #17 Layout Server Sync
   ═══════════════════════════════════════ */
let _layoutSyncTimer = null;
function _syncLayoutToServer() {
  // Debounce: wait 2s after last drag before syncing
  clearTimeout(_layoutSyncTimer);
  _layoutSyncTimer = setTimeout(() => {
    const panels = {};
    ['panel-left', 'panel-center', 'panel-right'].forEach(pid => {
      const saved = localStorage.getItem(`ryzm_panel_order_${pid}`);
      if (saved) panels[pid] = JSON.parse(saved);
    });
    apiFetch('/api/layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ panels }),
      silent: true
    }).catch(() => {}); // silent fail
  }, 2000);
}

// On startup, try loading server layout (merge with local)
function _loadServerLayout() {
  apiFetch('/api/layout', { silent: true })
    .then(data => {
      if (data && data.layout) {
        Object.entries(data.layout).forEach(([panelId, order]) => {
          if (!localStorage.getItem(`ryzm_panel_order_${panelId}`)) {
            localStorage.setItem(`ryzm_panel_order_${panelId}`, JSON.stringify(order));
          }
        });
      }
    })
    .catch(() => {});
}
_loadServerLayout();


/* ═══════════════════════════════════════
   #18 Price Alerts UI
   ═══════════════════════════════════════ */
function initPriceAlerts() {
  const container = document.getElementById('price-alerts-container');
  if (!container) return;

  const html = `
    <div class="alert-form" style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;">
      <input id="alert-symbol" type="text" placeholder="BTC" maxlength="10"
        style="width:60px; background:rgba(255,255,255,0.05); border:1px solid rgba(6,182,212,0.3); border-radius:4px; color:var(--text-primary); padding:4px 8px; font-size:0.75rem; text-transform:uppercase;">
      <select id="alert-direction" style="background:rgba(255,255,255,0.05); border:1px solid rgba(6,182,212,0.3); border-radius:4px; color:var(--text-primary); padding:4px 6px; font-size:0.75rem;">
        <option value="above">Above</option>
        <option value="below">Below</option>
      </select>
      <input id="alert-price" type="number" placeholder="$100,000" step="0.01"
        style="width:100px; background:rgba(255,255,255,0.05); border:1px solid rgba(6,182,212,0.3); border-radius:4px; color:var(--text-primary); padding:4px 8px; font-size:0.75rem;">
      <button id="alert-add-btn" style="background:var(--neon-cyan); color:#000; border:none; border-radius:4px; padding:4px 10px; font-size:0.7rem; cursor:pointer; font-weight:700;">
        + ADD
      </button>
    </div>
    <div id="alert-list" style="font-size:0.72rem;"></div>
  `;
  container.innerHTML = html;

  document.getElementById('alert-add-btn')?.addEventListener('click', async () => {
    const symbol = document.getElementById('alert-symbol').value.trim().toUpperCase() || 'BTC';
    const direction = document.getElementById('alert-direction').value;
    const target_price = parseFloat(document.getElementById('alert-price').value);
    if (!target_price || target_price <= 0) {
      showToast('error', 'Invalid Price', 'Enter a valid target price.');
      return;
    }
    try {
      await apiFetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, target_price, direction })
      });
      showToast('success', 'Alert Set', `${symbol} ${direction} $${target_price.toLocaleString()}`);
      document.getElementById('alert-price').value = '';
      refreshAlertList();
    } catch (e) {
      if (e.status === 403) {
        showToast('warning', 'Limit Reached', e.data?.detail || 'Free alert limit reached.');
      } else {
        showToast('error', 'Error', 'Could not create alert.');
      }
    }
  });

  refreshAlertList();
  // Poll for triggered alerts every 60s
  setInterval(refreshAlertList, 60000);
}

async function refreshAlertList() {
  const list = document.getElementById('alert-list');
  if (!list) return;
  try {
    const data = await apiFetch('/api/alerts', { silent: true });
    let html = '';
    if (data.triggered && data.triggered.length > 0) {
      data.triggered.slice(0, 3).forEach(a => {
        html += `<div style="color:var(--neon-yellow); margin-bottom:3px;">🔔 ${escapeHtml(a.symbol)} hit $${Number(a.target_price).toLocaleString()} (${escapeHtml(a.direction)})</div>`;
      });
    }
    if (data.alerts && data.alerts.length > 0) {
      data.alerts.forEach(a => {
        const aid = parseInt(a.id, 10);
        html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
          <span style="color:var(--text-secondary);">${escapeHtml(a.symbol)} ${escapeHtml(a.direction)} $${Number(a.target_price).toLocaleString()}</span>
          <button data-delete-alert="${aid}" style="background:none; border:none; color:var(--neon-red); cursor:pointer; font-size:0.7rem;">✕</button>
        </div>`;
      });
    } else if (!data.triggered || data.triggered.length === 0) {
      html = '<div style="color:var(--text-tertiary); font-style:italic;">No active alerts</div>';
    }
    list.innerHTML = html;
    // Event delegation for delete buttons (avoids inline onclick)
    list.querySelectorAll('[data-delete-alert]').forEach(btn => {
      btn.addEventListener('click', () => deleteAlert(parseInt(btn.dataset.deleteAlert, 10)));
    });
  } catch {
    list.innerHTML = '<div style="color:var(--text-tertiary);">—</div>';
  }
}

async function deleteAlert(id) {
  try {
    await apiFetch(`/api/alerts/${id}`, { method: 'DELETE', silent: true });
    refreshAlertList();
  } catch {}
}


/* ═══════════════════════════════════════════════════════
   PR-5: Accuracy Tracking 2.0
   ═══════════════════════════════════════════════════════ */

/**
 * drawEquityCurve — cumulative hypothetical return curve.
 * Simple strategy: follow the AI signal (BULL → +return, BEAR → -return).
 */
function drawEquityCurve(records) {
  const canvas = document.getElementById('ch-equity-canvas');
  if (!canvas) return;

  const evaluated = records.filter(r =>
    r.btc_price && r.btc_price > 0 && r.btc_price_after && parseFloat(r.btc_price_after) > 0
  );
  if (evaluated.length < 2) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const w = rect.width, h = rect.height;
  const pad = { top: 6, right: 10, bottom: 14, left: 28 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;
  ctx.clearRect(0, 0, w, h);

  // Compute cumulative returns
  let cumReturn = 0;
  const curve = [0]; // start at 0%
  evaluated.forEach(r => {
    const after = parseFloat(r.btc_price_after);
    const pctChange = (after - r.btc_price) / r.btc_price * 100;
    const score = r.consensus_score || 50;
    // Signal: score >= 60 → long (capture gain), score <= 40 → short (inverse), else flat
    let signal = 0;
    if (score >= 60) signal = 1;
    else if (score <= 40) signal = -1;
    cumReturn += pctChange * signal;
    curve.push(cumReturn);
  });

  const minY = Math.min(...curve);
  const maxY = Math.max(...curve);
  const range = maxY - minY || 1;

  const x = (i) => pad.left + (i / (curve.length - 1)) * cw;
  const y = (v) => pad.top + ch - ((v - minY) / range) * ch;

  // Zero line
  ctx.strokeStyle = 'rgba(148,163,184,0.2)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  const zeroY = y(0);
  ctx.beginPath(); ctx.moveTo(pad.left, zeroY); ctx.lineTo(w - pad.right, zeroY); ctx.stroke();
  ctx.setLineDash([]);

  // Curve gradient
  const gradient = ctx.createLinearGradient(0, pad.top, 0, h);
  const finalReturn = curve[curve.length - 1];
  if (finalReturn >= 0) {
    gradient.addColorStop(0, 'rgba(5,150,105,0.3)');
    gradient.addColorStop(1, 'rgba(5,150,105,0)');
    ctx.strokeStyle = '#059669';
  } else {
    gradient.addColorStop(0, 'rgba(220,38,38,0)');
    gradient.addColorStop(1, 'rgba(220,38,38,0.3)');
    ctx.strokeStyle = '#dc2626';
  }

  // Fill area
  ctx.beginPath();
  ctx.moveTo(x(0), zeroY);
  curve.forEach((v, i) => ctx.lineTo(x(i), y(v)));
  ctx.lineTo(x(curve.length - 1), zeroY);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Line
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  curve.forEach((v, i) => {
    if (i === 0) ctx.moveTo(x(i), y(v));
    else ctx.lineTo(x(i), y(v));
  });
  ctx.stroke();

  // End label
  ctx.font = '9px Inter, system-ui';
  ctx.fillStyle = finalReturn >= 0 ? '#059669' : '#dc2626';
  ctx.textAlign = 'right';
  ctx.fillText(`${finalReturn >= 0 ? '+' : ''}${finalReturn.toFixed(2)}%`, w - 2, y(finalReturn) - 3);

  // Y-axis labels
  ctx.fillStyle = 'rgba(148,163,184,0.6)';
  ctx.font = '8px Inter, system-ui';
  ctx.textAlign = 'right';
  ctx.fillText(`${maxY >= 0 ? '+' : ''}${maxY.toFixed(1)}%`, pad.left - 2, pad.top + 8);
  ctx.fillText(`${minY >= 0 ? '+' : ''}${minY.toFixed(1)}%`, pad.left - 2, h - pad.bottom);
}

/**
 * renderRegimeBadges — show performance badges by market regime.
 * Regimes: BULL (score ≥ 60), BEAR (score ≤ 40), NEUTRAL, HIGH_CONF, LOW_CONF
 */
function renderRegimeBadges(records, scoreVsBtc) {
  const container = document.getElementById('ch-regime-badges');
  if (!container) return;

  const evaluated = records.filter(r => r.hit !== null && r.hit !== undefined);
  if (!evaluated.length) { container.innerHTML = ''; return; }

  // Group by regime
  const regimes = {};
  evaluated.forEach(r => {
    let regime = 'NEUTRAL';
    if (r.consensus_score >= 70) regime = 'BULL';
    else if (r.consensus_score >= 60) regime = 'ALT';
    else if (r.consensus_score <= 30) regime = 'BEAR';
    else if (r.consensus_score <= 40) regime = 'RISK OFF';

    if (!regimes[regime]) regimes[regime] = { hits: 0, total: 0 };
    regimes[regime].total++;
    if (r.hit === 1) regimes[regime].hits++;
  });

  // Render badges
  const badgeColors = {
    BULL: '#059669', BEAR: '#dc2626', ALT: '#f59e0b',
    'RISK OFF': '#8b5cf6', NEUTRAL: '#64748b'
  };

  container.innerHTML = Object.entries(regimes)
    .filter(([, v]) => v.total >= 2) // only show regimes with enough data
    .map(([regime, data]) => {
      const pct = Math.round((data.hits / data.total) * 100);
      const color = badgeColors[regime] || '#64748b';
      return `<span class="regime-badge" style="border-color:${color};color:${color};" title="${data.hits}/${data.total} hits">
        ${escapeHtml(regime)} ${pct}%
      </span>`;
    }).join('');
}

/* PR-5: CSV Export button handler */
document.getElementById('btn-export-csv')?.addEventListener('click', async () => {
  try {
    const res = await apiFetch('/api/export/council-history', { raw: true });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ryzm_council_history.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('success', '✓ Exported', 'Council history CSV downloaded.');
  } catch (e) {
    console.error('[CSV Export]', e);
    showToast('error', '⚠ Export Failed', 'Could not export data.');
  }
});
