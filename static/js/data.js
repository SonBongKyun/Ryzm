
async function fetchBriefing() {
  try {
    const res = await fetch('/api/briefing');
    const data = await res.json();
    const panel = document.getElementById('briefing-panel');
    const titleEl = document.getElementById('briefing-title');
    const contentEl = document.getElementById('briefing-content');
    const timeEl = document.getElementById('briefing-time');
    const closeBtn = document.getElementById('briefing-close');

    if (!panel || data.status === 'empty' || !data.title) {
      if (panel) panel.style.display = 'none';
      return;
    }

    // Don't re-show if user already dismissed this briefing
    const dismissedKey = `briefing_dismissed_${data.time}`;
    if (sessionStorage.getItem(dismissedKey)) return;

    titleEl.innerText = data.title;
    contentEl.innerText = data.content;
    timeEl.innerText = data.time;
    panel.style.display = 'flex';

    // Close handler (only bind once)
    if (!closeBtn.dataset.bound) {
      closeBtn.addEventListener('click', () => {
        panel.style.display = 'none';
        sessionStorage.setItem(dismissedKey, '1');
        playSound('click');
      });
      closeBtn.dataset.bound = 'true';
    }
  } catch (e) {
    console.error('Briefing Error:', e);
  }
}

async function fetchFundingRate() {
  try {
    const res = await fetch('/api/funding-rate');
    const data = await res.json();
    if (!data.rates || data.rates.length === 0) return;
    data.rates.forEach(r => {
      const el = document.getElementById(`fr-${String(r.symbol).toLowerCase().replace(/[^a-z0-9]/g,'')}`);
      if (el) {
        const color = r.rate > 0 ? 'var(--neon-green)' : r.rate < 0 ? 'var(--neon-red)' : 'var(--text-muted)';
        el.innerHTML = `${escapeHtml(r.symbol)} <span style="color:${safeColor(color)};font-weight:600;">${r.rate > 0 ? '+' : ''}${escapeHtml(String(r.rate))}%</span>`;
      }
    });
  } catch (e) {
    console.error('Funding Rate Error:', e);
  }
}

