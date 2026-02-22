
/* ═══ Briefing (click-to-show) ═══ */
let _briefingCache = null;

async function fetchBriefing() {
  try {
    const data = await apiFetch('/api/briefing', { silent: true });
    if (!data || data.status === 'empty' || !data.title) { _briefingCache = null; return; }
    _briefingCache = data;
    // Show dot indicator on the header button
    const dot = document.getElementById('briefing-dot');
    if (dot) dot.style.display = '';
  } catch (e) {
    console.error('Briefing fetch error:', e);
  }
}

function showBriefingPanel() {
  const panel = document.getElementById('briefing-panel');
  if (!panel) return;

  // If panel is already visible, toggle off
  if (panel.style.display === 'flex') {
    panel.style.display = 'none';
    return;
  }

  // No cached data — fetch first, then show
  if (!_briefingCache) {
    apiFetch('/api/briefing', { silent: true }).then(data => {
      if (!data || data.status === 'empty' || !data.title) {
        showToast?.('No briefing available yet', 'info');
        return;
      }
      _briefingCache = data;
      _renderBriefing();
    }).catch(() => showToast?.('Briefing load failed', 'error'));
    return;
  }
  _renderBriefing();
}

function _renderBriefing() {
  const panel = document.getElementById('briefing-panel');
  const titleEl = document.getElementById('briefing-title');
  const contentEl = document.getElementById('briefing-content');
  const timeEl = document.getElementById('briefing-time');
  const closeBtn = document.getElementById('briefing-close');
  if (!panel || !_briefingCache) return;

  titleEl.innerText = _briefingCache.title;
  contentEl.innerText = _briefingCache.content;
  timeEl.innerText = _briefingCache.time;
  panel.style.display = 'flex';

  // Hide dot indicator
  const dot = document.getElementById('briefing-dot');
  if (dot) dot.style.display = 'none';

  // Close handler
  if (!closeBtn.dataset.bound) {
    closeBtn.addEventListener('click', () => {
      panel.style.display = 'none';
      playSound?.('click');
    });
    closeBtn.dataset.bound = 'true';
  }
}

async function fetchFundingRate() {
  try {
    let data;
    if (typeof BinanceDirect !== 'undefined' && await BinanceDirect.isFapiAvailable()) {
      data = await BinanceDirect.fundingRate();
    } else {
      data = await apiFetch('/api/funding-rate', { silent: true });
    }
    if (!data.rates || data.rates.length === 0) return;
    data.rates.forEach(r => {
      const sym = String(r.symbol).toLowerCase().replace(/[^a-z0-9]/g, '');
      const rateEl = document.getElementById(`fr-${sym}`);
      const blockEl = document.getElementById(`fr-block-${sym}`);
      if (rateEl) {
        const sign = r.rate > 0 ? '+' : '';
        rateEl.textContent = `${sign}${r.rate}%`;
        rateEl.style.color = r.rate > 0 ? 'var(--neon-green)' : r.rate < 0 ? 'var(--neon-red)' : 'var(--text-muted)';
      }
      // ??Heatmap block coloring
      if (blockEl) {
        blockEl.classList.remove('fr-positive', 'fr-negative', 'fr-extreme');
        if (r.rate > 0) blockEl.classList.add('fr-positive');
        else if (r.rate < 0) blockEl.classList.add('fr-negative');
        if (Math.abs(r.rate) >= 0.05) blockEl.classList.add('fr-extreme');
      }
    });
  } catch (e) {
    console.error('Funding Rate Error:', e);
  }
}

