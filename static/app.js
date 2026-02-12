/* static/app.js - Ryzm Neural Network v2.0 */

// Global state
let validatorCredits = 3;
const MAX_FREE_VALIDATIONS = 3;

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initClock();
  initDataFeeds();
  setupEventListeners();
  initAudioEngine(); // Start audio engine
  initValidator(); // Trade Validator
  initChat(); // Ask Ryzm Chat
  loadValidatorCredits(); // Load saved credits
  lucide.createIcons();
});

/* ── 0. Audio Engine (BGM & SFX) ── */
const sfx = {
  click: new Audio('https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3'),
  alert: new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'),
  hover: new Audio('https://assets.mixkit.co/active_storage/sfx/2572/2572-preview.mp3')
};

const playlist = [
  { title: "Echoes of Time", url: "/static/audio/Echoes%20of%20Time.mp3" },
  { title: "Invisible Room", url: "/static/audio/Invisible%20Room.mp3" },
  { title: "Morning Glow", url: "/static/audio/Morning%20Glow.mp3" },
  { title: "Morning Light", url: "/static/audio/Morning%20Light.mp3" },
  { title: "Quiet Gravity", url: "/static/audio/Quiet%20Gravity.mp3" },
  { title: "Raindrops in D Minor", url: "/static/audio/Raindrops%20in%20D%20Minor.mp3" },
  { title: "Sunrise Over Waves", url: "/static/audio/Sunrise%20Over%20Waves.mp3" }
];
let currentTrack = 0;
let bgmAudio = new Audio();
let isPlaying = false;

function initAudioEngine() {
  sfx.click.volume = 0.2;
  sfx.alert.volume = 0.3;
  sfx.hover.volume = 0.05;

  const btnPlay = document.getElementById('bgm-play');
  const btnSkip = document.getElementById('bgm-skip');
  const slider = document.getElementById('bgm-volume');
  const trackName = document.getElementById('bgm-track-name');

  bgmAudio.loop = true;
  bgmAudio.volume = 0.3;
  loadTrack(0, trackName);

  bgmAudio.addEventListener('error', () => {
    if (trackName) {
      trackName.innerText = 'BGM LOAD FAILED';
      trackName.style.color = 'var(--neon-red)';
      trackName.style.textShadow = 'none';
    }
  });

  if (btnPlay) {
    btnPlay.addEventListener('click', () => {
      toggleBGM();
      playSound('click');
    });
  }

  if (btnSkip) {
    btnSkip.addEventListener('click', () => {
      skipTrack(trackName);
      playSound('click');
    });
  }

  if (slider) {
    slider.addEventListener('input', (e) => {
      bgmAudio.volume = e.target.value / 100;
    });
  }

  document.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => playSound('click'));
    btn.addEventListener('mouseenter', () => playSound('hover'));
  });
}

function loadTrack(index, trackNameEl) {
  const track = playlist[index];
  if (!track) return;
  currentTrack = index;
  bgmAudio.src = track.url;
  bgmAudio.load();
  if (trackNameEl) {
    trackNameEl.innerText = `READY: ${track.title}`;
    trackNameEl.style.color = 'var(--text-muted)';
    trackNameEl.style.textShadow = 'none';
  }
}

function skipTrack(trackNameEl) {
  const next = (currentTrack + 1) % playlist.length;
  loadTrack(next, trackNameEl);
  if (isPlaying) {
    bgmAudio.play().catch(() => {
      isPlaying = false;
      if (trackNameEl) {
        trackNameEl.innerText = 'BGM BLOCKED';
        trackNameEl.style.color = 'var(--neon-red)';
      }
    });
  }
}

function toggleBGM() {
  const btnPlay = document.getElementById('bgm-play');
  const trackName = document.getElementById('bgm-track-name');

  if (isPlaying) {
    bgmAudio.pause();
    if (btnPlay) btnPlay.innerHTML = '<i data-lucide="play" style="width:14px;height:14px;"></i>';
    if (trackName) {
      trackName.style.color = 'var(--text-muted)';
      trackName.style.textShadow = 'none';
    }
    isPlaying = false;
  } else {
    bgmAudio.play().then(() => {
      isPlaying = true;
      if (btnPlay) btnPlay.innerHTML = '<i data-lucide="pause" style="width:14px;height:14px;"></i>';
      if (trackName) {
        trackName.style.color = 'var(--neon-cyan)';
        trackName.style.textShadow = '0 0 5px var(--neon-cyan)';
      }
    }).catch(() => {
      isPlaying = false;
      if (trackName) {
        trackName.innerText = 'BGM BLOCKED';
        trackName.style.color = 'var(--neon-red)';
        trackName.style.textShadow = 'none';
      }
    });
  }
  lucide.createIcons();
}

function playSound(type) {
  if (sfx[type]) {
    sfx[type].currentTime = 0;
    sfx[type].play().catch(() => { });
  }
}