async function fetchWhaleFeed() {
  try {
    const res = await fetch('/api/liquidations');
    const data = await res.json();
    const container = document.getElementById('whale-feed');
    if (!container) return;
    if (!data.trades || data.trades.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">' + t('no_whale') + '</div>';
      return;
    }
    container.innerHTML = data.trades.map(tr => {
      const isBuy = tr.side === 'BUY';
      const icon = isBuy ? '▲' : '▼';
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
    const res = await fetch('/api/calendar');
    const data = await res.json();
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
      const impactDot = e.impact === 'HIGH' ? '🔴' : '🟡';
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
  const saved = localStorage.getItem('ryzm-theme') || 'light';
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

/* ══════════════════════════════════════════════════════
   Systemic Risk Gauge v2.0
   270° arc, radar, heatmap, sparklines, simulator,
   correlation, zone timeline, BTC overlay, alerts
   ══════════════════════════════════════════════════════ */
let _prevRiskScore = null;
let _riskAlertThreshold = parseFloat(localStorage.getItem('rg_threshold') || '-999');
let _btcPriceOverlay = false;
let _cachedRiskHistory = null;

// ── Tab switching ──
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
    const res = await fetch('/api/risk-gauge');
    const data = await res.json();

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
      'MODERATE': '#06b6d4', 'LOW': '#059669'
    };
    const color = levelColors[data.level] || '#64748b';

    // Score + label with countup
    animateCountup(scoreSvg, score, { duration: 800, decimals: 1, useComma: false });
    scoreSvg.setAttribute('fill', color);
    labelSvg.textContent = `[${data.label}]`;
    labelSvg.setAttribute('fill', color);

    // Needle color
    if (needleLine) needleLine.setAttribute('stroke', color);

    // 270° needle rotation: -100→-135°, 0→0°, +100→+135°
    const needleAngle = (clampedScore / 100) * 135;
    if (needleEl) needleEl.setAttribute('transform', `rotate(${needleAngle}, 100, 100)`);

    // 270° arc fill: total arc length ≈ 377
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
        const arrow = diff > 0 ? '▲' : '▼';
        const dColor = diff > 0 ? '#059669' : '#dc2626';
        deltaEl.innerHTML = `<span style="color:${dColor}">${arrow} ${Math.abs(diff).toFixed(1)}</span>`;
        deltaEl.classList.add('delta-flash');
        setTimeout(() => deltaEl.classList.remove('delta-flash'), 2000);
      } else {
        deltaEl.innerHTML = '<span style="color:var(--text-muted)">— 0.0</span>';
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

    // ── Component bars + sparklines ──
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

    // ── Radar Chart ──
    _drawRadarChart(c);

    // ── Change Heatmap ──
    if (data.changes) _drawChangeHeatmap(data.changes);

    // Auto-update Market Vibe
    updateMarketVibe(data);

    // Populate simulator with current values
    _populateSimulator(c);

  } catch (e) {
    console.error('Risk Gauge Error:', e);
  }
}

// ── Sparkline drawer ──
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

// ── Radar Chart ──
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

// ── Change Rate Heatmap ──
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

// ── Correlation Matrix ──
async function _fetchCorrelationMatrix() {
  try {
    const res = await fetch('/api/correlation');
    const data = await res.json();
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
  // Rows — handle both dict-of-dicts and array-of-arrays
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
        bg = 'rgba(6,182,212,0.15)'; fg = 'var(--neon-cyan)';
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

// ── Scenario Simulator ──
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
      const res = await fetch('/api/risk-gauge/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      const data = await res.json();
      const scoreEl = document.getElementById('rg-sim-score');
      const labelEl = document.getElementById('rg-sim-label');
      const levelColors = {
        'CRITICAL': '#dc2626', 'HIGH': '#f97316', 'ELEVATED': '#eab308',
        'MODERATE': '#06b6d4', 'LOW': '#059669'
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
    'CRITICAL': { text: 'EXTREME FEAR', color: '#dc2626', msg: '/// SYSTEM: High-risk environment detected — exercise extreme caution' },
    'HIGH':     { text: 'FEARFUL',      color: '#f97316', msg: '/// SYSTEM: Elevated risk levels — monitor positions closely' },
    'ELEVATED': { text: 'CAUTIOUS',     color: '#eab308', msg: '/// SYSTEM: Market uncertainty elevated — stay alert' },
    'MODERATE': { text: 'NEUTRAL',      color: '#06b6d4', msg: '/// SYSTEM: Market conditions within normal range' },
    'LOW':      { text: 'OPTIMISTIC',   color: '#059669', msg: '/// SYSTEM: Low-risk environment — favorable conditions' }
  };
  const vibe = vibeMap[level] || vibeMap['MODERATE'];

  vStat.innerText = vibe.text;
  vStat.style.color = vibe.color;
  vStat.style.textShadow = `0 0 8px ${vibe.color}`;
  if (vMsg) vMsg.innerText = vibe.msg;
}

/* ══ Risk Index 30-Day History Chart (Interactive + BTC overlay + Zone Timeline) ══ */
async function fetchRiskHistory() {
  try {
    const res = await fetch('/api/risk-gauge/history?days=30');
    const data = await res.json();
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
    { min: 0, max: 30, color: 'rgba(6,182,212,0.03)' },
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
  const lineColor = latest > 30 ? '#059669' : latest > 0 ? '#06b6d4' : latest > -30 ? '#eab308' : latest > -60 ? '#f97316' : '#dc2626';
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Latest point pulse
  const lastX = pad.left + (scores.length - 1) * step;
  const lastY = yOf(latest);
  ctx.beginPath(); ctx.arc(lastX, lastY, 4, 0, Math.PI * 2); ctx.fillStyle = lineColor; ctx.fill();
  ctx.beginPath(); ctx.arc(lastX, lastY, 7, 0, Math.PI * 2); ctx.strokeStyle = lineColor; ctx.lineWidth = 1; ctx.globalAlpha = 0.3; ctx.stroke(); ctx.globalAlpha = 1;

  // Level dots
  const levelColors = { 'CRITICAL': '#dc2626', 'HIGH': '#f97316', 'ELEVATED': '#eab308', 'MODERATE': '#06b6d4', 'LOW': '#059669' };
  history.forEach((r, i) => {
    const x = pad.left + i * step, y = yOf(r.score);
    ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fillStyle = levelColors[r.level] || '#94a3b8'; ctx.fill();
  });

  // ── BTC Price Overlay (Feature 13) ──
  if (_btcPriceOverlay) {
    _drawBtcPriceOverlay(ctx, history, pad, cw, ch, w);
  }

  // ── Interactive tooltip on hover (Feature 3) ──
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

// ── BTC Price Overlay ──
async function _drawBtcPriceOverlay(ctx, history, pad, cw, ch, w) {
  try {
    const res = await fetch('/api/market');
    const marketData = await res.json();
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
    ctx.fillText('BTC ₿', pad.left + cw - 2, yPrice(btcPrice) - 3);
  } catch (e) {
    // silently fail
  }
}

// ── Zone Timeline (Feature 4) ──
function _drawZoneTimeline(history) {
  const container = document.getElementById('rg-zone-timeline');
  if (!container || !history.length) return;

  const levelColors = {
    'CRITICAL': '#dc2626', 'HIGH': '#f97316', 'ELEVATED': '#eab308',
    'MODERATE': '#06b6d4', 'LOW': '#059669'
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

// Load correlation matrix once (delayed)
setTimeout(() => _fetchCorrelationMatrix(), 5000);
// Refresh correlation every 10 minutes
setInterval(() => _fetchCorrelationMatrix(), 600000);

// Fetch risk history on page load (delayed)
setTimeout(() => fetchRiskHistory(), 4000);
// Refresh risk history every 10 minutes
setInterval(() => fetchRiskHistory(), 600000);

/* ── Museum of Scars ── */
async function fetchMuseumOfScars() {
  try {
    const res = await fetch('/api/scars');
    const data = await res.json();
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

/* ── Strategic Narrative (rendered from Council data) ── */
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

async function fetchLongShortRatio() {
  try {
    const res = await fetch('/api/long-short');
    const data = await res.json();
    
    const lsLong = document.getElementById('ls-long');
    const lsShort = document.getElementById('ls-short');
    
    if (lsLong && lsShort && data.longAccount) {
      let finalLong = data.longAccount;
      if (finalLong <= 1) finalLong *= 100;
      const finalShort = 100 - finalLong;

      lsLong.style.width = `${finalLong}%`;
      const lsLongVal = lsLong.querySelector('.ls-val');
      if (lsLongVal) lsLongVal.textContent = `${finalLong.toFixed(1)}%`;

      lsShort.style.width = `${finalShort}%`;
      const lsShortVal = lsShort.querySelector('.ls-val');
      if (lsShortVal) lsShortVal.textContent = `${finalShort.toFixed(1)}%`;

      // Update indicator row
      const longPct = document.getElementById('ls-long-pct');
      const shortPct = document.getElementById('ls-short-pct');
      const ratioNum = document.getElementById('ls-ratio-num');
      if (longPct) longPct.textContent = `${finalLong.toFixed(1)}%`;
      if (shortPct) shortPct.textContent = `${finalShort.toFixed(1)}%`;
      if (ratioNum) {
        const ratio = finalShort > 0 ? (finalLong / finalShort).toFixed(2) : '∞';
        ratioNum.textContent = ratio;
        ratioNum.style.color = finalLong > finalShort ? 'var(--neon-green)' : finalLong < finalShort ? 'var(--neon-red)' : 'var(--neon-cyan)';
      }
    }
  } catch (e) {
    console.error("L/S Error:", e); 
  }
}

async function fetchMacroTicker() {
  try {
    const res = await fetch('/api/market');
    const data = await res.json();
    const market = data.market;
    const container = document.getElementById('macro-ticker');

    if (!market || Object.keys(market).length === 0) return;

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

    const order = ['BTC', 'ETH', 'SOL', 'VIX', 'DXY', 'USD/KRW', 'USD/JPY'];
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

    // Kimchi Premium Update
    fetchKimchi();
  } catch (e) { console.error("Ticker Error:", e); }
}

async function fetchKimchi() {
  try {
    const res = await fetch('/api/kimchi');
    const data = await res.json();
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

/* ── Real-time Price Panel (Binance WebSocket + Backend Macro) ── */
const _livePrices = {};   // { BTC: {price, change, prevPrice, high, low, vol}, ... }
const _priceHistory = {};  // { BTC: [p1, p2, ...], ... } mini sparkline data (max 30 pts)
let _priceWs = null;
let _priceWsRetry = 0;
const _wsHosts = [
  'wss://stream.binance.com:9443',
  'wss://stream.binance.com:443',
  'wss://fstream.binance.com'
];
let _wsHostIdx = 0;

function initBinanceWebSocket() {
  if (_priceWs && _priceWs.readyState <= 1) return; // already open/connecting
  const streams = 'btcusdt@miniTicker/ethusdt@miniTicker/solusdt@miniTicker';
  const host = _wsHosts[_wsHostIdx % _wsHosts.length];
  const url = `${host}/stream?streams=${streams}`;
  console.log(`[WS] Connecting to ${host}...`);
  try { _priceWs = new WebSocket(url); } catch (e) { _wsHostIdx++; scheduleWsReconnect(); return; }

  const connectTimeout = setTimeout(() => {
    if (_priceWs && _priceWs.readyState !== 1) { _priceWs.close(); }
  }, 8000);

  _priceWs.onopen = () => { clearTimeout(connectTimeout); _priceWsRetry = 0; console.log('[WS] Binance connected via ' + host); };

  _priceWs.onmessage = (evt) => {
    try {
      const msg = JSON.parse(evt.data);
      const d = msg.data;
      if (!d || !d.s) return;
      const symbolMap = { BTCUSDT: 'BTC', ETHUSDT: 'ETH', SOLUSDT: 'SOL' };
      const key = symbolMap[d.s];
      if (!key) return;

      const newPrice = parseFloat(d.c);  // current close
      const openPrice = parseFloat(d.o); // 24h open
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
        _wsTime: Date.now()
      };
      renderPriceCard(key);
    } catch (e) { /* ignore parse errors */ }
  };

  _priceWs.onclose = () => {
    clearTimeout(connectTimeout);
    console.log('[WS] Binance disconnected, trying next host...');
    _wsHostIdx++;
    scheduleWsReconnect();
  };
  _priceWs.onerror = () => { clearTimeout(connectTimeout); _priceWs.close(); };
}

function scheduleWsReconnect() {
  const delay = Math.min(15000, 1000 * Math.pow(2, _priceWsRetry++));
  console.log(`[WS] Reconnect in ${delay}ms (attempt ${_priceWsRetry})`);
  _priceWs = null;
  setTimeout(initBinanceWebSocket, delay);
}

function round2(v) { return Math.round(v * 100) / 100; }

function formatVol(v) {
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toFixed(0);
}

function renderPriceCard(key) {
  const container = document.getElementById('realtime-prices');
  if (!container) return;
  const data = _livePrices[key];
  if (!data) return;

  let card = document.getElementById(`price-card-${key}`);
  if (!card) return; // card not yet built

  const valEl = card.querySelector('.price-value');
  const chgEl = card.querySelector('.price-change');
  const volEl = card.querySelector('.price-vol');
  const timeEl = card.querySelector('.price-time');

  if (!valEl) return;

  // Determine direction
  const dir = data.price > data.prevPrice ? 'up' : data.price < data.prevPrice ? 'down' : null;

  // Format price — use countup animation for crypto
  const decimals = data.price >= 100 ? 2 : data.price >= 1 ? 4 : 6;
  animateCountup(valEl, data.price, { duration: 400, decimals, prefix: '$', useComma: true });

  // Flash effect
  if (dir) {
    card.classList.remove('price-flash-up', 'price-flash-down');
    void card.offsetWidth; // force reflow
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

  // Volume
  if (volEl && data.vol) volEl.textContent = 'Vol: ' + formatVol(data.vol);
  if (timeEl) timeEl.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });

  // Update mini sparkline
  updateMiniChart(key, data.price, data.change);
}

function updateMiniChart(key, price, change) {
  const cardKey = key.replace('/', '');
  if (!_priceHistory[key]) _priceHistory[key] = [];
  _priceHistory[key].push(price);
  if (_priceHistory[key].length > 30) _priceHistory[key].shift();
  const hist = _priceHistory[key];
  if (hist.length < 2) return;

  const chartEl = document.getElementById(`mini-chart-${cardKey}`);
  if (!chartEl) return;
  const svg = chartEl.querySelector('svg');
  if (!svg) return;

  const min = Math.min(...hist);
  const max = Math.max(...hist);
  const range = max - min || 1;
  const w = 60, h = 24, pad = 2;
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

// Build all price cards once, then let WebSocket + polling update them
// Inline SVG icons for each ticker
const _tickerIcons = {
  BTC: `<svg viewBox="0 0 32 32" class="ticker-icon"><circle cx="16" cy="16" r="16" fill="#f7931a"/><path d="M22.5 14.2c.3-2-1.2-3.1-3.3-3.8l.7-2.7-1.6-.4-.6 2.6c-.4-.1-.9-.2-1.3-.3l.7-2.6-1.7-.4-.7 2.7c-.4-.1-.7-.2-1-.2l-2.3-.6-.4 1.7s1.2.3 1.2.3c.7.2.8.6.8 1l-.8 3.3c0 .1.1.1.1.1l-.1 0-1.2 4.7c-.1.2-.3.6-.8.4 0 0-1.2-.3-1.2-.3l-.8 1.9 2.2.5c.4.1.8.2 1.2.3l-.7 2.8 1.6.4.7-2.7c.5.1.9.2 1.3.3l-.7 2.7 1.7.4.7-2.8c2.8.5 4.9.3 5.8-2.2.7-2 0-3.2-1.5-3.9 1.1-.3 1.9-1 2.1-2.5zm-3.7 5.2c-.5 2-3.9.9-5 .7l.9-3.6c1.1.3 4.7.8 4.1 2.9zm.5-5.3c-.5 1.8-3.3.9-4.2.7l.8-3.2c.9.2 3.9.7 3.4 2.5z" fill="#fff"/></svg>`,
  ETH: `<svg viewBox="0 0 32 32" class="ticker-icon"><circle cx="16" cy="16" r="16" fill="#627eea"/><path d="M16.5 4v8.9l7.5 3.3z" fill="#fff" opacity=".6"/><path d="M16.5 4L9 16.2l7.5-3.3z" fill="#fff"/><path d="M16.5 21.9v6.1l7.5-10.4z" fill="#fff" opacity=".6"/><path d="M16.5 28V21.9L9 17.6z" fill="#fff"/><path d="M16.5 20.6l7.5-4.4-7.5-3.3z" fill="#fff" opacity=".2"/><path d="M9 16.2l7.5 4.4v-7.7z" fill="#fff" opacity=".5"/></svg>`,
  SOL: `<svg viewBox="0 0 32 32" class="ticker-icon"><circle cx="16" cy="16" r="16" fill="#000"/><linearGradient id="sol-g" x1="5" y1="27" x2="27" y2="5" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#9945ff"/><stop offset=".5" stop-color="#14f195"/><stop offset="1" stop-color="#00d1ff"/></linearGradient><path d="M9.5 20.1h13.6l-3 3H6.5z M9.5 14.5h13.6l-3-3H6.5z M9.5 8.9h13.6l-3 3H6.5z" fill="url(#sol-g)" transform="translate(0,0.5)"/></svg>`,
  VIX: `<svg viewBox="0 0 32 32" class="ticker-icon"><circle cx="16" cy="16" r="16" fill="#1e293b"/><path d="M8 22l4-8 3 5 3-10 3 7 3-6" stroke="#f97316" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  DXY: `<svg viewBox="0 0 32 32" class="ticker-icon"><circle cx="16" cy="16" r="16" fill="#1e293b"/><text x="16" y="21" text-anchor="middle" fill="#06b6d4" font-size="14" font-weight="bold" font-family="sans-serif">$</text></svg>`,
  'USD/KRW': `<svg viewBox="0 0 32 32" class="ticker-icon"><circle cx="16" cy="16" r="16" fill="#1e293b"/><text x="16" y="21" text-anchor="middle" fill="#eab308" font-size="12" font-weight="bold" font-family="sans-serif">₩</text></svg>`,
  'USD/JPY': `<svg viewBox="0 0 32 32" class="ticker-icon"><circle cx="16" cy="16" r="16" fill="#1e293b"/><text x="16" y="21" text-anchor="middle" fill="#dc2626" font-size="12" font-weight="bold" font-family="sans-serif">¥</text></svg>`
};

function buildPriceCards() {
  const container = document.getElementById('realtime-prices');
  if (!container) return;

  const order = ['BTC', 'ETH', 'SOL', 'VIX', 'DXY', 'USD/KRW', 'USD/JPY'];
  let html = '';
  order.forEach((key, idx) => {
    const icon = _tickerIcons[key] || '';
    html += `
      <div class="price-card" id="price-card-${key.replace('/', '')}" style="animation-delay:${idx * 0.05}s">
        <div class="price-card-header">
          <span class="price-symbol">${icon} ${key}</span>
          <span class="price-live-dot" title="Live">&bull;</span>
        </div>
        <div style="display:flex;align-items:baseline;gap:8px;">
          <div class="price-value">—</div>
          <div class="price-change">—</div>
        </div>
        <div class="price-details">
          <span class="price-vol">Vol: —</span>
          <span class="price-time">--:--:--</span>
        </div>
        <div class="price-mini-chart" id="mini-chart-${key.replace('/', '')}">
          <svg width="100%" height="24" preserveAspectRatio="none" viewBox="0 0 60 24">
            <polyline class="mini-chart-line" fill="none" stroke="var(--neon-cyan)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" points="0,12 60,12" opacity="0.3"/>
          </svg>
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
}

// Fetch macro/FX from backend (VIX, DXY, USD/KRW, USD/JPY) for price panel
// Also updates BTC/ETH/SOL as fallback when Binance WS is unavailable
async function fetchRealtimePrices() {
  try {
    const res = await fetch('/api/market');
    const data = await res.json();
    const market = data.market;
    if (!market) return;

    const allKeys = ['BTC', 'ETH', 'SOL', 'VIX', 'DXY', 'USD/KRW', 'USD/JPY'];
    allKeys.forEach(key => {
      if (!market[key]) return;
      const item = market[key];
      const cardKey = key.replace('/', '');
      const prev = _livePrices[key];

      // For crypto: skip if WS already provided a recent update (within 15s)
      const isCrypto = ['BTC', 'ETH', 'SOL'].includes(key);
      if (isCrypto && prev && prev._wsTime && (Date.now() - prev._wsTime < 15000)) return;

      _livePrices[key] = {
        price: item.price,
        change: item.change,
        prevPrice: prev ? prev.price : item.price,
        high: prev ? prev.high : 0,
        low: prev ? prev.low : 0,
        vol: prev ? prev.vol : 0,
        _wsTime: prev ? prev._wsTime : 0
      };

      const card = document.getElementById(`price-card-${cardKey}`);
      if (!card) return;
      const valEl = card.querySelector('.price-value');
      const chgEl = card.querySelector('.price-change');
      const timeEl = card.querySelector('.price-time');
      if (!valEl) return;

      // Direction flash
      const dir = prev && item.price > prev.price ? 'up' : prev && item.price < prev.price ? 'down' : null;

      const isFx = key.startsWith('USD/');
      const decimals = isCrypto ? (item.price >= 100 ? 2 : item.price >= 1 ? 4 : 6) : 2;
      const prefix = isFx ? '' : '$';
      valEl.textContent = prefix + Number(item.price).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

      if (dir) {
        card.classList.remove('price-flash-up', 'price-flash-down');
        void card.offsetWidth;
        card.classList.add(dir === 'up' ? 'price-flash-up' : 'price-flash-down');
        valEl.style.color = dir === 'up' ? 'var(--neon-green)' : 'var(--neon-red)';
        setTimeout(() => { valEl.style.color = ''; }, 1200);
      }

      if (chgEl) {
        const sign = item.change >= 0 ? '+' : '';
        chgEl.textContent = `${sign}${item.change}%`;
        chgEl.className = `price-change ${item.change >= 0 ? 'up' : 'down'}`;
      }
      if (timeEl) timeEl.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });

      // Update mini sparkline for this key too
      updateMiniChart(key, item.price, item.change);
    });
  } catch (e) {
    console.error('Realtime Price Error:', e);
  }
}

async function fetchNews() {
  try {
    const res = await fetch('/api/news');
    const data = await res.json();
    const feed = document.getElementById('news-feed');

    if (!data.news || data.news.length === 0) return;

    if (feed) {
      feed.innerHTML = data.news.map(n => {
        const sClass = n.sentiment === 'BULLISH' ? 'sentiment-bullish' : n.sentiment === 'BEARISH' ? 'sentiment-bearish' : 'sentiment-neutral';
        const sLabel = escapeHtml(n.sentiment || 'NEUTRAL');
        return `
                <div class="news-item-v2">
                    <div class="news-meta">
                        <span class="news-meta-left"><span class="news-source-tag">${escapeHtml(n.source)}</span><span class="sentiment-tag ${sClass}">${sLabel}</span></span>
                        <span>${escapeHtml(n.time)}</span>
                    </div>
                    <a href="${safeUrl(n.link)}" target="_blank" rel="noopener noreferrer" class="news-link">${escapeHtml(n.title)}</a>
                </div>`;
      }).join('');
    }
  } catch (e) { console.error("News Error:", e); }
}