async function fetchWhaleFeed() {
  try {
    let data;
    if (typeof BinanceDirect !== 'undefined' && await BinanceDirect.isFapiAvailable()) {
      data = await BinanceDirect.whaleTrades();
    } else {
      data = await apiFetch('/api/liquidations', { silent: true });
    }
    const container = document.getElementById('whale-feed');
    if (!container) return;
    if (!data.trades || data.trades.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">' + t('no_whale') + '</div>';
      return;
    }
    container.innerHTML = data.trades.map(tr => {
      const isBuy = tr.side === 'BUY';
      const icon = isBuy ? '\u25B2' : '\u25BC';
      const color = isBuy ? 'var(--neon-green)' : 'var(--neon-red)';
      const usd = tr.usd >= 1000000 ? `$${(tr.usd/1000000).toFixed(1)}M` : `$${(tr.usd/1000).toFixed(0)}K`;
      const time = new Date(tr.time).toLocaleTimeString('en-US', {hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit'});
      return `<div class="whale-item">
        <span style="color:${safeColor(color)};font-weight:700;">${icon} ${escapeHtml(tr.side)}</span>
        <span style="font-weight:600;">${escapeHtml(tr.symbol)}</span>
        <span style="color:${safeColor(color)};font-family:var(--font-mono);">${escapeHtml(usd)}</span>
        <span style="color:var(--text-muted);">${escapeHtml(time)}</span>
      </div>`;
    }).join('');
  } catch (e) {
    console.error('Whale Feed Error:', e);
  }
}

async function fetchCalendar() {
  try {
    const data = await apiFetch('/api/calendar', { silent: true });
    const container = document.getElementById('calendar-feed');
    if (!container) return;
    if (!data.events || data.events.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">' + t('no_events') + '</div>';
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    container.innerHTML = data.events.map(e => {
      const isToday = e.date === today;
      const isTomorrow = (() => { const d = new Date(); d.setDate(d.getDate()+1); return e.date === d.toISOString().slice(0,10); })();
      const badge = isToday ? '<span class="cal-badge today">TODAY</span>' : isTomorrow ? '<span class="cal-badge tomorrow">D-1</span>' : '';
      const dateStr = e.date.slice(5); // MM-DD
      const impactDot = e.impact === 'HIGH' ? '?��' : '?��';
      return `<div class="cal-item ${isToday ? 'cal-today' : ''}">
        <span class="cal-date">${escapeHtml(dateStr)}</span>
        <span class="cal-event">${impactDot} ${escapeHtml(e.event)} <span class="cal-region">${escapeHtml(e.region)}</span></span>
        ${badge}
      </div>`;
    }).join('');
  } catch (e) {
    console.error('Calendar Error:', e);
  }
}

/* Dark Mode */
function initTheme() {
  const saved = localStorage.getItem('ryzm-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  // Sync body class for components that check body.classList (e.g. TradingView modal)
  document.body.classList.toggle('white-theme', saved === 'light');
  updateThemeIcon(saved);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.addEventListener('click', toggleTheme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  // Smooth transition class
  document.documentElement.classList.add('theme-transitioning');
  document.documentElement.setAttribute('data-theme', next);
  // Sync body class for TradingView modal and other components
  document.body.classList.toggle('white-theme', next === 'light');
  localStorage.setItem('ryzm-theme', next);
  updateThemeIcon(next);
  // Remove transition class after animation
  setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 500);
  // Reload chart with correct theme
  if (typeof RyzmChart !== 'undefined') RyzmChart.updateTheme();
  playSound('click');
}

function updateThemeIcon(theme) {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.innerHTML = theme === 'dark'
    ? '<i data-lucide="sun" style="width:16px;height:16px;"></i>'
    : '<i data-lucide="moon" style="width:16px;height:16px;"></i>';
  lucide.createIcons();
}

/* ?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═
   Systemic Risk Gauge v2.0
   270° arc, radar, heatmap, sparklines, simulator,
   correlation, zone timeline, BTC overlay, alerts
   ?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═ */
let _prevRiskScore = null;
let _riskAlertThreshold = parseFloat(localStorage.getItem('rg_threshold') || '-999');
let _btcPriceOverlay = false;
let _cachedRiskHistory = null;

// ?�?� Tab switching ?�?�
document.addEventListener('DOMContentLoaded', () => {
  const tabContainer = document.getElementById('rg-tabs');
  if (tabContainer) {
    tabContainer.addEventListener('click', e => {
      const btn = e.target.closest('.rg-tab');
      if (!btn) return;
      const tabId = btn.dataset.rgtab;
      tabContainer.querySelectorAll('.rg-tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.rg-tab-content').forEach(c => c.classList.remove('active'));
      const target = document.getElementById('rg-tab-' + tabId);
      if (target) target.classList.add('active');
    });
  }
  // Alert threshold UI
  const alertBtn = document.getElementById('rg-alert-btn');
  const alertConfig = document.getElementById('rg-alert-config');
  const thresholdSlider = document.getElementById('rg-threshold');
  const thresholdVal = document.getElementById('rg-threshold-val');
  const alertSave = document.getElementById('rg-alert-save');
  if (alertBtn && alertConfig) {
    alertBtn.addEventListener('click', () => {
      alertConfig.classList.toggle('hidden');
      alertBtn.classList.toggle('active');
    });
  }
  if (thresholdSlider && thresholdVal) {
    thresholdSlider.value = _riskAlertThreshold > -999 ? _riskAlertThreshold : -50;
    thresholdVal.textContent = thresholdSlider.value;
    thresholdSlider.addEventListener('input', () => { thresholdVal.textContent = thresholdSlider.value; });
  }
  if (alertSave) {
    alertSave.addEventListener('click', () => {
      _riskAlertThreshold = parseFloat(thresholdSlider.value);
      localStorage.setItem('rg_threshold', _riskAlertThreshold);
      alertConfig.classList.add('hidden');
      alertBtn.classList.add('active');
      _updateThresholdLine(_riskAlertThreshold);
    });
  }
  // BTC overlay toggle
  const overlayBtn = document.getElementById('rg-price-overlay-btn');
  if (overlayBtn) {
    overlayBtn.addEventListener('click', () => {
      _btcPriceOverlay = !_btcPriceOverlay;
      overlayBtn.classList.toggle('active', _btcPriceOverlay);
      if (_cachedRiskHistory) drawRiskHistoryChart(_cachedRiskHistory);
    });
  }
  // Simulator sliders
  document.querySelectorAll('.rg-sim-slider').forEach(slider => {
    const valSpan = document.getElementById(slider.id + '-val');
    if (valSpan) {
      slider.addEventListener('input', () => {
        valSpan.textContent = slider.value;
        _runSimulation();
      });
    }
  });
});

function _updateThresholdLine(score) {
  const line = document.getElementById('gauge-threshold-line');
  if (!line) return;
  if (score <= -999) { line.setAttribute('opacity', '0'); return; }
  const angle = (score / 100) * 135;
  const rad = (angle - 90) * Math.PI / 180;
  const cx = 100, cy = 100, r = 75;
  const x2 = cx + r * Math.cos(rad), y2 = cy + r * Math.sin(rad);
  line.setAttribute('x2', x2); line.setAttribute('y2', y2);
  line.setAttribute('opacity', '0.6');
}

async function fetchRiskGauge() {
  try {
    const data = await apiFetch('/api/risk-gauge', { silent: true });

    const needleEl = document.getElementById('gauge-needle');
    const arcEl = document.getElementById('gauge-arc');
    const scoreSvg = document.getElementById('gauge-score-svg');
    const labelSvg = document.getElementById('gauge-label-svg');
    const deltaEl = document.getElementById('risk-delta');
    const panel = document.getElementById('risk-gauge-panel');
    const tsEl = document.getElementById('gauge-timestamp');
    const needleLine = document.getElementById('needle-line');
    const commentaryEl = document.getElementById('rg-commentary');

    if (!scoreSvg) return;

    const score = data.score || 0;
    const clampedScore = Math.max(-100, Math.min(100, score));

    // Color mapping
    const levelColors = {
      'CRITICAL': '#dc2626', 'HIGH': '#f97316', 'ELEVATED': '#eab308',
      'MODERATE': '#C9A96E', 'LOW': '#059669'
    };
    const color = levelColors[data.level] || '#64748b';

    // Score + label with countup
    animateCountup(scoreSvg, score, { duration: 800, decimals: 1, useComma: false });
    scoreSvg.setAttribute('fill', color);
    labelSvg.textContent = `[${data.label}]`;
    labelSvg.setAttribute('fill', color);

    // Needle color
    if (needleLine) needleLine.setAttribute('stroke', color);

    // 270° needle rotation: -100??135°, 0??°, +100??135°
    const needleAngle = (clampedScore / 100) * 135;
    if (needleEl) needleEl.setAttribute('transform', `rotate(${needleAngle}, 100, 100)`);

    // 270° arc fill: total arc length ??377
    const pct = (clampedScore + 100) / 200;
    const arcLen = 377;
    if (arcEl) arcEl.setAttribute('stroke-dashoffset', arcLen - (pct * arcLen));

    // AI Commentary
    if (commentaryEl && data.commentary) {
      commentaryEl.textContent = data.commentary;
    }

    // Delta indicator
    if (deltaEl && _prevRiskScore !== null) {
      const diff = score - _prevRiskScore;
      if (Math.abs(diff) > 0.5) {
        const arrow = diff > 0 ? '\u25B2' : '\u25BC';
        const dColor = diff > 0 ? '#059669' : '#dc2626';
        deltaEl.innerHTML = `<span style="color:${dColor}">${arrow} ${Math.abs(diff).toFixed(1)}</span>`;
        deltaEl.classList.add('delta-flash');
        setTimeout(() => deltaEl.classList.remove('delta-flash'), 2000);
      } else {
        deltaEl.innerHTML = '<span style="color:var(--text-muted)">+0.0</span>';
      }
    }
    _prevRiskScore = score;

    // Alert check
    if (_riskAlertThreshold > -999 && score <= _riskAlertThreshold) {
      if (panel && !panel.classList.contains('rg-alert-flash')) {
        panel.classList.add('rg-alert-flash');
        setTimeout(() => panel.classList.remove('rg-alert-flash'), 3500);
      }
    }

    // Panel pulse glow
    if (panel) {
      panel.classList.remove('risk-pulse-critical', 'risk-pulse-high', 'risk-pulse-elevated', 'risk-pulse-moderate', 'risk-pulse-low');
      const pulseClass = {
        'CRITICAL': 'risk-pulse-critical', 'HIGH': 'risk-pulse-high',
        'ELEVATED': 'risk-pulse-elevated', 'MODERATE': 'risk-pulse-moderate', 'LOW': 'risk-pulse-low'
      }[data.level];
      if (pulseClass) panel.classList.add(pulseClass);
    }

    // Timestamp
    if (tsEl) tsEl.textContent = `Updated ${data.timestamp || new Date().toLocaleTimeString('en-US', {hour12:false})}`;

    // Update threshold line on gauge
    _updateThresholdLine(_riskAlertThreshold);

    // ?�?� Component bars + sparklines ?�?�
    const c = data.components || {};
    const sparklines = data.sparklines || {};

    function updateBar(barId, valId, sparkId, sparkKey, contrib, maxContrib, displayText) {
      const bar = document.getElementById(barId);
      const valEl = document.getElementById(valId);
      if (bar) {
        const pct = Math.min(100, Math.abs(contrib) / maxContrib * 100);
        const barColor = contrib >= 0 ? '#059669' : '#dc2626';
        bar.style.width = pct + '%';
        bar.style.background = barColor;
        bar.style.boxShadow = `0 0 6px ${barColor}40`;
      }
      if (valEl) valEl.innerHTML = displayText;
      // Draw sparkline
      const sparkData = sparklines[sparkKey];
      if (sparkData && sparkData.length > 1) {
        _drawSparkline(sparkId, sparkData);
      }
    }

    if (c.fear_greed) {
      const fgVal = c.fear_greed.value;
      const fgColor = fgVal < 30 ? '#dc2626' : fgVal > 70 ? '#059669' : '#eab308';
      updateBar('rc-fg-bar', 'rc-fg', 'rc-spark-fg', 'fg', c.fear_greed.contrib, 50,
        `<span style="color:${fgColor}">${fgVal}/100</span>`);
    }
    if (c.vix) {
      const vColor = c.vix.value > 25 ? '#dc2626' : '#059669';
      updateBar('rc-vix-bar', 'rc-vix', 'rc-spark-vix', 'vix', c.vix.contrib, 25,
        `<span style="color:${vColor}">${c.vix.value}</span>`);
    }
    if (c.long_short) {
      updateBar('rc-ls-bar', 'rc-ls', 'rc-spark-ls', 'ls', c.long_short.contrib, 30,
        `${c.long_short.value}% L`);
    }
    if (c.funding_rate) {
      const frVal = c.funding_rate.value;
      const frColor = Math.abs(frVal) > 0.05 ? '#dc2626' : '#059669';
      updateBar('rc-fr-bar', 'rc-fr', 'rc-spark-fr', 'fr', c.funding_rate.contrib, 20,
        `<span style="color:${frColor}">${frVal > 0 ? '+' : ''}${frVal}%</span>`);
    }
    if (c.kimchi) {
      const kpVal = c.kimchi.value;
      const kpColor = Math.abs(kpVal) > 3 ? '#f97316' : '#059669';
      updateBar('rc-kp-bar', 'rc-kp', 'rc-spark-kp', 'kp', c.kimchi.contrib, 15,
        `<span style="color:${kpColor}">${kpVal > 0 ? '+' : ''}${kpVal}%</span>`);
    }
    if (c.open_interest) {
      const oiVal = c.open_interest.value;
      const oiColor = oiVal > 25 ? '#dc2626' : '#059669';
      updateBar('rc-oi-bar', 'rc-oi', 'rc-spark-oi', 'oi', c.open_interest.contrib, 15,
        `<span style="color:${oiColor}">${oiVal}B</span>`);
    }
    if (c.stablecoin) {
      const scVal = c.stablecoin.value;
      const scColor = scVal > 7 ? '#dc2626' : '#059669';
      updateBar('rc-sc-bar', 'rc-sc', 'rc-spark-sc', 'sc', c.stablecoin.contrib, 10,
        `<span style="color:${scColor}">${scVal}%</span>`);
    }

    // ?�?� Radar Chart ?�?�
    _drawRadarChart(c);

    // ?�?� Change Heatmap ?�?�
    if (data.changes) _drawChangeHeatmap(data.changes);

    // Auto-update Market Vibe
    updateMarketVibe(data);

    // Populate simulator with current values
    _populateSimulator(c);

  } catch (e) {
    console.error('Risk Gauge Error:', e);
  }
}

// ?�?� Sparkline drawer ?�?�
function _drawSparkline(canvasId, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || data.length < 2) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  // Limit to last 30 points
  const pts = data.slice(-30);
  const min = Math.min(...pts), max = Math.max(...pts);
  const range = max - min || 1;
  const step = w / (pts.length - 1);

  const latest = pts[pts.length - 1];
  const lineColor = latest >= 0 ? '#059669' : '#dc2626';

  ctx.beginPath();
  pts.forEach((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * (h - 2) - 1;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Endpoint dot
  const lastX = (pts.length - 1) * step;
  const lastY = h - ((latest - min) / range) * (h - 2) - 1;
  ctx.beginPath();
  ctx.arc(lastX, lastY, 1.5, 0, Math.PI * 2);
  ctx.fillStyle = lineColor;
  ctx.fill();
}

// ?�?� Radar Chart ?�?�
function _drawRadarChart(components) {
  const svg = document.getElementById('rg-radar-svg');
  if (!svg) return;

  const keys = ['fear_greed', 'vix', 'long_short', 'funding_rate', 'kimchi', 'open_interest', 'stablecoin'];
  const labels = ['SEN', 'VIX', 'L/S', 'FR', 'KP', 'OI', 'SC'];
  const maxVals = [50, 25, 30, 20, 15, 15, 10];
  const n = keys.length;
  const cx = 100, cy = 100, r = 70;

  let html = '';
  // Grid rings (3 levels)
  for (let ring = 1; ring <= 3; ring++) {
    const rr = (r * ring) / 3;
    let points = [];
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
      points.push(`${cx + rr * Math.cos(angle)},${cy + rr * Math.sin(angle)}`);
    }
    html += `<polygon points="${points.join(' ')}" fill="none" stroke="var(--border-dim)" stroke-width="0.5" opacity="0.5"/>`;
  }
  // Axis lines
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
    const x2 = cx + r * Math.cos(angle), y2 = cy + r * Math.sin(angle);
    html += `<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="var(--border-dim)" stroke-width="0.5" opacity="0.4"/>`;
  }
  // Data polygon
  let dataPoints = [];
  for (let i = 0; i < n; i++) {
    const comp = components[keys[i]];
    const val = comp ? Math.abs(comp.contrib) : 0;
    const pct = Math.min(1, val / maxVals[i]);
    const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
    dataPoints.push(`${cx + r * pct * Math.cos(angle)},${cy + r * pct * Math.sin(angle)}`);
  }
  const fillColor = _prevRiskScore > 0 ? 'rgba(5,150,105,0.25)' : 'rgba(220,38,38,0.25)';
  const strokeColor = _prevRiskScore > 0 ? '#059669' : '#dc2626';
  html += `<polygon points="${dataPoints.join(' ')}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5"/>`;
  // Data dots + labels
  for (let i = 0; i < n; i++) {
    const comp = components[keys[i]];
    const val = comp ? Math.abs(comp.contrib) : 0;
    const pct = Math.min(1, val / maxVals[i]);
    const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
    const dx = cx + r * pct * Math.cos(angle), dy = cy + r * pct * Math.sin(angle);
    const dotColor = (comp && comp.contrib >= 0) ? '#059669' : '#dc2626';
    html += `<circle cx="${dx}" cy="${dy}" r="2.5" fill="${dotColor}"/>`;
    // Label
    const lx = cx + (r + 14) * Math.cos(angle), ly = cy + (r + 14) * Math.sin(angle);
    html += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" fill="var(--text-muted)" font-size="6" font-family="var(--font-head)" letter-spacing="0.5px">${labels[i]}</text>`;
  }
  svg.innerHTML = html;
}

// ?�?� Change Rate Heatmap ?�?�
function _drawChangeHeatmap(changes) {
  const body = document.getElementById('rg-heatmap-body');
  if (!body) return;
  const labels = { fg: 'SENT', vix: 'VIX', ls: 'L/S', fr: 'FUND', kp: 'KP', oi: 'OI', sc: 'USDT' };
  const periods = ['1h', '4h', '24h'];
  let html = '';
  for (const [key, label] of Object.entries(labels)) {
    html += `<tr><td>${label}</td>`;
    for (const p of periods) {
      const val = (changes[p] && changes[p][key]) || 0;
      const cls = val > 0.5 ? 'rg-hm-pos' : val < -0.5 ? 'rg-hm-neg' : 'rg-hm-neutral';
      const sign = val > 0 ? '+' : '';
      html += `<td class="${cls}">${sign}${val.toFixed(1)}</td>`;
    }
    html += '</tr>';
  }
  body.innerHTML = html;
}

// ?�?� Correlation Matrix ?�?�
async function _fetchCorrelationMatrix() {
  try {
    const data = await apiFetch('/api/correlation', { silent: true });
    _drawCorrelationMatrix(data);
  } catch (e) {
    console.error('[RG Corr]', e);
  }
}

function _drawCorrelationMatrix(data) {
  const container = document.getElementById('rg-corr-matrix');
  if (!container || !data.matrix) return;

  const assets = data.assets || Object.keys(data.matrix);
  const matrix = data.matrix;
  const n = assets.length;

  container.style.gridTemplateColumns = `40px repeat(${n}, 1fr)`;
  let html = '<div class="rg-corr-cell rg-corr-header"></div>';
  // Headers
  for (const a of assets) {
    html += `<div class="rg-corr-cell rg-corr-header">${a}</div>`;
  }
  // Rows ??handle both dict-of-dicts and array-of-arrays
  for (let i = 0; i < n; i++) {
    html += `<div class="rg-corr-cell rg-corr-header">${assets[i]}</div>`;
    for (let j = 0; j < n; j++) {
      let val;
      if (Array.isArray(matrix)) {
        val = matrix[i] ? matrix[i][j] : 0;
      } else {
        val = matrix[assets[i]] ? (matrix[assets[i]][assets[j]] || 0) : 0;
      }
      const absVal = Math.abs(val);
      let bg, fg;
      if (i === j) {
        bg = 'rgba(201,169,110,0.15)'; fg = 'var(--neon-cyan)';
      } else if (val > 0.5) {
        bg = `rgba(5,150,105,${0.1 + absVal * 0.3})`; fg = '#059669';
      } else if (val < -0.3) {
        bg = `rgba(220,38,38,${0.1 + absVal * 0.3})`; fg = '#dc2626';
      } else {
        bg = 'var(--bg-deep)'; fg = 'var(--text-muted)';
      }
      html += `<div class="rg-corr-cell" style="background:${bg};color:${fg}">${val.toFixed(2)}</div>`;
    }
  }
  container.innerHTML = html;
}

// ?�?� Scenario Simulator ?�?�
function _populateSimulator(components) {
  const mapping = {
    'sim-fg': c => c.fear_greed?.value ?? 50,
    'sim-vix': c => c.vix?.value ?? 20,
    'sim-ls': c => c.long_short?.value ?? 50,
    'sim-fr': c => c.funding_rate?.value ?? 0,
    'sim-kp': c => c.kimchi?.value ?? 0,
    'sim-oi': c => c.open_interest?.value ?? 20,
    'sim-sc': c => c.stablecoin?.value ?? 5,
  };
  for (const [id, getter] of Object.entries(mapping)) {
    const slider = document.getElementById(id);
    const valSpan = document.getElementById(id + '-val');
    if (slider) {
      const val = getter(components);
      slider.value = val;
      if (valSpan) valSpan.textContent = typeof val === 'number' ? (Number.isInteger(val) ? val : val.toFixed(2)) : val;
    }
  }
}

let _simDebounce = null;
function _runSimulation() {
  clearTimeout(_simDebounce);
  _simDebounce = setTimeout(async () => {
    const params = {
      fg: parseFloat(document.getElementById('sim-fg')?.value || 50),
      vix: parseFloat(document.getElementById('sim-vix')?.value || 20),
      ls: parseFloat(document.getElementById('sim-ls')?.value || 50),
      fr: parseFloat(document.getElementById('sim-fr')?.value || 0),
      kp: parseFloat(document.getElementById('sim-kp')?.value || 0),
      oi: parseFloat(document.getElementById('sim-oi')?.value || 20),
      sc: parseFloat(document.getElementById('sim-sc')?.value || 5),
    };
    try {
      const data = await apiFetch('/api/risk-gauge/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        silent: true
      });
      const scoreEl = document.getElementById('rg-sim-score');
      const labelEl = document.getElementById('rg-sim-label');
      const levelColors = {
        'CRITICAL': '#dc2626', 'HIGH': '#f97316', 'ELEVATED': '#eab308',
        'MODERATE': '#C9A96E', 'LOW': '#059669'
      };
      if (scoreEl) { scoreEl.textContent = data.score; scoreEl.style.color = levelColors[data.level] || '#64748b'; }
      if (labelEl) { labelEl.textContent = data.label; labelEl.style.color = levelColors[data.level] || '#64748b'; }
    } catch (e) {
      console.error('[Sim]', e);
    }
  }, 200);
}

/**
 * Auto-compute Market Vibe from risk gauge data.
 * Council renderCouncil() will override this when executed.
 */
let _vibeFromCouncil = false;
function updateMarketVibe(riskData) {
  if (_vibeFromCouncil) return;
  const vStat = document.getElementById('vibe-status');
  const vMsg = document.getElementById('vibe-message');
  if (!vStat) return;

  const score = riskData.score || 0;
  const level = riskData.level || 'MODERATE';

  const vibeMap = {
    'CRITICAL': { text: 'EXTREME FEAR', color: '#dc2626', msg: '/// SYSTEM: High-risk environment detected ??exercise extreme caution' },
    'HIGH':     { text: 'FEARFUL',      color: '#f97316', msg: '/// SYSTEM: Elevated risk levels ??monitor positions closely' },
    'ELEVATED': { text: 'CAUTIOUS',     color: '#eab308', msg: '/// SYSTEM: Market uncertainty elevated ??stay alert' },
    'MODERATE': { text: 'NEUTRAL',      color: '#C9A96E', msg: '/// SYSTEM: Market conditions within normal range' },
    'LOW':      { text: 'OPTIMISTIC',   color: '#059669', msg: '/// SYSTEM: Low-risk environment ??favorable conditions' }
  };
  const vibe = vibeMap[level] || vibeMap['MODERATE'];

  vStat.innerText = vibe.text;
  vStat.style.color = vibe.color;
  vStat.style.textShadow = `0 0 8px ${vibe.color}`;
  if (vMsg) vMsg.innerText = vibe.msg;
}

/* ?�═ Risk Index 30-Day History Chart (Interactive + BTC overlay + Zone Timeline) ?�═ */
async function fetchRiskHistory() {
  try {
    const data = await apiFetch('/api/risk-gauge/history?days=30', { silent: true });
    if (data.history && data.history.length > 0) {
      _cachedRiskHistory = data.history;
      drawRiskHistoryChart(data.history);
      _drawZoneTimeline(data.history);
    }
  } catch (e) {
    console.error('[RiskHistory]', e);
  }
}

function drawRiskHistoryChart(history) {
  const canvas = document.getElementById('risk-history-canvas');
  const rangeEl = document.getElementById('risk-history-range');
  const tooltipEl = document.getElementById('rg-chart-tooltip');
  if (!canvas || !history.length) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width, h = rect.height;
  const pad = { top: 8, right: _btcPriceOverlay ? 32 : 8, bottom: 16, left: 28 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;

  ctx.clearRect(0, 0, w, h);

  const scores = history.map(r => r.score);
  const minScore = -100, maxScore = 100;

  const latest = scores[scores.length - 1];
  const min = Math.min(...scores), max = Math.max(...scores);
  if (rangeEl) rangeEl.textContent = `L:${min.toFixed(0)} / H:${max.toFixed(0)} / NOW:${latest.toFixed(0)}`;

  const step = cw / Math.max(scores.length - 1, 1);
  const yOf = (v) => pad.top + ch * (1 - (v - minScore) / (maxScore - minScore));

  // Zone backgrounds
  const zones = [
    { min: -100, max: -60, color: 'rgba(220,38,38,0.06)' },
    { min: -60, max: -30, color: 'rgba(249,115,22,0.04)' },
    { min: -30, max: 0, color: 'rgba(234,179,8,0.03)' },
    { min: 0, max: 30, color: 'rgba(201,169,110,0.03)' },
    { min: 30, max: 100, color: 'rgba(5,150,105,0.05)' }
  ];
  zones.forEach(z => {
    ctx.fillStyle = z.color;
    ctx.fillRect(pad.left, yOf(z.max), cw, yOf(z.min) - yOf(z.max));
  });

  // Zero line
  ctx.strokeStyle = 'rgba(100,116,139,0.25)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(pad.left, yOf(0));
  ctx.lineTo(pad.left + cw, yOf(0));
  ctx.stroke();
  ctx.setLineDash([]);

  // Alert threshold line
  if (_riskAlertThreshold > -999) {
    ctx.strokeStyle = 'rgba(239,68,68,0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.left, yOf(_riskAlertThreshold));
    ctx.lineTo(pad.left + cw, yOf(_riskAlertThreshold));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '6px monospace';
    ctx.fillStyle = 'rgba(239,68,68,0.6)';
    ctx.textAlign = 'left';
    ctx.fillText('ALERT', pad.left + 2, yOf(_riskAlertThreshold) - 2);
  }

  // Y-axis labels
  ctx.font = '7px monospace';
  ctx.fillStyle = 'rgba(100,116,139,0.6)';
  ctx.textAlign = 'right';
  [-100, -50, 0, 50, 100].forEach(v => {
    ctx.fillText(v.toString(), pad.left - 3, yOf(v) + 3);
  });

  // Gradient fill
  const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch);
  gradient.addColorStop(0, 'rgba(5,150,105,0.25)');
  gradient.addColorStop(0.5, 'rgba(100,116,139,0.05)');
  gradient.addColorStop(1, 'rgba(220,38,38,0.25)');

  ctx.beginPath();
  ctx.moveTo(pad.left, yOf(0));
  scores.forEach((s, i) => ctx.lineTo(pad.left + i * step, yOf(s)));
  ctx.lineTo(pad.left + (scores.length - 1) * step, yOf(0));
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Risk score line
  ctx.beginPath();
  scores.forEach((s, i) => {
    const x = pad.left + i * step, y = yOf(s);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  const lineColor = latest > 30 ? '#059669' : latest > 0 ? '#C9A96E' : latest > -30 ? '#eab308' : latest > -60 ? '#f97316' : '#dc2626';
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Latest point pulse
  const lastX = pad.left + (scores.length - 1) * step;
  const lastY = yOf(latest);
  ctx.beginPath(); ctx.arc(lastX, lastY, 4, 0, Math.PI * 2); ctx.fillStyle = lineColor; ctx.fill();
  ctx.beginPath(); ctx.arc(lastX, lastY, 7, 0, Math.PI * 2); ctx.strokeStyle = lineColor; ctx.lineWidth = 1; ctx.globalAlpha = 0.3; ctx.stroke(); ctx.globalAlpha = 1;

  // Level dots
  const levelColors = { 'CRITICAL': '#dc2626', 'HIGH': '#f97316', 'ELEVATED': '#eab308', 'MODERATE': '#C9A96E', 'LOW': '#059669' };
  history.forEach((r, i) => {
    const x = pad.left + i * step, y = yOf(r.score);
    ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fillStyle = levelColors[r.level] || '#94a3b8'; ctx.fill();
  });

  // ?�?� BTC Price Overlay (Feature 13) ?�?�
  if (_btcPriceOverlay) {
    _drawBtcPriceOverlay(ctx, history, pad, cw, ch, w);
  }

  // ?�?� Interactive tooltip on hover (Feature 3) ?�?�
  canvas.onmousemove = (e) => {
    if (!tooltipEl) return;
    const cRect = canvas.getBoundingClientRect();
    const mx = e.clientX - cRect.left;
    const idx = Math.round((mx - pad.left) / step);
    if (idx >= 0 && idx < history.length) {
      const r = history[idx];
      const dateStr = r.timestamp ? r.timestamp.slice(0, 16).replace('T', ' ') : '';
      tooltipEl.innerHTML = `<b>${dateStr}</b><br>Score: <b style="color:${levelColors[r.level]||'#fff'}">${r.score.toFixed(1)}</b> [${r.level}]`;
      tooltipEl.classList.remove('hidden');
      const tx = Math.min(mx + 10, w - 120);
      tooltipEl.style.left = tx + 'px';
      tooltipEl.style.top = '4px';
    }
  };
  canvas.onmouseleave = () => { if (tooltipEl) tooltipEl.classList.add('hidden'); };
}

// ?�?� BTC Price Overlay ?�?�
async function _drawBtcPriceOverlay(ctx, history, pad, cw, ch, w) {
  try {
    const marketData = await apiFetch('/api/market', { silent: true });
    const btcPrice = marketData?.market?.BTC?.price;
    if (!btcPrice) return;

    // We'll use a simple overlay showing just the latest BTC price indicator
    // and scale line on right axis
    const priceMin = btcPrice * 0.9, priceMax = btcPrice * 1.1;
    const yPrice = (v) => pad.top + ch * (1 - (v - priceMin) / (priceMax - priceMin));

    // Right Y-axis for BTC price
    ctx.font = '6px monospace';
    ctx.fillStyle = 'rgba(247,147,26,0.6)';
    ctx.textAlign = 'left';
    const rightX = pad.left + cw + 3;
    ctx.fillText(`$${(btcPrice/1000).toFixed(1)}k`, rightX, yPrice(btcPrice) + 3);

    // Horizontal price line
    ctx.strokeStyle = 'rgba(247,147,26,0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.left, yPrice(btcPrice));
    ctx.lineTo(pad.left + cw, yPrice(btcPrice));
    ctx.stroke();
    ctx.setLineDash([]);

    // BTC label
    ctx.fillStyle = 'rgba(247,147,26,0.5)';
    ctx.font = '7px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('BTC >>', pad.left + cw - 2, yPrice(btcPrice) - 3);
  } catch (e) {
    // silently fail
  }
}

// ?�?� Zone Timeline (Feature 4) ?�?�
function _drawZoneTimeline(history) {
  const container = document.getElementById('rg-zone-timeline');
  if (!container || !history.length) return;

  const levelColors = {
    'CRITICAL': '#dc2626', 'HIGH': '#f97316', 'ELEVATED': '#eab308',
    'MODERATE': '#C9A96E', 'LOW': '#059669'
  };

  // Group consecutive same-level segments
  let segments = [];
  let current = { level: history[0].level, count: 1 };
  for (let i = 1; i < history.length; i++) {
    if (history[i].level === current.level) {
      current.count++;
    } else {
      segments.push(current);
      current = { level: history[i].level, count: 1 };
    }
  }
  segments.push(current);

  const total = history.length;
  container.innerHTML = segments.map(s => {
    const pct = (s.count / total * 100).toFixed(1);
    return `<div class="rg-zone-segment" style="width:${pct}%;background:${levelColors[s.level]||'#64748b'}" title="${s.level}: ${s.count} records"></div>`;
  }).join('');
}

// Correlation matrix and risk history are now managed via RyzmScheduler (H-5/M-2 fix)
// Removed standalone setTimeout/setInterval to prevent duplicate polling.

/* ?�?� Museum of Scars ?�?� */
async function fetchMuseumOfScars() {
  try {
    const data = await apiFetch('/api/scars', { silent: true });
    const container = document.getElementById('scars-feed');
    if (!container || !data.scars) return;

    container.innerHTML = data.scars.map(s => `
      <div class="scar-item">
        <div class="scar-header">
          <span class="scar-date">${escapeHtml(s.date)}</span>
          <span class="scar-event">${escapeHtml((s.event || '').toUpperCase())}</span>
          <span class="scar-drop">${escapeHtml(s.drop)}</span>
        </div>
        <div class="scar-desc">${escapeHtml(s.desc)}</div>
      </div>
    `).join('');
  } catch (e) {
    console.error('Museum of Scars Error:', e);
  }
}

/* ?�?� Strategic Narrative (rendered from Council data) ?�?� */
function renderStrategicNarrative(narrativeData) {
  const container = document.getElementById('strategic-narrative');
  const layersEl = document.getElementById('sn-layers');
  if (!container || !layersEl) return;

  if (!narrativeData || narrativeData.length === 0) {
    container.style.display = 'none';
    return;
  }

  const layerColors = ['var(--neon-red)', 'var(--neon-magenta)', 'var(--neon-cyan)'];
  layersEl.innerHTML = narrativeData.map((layer, i) => `
    <div class="sn-layer">
      <div class="sn-layer-title" style="color:${layerColors[i] || 'var(--text-muted)'}">
        LAYER ${escapeHtml(layer.layer)}: ${escapeHtml(layer.title)}
      </div>
      <div class="sn-layer-content">${escapeHtml(layer.content)}</div>
    </div>
  `).join('');

  container.style.display = 'block';
}

/* ?�?� L/S Ratio Panel (Upgraded) ?�?� */
let _lsActiveCoin = 'BTC';
let _lsCoinData = {};   // { BTC: {longAccount, shortAccount, ratio}, ETH: {...}, SOL: {...} }
let _lsHistory = {};    // { BTC: [{long, ts}, ...], ... }
let _lsPrevLong = {};   // track previous long% for wave trigger

function _initLsTabs() {
  document.querySelectorAll('.ls-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ls-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _lsActiveCoin = btn.dataset.coin;
      _renderLsPanel();
    });
  });
}

async function fetchLongShortRatio() {
  try {
    let data;
    if (typeof BinanceDirect !== 'undefined' && await BinanceDirect.isFapiAvailable()) {
      data = await BinanceDirect.longShort();
    } else {
      data = await apiFetch('/api/long-short', { silent: true });
    }
    
    // Parse multi-coin data
    if (data.coins) {
      _lsCoinData = data.coins;
    } else if (data.longAccount) {
      // Backward compat ??single BTC
      _lsCoinData['BTC'] = { longAccount: data.longAccount, shortAccount: data.shortAccount, ratio: data.ratio };
    }

    // Parse history
    if (data.history) {
      _lsHistory = data.history;
    }

    _renderLsPanel();
    _renderLsHistory();
    _initLsTabs();
  } catch (e) {
    console.error("L/S Error:", e); 
  }
}

function _renderLsPanel() {
  const coinData = _lsCoinData[_lsActiveCoin];
  if (!coinData) return;

  let finalLong = coinData.longAccount;
  if (finalLong <= 1) finalLong *= 100;
  const finalShort = 100 - finalLong;

  const lsLong = document.getElementById('ls-long');
  const lsShort = document.getElementById('ls-short');

  if (lsLong && lsShort) {
    lsLong.style.width = `${finalLong}%`;
    const lsLongVal = lsLong.querySelector('.ls-val');
    if (lsLongVal) lsLongVal.textContent = `${finalLong.toFixed(1)}%`;

    lsShort.style.width = `${finalShort}%`;
    const lsShortVal = lsShort.querySelector('.ls-val');
    if (lsShortVal) lsShortVal.textContent = `${finalShort.toFixed(1)}%`;
  }

  // Update indicator row
  const longPct = document.getElementById('ls-long-pct');
  const shortPct = document.getElementById('ls-short-pct');
  const ratioNum = document.getElementById('ls-ratio-num');
  if (longPct) longPct.textContent = `${finalLong.toFixed(1)}%`;
  if (shortPct) shortPct.textContent = `${finalShort.toFixed(1)}%`;
  if (ratioNum) {
    const ratio = finalShort > 0 ? (finalLong / finalShort).toFixed(2) : '--';
    ratioNum.textContent = ratio;
    ratioNum.style.color = finalLong > finalShort ? 'var(--neon-green)' : finalLong < finalShort ? 'var(--neon-red)' : 'var(--neon-cyan)';
  }

  // ??Sentiment Arc Gauge
  _updateLsArcGauge(finalLong);

  // ??Wave animation ??trigger if ratio changed significantly
  const prevLong = _lsPrevLong[_lsActiveCoin] || 50;
  if (Math.abs(finalLong - prevLong) > 0.3) {
    _triggerLsWave(finalLong > prevLong);
  }
  _lsPrevLong[_lsActiveCoin] = finalLong;

  // ??Alert threshold (60%+)
  _updateLsAlert(finalLong, finalShort);
}

/* ??Sentiment Arc Gauge */
function _updateLsArcGauge(longPct) {
  const arcFill = document.getElementById('ls-arc-fill');
  const arcDot = document.getElementById('ls-arc-dot');
  const arcLabel = document.getElementById('ls-arc-label');
  if (!arcFill) return;

  // Arc total length ??157 (half circle)
  const totalLen = 157;
  const pct = longPct / 100;  // 0~1
  const offset = totalLen * (1 - pct);
  arcFill.style.strokeDashoffset = offset;

  // Move dot along arc (angle from -180° to 0°)
  if (arcDot) {
    const angle = Math.PI * (1 - pct);
    const cx = 60 - 50 * Math.cos(angle);
    const cy = 62 - 50 * Math.sin(angle);
    arcDot.setAttribute('cx', cx.toFixed(1));
    arcDot.setAttribute('cy', cy.toFixed(1));
  }

  // Label
  if (arcLabel) {
    if (longPct >= 65) { arcLabel.textContent = 'EXTREME LONG'; arcLabel.style.fill = 'var(--neon-green)'; }
    else if (longPct >= 55) { arcLabel.textContent = 'BULLISH'; arcLabel.style.fill = 'var(--neon-green)'; }
    else if (longPct <= 35) { arcLabel.textContent = 'EXTREME SHORT'; arcLabel.style.fill = 'var(--neon-red)'; }
    else if (longPct <= 45) { arcLabel.textContent = 'BEARISH'; arcLabel.style.fill = 'var(--neon-red)'; }
    else { arcLabel.textContent = 'NEUTRAL'; arcLabel.style.fill = 'var(--neon-cyan)'; }
  }
}

/* ??Wave ripple animation on ratio change */
function _triggerLsWave(isLongSide) {
  const canvas = document.getElementById('ls-wave-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width = canvas.offsetWidth || 300;
  const h = canvas.height = canvas.offsetHeight || 32;
  const color = isLongSide ? [5, 150, 105] : [220, 38, 38];
  const startX = isLongSide ? 0 : w;

  let frame = 0;
  function animate() {
    ctx.clearRect(0, 0, w, h);
    const progress = frame / 40;
    if (progress > 1) { ctx.clearRect(0, 0, w, h); return; }
    const waveX = startX + (isLongSide ? 1 : -1) * progress * w;
    const alpha = 0.3 * (1 - progress);
    ctx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${alpha})`;
    ctx.beginPath();
    for (let y = 0; y <= h; y += 2) {
      const wave = Math.sin(y * 0.3 + frame * 0.3) * 8 * (1 - progress);
      ctx.rect(isLongSide ? 0 : waveX, y, Math.abs(waveX - (isLongSide ? 0 : w)) + wave, 2);
    }
    ctx.fill();
    frame++;
    if (frame < 40) requestAnimationFrame(animate);
    else ctx.clearRect(0, 0, w, h);
  }
  animate();
}

/* ??Alert threshold */
function _updateLsAlert(longPct, shortPct) {
  const zone = document.getElementById('ls-alert-zone');
  const text = document.getElementById('ls-alert-text');
  if (!zone) return;

  if (longPct >= 60) {
    zone.style.display = 'flex';
    zone.className = 'ls-alert-zone alert-long';
    text.textContent = `[!] EXTREME LONG ${longPct.toFixed(1)}%`;
  } else if (shortPct >= 60) {
    zone.style.display = 'flex';
    zone.className = 'ls-alert-zone alert-short';
    text.textContent = `[!] EXTREME SHORT ${shortPct.toFixed(1)}%`;
  } else {
    zone.style.display = 'none';
  }
}

/* ??History sparkline (24h L/S trend) */
function _renderLsHistory() {
  const canvas = document.getElementById('ls-history-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const hist = _lsHistory[_lsActiveCoin];
  if (!hist || hist.length < 2) return;

  const w = canvas.width = canvas.offsetWidth || 240;
  const h = canvas.height = 36;
  ctx.clearRect(0, 0, w, h);

  const values = hist.map(d => d.long);
  const min = Math.min(...values) - 1;
  const max = Math.max(...values) + 1;
  const range = max - min || 1;

  // Draw 50% reference line
  const y50 = h - ((50 - min) / range) * h;
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(0, y50);
  ctx.lineTo(w, y50);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw area fill
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  const lastVal = values[values.length - 1];
  const isUp = lastVal >= 50;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, isUp ? 'rgba(5,150,105,0.2)' : 'rgba(220,38,38,0.2)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fill();

  // Draw line
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = isUp ? '#059669' : '#dc2626';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // End dot
  const lastX = w;
  const lastY = h - ((lastVal - min) / range) * h;
  ctx.beginPath();
  ctx.arc(lastX - 1, lastY, 3, 0, Math.PI * 2);
  ctx.fillStyle = isUp ? '#059669' : '#dc2626';
  ctx.fill();
  ctx.strokeStyle = 'var(--bg-card)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

async function fetchMacroTicker() {
  try {
    const data = await apiFetch('/api/market', { silent: true });
    const market = data.market;
    const container = document.getElementById('macro-ticker');

    if (!market || Object.keys(market).length === 0) return;

    // Expose market data globally for Price Alerts current price display
    window._latestMarketData = market;

    // Update header FX display
    if (market['USD/KRW']) {
      const fx = market['USD/KRW'];
      const fxVal = document.getElementById('fx-usdkrw');
      const fxChg = document.getElementById('fx-usdkrw-chg');
      if (fxVal) fxVal.textContent = Number(fx.price).toLocaleString('ko-KR', {minimumFractionDigits:1, maximumFractionDigits:1});
      if (fxChg) {
        const sign = fx.change >= 0 ? '+' : '';
        fxChg.textContent = `${sign}${fx.change}%`;
        fxChg.className = `fx-change ${fx.change >= 0 ? 'fx-up' : 'fx-down'}`;
      }
    }
    if (market['USD/JPY']) {
      const fx2 = market['USD/JPY'];
      const fxVal2 = document.getElementById('fx-usdjpy');
      const fxChg2 = document.getElementById('fx-usdjpy-chg');
      if (fxVal2) fxVal2.textContent = Number(fx2.price).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
      if (fxChg2) {
        const sign2 = fx2.change >= 0 ? '+' : '';
        fxChg2.textContent = `${sign2}${fx2.change}%`;
        fxChg2.className = `fx-change ${fx2.change >= 0 ? 'fx-up' : 'fx-down'}`;
      }
    }

    const order = ['BTC', 'ETH', 'SOL', 'VIX', 'DXY', 'GOLD', 'SILVER', 'USD/KRW', 'USD/JPY'];
    let html = '';

    order.forEach(key => {
      // Prefer live WebSocket prices for crypto
      const live = _livePrices[key];
      const backend = market[key];
      const item = (live && live.price) ? { price: live.price, change: live.change } : backend;
      if (item) {
        const chgClass = item.change >= 0 ? 'up' : 'down';
        const sign = item.change >= 0 ? '+' : '';
        const decimals = item.price >= 100 ? 2 : item.price >= 1 ? 4 : 6;
        const isEstimate = item.est ? ' ~' : '';
        const priceStr = key.startsWith('USD/') ? Number(item.price).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2})
          : '$' + Number(item.price).toLocaleString('en-US', {minimumFractionDigits: decimals, maximumFractionDigits: decimals});
        html += `
          <span class="ticker-item">
            <span class="ticker-sym">${key}</span>
            <span class="ticker-price">${priceStr}${isEstimate}</span>
            <span class="ticker-chg ${chgClass}">${sign}${item.change}%</span>
          </span>
          <span class="ticker-sep"></span>`;
      }
    });
    if (container) container.innerHTML = html + html;

    // ── Seed price cards from backend API (so effects work even without WebSocket) ──
    _allPriceKeys.forEach(key => {
      const coin = market[key];
      if (!coin || !coin.price) return;
      const prev = _livePrices[key];
      const prevPrice = prev ? prev.price : coin.price;
      _livePrices[key] = {
        price: coin.price,
        prevPrice: prevPrice,
        change: coin.change ?? (prev ? prev.change : 0),
        high: coin.high ?? (prev ? prev.high : coin.price),
        low: coin.low ?? (prev ? prev.low : coin.price),
        vol: coin.volume ?? (prev ? prev.vol : 0),
        mcap: coin.mcap ?? (prev ? prev.mcap : 0),
      };
      renderPriceCard(key);
    });

    // Kimchi is handled by its own scheduler entry ??no duplicate call needed (H-4 fix)
  } catch (e) { console.error("Ticker Error:", e); }
}

async function fetchKimchi() {
  try {
    const data = await apiFetch('/api/kimchi', { silent: true });
    const p = data.premium;
    if (p === undefined) return;

    // Update ALL kimchi displays (class .kp-value + id #kp-value)
    const targets = [document.querySelector('.kp-value'), document.getElementById('kp-value')];
    const valText = (p > 0 ? '+' : '') + p + '%';
    const valColor = p > 3 ? 'var(--neon-red)' : p < -1 ? 'var(--neon-cyan)' : 'var(--neon-green)';
    targets.forEach(el => {
      if (!el) return;
      el.innerText = valText;
      el.style.color = valColor;
      el.classList.remove('kp-positive', 'kp-negative');
      el.classList.add(p > 0 ? 'kp-positive' : 'kp-negative');
    });

    // Status label (arbitrage opportunity level)
    const kpStatus = document.getElementById('kp-status');
    if (kpStatus) {
      if (Math.abs(p) > 3) {
        kpStatus.innerText = t('arb_high');
        kpStatus.style.color = 'var(--neon-cyan)';
      } else if (Math.abs(p) > 1) {
        kpStatus.innerText = t('arb_medium');
        kpStatus.style.color = 'var(--text-muted)';
      } else {
        kpStatus.innerText = t('arb_low');
        kpStatus.style.color = 'var(--text-muted)';
      }
    }

    // Freshness timestamp
    const kpTime = document.getElementById('kp-updated');
    if (kpTime) kpTime.textContent = new Date().toLocaleTimeString('en-US', { hour12:false, hour:'2-digit', minute:'2-digit' });
  } catch (e) { console.error("KP Error:", e); }
}

/* ?�?� Connection Status Banner ?�?� */
let _connBanner = null;
let _connBannerTimeout = null;

function _updateConnectionBanner(status) {
  // status: 'connected' | 'reconnecting' | 'disconnected'
  if (!_connBanner) {
    _connBanner = document.createElement('div');
    _connBanner.className = 'connection-toast hidden';
    document.body.appendChild(_connBanner);
  }
  clearTimeout(_connBannerTimeout);

  if (status === 'connected') {
    // Only show "connected" if it was previously disconnected/reconnecting
    if (_connBanner.classList.contains('disconnected') || _connBanner.classList.contains('reconnecting')) {
      _connBanner.className = 'connection-toast connected';
      _connBanner.innerHTML = '<span class="conn-dot" style="animation:none;background:#fff;"></span> LIVE FEED RESTORED';
      _connBannerTimeout = setTimeout(() => {
        _connBanner.className = 'connection-toast hidden';
      }, 3000);
    }
  } else if (status === 'reconnecting') {
    _connBanner.className = 'connection-toast reconnecting';
    _connBanner.innerHTML = '<span class="conn-dot"></span> RECONNECTING TO LIVE FEED...';
  } else {
    _connBanner.className = 'connection-toast disconnected';
    _connBanner.innerHTML = '<span class="conn-dot"></span> LIVE FEED DISCONNECTED';
  }
}

/* ?�?� Skeleton ??Data Fade Transition Helper ?�?� */
function replaceSkeleton(container) {
  if (!container) return;
  const skeleton = container.querySelector('.skeleton-loader');
  if (skeleton) {
    skeleton.classList.add('fade-out');
    setTimeout(() => skeleton.remove(), 150);
  }
  container.classList.add('data-loaded');
  // Remove animation class after it completes to avoid re-triggering
  container.addEventListener('animationend', () => container.classList.remove('data-loaded'), { once: true });
}

/* ═══ Real-time Price Panel v6.0 (Dynamic Altcoin Selector + Binance WS) ═══ */
const _livePrices = {};   // { BTC: {price, change, prevPrice, high, low, vol, mcap}, ... }
const _priceHistory = {};  // { BTC: [p1, p2, ...], ... } mini sparkline data (max 50 pts)
const _tickDirs = {};      // { BTC: ['up','down','up',...], ... } last 5 tick directions
let _priceWs = null;
let _priceWsRetry = 0;
const _wsHosts = [
  'wss://stream.binance.com:9443',
  'wss://stream.binance.com:443',
  'wss://fstream.binance.com'
];
let _wsHostIdx = 0;
let _priceFilter = 'all';   // 'all' | 'crypto' | 'macro'
let _priceSort = 'default'; // 'default' | 'change-desc' | 'change-asc' | 'vol-desc'

// ── Core coins (always shown) + Macro ──
const _coreCoins = ['BTC','ETH','SOL'];
const _macroKeys = ['VIX','DXY','GOLD','SILVER','USD/KRW','USD/JPY'];

// ── Altcoin Catalog ──
const _altCatalog = [
  {key:'XRP',  symbol:'XRPUSDT',  name:'Ripple',    color:'#00aae4'},
  {key:'DOGE', symbol:'DOGEUSDT', name:'Dogecoin',  color:'#c2a633'},
  {key:'ADA',  symbol:'ADAUSDT',  name:'Cardano',   color:'#0033ad'},
  {key:'AVAX', symbol:'AVAXUSDT', name:'Avalanche', color:'#e84142'},
  {key:'DOT',  symbol:'DOTUSDT',  name:'Polkadot',  color:'#e6007a'},
  {key:'LINK', symbol:'LINKUSDT', name:'Chainlink', color:'#375bd2'},
  {key:'SUI',  symbol:'SUIUSDT',  name:'Sui',       color:'#6fbcf0'},
  {key:'ARB',  symbol:'ARBUSDT',  name:'Arbitrum',  color:'#28a0f0'},
  {key:'OP',   symbol:'OPUSDT',   name:'Optimism',  color:'#ff0420'},
  {key:'NEAR', symbol:'NEARUSDT', name:'NEAR',      color:'#00ec97'},
  {key:'TRX',  symbol:'TRXUSDT',  name:'Tron',      color:'#eb0029'},
  {key:'LTC',  symbol:'LTCUSDT',  name:'Litecoin',  color:'#bfbbbb'},
  {key:'UNI',  symbol:'UNIUSDT',  name:'Uniswap',   color:'#ff007a'},
  {key:'ATOM', symbol:'ATOMUSDT', name:'Cosmos',    color:'#6f7390'},
  {key:'POL',  symbol:'POLUSDT',  name:'Polygon',   color:'#8247e5'},
  {key:'PEPE', symbol:'PEPEUSDT', name:'Pepe',      color:'#4ca22c'},
  {key:'SHIB', symbol:'SHIBUSDT', name:'Shiba Inu', color:'#ffa409'},
  {key:'APT',  symbol:'APTUSDT',  name:'Aptos',     color:'#2ed8a3'},
  {key:'AAVE', symbol:'AAVEUSDT', name:'Aave',      color:'#b6509e'},
  {key:'BNB',  symbol:'BNBUSDT',  name:'BNB',       color:'#f0b90b'},
];

// ── Selected altcoins (persisted to localStorage) ──
let _selectedAlts = _loadSelectedAlts();

function _loadSelectedAlts() {
  try {
    const raw = localStorage.getItem('ryzm_selected_alts');
    if (raw) {
      const arr = JSON.parse(raw);
      const validKeys = new Set(_altCatalog.map(a => a.key));
      return arr.filter(k => validKeys.has(k));
    }
  } catch {}
  return [];
}
function _saveSelectedAlts() {
  try { localStorage.setItem('ryzm_selected_alts', JSON.stringify(_selectedAlts)); } catch {}
}

// ── Dynamic keys ──
function _getCryptoKeys() { return [..._coreCoins, ..._selectedAlts]; }
function _getAllPriceKeys() { return [..._getCryptoKeys(), ..._macroKeys]; }

// backward-compat references (used by other parts of data.js)
let _cryptoKeys = _getCryptoKeys();
let _allPriceKeys = _getAllPriceKeys();
function _refreshKeyArrays() {
  _cryptoKeys = _getCryptoKeys();
  _allPriceKeys = _getAllPriceKeys();
}

// ── WS stream map (dynamic) ──
function _getWsStreamMap() {
  const map = {};
  _getCryptoKeys().forEach(k => { map[k.toUpperCase() + 'USDT'] = k; });
  return map;
}
let _wsStreamMap = _getWsStreamMap();

function initBinanceWebSocket() {
  if (_priceWs && _priceWs.readyState <= 1) { _priceWs.close(); _priceWs = null; }
  _wsStreamMap = _getWsStreamMap();
  const cryptoKeys = _getCryptoKeys();
  const streams = cryptoKeys.map(k => `${k.toLowerCase()}usdt@miniTicker`).join('/');
  const host = _wsHosts[_wsHostIdx % _wsHosts.length];
  const url = `${host}/stream?streams=${streams}`;
  try { _priceWs = new WebSocket(url); } catch (e) { _wsHostIdx++; scheduleWsReconnect(); return; }

  const connectTimeout = setTimeout(() => {
    if (_priceWs && _priceWs.readyState !== 1) { _priceWs.close(); }
  }, 8000);

  _priceWs.onopen = () => {
    clearTimeout(connectTimeout);
    _priceWsRetry = 0;
    _updateConnectionBanner('connected');
    _updateWsBadge('connected');
  };

  _priceWs.onmessage = (evt) => {
    try {
      const msg = JSON.parse(evt.data);
      const d = msg.data;
      if (!d || !d.s) return;
      const key = _wsStreamMap[d.s];
      if (!key) return;

      const newPrice = parseFloat(d.c);
      const openPrice = parseFloat(d.o);
      const high = parseFloat(d.h);
      const low = parseFloat(d.l);
      const vol = parseFloat(d.v);
      const change24h = openPrice ? ((newPrice - openPrice) / openPrice * 100) : 0;

      const prev = _livePrices[key];
      _livePrices[key] = {
        price: newPrice,
        change: round2(change24h),
        prevPrice: prev ? prev.price : newPrice,
        high: high,
        low: low,
        vol: vol,
        mcap: prev ? prev.mcap : 0,
        _wsTime: Date.now(),
        _source: 'ws'
      };
      renderPriceCard(key);
      _updatePriceSummary();
    } catch (e) { /* ignore parse errors */ }
  };

  _priceWs.onclose = () => {
    clearTimeout(connectTimeout);
    _wsHostIdx++;
    _updateConnectionBanner('reconnecting');
    _updateWsBadge('reconnecting');
    scheduleWsReconnect();
  };
  _priceWs.onerror = () => {
    clearTimeout(connectTimeout);
    _updateConnectionBanner('disconnected');
    _updateWsBadge('disconnected');
    _priceWs.close();
  };
}

function scheduleWsReconnect() {
  const delay = Math.min(15000, 1000 * Math.pow(2, _priceWsRetry++));
  _priceWs = null;
  setTimeout(initBinanceWebSocket, delay);
}

function _updateWsBadge(status) {
  const badge = document.getElementById('price-ws-status');
  if (!badge) return;
  const label = badge.querySelector('.price-ws-label');
  badge.className = 'price-ws-badge ws-' + status;
  if (label) {
    const labels = { connected: 'LIVE', reconnecting: 'RECONNECTING', disconnected: 'OFFLINE' };
    label.textContent = labels[status] || 'CONNECTING';
  }
}

function round2(v) { return Math.round(v * 100) / 100; }

function formatVol(v) {
  if (v >= 1e12) return (v / 1e12).toFixed(1) + 'T';
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toFixed(0);
}

function renderPriceCard(key) {
  const data = _livePrices[key];
  if (!data) return;

  const cardKey = key.replace('/', '');
  let card = document.getElementById(`price-card-${cardKey}`);
  if (!card) return;

  const valEl = card.querySelector('.price-value');
  const chgEl = card.querySelector('.price-change');
  const volEl = card.querySelector('.price-vol');
  const timeEl = card.querySelector('.price-time');
  const hlBar = card.querySelector('.price-hl-bar');

  if (!valEl) return;

  // Determine direction
  const dir = data.price > data.prevPrice ? 'up' : data.price < data.prevPrice ? 'down' : null;

  // ??Neon glow ??set data-dir attribute for CSS-driven glow
  if (dir) card.setAttribute('data-dir', dir);

  // ??Track tick direction history (last 5)
  if (dir) {
    if (!_tickDirs[key]) _tickDirs[key] = [];
    _tickDirs[key].push(dir);
    if (_tickDirs[key].length > 5) _tickDirs[key].shift();
    _renderTickSeq(cardKey, _tickDirs[key]);
  }

  // Format price
  const isCrypto = _cryptoKeys.includes(key);
  const isFx = key.startsWith('USD/');
  const decimals = isCrypto ? (data.price >= 100 ? 2 : data.price >= 1 ? 4 : 6) : 2;
  const prefix = isFx ? '' : '$';
  animateCountup(valEl, data.price, { duration: 400, decimals, prefix, useComma: true });

  // Flash effect
  if (dir) {
    card.classList.remove('price-flash-up', 'price-flash-down');
    void card.offsetWidth;
    card.classList.add(dir === 'up' ? 'price-flash-up' : 'price-flash-down');
    valEl.style.color = dir === 'up' ? 'var(--neon-green)' : 'var(--neon-red)';
    setTimeout(() => { valEl.style.color = ''; }, 1200);
  }

  // Change %
  if (chgEl) {
    const sign = data.change >= 0 ? '+' : '';
    chgEl.textContent = `${sign}${data.change}%`;
    chgEl.className = `price-change ${data.change >= 0 ? 'up' : 'down'}`;
  }

  // ??Particle burst on ±3% change
  if (Math.abs(data.change) >= 3) {
    const canvas = card.querySelector('.price-card-particle');
    if (canvas) _spawnParticles(canvas, data.change >= 0);
  }

  // Volume
  if (volEl && data.vol) volEl.textContent = formatVol(data.vol);
  if (timeEl) timeEl.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });

  // ??24h High/Low bar ??enhanced with gradient + current price label
  if (hlBar && data.high && data.low && data.high !== data.low) {
    const range = data.high - data.low;
    const pos = ((data.price - data.low) / range) * 100;
    const fill = hlBar.querySelector('.price-hl-fill');
    const dot = hlBar.querySelector('.price-hl-dot');
    const valLabel = hlBar.querySelector('.price-hl-val');
    if (fill) fill.style.width = pos + '%';
    if (dot) dot.style.left = pos + '%';
    if (valLabel) {
      // Show abbreviated price at dot position
      const shortPrice = data.price >= 1000 ? (data.price / 1000).toFixed(1) + 'k'
                       : data.price >= 1 ? data.price.toFixed(1)
                       : data.price.toFixed(4);
      valLabel.textContent = shortPrice;
      valLabel.style.left = pos + '%';
    }
  }

  // Update mini sparkline
  updateMiniChart(key, data.price, data.change);
}

function updateMiniChart(key, price, change) {
  const cardKey = key.replace('/', '');
  if (!_priceHistory[key]) _priceHistory[key] = [];
  _priceHistory[key].push(price);
  if (_priceHistory[key].length > 50) _priceHistory[key].shift();
  const hist = _priceHistory[key];
  if (hist.length < 2) return;

  const chartEl = document.getElementById(`mini-chart-${cardKey}`);
  if (!chartEl) return;
  const svg = chartEl.querySelector('svg');
  if (!svg) return;

  const min = Math.min(...hist);
  const max = Math.max(...hist);
  const range = max - min || 1;
  const w = 60, h = 18, pad = 2;
  const points = hist.map((v, i) => {
    const x = (i / (hist.length - 1)) * w;
    const y = pad + (1 - (v - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const color = change >= 0 ? 'var(--neon-green)' : 'var(--neon-red)';
  svg.innerHTML = `
    <defs>
      <linearGradient id="mcg-${cardKey}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.15"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <polygon points="${points} ${w},${h} 0,${h}" fill="url(#mcg-${cardKey})"/>
    <polyline fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" points="${points}" opacity="0.7"/>
  `;
}

// Inline SVG icons for core + macro tickers
const _tickerIcons = {
  BTC: `<svg viewBox="0 0 32 32" class="ticker-icon"><circle cx="16" cy="16" r="16" fill="#f7931a"/><path d="M22.5 14.2c.3-2-1.2-3.1-3.3-3.8l.7-2.7-1.6-.4-.6 2.6c-.4-.1-.9-.2-1.3-.3l.7-2.6-1.7-.4-.7 2.7c-.4-.1-.7-.2-1-.2l-2.3-.6-.4 1.7s1.2.3 1.2.3c.7.2.8.6.8 1l-.8 3.3c0 .1.1.1.1.1l-.1 0-1.2 4.7c-.1.2-.3.6-.8.4 0 0-1.2-.3-1.2-.3l-.8 1.9 2.2.5c.4.1.8.2 1.2.3l-.7 2.8 1.6.4.7-2.7c.5.1.9.2 1.3.3l-.7 2.7 1.7.4.7-2.8c2.8.5 4.9.3 5.8-2.2.7-2 0-3.2-1.5-3.9 1.1-.3 1.9-1 2.1-2.5zm-3.7 5.2c-.5 2-3.9.9-5 .7l.9-3.6c1.1.3 4.7.8 4.1 2.9zm.5-5.3c-.5 1.8-3.3.9-4.2.7l.8-3.2c.9.2 3.9.7 3.4 2.5z" fill="#fff"/></svg>`,
  ETH: `<svg viewBox="0 0 32 32" class="ticker-icon"><circle cx="16" cy="16" r="16" fill="#627eea"/><path d="M16.5 4v8.9l7.5 3.3z" fill="#fff" opacity=".6"/><path d="M16.5 4L9 16.2l7.5-3.3z" fill="#fff"/><path d="M16.5 21.9v6.1l7.5-10.4z" fill="#fff" opacity=".6"/><path d="M16.5 28V21.9L9 17.6z" fill="#fff"/><path d="M16.5 20.6l7.5-4.4-7.5-3.3z" fill="#fff" opacity=".2"/><path d="M9 16.2l7.5 4.4v-7.7z" fill="#fff" opacity=".5"/></svg>`,
  SOL: `<svg viewBox="0 0 32 32" class="ticker-icon"><circle cx="16" cy="16" r="16" fill="#000"/><linearGradient id="sol-g" x1="5" y1="27" x2="27" y2="5" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#9945ff"/><stop offset=".5" stop-color="#14f195"/><stop offset="1" stop-color="#00d1ff"/></linearGradient><path d="M9.5 20.1h13.6l-3 3H6.5z M9.5 14.5h13.6l-3-3H6.5z M9.5 8.9h13.6l-3 3H6.5z" fill="url(#sol-g)" transform="translate(0,0.5)"/></svg>`,
  VIX: `<svg viewBox="0 0 32 32" class="ticker-icon"><circle cx="16" cy="16" r="16" fill="#1e293b"/><path d="M8 22l4-8 3 5 3-10 3 7 3-6" stroke="#f97316" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  DXY: `<svg viewBox="0 0 32 32" class="ticker-icon"><circle cx="16" cy="16" r="16" fill="#1e293b"/><text x="16" y="21" text-anchor="middle" fill="#C9A96E" font-size="14" font-weight="bold" font-family="sans-serif">$</text></svg>`,
  'USD/KRW': `<svg viewBox="0 0 32 32" class="ticker-icon"><circle cx="16" cy="16" r="16" fill="#1e293b"/><text x="16" y="21" text-anchor="middle" fill="#eab308" font-size="12" font-weight="bold" font-family="sans-serif">\u20A9</text></svg>`,
  'USD/JPY': `<svg viewBox="0 0 32 32" class="ticker-icon"><circle cx="16" cy="16" r="16" fill="#1e293b"/><text x="16" y="21" text-anchor="middle" fill="#dc2626" font-size="12" font-weight="bold" font-family="sans-serif">\u00A5</text></svg>`,
  GOLD: `<svg viewBox="0 0 32 32" class="ticker-icon"><circle cx="16" cy="16" r="16" fill="#d4a017"/><text x="16" y="21" text-anchor="middle" fill="#fff" font-size="10" font-weight="bold" font-family="sans-serif">Au</text></svg>`,
  SILVER: `<svg viewBox="0 0 32 32" class="ticker-icon"><circle cx="16" cy="16" r="16" fill="#a8a9ad"/><text x="16" y="21" text-anchor="middle" fill="#fff" font-size="10" font-weight="bold" font-family="sans-serif">Ag</text></svg>`
};

// Generate generic altcoin icon from catalog color
function _altIcon(key) {
  if (_tickerIcons[key]) return _tickerIcons[key];
  const alt = _altCatalog.find(a => a.key === key);
  const color = alt ? alt.color : '#888';
  const letter = key.charAt(0);
  return `<svg viewBox="0 0 32 32" class="ticker-icon"><circle cx="16" cy="16" r="16" fill="${color}"/><text x="16" y="21" text-anchor="middle" fill="#fff" font-size="13" font-weight="bold" font-family="sans-serif">${letter}</text></svg>`;
}

function _rebuildTickerCategory() {
  const cat = {};
  _getCryptoKeys().forEach(k => { cat[k] = 'crypto'; });
  _macroKeys.forEach(k => {
    if (k.startsWith('USD/')) cat[k] = 'fx';
    else if (k === 'GOLD' || k === 'SILVER') cat[k] = 'commodity';
    else cat[k] = 'macro';
  });
  return cat;
}
let _tickerCategory = _rebuildTickerCategory();

function buildPriceCards() {
  _refreshKeyArrays();
  _tickerCategory = _rebuildTickerCategory();
  const container = document.getElementById('realtime-prices');
  if (!container) return;

  // Force vertical column layout
  container.style.cssText = 'display:flex !important;flex-direction:column !important;flex-wrap:nowrap !important;overflow-y:auto;overflow-x:hidden;max-height:600px;width:100%;';

  let html = '';
  _allPriceKeys.forEach((key, idx) => {
    const icon = _altIcon(key);
    const cardKey = key.replace('/', '');
    const cat = _tickerCategory[key] || 'macro';
    const tagClass = cat === 'crypto' ? 'tag-crypto' : (cat === 'fx' ? 'tag-fx' : (cat === 'commodity' ? 'tag-commodity' : 'tag-macro'));
    const tagLabel = cat === 'crypto' ? 'CRYPTO' : (cat === 'fx' ? 'FX' : (cat === 'commodity' ? 'CMDTY' : 'INDEX'));

    html += `
      <div class="price-card" id="price-card-${cardKey}" data-key="${key}" data-cat="${cat}" style="width:100%;box-sizing:border-box;margin-bottom:3px;animation-delay:${idx * 0.04}s">
        <canvas class="price-card-particle" width="200" height="80"></canvas>
        <div class="price-card-icon">${icon}</div>
        <div class="price-card-info">
          <span class="price-symbol">${key}</span>
          <span class="price-card-tag ${tagClass}">${tagLabel}</span>
        </div>
        <div class="price-card-right">
          <div class="price-value">--</div>
          <div class="price-change">--</div>
          <div class="price-time">--:--:--</div>
        </div>
        <div class="price-card-bottom">
          <span class="price-vol">--</span>
          <div class="price-mini-chart" id="mini-chart-${cardKey}">
            <svg width="100%" height="18" preserveAspectRatio="none" viewBox="0 0 60 18">
              <polyline class="mini-chart-line" fill="none" stroke="var(--neon-cyan)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" points="0,9 60,9" opacity="0.2"/>
            </svg>
          </div>
          <span class="price-tick-seq" id="tick-seq-${cardKey}"></span>
          <div class="price-hl-bar" title="24h Range">
            <span class="hl-label">L</span>
            <div class="price-hl-track">
              <div class="price-hl-fill" style="width:50%"></div>
              <div class="price-hl-dot" style="left:50%"></div>
              <span class="price-hl-val" style="left:50%">--</span>
            </div>
            <span class="hl-label">H</span>
          </div>
        </div>
      </div>
    `;
  });
  container.innerHTML = html;

  // Re-apply layout after innerHTML (belt & suspenders)
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.flexWrap = 'nowrap';
  container.style.overflowY = 'auto';
  container.style.overflowX = 'hidden';
  container.style.maxHeight = '600px';
  container.style.width = '100%';

  _initPriceToolbar();
  _initPriceHover();
  _initThemeToggle();
  _cloneMarqueeForSeamless();
  _initAltSelector();

  // Re-apply current filter/sort after rebuilding cards
  _applyPriceFilterSort();
}

/* ═══ Altcoin Selector ═══ */
function _initAltSelector() {
  const toggle = document.getElementById('alt-selector-toggle');
  const panel = document.getElementById('alt-selector-panel');
  const grid = document.getElementById('alt-coin-grid');
  const badge = document.getElementById('alt-count-badge');
  const selectAllBtn = document.getElementById('alt-select-all');
  const clearAllBtn = document.getElementById('alt-clear-all');
  if (!toggle || !panel || !grid) return;

  // Build coin chips
  let html = '';
  _altCatalog.forEach(alt => {
    const isActive = _selectedAlts.includes(alt.key);
    html += `
      <button class="alt-chip${isActive ? ' active' : ''}" data-key="${alt.key}" style="--chip-color:${alt.color}">
        <span class="alt-chip-dot" style="background:${alt.color}"></span>
        <span class="alt-chip-label">${alt.key}</span>
        <span class="alt-chip-name">${alt.name}</span>
      </button>`;
  });
  grid.innerHTML = html;
  _updateAltBadge();

  // Toggle panel
  toggle.addEventListener('click', () => {
    panel.classList.toggle('hidden');
    toggle.querySelector('.alt-chevron')?.classList.toggle('rotated');
  });

  // Chip click
  grid.addEventListener('click', (e) => {
    const chip = e.target.closest('.alt-chip');
    if (!chip) return;
    const key = chip.dataset.key;
    if (chip.classList.contains('active')) {
      chip.classList.remove('active');
      _selectedAlts = _selectedAlts.filter(k => k !== key);
    } else {
      chip.classList.add('active');
      _selectedAlts.push(key);
    }
    _saveSelectedAlts();
    _onAltSelectionChange();
  });

  // Select All
  if (selectAllBtn) selectAllBtn.addEventListener('click', () => {
    _selectedAlts = _altCatalog.map(a => a.key);
    grid.querySelectorAll('.alt-chip').forEach(c => c.classList.add('active'));
    _saveSelectedAlts();
    _onAltSelectionChange();
  });

  // Clear All
  if (clearAllBtn) clearAllBtn.addEventListener('click', () => {
    _selectedAlts = [];
    grid.querySelectorAll('.alt-chip').forEach(c => c.classList.remove('active'));
    _saveSelectedAlts();
    _onAltSelectionChange();
  });
}

function _updateAltBadge() {
  const badge = document.getElementById('alt-count-badge');
  if (badge) {
    badge.textContent = _selectedAlts.length;
    badge.classList.toggle('hidden', _selectedAlts.length === 0);
  }
}

function _onAltSelectionChange() {
  _updateAltBadge();
  // Rebuild cards with new coin set
  buildPriceCards();
  // Reconnect WS with updated streams
  initBinanceWebSocket();
  // Fetch initial prices for new coins
  _fetchAltPricesFromBinance();
}

/** Fetch 24h ticker for all selected alts from Binance REST (one batch call) */
async function _fetchAltPricesFromBinance() {
  const alts = _selectedAlts.filter(k => !_livePrices[k] || !_livePrices[k].price);
  if (alts.length === 0) return;
  const symbols = alts.map(k => k.toUpperCase() + 'USDT');
  const param = '%5B' + symbols.map(s => '%22' + s + '%22').join('%2C') + '%5D';
  try {
    const resp = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbols=' + param);
    if (!resp.ok) return;
    const tickers = await resp.json();
    tickers.forEach(t => {
      const key = t.symbol.replace('USDT','');
      const price = parseFloat(t.lastPrice || 0);
      const change = parseFloat(t.priceChangePercent || 0);
      const prev = _livePrices[key];
      _livePrices[key] = {
        price: price,
        change: round2(change),
        prevPrice: prev ? prev.price : price,
        high: parseFloat(t.highPrice || 0),
        low: parseFloat(t.lowPrice || 0),
        vol: parseFloat(t.volume || 0),
        mcap: prev ? prev.mcap : 0,
        _wsTime: Date.now(),
        _source: 'rest'
      };
      renderPriceCard(key);
    });
    _updatePriceSummary();
  } catch (e) { console.warn('[Alt] Binance REST fetch error:', e); }
}

/* Sort & Filter */
let _toolbarInited = false;
function _initPriceToolbar() {
  if (_toolbarInited) return;
  _toolbarInited = true;
  // Filter buttons
  document.querySelectorAll('.price-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.price-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _priceFilter = btn.dataset.filter;
      _applyPriceFilterSort();
    });
  });
  // Sort buttons
  document.querySelectorAll('.price-sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.price-sort-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _priceSort = btn.dataset.sort;
      _applyPriceFilterSort();
    });
  });
}

function _applyPriceFilterSort() {
  const container = document.getElementById('realtime-prices');
  if (!container) return;

  // Filter
  const cards = Array.from(container.querySelectorAll('.price-card'));
  cards.forEach(card => {
    const cat = card.dataset.cat;
    const show = _priceFilter === 'all' ||
      (_priceFilter === 'crypto' && cat === 'crypto') ||
      (_priceFilter === 'macro' && (cat === 'macro' || cat === 'fx' || cat === 'commodity'));
    card.classList.toggle('hidden-card', !show);
  });

  // Sort visible cards
  const visible = cards.filter(c => !c.classList.contains('hidden-card'));
  if (_priceSort !== 'default') {
    visible.sort((a, b) => {
      const ka = a.dataset.key, kb = b.dataset.key;
      const da = _livePrices[ka], db = _livePrices[kb];
      if (!da || !db) return 0;
      if (_priceSort === 'change-desc') return db.change - da.change;
      if (_priceSort === 'change-asc') return da.change - db.change;
      if (_priceSort === 'vol-desc') return (db.vol || 0) - (da.vol || 0);
      return 0;
    });
    visible.forEach(card => container.appendChild(card));
  } else {
    // Restore default order
    _allPriceKeys.forEach(key => {
      const cardKey = key.replace('/', '');
      const card = document.getElementById(`price-card-${cardKey}`);
      if (card) container.appendChild(card);
    });
  }
}

/* Summary Stats Marquee Ticker */
function _updatePriceSummary() {
  const btcdEl = document.getElementById('psb-btcd');
  const volEl = document.getElementById('psb-vol');
  const gainEl = document.getElementById('psb-gainers');
  const loseEl = document.getElementById('psb-losers');
  if (!btcdEl) return;

  // BTC dominance ??estimate from BTC mcap if available
  const btc = _livePrices['BTC'];
  if (btc && btc.mcap) {
    let totalMcap = 0;
    _cryptoKeys.forEach(k => { if (_livePrices[k] && _livePrices[k].mcap) totalMcap += _livePrices[k].mcap; });
    if (totalMcap > 0) btcdEl.textContent = ((btc.mcap / totalMcap) * 100).toFixed(1) + '%';
  }

  // Total 24h vol (crypto only)
  let totalVol = 0;
  _cryptoKeys.forEach(k => {
    const d = _livePrices[k];
    if (d && d.vol && d.price) totalVol += d.vol * d.price;
  });
  if (totalVol > 0) volEl.textContent = '$' + formatVol(totalVol);

  // Gainers / losers count
  let gainers = 0, losers = 0;
  _cryptoKeys.forEach(k => {
    const d = _livePrices[k];
    if (d) { if (d.change > 0) gainers++; else if (d.change < 0) losers++; }
  });
  gainEl.textContent = gainers;
  loseEl.textContent = losers;

  // ??Update BTC/ETH/SOL prices in marquee
  _cryptoKeys.forEach(k => {
    const d = _livePrices[k];
    const el = document.getElementById('psb-' + k.toLowerCase());
    if (el && d) {
      const dec = d.price >= 100 ? 0 : d.price >= 1 ? 2 : 4;
      const priceStr = '$' + Number(d.price).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
      const sign = d.change >= 0 ? '+' : '';
      el.textContent = `${priceStr} (${sign}${d.change}%)`;
      el.className = 'pmq-val ' + (d.change >= 0 ? 'up' : 'down');
    }
  });
}

/* Hover Preview Card */
function _initPriceHover() {
  const hoverCard = document.getElementById('price-hover-card');
  if (!hoverCard) return;
  const container = document.getElementById('realtime-prices');
  if (!container) return;

  let hoverTimeout = null;

  container.addEventListener('mouseenter', (e) => {
    const card = e.target.closest('.price-card');
    if (!card) return;
    clearTimeout(hoverTimeout);
    hoverTimeout = setTimeout(() => _showHoverCard(card, hoverCard), 350);
  }, true);

  container.addEventListener('mouseleave', (e) => {
    const card = e.target.closest('.price-card');
    if (!card) return;
    clearTimeout(hoverTimeout);
    hoverCard.classList.add('hidden');
  }, true);

  container.addEventListener('mousemove', (e) => {
    if (hoverCard.classList.contains('hidden')) return;
    const card = e.target.closest('.price-card');
    if (!card) { hoverCard.classList.add('hidden'); return; }
  }, true);
}

function _showHoverCard(card, hoverCard) {
  const key = card.dataset.key;
  if (!key) return;
  const data = _livePrices[key];
  if (!data) return;

  const icon = _tickerIcons[key] || '';
  hoverCard.querySelector('.phc-icon').innerHTML = icon;
  hoverCard.querySelector('.phc-symbol').textContent = key;
  hoverCard.querySelector('.phc-source').textContent = data._source === 'ws' ? 'BINANCE WS' : 'REST API';

  const isFx = key.startsWith('USD/');
  const isCrypto = _cryptoKeys.includes(key);
  const decimals = isCrypto ? (data.price >= 100 ? 2 : data.price >= 1 ? 4 : 6) : 2;
  const prefix = isFx ? '' : '$';
  hoverCard.querySelector('.phc-price').textContent = prefix + Number(data.price).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  const chgEl = hoverCard.querySelector('.phc-change');
  const sign = data.change >= 0 ? '+' : '';
  chgEl.textContent = `${sign}${data.change}%`;
  chgEl.className = `phc-change ${data.change >= 0 ? 'up' : 'down'}`;
  chgEl.style.background = data.change >= 0 ? 'rgba(5,150,105,0.12)' : 'rgba(220,38,38,0.12)';
  chgEl.style.color = data.change >= 0 ? 'var(--neon-green)' : 'var(--neon-red)';

  const highEl = document.getElementById('phc-high');
  const lowEl = document.getElementById('phc-low');
  const pVolEl = document.getElementById('phc-vol');
  const mcapEl = document.getElementById('phc-mcap');

  if (highEl) highEl.textContent = data.high ? prefix + Number(data.high).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--';
  if (lowEl) lowEl.textContent = data.low ? prefix + Number(data.low).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--';
  if (pVolEl) pVolEl.textContent = data.vol ? formatVol(data.vol) : '--';
  if (mcapEl) mcapEl.textContent = data.mcap ? '$' + formatVol(data.mcap) : '--';

  // Draw mini sparkline in canvas
  const canvas = document.getElementById('phc-canvas');
  if (canvas && _priceHistory[key] && _priceHistory[key].length > 2) {
    _drawHoverSparkline(canvas, _priceHistory[key], data.change >= 0);
  }

  // Position below the card
  const rect = card.getBoundingClientRect();
  const parent = hoverCard.offsetParent ? hoverCard.offsetParent.getBoundingClientRect() : { left: 0, top: 0 };
  hoverCard.style.left = (rect.left - parent.left) + 'px';
  hoverCard.style.top = (rect.bottom - parent.top + 6) + 'px';
  hoverCard.classList.remove('hidden');
}

function _drawHoverSparkline(canvas, history, isUp) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min || 1;
  const color = isUp ? '#059669' : '#dc2626';

  ctx.beginPath();
  history.forEach((v, i) => {
    const x = (i / (history.length - 1)) * w;
    const y = 4 + (1 - (v - min) / range) * (h - 8);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Area fill
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, isUp ? 'rgba(5,150,105,0.15)' : 'rgba(220,38,38,0.15)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fill();
}

/* ??Render tick direction arrows (last 5) */
function _renderTickSeq(cardKey, dirs) {
  const el = document.getElementById('tick-seq-' + cardKey);
  if (!el) return;
  el.innerHTML = dirs.map(d => {
    if (d === 'up') return '<span class="tick-arrow tick-up">\u25B2</span>';
    if (d === 'down') return '<span class="tick-arrow tick-down">\u25BC</span>';
    return '<span class="tick-arrow tick-flat">\u2022</span>';
  }).join('');
}

/* ??Particle spark burst on ±3% change */
function _spawnParticles(canvas, isUp) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width = canvas.offsetWidth || 200;
  const h = canvas.height = canvas.offsetHeight || 80;
  const color = isUp ? [5, 150, 105] : [220, 38, 38];
  const particles = [];
  for (let i = 0; i < 18; i++) {
    particles.push({
      x: w * 0.5 + (Math.random() - 0.5) * w * 0.6,
      y: h * 0.5 + (Math.random() - 0.5) * h * 0.4,
      vx: (Math.random() - 0.5) * 3,
      vy: (Math.random() - 0.5) * 3,
      r: Math.random() * 2.5 + 0.5,
      life: 1
    });
  }
  let frame = 0;
  function animate() {
    ctx.clearRect(0, 0, w, h);
    let alive = false;
    particles.forEach(p => {
      if (p.life <= 0) return;
      alive = true;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.025;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${p.life * 0.7})`;
      ctx.fill();
    });
    if (alive && frame++ < 60) requestAnimationFrame(animate);
    else ctx.clearRect(0, 0, w, h);
  }
  animate();
}