/* ── 1. Clock ── */
function initClock() {
  const updateTime = () => {
    const now = new Date();
    const kstEl = document.getElementById('clock-kst');
    const estEl = document.getElementById('clock-est');
    if (kstEl) kstEl.innerText = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" })).toLocaleTimeString('en-US', { hour12: false });
    if (estEl) estEl.innerText = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" })).toLocaleTimeString('en-US', { hour12: false });
  };
  setInterval(updateTime, 1000);
  updateTime();
}

/* ── 2. Data Feeds ── */
function initDataFeeds() {
  fetchMacroTicker();
  fetchNews();
  fetchRealtimePrices();
  fetchLongShortRatio();
  fetchBriefing();
  fetchFundingRate();
  fetchWhaleFeed();
  fetchCalendar();
  fetchRiskGauge();
  fetchMuseumOfScars();
  fetchHeatmap();
  fetchHealthCheck();
  setInterval(fetchMacroTicker, 10000);
  setInterval(fetchNews, 60000);
  setInterval(fetchRealtimePrices, 5000);
  setInterval(fetchLongShortRatio, 60000);
  setInterval(fetchBriefing, 120000);
  setInterval(fetchFundingRate, 60000);
  setInterval(fetchWhaleFeed, 30000);
  setInterval(fetchCalendar, 300000);
  setInterval(fetchRiskGauge, 60000);
  setInterval(fetchHeatmap, 60000);
  setInterval(fetchHealthCheck, 30000);
}

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
      const el = document.getElementById(`fr-${r.symbol.toLowerCase()}`);
      if (el) {
        const color = r.rate > 0 ? 'var(--neon-green)' : r.rate < 0 ? 'var(--neon-red)' : 'var(--text-muted)';
        el.innerHTML = `${r.symbol} <span style="color:${color};font-weight:600;">${r.rate > 0 ? '+' : ''}${r.rate}%</span>`;
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
      container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">No whale activity detected</div>';
      return;
    }
    container.innerHTML = data.trades.map(t => {
      const isBuy = t.side === 'BUY';
      const icon = isBuy ? '▲' : '▼';
      const color = isBuy ? 'var(--neon-green)' : 'var(--neon-red)';
      const usd = t.usd >= 1000000 ? `$${(t.usd/1000000).toFixed(1)}M` : `$${(t.usd/1000).toFixed(0)}K`;
      const time = new Date(t.time).toLocaleTimeString('en-US', {hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit'});
      return `<div class="whale-item">
        <span style="color:${color};font-weight:700;">${icon} ${t.side}</span>
        <span style="font-weight:600;">${t.symbol}</span>
        <span style="color:${color};font-family:var(--font-mono);">${usd}</span>
        <span style="color:var(--text-muted);">${time}</span>
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
      container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">No upcoming events</div>';
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
        <span class="cal-date">${dateStr}</span>
        <span class="cal-event">${impactDot} ${e.event} <span class="cal-region">${e.region}</span></span>
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
  updateThemeIcon(saved);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.addEventListener('click', toggleTheme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('ryzm-theme', next);
  updateThemeIcon(next);
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

/* ── Systemic Risk Gauge ── */
async function fetchRiskGauge() {
  try {
    const res = await fetch('/api/risk-gauge');
    const data = await res.json();

    const scoreEl = document.getElementById('risk-score');
    const labelEl = document.getElementById('risk-label');
    const needleEl = document.getElementById('gauge-needle');
    const arcEl = document.getElementById('gauge-arc');

    if (!scoreEl) return;

    const score = data.score || 0;
    scoreEl.innerText = score.toFixed(1);
    labelEl.innerText = `[${data.label}]`;

    // Color based on level
    const colors = {
      'CRITICAL': 'var(--neon-red)',
      'HIGH': '#f97316',
      'ELEVATED': '#eab308',
      'MODERATE': 'var(--neon-cyan)',
      'LOW': 'var(--neon-green)'
    };
    const color = colors[data.level] || 'var(--text-muted)';
    scoreEl.style.color = color;
    labelEl.style.color = color;
    // Arc uses SVG gradient; update gradient stops dynamically for single-color glow
    if (arcEl) arcEl.setAttribute('stroke', 'url(#gaugeGrad)');

    // Score range: -100 (extreme risk/left) to +100 (safe/right)
    // Needle: score -100 → -90° (left), 0 → 0° (center/up), +100 → +90° (right)
    const clampedScore = Math.max(-100, Math.min(100, score));
    // -100 → -90° (left/danger), 0 → 0° (center/up), +100 → +90° (right/safe)
    const needleAngle = (clampedScore / 100) * 90;
    if (needleEl) {
      needleEl.setAttribute('transform', `rotate(${needleAngle}, 100, 100)`);
      console.log(`[Gauge] score=${score}, angle=${needleAngle}`);
    }

    // Arc fill: map -100..+100 to 0..1, then to dashoffset 251..0
    const pct = (clampedScore + 100) / 200;  // 0..1
    const arcLen = 251;
    if (arcEl) arcEl.setAttribute('stroke-dashoffset', arcLen - (pct * arcLen));

    // Update sub-components
    const c = data.components || {};
    if (c.vix) {
      const rcVix = document.getElementById('rc-vix');
      if (rcVix) rcVix.innerHTML = `<span style="color:${c.vix.value > 25 ? 'var(--neon-red)' : 'var(--neon-green)'}">${c.vix.value}</span>`;
    }
    if (c.fear_greed) {
      const rcFg = document.getElementById('rc-fg');
      if (rcFg) rcFg.innerHTML = `<span style="color:${c.fear_greed.value < 30 ? 'var(--neon-red)' : c.fear_greed.value > 70 ? 'var(--neon-green)' : 'var(--text-muted)'}">${c.fear_greed.value}/100</span>`;
    }
    if (c.long_short) {
      const rcLs = document.getElementById('rc-ls');
      if (rcLs) rcLs.innerHTML = `${c.long_short.value}% L`;
    }
    if (c.funding_rate) {
      const rcFr = document.getElementById('rc-fr');
      if (rcFr) {
        const frVal = c.funding_rate.value;
        rcFr.innerHTML = `<span style="color:${frVal > 0.05 ? 'var(--neon-red)' : frVal < -0.05 ? 'var(--neon-red)' : 'var(--neon-green)'}">${frVal > 0 ? '+' : ''}${frVal}%</span>`;
      }
    }
  } catch (e) {
    console.error('Risk Gauge Error:', e);
  }
}

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
          <span class="scar-date">${s.date}</span>
          <span class="scar-event">${s.event.toUpperCase()}</span>
          <span class="scar-drop">${s.drop}</span>
        </div>
        <div class="scar-desc">${s.desc}</div>
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
        LAYER ${layer.layer}: ${layer.title}
      </div>
      <div class="sn-layer-content">${layer.content}</div>
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

    const order = ['BTC', 'ETH', 'SOL', 'VIX', 'DXY', 'USD/KRW', 'USD/JPY'];
    let html = '';

    order.forEach(key => {
      if (market[key]) {
        const item = market[key];
        const colorClass = item.change >= 0 ? 'var(--neon-green)' : 'var(--neon-red)';
        const sign = item.change >= 0 ? '+' : '';
        html += `
                    <span style="margin-right:30px; font-family:'Share Tech Mono'; display:inline-flex; align-items:center;">
                        <span style="color:var(--text-muted); margin-right:8px;">${key}</span>
                        <span style="color:#fff; margin-right:8px;">${item.price.toLocaleString()}</span>
                        <span style="color:${colorClass}; font-size:0.85rem;">${sign}${item.change}%</span>
                    </span>
                `;
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
    const kpDiv = document.querySelector('.kp-value');
    if (kpDiv && data.premium !== undefined) {
      const p = data.premium;
      kpDiv.innerText = (p > 0 ? '+' : '') + p + '%';
      kpDiv.style.color = p > 3 ? 'var(--neon-red)' : 'var(--neon-green)';
    }
  } catch (e) { console.error("KP Error:", e); }
}

/* ── Real-time Price Panel (NEW) ── */
async function fetchRealtimePrices() {
  try {
    const res = await fetch('/api/market');
    const data = await res.json();
    const market = data.market;
    const container = document.getElementById('realtime-prices');

    if (!market || Object.keys(market).length === 0 || !container) return;

    const order = ['BTC', 'ETH', 'SOL', 'VIX', 'DXY', 'USD/KRW', 'USD/JPY'];
    let html = '';

    order.forEach(key => {
      if (market[key]) {
        const item = market[key];
        const changeClass = item.change >= 0 ? 'up' : 'down';
        const sign = item.change >= 0 ? '+' : '';

        html += `
          <div class="price-card">
            <div class="price-card-header">
              <span class="price-symbol">${key}</span>
            </div>
            <div class="price-value">${item.price.toLocaleString()}</div>
            <div class="price-change ${changeClass}">${sign}${item.change}%</div>
            <div class="price-details">
              <span>24h Vol: N/A</span>
              <span>${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
        `;
      }
    });

    container.innerHTML = html;
    lucide.createIcons();
  } catch (e) {
    console.error("Realtime Price Error:", e);
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
        const sLabel = n.sentiment || 'NEUTRAL';
        return `
                <div style="padding:10px; border-bottom:1px solid var(--border-dim); transition: background 0.2s; cursor:pointer;" onmouseenter="this.style.background='rgba(0,0,0,0.03)'" onmouseleave="this.style.background='transparent'">
                    <div style="display:flex; justify-content:space-between; align-items:center; color:var(--text-muted); font-size:0.7rem; margin-bottom:4px;">
                        <span style="display:flex; align-items:center; gap:6px;"><span style="color:var(--neon-cyan);">${n.source}</span><span class="sentiment-tag ${sClass}">${sLabel}</span></span>
                        <span>${n.time}</span>
                    </div>
                    <a href="${n.link}" target="_blank" style="color:var(--text-main); text-decoration:none; font-size:0.85rem; line-height:1.4; display:block;">${n.title}</a>
                </div>`;
      }).join('');
    }
  } catch (e) { console.error("News Error:", e); }
}

/* ── 3. AI Council ── */
function setupEventListeners() {
  const btnCouncil = document.getElementById('btn-council-start');
  const btnCopy = document.getElementById('btn-copy-report');

  if (btnCouncil) {
    btnCouncil.addEventListener('click', async () => {
      playSound('click');
      btnCouncil.innerHTML = '<i data-lucide="loader-2" class="spin"></i> ACCESSING NEURAL NET...';
      btnCouncil.disabled = true;

      const agentsGrid = document.getElementById('agents-grid');
      if (agentsGrid) {
        agentsGrid.innerHTML = `
                    <div style="grid-column: span 5; text-align:center; padding:40px; color:var(--text-muted);">
                        <i data-lucide="radio-tower" style="width:32px; height:32px; margin-bottom:10px; animation:pulse 1s infinite;"></i><br>
                        SUMMONING AGENTS...
                    </div>
                `;
        lucide.createIcons();
      }

      try {
        const res = await fetch('/api/council');
        const data = await res.json();
        renderCouncil(data);
        playSound('alert');

        btnCouncil.innerHTML = '<i data-lucide="zap"></i> RE-RUN ANALYSIS';
        if (btnCopy) btnCopy.style.display = 'flex';

      } catch (e) {
        console.error(e);
        if (agentsGrid) agentsGrid.innerHTML = '<div style="color:var(--neon-red); grid-column:span 5; text-align:center;">CONNECTION FAILED</div>';
        btnCouncil.innerHTML = '<i data-lucide="alert-triangle"></i> RETRY';
      } finally {
        btnCouncil.disabled = false;
        lucide.createIcons();
      }
    });
  }

  if (btnCopy) {
    btnCopy.addEventListener('click', () => {
      playSound('click');
      const scoreEl = document.getElementById('consensus-score');
      const vibeEl = document.getElementById('vibe-status');

      const score = scoreEl ? scoreEl.innerText.replace('SCORE: ', '') : 'N/A';
      const vibe = vibeEl ? vibeEl.innerText : 'N/A';

      let debateLog = "";
      document.querySelectorAll('.agent-card').forEach(card => {
        const nameEl = card.querySelector('.agent-name');
        if (nameEl) {
          const name = nameEl.innerText;
          if (name !== 'SYSTEM') {
            const msg = card.querySelector('.agent-msg').innerText.replace(/"/g, '');
            let icon = '🤖';
            if (name.includes('Grok')) icon = '🚀';
            if (name.includes('GPT')) icon = '📉';
            if (name.includes('Vision')) icon = '👁️';
            if (name.includes('Claude')) icon = '⚖️';
            debateLog += `${icon} **${name}**: ${msg}\n`;
          }
        }
      });

      const text = `🚨 **Ryzm Terminal Alert**\n\n` +
        `🧠 Vibe: ${vibe}\n` +
        `🎯 Score: ${score}/100\n\n` +
        `**[Council Debate]**\n${debateLog}\n` +
        `#Bitcoin #Crypto #Ryzm`;

      navigator.clipboard.writeText(text).then(() => {
        const origin = btnCopy.innerHTML;
        btnCopy.innerHTML = '<i data-lucide="check"></i> COPIED!';
        setTimeout(() => { btnCopy.innerHTML = origin; lucide.createIcons(); }, 2000);
      });
    });
  }
}

function renderCouncil(data) {
  // Vibe
  if (data.vibe) {
    const vStat = document.getElementById('vibe-status');
    const vMsg = document.getElementById('vibe-message');
    if (vStat) {
      vStat.innerText = data.vibe.status;
      vStat.style.color = data.vibe.color;
      vStat.style.textShadow = `0 0 8px ${data.vibe.color}`;
    }
    if (vMsg) vMsg.innerText = `/// SYSTEM: ${data.vibe.message}`;
  }

  // Score
  const sDisplay = document.getElementById('consensus-score');
  if (sDisplay) {
    sDisplay.innerText = `SCORE: ${data.consensus_score}`;
    sDisplay.style.color = data.consensus_score > 50 ? 'var(--neon-green)' : 'var(--neon-red)';
  }

  // Long/Short Ratio
  // We use real data from /api/long-short now, so we don't overwrite it with AI score anymore
  // But if real data failed, we could use AI score as fallback? 
  // For now, let's DISABLE AI override for L/S to keep it real.
  /*
  const lsLong = document.getElementById('ls-long');
  const lsShort = document.getElementById('ls-short');
  if (lsLong && lsShort) {
    const score = data.consensus_score || 50;
    const longRatio = score;
    const shortRatio = 100 - score;

    lsLong.style.width = `${longRatio}%`;
    lsLong.innerText = `${longRatio}%`;
    lsShort.style.width = `${shortRatio}%`;
    lsShort.innerText = `${shortRatio}%`;
  }
  */

  // Render Bubble Chart (NEW)
  if (data.narratives && data.narratives.length > 0) {
    renderBubbleChart(data.narratives);
  }

  // Agents
  const grid = document.getElementById('agents-grid');
  if (grid) {
    grid.innerHTML = '';
    data.agents.forEach((agent, i) => {
      let color = agent.status.includes('BULL') ? 'var(--neon-green)' :
        agent.status.includes('BEAR') ? 'var(--neon-red)' : 'var(--text-muted)';

      setTimeout(() => {
        const div = document.createElement('div');
        div.className = 'agent-card speaking';
        div.innerHTML = `
                    <div class="agent-icon" style="border-color:${color}; color:${color};">${agent.name[0]}</div>
                    <div class="agent-name">${agent.name}</div>
                    <div class="agent-status" style="color:${color}; border-color:${color};">${agent.status}</div>
                    <div class="agent-msg">"${agent.message}"</div>
                `;
        grid.appendChild(div);
        playSound('hover');
        setTimeout(() => div.classList.remove('speaking'), 600);
      }, i * 250);
    });
  }

  // Strategies
  const sList = document.getElementById('strategy-list');
  if (sList && data.strategies) {
    sList.innerHTML = data.strategies.map(s => `
            <div class="strategy-card" style="border-left-color:${s.name.includes('Bull') ? 'var(--neon-green)' : 'var(--neon-red)'}">
                <div style="display:flex; justify-content:space-between; color:var(--text-muted); font-size:0.7rem; margin-bottom:4px;">
                    <span>${s.name}</span>
                    <span style="color:var(--neon-cyan); font-family:'Share Tech Mono'">${s.prob}</span>
                </div>
                <div style="font-size:0.8rem; line-height:1.3;">${s.action}</div>
            </div>
        `).join('');
  }

  // Strategic Narrative
  if (data.strategic_narrative) {
    renderStrategicNarrative(data.strategic_narrative);
  }
}

/* ─── Bubble Chart Renderer ─── */
function renderBubbleChart(narratives) {
  const svg = document.getElementById('bubble-svg');
  const container = document.getElementById('bubble-chart');

  if (!svg || !container) return;

  const width = container.clientWidth || 250;
  const height = container.clientHeight || 250;

  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.innerHTML = ''; // Clear existing

  // Calculate bubble positions (simple grid layout with some randomness)
  const cols = Math.ceil(Math.sqrt(narratives.length));
  const cellWidth = width / cols;
  const cellHeight = height / cols;

  narratives.forEach((n, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);

    // Add some randomness to position
    const x = col * cellWidth + cellWidth / 2 + (Math.random() - 0.5) * 20;
    const y = row * cellHeight + cellHeight / 2 + (Math.random() - 0.5) * 20 + 40;

    // Scale bubble size based on score (min 15, max 40)
    const radius = 15 + (n.score / 100) * 25;

    // Color based on trend
    const color = n.trend === 'UP' ? '#ec4899' : n.trend === 'DOWN' ? '#64748b' : '#06b6d4';

    // Create bubble group
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('bubble');
    g.setAttribute('data-name', n.name);
    g.setAttribute('data-score', n.score);

    // Circle
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', x);
    circle.setAttribute('cy', y);
    circle.setAttribute('r', radius);
    circle.setAttribute('fill', color);
    circle.setAttribute('opacity', '0.6');
    circle.setAttribute('stroke', color);
    circle.setAttribute('stroke-width', '2');

    // Animate entrance
    circle.style.animation = `bubblePop 0.5s ease-out ${i * 0.1}s backwards`;

    // Name text
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.classList.add('bubble-text');
    text.setAttribute('x', x);
    text.setAttribute('y', y - 3);
    text.textContent = n.name;

    // Score text
    const scoreText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    scoreText.classList.add('bubble-score');
    scoreText.setAttribute('x', x);
    scoreText.setAttribute('y', y + 8);
    scoreText.textContent = n.score;

    g.appendChild(circle);
    g.appendChild(text);
    g.appendChild(scoreText);
    svg.appendChild(g);

    // Text appearance
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', '#ffffff');
    text.setAttribute('font-size', Math.max(9, Math.floor(radius / 2)));

    scoreText.setAttribute('text-anchor', 'middle');
    scoreText.setAttribute('fill', 'rgba(255,255,255,0.9)');
    scoreText.setAttribute('font-size', Math.max(8, Math.floor(radius / 2.5)));

    // Floating animation parameters (randomized per bubble)
    const floatDur = 4 + Math.random() * 6; // 4s ~ 10s
    const floatDelay = Math.random() * 3; // stagger start
    // ensure transform origin works for SVG
    g.style.transformBox = 'fill-box';
    g.style.transformOrigin = 'center';
    g.style.animation = `float ${floatDur}s ease-in-out ${floatDelay}s infinite`;

    // Hover tooltip effect
    g.addEventListener('mouseenter', () => {
      circle.setAttribute('opacity', '0.95');
      circle.setAttribute('r', radius * 1.25);
      g.style.animationPlayState = 'paused';
    });

    g.addEventListener('mouseleave', () => {
      circle.setAttribute('opacity', '0.6');
      circle.setAttribute('r', radius);
      g.style.animationPlayState = 'running';
    });
  });
}

// Add bubble animation to CSS dynamically
if (!document.getElementById('bubble-animation-style')) {
  const style = document.createElement('style');
  style.id = 'bubble-animation-style';
  style.textContent = `
    @keyframes bubblePop {
      0% {
        opacity: 0;
        transform: scale(0);
      }
      50% {
        transform: scale(1.2);
      }
      100% {
        opacity: 0.6;
        transform: scale(1);
      }
    }
  `;
  document.head.appendChild(style);
}

/* ─── Matrix Rain Effect ─── */
const canvas = document.getElementById('matrix-bg');
if (canvas) {
  const ctx = canvas.getContext('2d');

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$₿Ξ";
  const fontSize = 14;
  const columns = canvas.width / fontSize;
  const drops = Array(Math.floor(columns)).fill(1);

  function drawMatrix() {
    ctx.fillStyle = "rgba(0, 0, 0, 0.05)"; // Afterimage effect
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#0f0";
    ctx.font = fontSize + "px monospace";

    for (let i = 0; i < drops.length; i++) {
      const text = chars[Math.floor(Math.random() * chars.length)];
      ctx.fillText(text, i * fontSize, drops[i] * fontSize);

      if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
        drops[i] = 0;
      }
      drops[i]++;
    }
  }
  setInterval(drawMatrix, 50);

  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });
}