/* ??Glass / Dark theme toggle */
function _initThemeToggle() {
  const btn = document.getElementById('price-theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const section = document.getElementById('prices-section');
    if (!section) return;
    const isGlass = section.classList.toggle('price-glass-mode');
    btn.classList.toggle('glass-active', isGlass);
  });
}

/* ??Clone marquee inner content for seamless infinite scroll */
function _cloneMarqueeForSeamless() {
  const marquee = document.querySelector('.price-marquee-inner');
  if (!marquee || marquee.dataset.cloned) return;
  const clone = marquee.cloneNode(true);
  clone.setAttribute('aria-hidden', 'true');
  marquee.parentElement.appendChild(clone);
  marquee.dataset.cloned = '1';
}

// Fetch macro/FX from backend + update crypto prices as fallback
async function fetchRealtimePrices() {
  try {
    const data = await apiFetch('/api/market', { silent: true });
    const market = data.market;
    if (!market) return;

    _allPriceKeys.forEach(key => {
      if (!market[key]) return;
      const item = market[key];
      const prev = _livePrices[key];

      // For crypto: skip if WS already provided a recent update (within 15s)
      const isCrypto = _cryptoKeys.includes(key);
      if (isCrypto && prev && prev._wsTime && (Date.now() - prev._wsTime < 15000)) return;

      _livePrices[key] = {
        price: item.price,
        change: item.change,
        prevPrice: prev ? prev.price : item.price,
        high: item.high || (prev ? prev.high : 0),
        low: item.low || (prev ? prev.low : 0),
        vol: item.vol || (prev ? prev.vol : 0),
        mcap: item.mcap || (prev ? prev.mcap : 0),
        _wsTime: prev ? prev._wsTime : 0,
        _source: 'rest'
      };

      renderPriceCard(key);
    });

    _updatePriceSummary();
  } catch (e) {
    console.error('Realtime Price Error:', e);
  }
}

/* ?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═??
   Live Wire ??News Feed (Upgraded v3)
   ?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═?�═??*/
let _newsCache = [];           // full article list from last fetch
let _newsFilter = 'all';      // active source filter
let _prevNewsLinks = new Set();// track known titles for flash effect
let _newsFilterInited = false;

async function fetchNews() {
  try {
    const data = await apiFetch('/api/news', { silent: true });
    if (!data.news || data.news.length === 0) return;

    _newsCache = data.news;
    _updateNewsSentimentBar(data.news);
    _updateBreakingBanner(data.news);
    _buildSourceFilterTabs(data.news);
    _renderNewsItems();
    _updateNewsCount(data.news.length);
  } catch (e) { console.error("News Error:", e); }
}

/* --- Sentiment summary bar --- */
function _updateNewsSentimentBar(articles) {
  const total = articles.length || 1;
  const bull = articles.filter(a => a.sentiment === 'BULLISH').length;
  const bear = articles.filter(a => a.sentiment === 'BEARISH').length;
  const neut = total - bull - bear;

  const bullPct = Math.round(bull / total * 100);
  const bearPct = Math.round(bear / total * 100);
  const neutPct = 100 - bullPct - bearPct;

  const elBull = document.getElementById('ns-bull');
  const elNeut = document.getElementById('ns-neutral');
  const elBear = document.getElementById('ns-bear');
  if (elBull) elBull.style.width = bullPct + '%';
  if (elNeut) elNeut.style.width = neutPct + '%';
  if (elBear) elBear.style.width = bearPct + '%';

  const pBull = document.getElementById('ns-bull-pct');
  const pNeut = document.getElementById('ns-neutral-pct');
  const pBear = document.getElementById('ns-bear-pct');
  if (pBull) pBull.textContent = bullPct + '%';
  if (pNeut) pNeut.textContent = neutPct + '%';
  if (pBear) pBear.textContent = bearPct + '%';
}