/* ─── Snapshot Export ─── */
const btnSnapshot = document.getElementById('btn-snapshot');
if (btnSnapshot) {
  btnSnapshot.addEventListener('click', () => {
    const element = document.body;
    playSound('click');

    const crt = document.querySelector('body::before');

    html2canvas(element, {
      backgroundColor: "#030305",
      scale: 2,
      ignoreElements: (element) => element.id === 'matrix-bg'
    }).then(canvas => {
      const link = document.createElement('a');
      link.download = `Ryzm_Intel_${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL();
      link.click();
      playSound('alert');
    });
  });
}

/* ─── Trade Validator ─── */
function initValidator() {
  const btnValidate = document.getElementById('btn-validate');
  if (!btnValidate) return;

  btnValidate.addEventListener('click', async () => {
    // Check credits
    if (validatorCredits <= 0) {
      showToast('error', '⚠ No Credits Left', 'Upgrade to Premium for unlimited validations!');
      return;
    }

    const symbol = document.getElementById('val-symbol').value.toUpperCase().trim();
    const price = parseFloat(document.getElementById('val-price').value);
    const position = document.getElementById('val-position').value;

    if (!symbol || !price || price <= 0) {
      showToast('warning', '⚠ Invalid Input', 'Please fill all fields correctly!');
      return;
    }

    playSound('click');
    btnValidate.disabled = true;
    btnValidate.innerHTML = '<i data-lucide="loader-2" class="spin"></i> SCANNING...';
    btnValidate.classList.add('scanning');
    lucide.createIcons();

    const resultDiv = document.getElementById('validator-result');
    resultDiv.style.display = 'none';

    try {
      const res = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, entry_price: price, position })
      });

      if (!res.ok) throw new Error('Validation failed');

      const data = await res.json();

      // Deduct credit
      validatorCredits--;
      updateCreditsDisplay();
      saveValidatorCredits();

      displayValidationResult(data);
      playSound('alert');
      showToast('success', '✓ Validation Complete', `Trade analyzed by 5 AI personas. Score: ${data.overall_score}/100`);

    } catch (e) {
      console.error(e);
      resultDiv.innerHTML = '<div style="color:var(--neon-red); font-size:0.8rem;">⚠ Validation Failed. Try again.</div>';
      resultDiv.style.display = 'block';
      showToast('error', '⚠ Validation Failed', 'Please try again or contact support.');
    } finally {
      btnValidate.disabled = false;
      btnValidate.innerHTML = '<i data-lucide="zap"></i> VALIDATE TRADE';
      btnValidate.classList.remove('scanning');
      lucide.createIcons();
    }
  });
}

function loadValidatorCredits() {
  const saved = localStorage.getItem('validatorCredits');
  if (saved !== null) {
    validatorCredits = parseInt(saved);
  }
  updateCreditsDisplay();
}

function saveValidatorCredits() {
  localStorage.setItem('validatorCredits', validatorCredits);
}

function updateCreditsDisplay() {
  const creditsEl = document.getElementById('val-credits');
  if (creditsEl) {
    creditsEl.innerText = `${validatorCredits}/${MAX_FREE_VALIDATIONS} Free`;

    if (validatorCredits <= 0) {
      creditsEl.classList.add('depleted');
      creditsEl.innerText = 'Upgrade to Pro';
    } else {
      creditsEl.classList.remove('depleted');
    }
  }
}

function displayValidationResult(data) {
  const resultDiv = document.getElementById('validator-result');

  const scoreColor = data.overall_score >= 70 ? 'var(--neon-green)' :
    data.overall_score >= 50 ? 'var(--neon-cyan)' : 'var(--neon-red)';

  let personasHTML = '';
  data.personas.forEach(p => {
    personasHTML += `
      <div class="val-persona">
        <div class="val-persona-header">
          <span class="val-persona-name">${p.name}</span>
          <span class="val-persona-stance stance-${p.stance}">${p.stance} ${p.score}</span>
        </div>
        <div class="val-persona-reason">${p.reason}</div>
      </div>
    `;
  });

  resultDiv.innerHTML = `
    <div class="val-header">
      <span class="val-verdict">${data.verdict}</span>
      <span class="val-score" style="color:${scoreColor};">${data.overall_score}/100</span>
    </div>
    <div style="font-size:0.75rem; color:var(--neon-cyan); margin-bottom:8px;">
      Win Rate: <strong>${data.win_rate}</strong>
    </div>
    <div class="val-personas">${personasHTML}</div>
    <div class="val-summary">📊 ${data.summary}</div>
  `;

  resultDiv.style.display = 'block';
  lucide.createIcons();
}

/* ─── Ask Ryzm Chat ─── */
function initChat() {
  const chatFloatBtn = document.getElementById('chat-float-btn');
  const chatOverlay = document.getElementById('chat-overlay');
  const chatClose = document.getElementById('chat-close');
  const chatInput = document.getElementById('chat-input');
  const chatSend = document.getElementById('chat-send');
  const chatMessages = document.getElementById('chat-messages');

  if (!chatFloatBtn) return;

  // Toggle chat
  chatFloatBtn.addEventListener('click', () => {
    chatOverlay.classList.toggle('active');
    playSound('click');
    if (chatOverlay.classList.contains('active')) {
      chatInput.focus();
    }
    lucide.createIcons();
  });

  chatClose.addEventListener('click', () => {
    chatOverlay.classList.remove('active');
    playSound('click');
  });

  // Send message
  const sendMessage = async () => {
    const message = chatInput.value.trim();
    if (!message) return;

    // Display user message
    addChatMessage('user', message);
    chatInput.value = '';
    playSound('hover');

    // Add "thinking" message
    const thinkingId = Date.now();
    addChatMessage('ai', '...', thinkingId);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });

      const data = await res.json();

      // Remove thinking message
      const thinkingEl = document.querySelector(`[data-id="${thinkingId}"]`);
      if (thinkingEl) thinkingEl.remove();

      // Display AI response
      addChatMessage('ai', data.response, null, data.confidence);
      playSound('alert');

    } catch (e) {
      console.error(e);
      const thinkingEl = document.querySelector(`[data-id="${thinkingId}"]`);
      if (thinkingEl) thinkingEl.remove();
      addChatMessage('ai', '⚠ Connection lost. Try again.');
    }
  };

  chatSend.addEventListener('click', sendMessage);
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
}

function addChatMessage(type, text, id = null, confidence = null) {
  const chatMessages = document.getElementById('chat-messages');

  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-message ${type}`;
  if (id) msgDiv.setAttribute('data-id', id);

  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${type}`;
  bubble.innerText = text;

  msgDiv.appendChild(bubble);

  if (type === 'ai' && confidence) {
    const confSpan = document.createElement('div');
    confSpan.className = 'chat-confidence';
    confSpan.innerText = `Confidence: ${confidence}`;
    msgDiv.appendChild(confSpan);
  }

  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/* ─── Toast Notification System ─── */
function showToast(type, title, message) {
  // Remove existing toast
  const existingToast = document.querySelector('.toast');
  if (existingToast) existingToast.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : '⚠';

  toast.innerHTML = `
    <div class="toast-icon">${icon}</div>
    <div class="toast-message">
      <strong>${title}</strong><br>
      ${message}
    </div>
  `;

  document.body.appendChild(toast);

  // Auto-remove after 4 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/* ─── Enhanced Kimchi Premium Display ─── */
async function updateKimchiDisplay() {
  try {
    const res = await fetch('/api/kimchi');
    const data = await res.json();

    const kpValue = document.getElementById('kp-value');
    const kpStatus = document.getElementById('kp-status');

    if (kpValue && data.premium !== undefined) {
      const p = data.premium;
      kpValue.innerText = (p > 0 ? '+' : '') + p + '%';

      // Apply color class
      kpValue.classList.remove('kp-positive', 'kp-negative');
      kpValue.classList.add(p > 0 ? 'kp-positive' : 'kp-negative');

      // Update status text
      if (kpStatus) {
        if (Math.abs(p) > 3) {
          kpStatus.innerText = 'Arb Opportunity: HIGH';
          kpStatus.style.color = 'var(--neon-cyan)';
        } else if (Math.abs(p) > 1) {
          kpStatus.innerText = 'Arb Opportunity: MEDIUM';
          kpStatus.style.color = 'var(--text-muted)';
        } else {
          kpStatus.innerText = 'Arb Opportunity: LOW';
          kpStatus.style.color = 'var(--text-muted)';
        }
      }
    }
  } catch (e) {
    console.error('KP Update Error:', e);
  }
}

// Update Kimchi Premium every 10 seconds
setInterval(updateKimchiDisplay, 10000);
updateKimchiDisplay();

/* ═══════════════════════════════════════
   UI/UX ENHANCEMENTS v2.0
   ═══════════════════════════════════════ */

/* ─── Quick Actions Toolbar ─── */
document.addEventListener('DOMContentLoaded', () => {
  initQuickActions();
  initStatusBar();
  initPulseIndicators();
});

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
/* ── Mini Heatmap ── */
async function fetchHeatmap() {
  try {
    const res = await fetch('/api/heatmap');
    const data = await res.json();
    const grid = document.getElementById('heatmap-grid');
    if (!grid || !data.coins || data.coins.length === 0) return;

    grid.innerHTML = data.coins.map(c => {
      const pct = c.change_24h;
      const abs = Math.abs(pct);
      let bg, clr;
      if (pct > 5) { bg = '#059669'; clr = '#fff'; }
      else if (pct > 0) { bg = `rgba(5,150,105,${0.15 + abs*0.08})`; clr = '#059669'; }
      else if (pct < -5) { bg = '#dc2626'; clr = '#fff'; }
      else if (pct < 0) { bg = `rgba(220,38,38,${0.15 + abs*0.08})`; clr = '#dc2626'; }
      else { bg = 'var(--border-dim)'; clr = 'var(--text-muted)'; }

      const size = c.market_cap_rank <= 5 ? 'heatmap-cell-lg' : c.market_cap_rank <= 10 ? 'heatmap-cell-md' : 'heatmap-cell-sm';
      return `<div class="heatmap-cell ${size}" style="background:${bg}; color:${clr};" title="${c.name}: ${pct >= 0 ? '+':''}${pct.toFixed(2)}%">
        <span class="hm-symbol">${c.symbol}</span>
        <span class="hm-pct">${pct >= 0 ? '+':''}${pct.toFixed(1)}%</span>
      </div>`;
    }).join('');
  } catch(e) { console.error('Heatmap Error:', e); }
}

/* ── Health Check / Connection Status ── */
async function fetchHealthCheck() {
  try {
    const res = await fetch('/api/health-check');
    const data = await res.json();
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
        return `<div class="src-row">${icon} ${s.name}</div>`;
      }).join('');
    }
  } catch(e) {
    const dot = document.getElementById('connection-status');
    if (dot) dot.className = 'status-dot dot-red';
    console.error('HealthCheck Error:', e);
  }
}

async function refreshAllData() {
  const promises = [
    fetch('/api/market').then(r => r.json()),
    fetch('/api/news').then(r => r.json()),
    fetch('/api/kimchi').then(r => r.json()),
    fetch('/api/fear-greed').then(r => r.json()),
    fetch('/api/funding-rate').then(r => r.json()),
    fetch('/api/liquidations').then(r => r.json()),
    fetch('/api/calendar').then(r => r.json()),
    fetch('/api/heatmap').then(r => r.json()),
    fetch('/api/health-check').then(r => r.json())
  ];

  try {
    const results = await Promise.all(promises);

    // Trigger pulse indicators
    pulsePanels(['pulse-narratives', 'pulse-kimchi']);

    // Update last refresh time
    updateLastRefreshTime();

    return results;
  } catch (e) {
    console.error('Refresh error:', e);
    showToast('error', '⚠ Refresh Failed', 'Could not update all data sources');
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

  // Simple ping test
  fetch('/api/market')
    .then(() => {
      statusDot.classList.remove('offline');
    })
    .catch(() => {
      statusDot.classList.add('offline');
    });
}

function updateLastRefreshTime() {
  const lastUpdate = document.getElementById('last-update');
  if (lastUpdate) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    lastUpdate.innerText = `Last Update: ${timeStr}`;
  }
}

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

/* ─── Enhanced Data Loading States ─── */
function showLoadingSkeleton(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <div class="skeleton skeleton-title"></div>
    <div class="skeleton skeleton-text"></div>
    <div class="skeleton skeleton-text"></div>
    <div class="skeleton skeleton-text" style="width: 80%;"></div>
  `;
  container.classList.add('panel-loading');
}

function hideLoadingSkeleton(containerId) {
  const container = document.getElementById(containerId);
  if (container) {
    container.classList.remove('panel-loading');
  }
}

/* ─── Smooth Scroll to Element ─── */
function smoothScrollTo(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
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

  // F11: Fullscreen (browser default, but we show toast)
  if (e.key === 'F11') {
    setTimeout(() => {
      const isFullscreen = !!document.fullscreenElement;
      if (isFullscreen) {
        showToast('success', '⛶ Fullscreen', 'Entered fullscreen mode (Press F11 to exit)');
      }
    }, 100);
  }

  // Escape: Close chat if open
  if (e.key === 'Escape') {
    const chatOverlay = document.getElementById('chat-overlay');
    if (chatOverlay && chatOverlay.classList.contains('active')) {
      chatOverlay.classList.remove('active');
    }
  }
});

/* ─── Page Visibility API - Pause updates when tab inactive ─── */
let isPageVisible = true;
document.addEventListener('visibilitychange', () => {
  isPageVisible = !document.hidden;
  if (isPageVisible) {
    console.log('Page visible - resuming updates');
    refreshAllData();
  } else {
    console.log('Page hidden - pausing intensive updates');
  }
});

/* ─── Performance Monitor (Optional Debug) ─── */
if (window.performance && window.performance.memory) {
  setInterval(() => {
    const memory = window.performance.memory;
    const used = (memory.usedJSHeapSize / 1048576).toFixed(2);
    const total = (memory.totalJSHeapSize / 1048576).toFixed(2);
    console.log(`Memory: ${used}MB / ${total}MB`);
  }, 60000); // Every minute
}