/* --- Breaking news banner (most recent non-neutral article) --- */
function _updateBreakingBanner(articles) {
  const banner = document.getElementById('news-breaking');
  const link = document.getElementById('news-breaking-link');
  if (!banner || !link) return;
  // Find the most recent article with a strong sentiment
  const breaking = articles.find(a => a.sentiment === 'BULLISH' || a.sentiment === 'BEARISH');
  if (breaking) {
    banner.style.display = 'flex';
    const badge = banner.querySelector('.news-breaking-badge');
    if (breaking.sentiment === 'BULLISH') {
      banner.style.background = 'linear-gradient(90deg, rgba(5,150,105,0.12), rgba(5,150,105,0.04))';
      banner.style.borderColor = 'rgba(5,150,105,0.3)';
      if (badge) { badge.style.background = '#059669'; badge.textContent = '?�� BULLISH'; }
    } else {
      banner.style.background = 'linear-gradient(90deg, rgba(220,38,38,0.12), rgba(220,38,38,0.04))';
      banner.style.borderColor = 'rgba(220,38,38,0.3)';
      if (badge) { badge.style.background = '#dc2626'; badge.textContent = '?�� BEARISH'; }
    }
    link.href = safeUrl(breaking.link);
    link.textContent = breaking.title;
  } else {
    banner.style.display = 'none';
  }
}

/* --- Source filter tabs (dynamic) --- */
function _buildSourceFilterTabs(articles) {
  const container = document.getElementById('news-filter-tabs');
  if (!container) return;
  const sources = [...new Set(articles.map(a => a.source))];
  const tabs = [{ key: 'all', label: 'All' }, ...sources.map(s => ({ key: s, label: s }))];

  // Only rebuild if sources changed
  const currentKeys = Array.from(container.querySelectorAll('.news-filter-btn')).map(b => b.dataset.source).join(',');
  const newKeys = tabs.map(t => t.key).join(',');
  if (currentKeys === newKeys) return;

  container.innerHTML = tabs.map(t =>
    `<button class="news-filter-btn${t.key === _newsFilter ? ' active' : ''}" data-source="${escapeHtml(t.key)}">${escapeHtml(t.label)}</button>`
  ).join('');

  if (!_newsFilterInited) {
    _newsFilterInited = true;
    container.addEventListener('click', e => {
      const btn = e.target.closest('.news-filter-btn');
      if (!btn) return;
      container.querySelectorAll('.news-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _newsFilter = btn.dataset.source;
      _renderNewsItems();
    });
  }
}

/* --- Coin keyword highlighting --- */
const _COIN_MAP = {
  'Bitcoin': 'btc', 'BTC': 'btc',
  'Ethereum': 'eth', 'ETH': 'eth', 'Ether': 'eth',
  'Solana': 'sol', 'SOL': 'sol',
  'XRP': 'xrp', 'Ripple': 'xrp',
  'BNB': 'bnb', 'Binance': 'bnb',
  'Dogecoin': 'doge', 'DOGE': 'doge',
  'Cardano': 'ada', 'ADA': 'ada',
  'Polygon': 'default', 'MATIC': 'default', 'POL': 'default',
  'Avalanche': 'default', 'AVAX': 'default',
  'Chainlink': 'default', 'LINK': 'default',
};
const _COIN_REGEX = new RegExp(`\\b(${Object.keys(_COIN_MAP).join('|')})\\b`, 'g');

function _highlightCoins(text) {
  return escapeHtml(text).replace(
    _COIN_REGEX,
    (match) => {
      const cls = _COIN_MAP[match] || 'default';
      return `<span class="coin-hl coin-hl-${cls}">${match}</span>`;
    }
  );
}

/* --- Relative time display --- */
function _relativeTime(isoStr) {
  if (!isoStr) return '';
  try {
    const then = new Date(isoStr);
    const now = new Date();
    const diffSec = Math.floor((now - then) / 1000);
    if (diffSec < 60) return 'just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  } catch { return ''; }
}

/* --- Render filtered news items --- */
function _renderNewsItems() {
  const feed = document.getElementById('news-feed');
  if (!feed) return;

  const filtered = _newsFilter === 'all'
    ? _newsCache
    : _newsCache.filter(n => n.source === _newsFilter);

  const newLinks = new Set(filtered.map(n => n.link));

  feed.innerHTML = filtered.map(n => {
    const sClass = n.sentiment === 'BULLISH' ? 'sentiment-bullish' : n.sentiment === 'BEARISH' ? 'sentiment-bearish' : 'sentiment-neutral';
    const sLabel = escapeHtml(n.sentiment || 'NEUTRAL');
    const isNew = !_prevNewsLinks.has(n.link) && _prevNewsLinks.size > 0;
    const flashClass = isNew ? ' news-flash' : '';
    const timeStr = _relativeTime(n.published_at_utc);
    return `<div class="news-item-v2${flashClass}">
      <div class="news-meta">
        <span class="news-meta-left"><span class="news-source-tag">${escapeHtml(n.source)}</span><span class="sentiment-tag ${sClass}">${sLabel}</span></span>
        <span class="news-time-relative">${escapeHtml(timeStr)}</span>
      </div>
      <a href="${safeUrl(n.link)}" target="_blank" rel="noopener noreferrer" class="news-link">${_highlightCoins(n.title)}</a>
    </div>`;
  }).join('');

  _prevNewsLinks = newLinks;
}

/* --- Article count badge --- */
function _updateNewsCount(count) {
  const el = document.getElementById('news-count');
  if (el) el.textContent = count;
}

/* ?�?� Auto Skeleton?�Data Fade-in via MutationObserver ?�?� */
(function initSkeletonFadeObserver() {
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const removed of m.removedNodes) {
        if (removed.nodeType === 1 && removed.classList && removed.classList.contains('skeleton-loader')) {
          // Skeleton was removed ??apply fade-in to parent
          const parent = m.target;
          if (parent && parent.nodeType === 1) {
            parent.classList.add('data-loaded');
            parent.addEventListener('animationend', () => parent.classList.remove('data-loaded'), { once: true });
          }
        }
      }
      // Also catch innerHTML replacement (skeleton in childList removals)
      if (m.type === 'childList' && m.target && m.target.nodeType === 1) {
        const hadSkeleton = Array.from(m.removedNodes).some(
          n => n.nodeType === 1 && n.querySelector && (n.classList.contains('skeleton-loader') || n.querySelector('.skeleton-loader'))
        );
        if (hadSkeleton && m.addedNodes.length > 0) {
          m.target.classList.add('data-loaded');
          m.target.addEventListener('animationend', () => m.target.classList.remove('data-loaded'), { once: true });
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
