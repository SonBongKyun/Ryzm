/* static/app.js - Ryzm Neural Network v3.2 */

// ── XSS Defense: HTML entity escaping for all external data ──
function escapeHtml(str) {
  if (typeof str !== 'string') return String(str ?? '');
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Global state
let validatorCredits = 3;
const MAX_FREE_VALIDATIONS = 3;
const _intervals = [];  // Track all setIntervals for cleanup

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initI18n();             // i18n system
  initClock();
  initPanelCollapse();  // Panel collapse toggle
  initChartTabs();      // Multi-symbol chart tabs
  initDataFeeds();
  setupEventListeners();
  initAudioEngine(); // Start audio engine
  initValidator(); // Trade Validator
  initChat(); // Ask Ryzm Chat
  loadValidatorCredits(); // Load saved credits
  initPanelDragDrop();    // Panel drag & drop customization
  initTradingViewModal();  // TradingView chart popup
  registerServiceWorker(); // PWA
  initMarketStatus();      // Market open/close indicators
  initKeyboardShortcutsModal(); // ? key help
  initPriceAlerts();       // Price alerts UI
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

let _bgmMuted = false;
let _bgmPrevVol = 0.3;

function initAudioEngine() {
  sfx.click.volume = 0.2;
  sfx.alert.volume = 0.3;
  sfx.hover.volume = 0.05;

  const btnPlay = document.getElementById('bgm-play');
  const btnSkip = document.getElementById('bgm-skip');
  const btnPrev = document.getElementById('bgm-prev');
  const btnMute = document.getElementById('bgm-mute');
  const btnListToggle = document.getElementById('bgm-list-toggle');
  const slider = document.getElementById('bgm-volume');
  const trackName = document.getElementById('bgm-track-name');
  const progressTrack = document.getElementById('bgm-progress-track');

  bgmAudio.volume = 0.3;
  bgmAudio.preload = 'auto';
  loadTrack(0, trackName);

  // Auto-advance to next track when current ends
  bgmAudio.addEventListener('ended', () => {
    skipTrack(trackName);
    if (isPlaying) bgmAudio.play().catch(() => {});
  });

  bgmAudio.addEventListener('error', () => {
    if (trackName) {
      trackName.innerText = 'LOAD FAILED';
      trackName.className = 'bgm-track-name';
    }
    // Auto-skip to next track after 2s on error
    if (isPlaying) {
      setTimeout(() => { skipTrack(trackName); }, 2000);
    }
  });

  // Stalled / waiting — attempt recovery when buffering hangs
  let _stallRetries = 0;
  bgmAudio.addEventListener('stalled', () => {
    if (isPlaying && _stallRetries < 3) {
      _stallRetries++;
      console.warn(`[BGM] Stalled (retry ${_stallRetries}/3) — rebuffering...`);
      const pos = bgmAudio.currentTime;
      bgmAudio.load();
      bgmAudio.currentTime = pos;
      bgmAudio.play().catch(() => {});
    }
  });

  bgmAudio.addEventListener('waiting', () => {
    if (trackName && isPlaying) {
      trackName.innerText = playlist[currentTrack]?.title + ' ⏳';
    }
  });

  bgmAudio.addEventListener('playing', () => {
    _stallRetries = 0;  // Reset retry counter on successful playback
    if (trackName && isPlaying) {
      trackName.innerText = playlist[currentTrack]?.title || 'Unknown';
    }
  });

  // Progress & time update
  bgmAudio.addEventListener('timeupdate', () => {
    const fill = document.getElementById('bgm-progress-fill');
    const timeEl = document.getElementById('bgm-time');
    if (fill && bgmAudio.duration) {
      fill.style.width = (bgmAudio.currentTime / bgmAudio.duration * 100) + '%';
    }
    if (timeEl) {
      timeEl.textContent = `${fmtTime(bgmAudio.currentTime)} / ${fmtTime(bgmAudio.duration || 0)}`;
    }
  });

  // Click on progress bar to seek
  if (progressTrack) {
    progressTrack.addEventListener('click', (e) => {
      if (!bgmAudio.duration) return;
      const rect = progressTrack.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      bgmAudio.currentTime = pct * bgmAudio.duration;
    });
  }

  if (btnPlay) btnPlay.addEventListener('click', () => { toggleBGM(); playSound('click'); });
  if (btnSkip) btnSkip.addEventListener('click', () => { skipTrack(trackName); playSound('click'); });
  if (btnPrev) btnPrev.addEventListener('click', () => { prevTrack(trackName); playSound('click'); });

  // Mute toggle
  if (btnMute) {
    btnMute.addEventListener('click', () => {
      _bgmMuted = !_bgmMuted;
      if (_bgmMuted) {
        _bgmPrevVol = bgmAudio.volume;
        bgmAudio.volume = 0;
        if (slider) slider.value = 0;
        btnMute.innerHTML = '<i data-lucide="volume-x" style="width:12px;height:12px;"></i>';
      } else {
        bgmAudio.volume = _bgmPrevVol;
        if (slider) slider.value = _bgmPrevVol * 100;
        btnMute.innerHTML = '<i data-lucide="volume-2" style="width:12px;height:12px;"></i>';
      }
      lucide.createIcons();
      playSound('click');
    });
  }

  if (slider) {
    slider.addEventListener('input', (e) => {
      bgmAudio.volume = e.target.value / 100;
      _bgmMuted = false;
      if (btnMute) {
        const icon = e.target.value == 0 ? 'volume-x' : 'volume-2';
        btnMute.innerHTML = `<i data-lucide="${icon}" style="width:12px;height:12px;"></i>`;
        lucide.createIcons();
      }
    });
  }

  // Playlist toggle
  if (btnListToggle) {
    btnListToggle.addEventListener('click', () => {
      const pl = document.getElementById('bgm-playlist');
      if (pl) {
        const show = pl.style.display === 'none';
        pl.style.display = show ? 'block' : 'none';
        if (show) renderPlaylist();
      }
      playSound('click');
    });
    // Close playlist on outside click
    document.addEventListener('click', (e) => {
      const pl = document.getElementById('bgm-playlist');
      const player = document.getElementById('bgm-player');
      if (pl && player && !player.contains(e.target)) pl.style.display = 'none';
    });
  }

  buildPlaylist();

  document.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => playSound('click'));
    btn.addEventListener('mouseenter', () => playSound('hover'));
  });
}

function fmtTime(s) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}

function loadTrack(index, trackNameEl) {
  const track = playlist[index];
  if (!track) return;
  currentTrack = index;
  bgmAudio.src = track.url;
  bgmAudio.load();
  if (trackNameEl) {
    trackNameEl.innerText = track.title;
    trackNameEl.className = 'bgm-track-name';
  }
  updatePlaylistHighlight();
}

function skipTrack(trackNameEl) {
  const next = (currentTrack + 1) % playlist.length;
  loadTrack(next, trackNameEl);
  if (isPlaying) {
    bgmAudio.play().catch(() => {
      isPlaying = false;
      updateBGMUI();
    });
  }
}

function prevTrack(trackNameEl) {
  // If >3s into track, restart; otherwise go to previous
  if (bgmAudio.currentTime > 3) {
    bgmAudio.currentTime = 0;
    return;
  }
  const prev = (currentTrack - 1 + playlist.length) % playlist.length;
  loadTrack(prev, trackNameEl);
  if (isPlaying) {
    bgmAudio.play().catch(() => {
      isPlaying = false;
      updateBGMUI();
    });
  }
}

function toggleBGM() {
  const trackName = document.getElementById('bgm-track-name');
  if (isPlaying) {
    bgmAudio.pause();
    isPlaying = false;
  } else {
    bgmAudio.play().then(() => {
      isPlaying = true;
      if (trackName) trackName.innerText = playlist[currentTrack]?.title || 'Unknown';
    }).catch(() => {
      isPlaying = false;
      if (trackName) trackName.innerText = 'BLOCKED';
    });
  }
  updateBGMUI();
}

function updateBGMUI() {
  const btnPlay = document.getElementById('bgm-play');
  const trackName = document.getElementById('bgm-track-name');
  const player = document.getElementById('bgm-player');

  if (btnPlay) {
    const icon = isPlaying ? 'pause' : 'play';
    btnPlay.innerHTML = `<i data-lucide="${icon}" style="width:14px;height:14px;"></i>`;
    btnPlay.classList.toggle('playing', isPlaying);
  }
  if (trackName) {
    trackName.classList.toggle('active', isPlaying);
  }
  if (player) {
    player.classList.toggle('bgm-active', isPlaying);
  }
  updatePlaylistHighlight();
  lucide.createIcons();
}

function buildPlaylist() {
  renderPlaylist();
}

function renderPlaylist() {
  const pl = document.getElementById('bgm-playlist');
  if (!pl) return;
  pl.innerHTML = playlist.map((t, i) => {
    const isActive = i === currentTrack && isPlaying;
    const eqBars = isActive ? '<span class="pl-eq"><span></span><span></span><span></span></span>' : `<span class="pl-num">${i + 1}</span>`;
    return `<div class="bgm-playlist-item ${i === currentTrack ? 'active' : ''}" data-index="${i}">
      ${eqBars}
      <span>${t.title}</span>
    </div>`;
  }).join('');
  // Click to play
  pl.querySelectorAll('.bgm-playlist-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.dataset.index);
      const trackName = document.getElementById('bgm-track-name');
      loadTrack(idx, trackName);
      bgmAudio.play().then(() => { isPlaying = true; updateBGMUI(); }).catch(() => {});
      playSound('click');
    });
  });
}

function updatePlaylistHighlight() {
  const items = document.querySelectorAll('.bgm-playlist-item');
  items.forEach((item, i) => {
    const isThis = i === currentTrack;
    item.classList.toggle('active', isThis);
    const numOrEq = item.querySelector('.pl-num, .pl-eq');
    if (numOrEq && isThis && isPlaying) {
      if (!numOrEq.classList.contains('pl-eq')) {
        numOrEq.outerHTML = '<span class="pl-eq"><span></span><span></span><span></span></span>';
      }
    } else if (numOrEq && numOrEq.classList.contains('pl-eq')) {
      numOrEq.outerHTML = `<span class="pl-num">${i + 1}</span>`;
    }
  });
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

/* ── Panel Collapse Toggle ── */
function initPanelCollapse() {
  const saved = JSON.parse(localStorage.getItem('ryzm_collapsed') || '{}');

  document.querySelectorAll('.panel-title').forEach(title => {
    const icon = title.querySelector('.collapse-icon');
    if (!icon) return; // Only panels with collapse-icon

    const panel = title.closest('.glass-panel');
    if (!panel) return;

    // Find or wrap panel body
    const body = panel.querySelector('.panel-body');
    if (!body) return;

    // Generate a stable key from panel title text
    const key = title.textContent.trim().replace(/\s+/g, '_').substring(0, 30);

    // Restore saved state
    if (saved[key]) {
      panel.classList.add('panel-collapsed');
    }

    title.addEventListener('click', (e) => {
      // Don't collapse if clicking a link or button inside title
      if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON') return;

      panel.classList.toggle('panel-collapsed');
      const isCollapsed = panel.classList.contains('panel-collapsed');

      // Save state
      const states = JSON.parse(localStorage.getItem('ryzm_collapsed') || '{}');
      if (isCollapsed) states[key] = true;
      else delete states[key];
      localStorage.setItem('ryzm_collapsed', JSON.stringify(states));

      playSound('click');
    });
  });
}

/* ── Chart Multi-Symbol Tabs ── */
let _tvWidget = null;

function initChartTabs() {
  const tabContainer = document.getElementById('chart-tabs');
  if (!tabContainer) return;

  // Load initial chart (BTC)
  setTimeout(() => loadTradingViewChart('BINANCE:BTCUSDT'), 300);

  tabContainer.addEventListener('click', (e) => {
    const tab = e.target.closest('.chart-tab');
    if (!tab) return;

    // Update active state
    tabContainer.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    const symbol = tab.dataset.symbol;
    loadTradingViewChart(symbol);
    playSound('click');
  });
}

function loadTradingViewChart(symbol) {
  const container = document.getElementById('tradingview_b1e30');
  if (!container) return;

  container.innerHTML = '';
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  try {
    _tvWidget = new TradingView.widget({
      autosize: true,
      symbol: symbol,
      interval: 'D',
      timezone: 'Asia/Seoul',
      theme: isDark ? 'dark' : 'light',
      style: '1',
      locale: 'en',
      enable_publishing: false,
      backgroundColor: isDark ? 'rgba(15,23,42,1)' : 'rgba(255,255,255,1)',
      gridColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: false,
      container_id: 'tradingview_b1e30'
    });
  } catch (e) {
    console.error('TradingView load error:', e);
  }
}

/* ── Number Countup Animation ── */
function animateCountup(element, newValue, options = {}) {
  const {
    duration = 600,
    decimals = 2,
    prefix = '',
    suffix = '',
    useComma = true
  } = options;

  const text = element.textContent.replace(/[^0-9.\-]/g, '');
  const startValue = parseFloat(text) || 0;
  const endValue = parseFloat(newValue) || 0;

  if (Math.abs(startValue - endValue) < 0.001) return;

  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // easeOutExpo
    const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
    const current = startValue + (endValue - startValue) * eased;

    let formatted = current.toFixed(decimals);
    if (useComma) formatted = Number(formatted).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

    element.textContent = `${prefix}${formatted}${suffix}`;

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      element.classList.add('countup-flash');
      setTimeout(() => element.classList.remove('countup-flash'), 400);
    }
  }
  requestAnimationFrame(update);
}

/* ── 2. Data Feeds ── */
function initDataFeeds() {
  fetchMacroTicker();
  fetchNews();
  buildPriceCards();
  initBinanceWebSocket();
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
  fetchFearGreedChart();
  fetchMultiTimeframe();
  fetchOnChainData();
  fetchScanner();
  fetchRegime();
  fetchCorrelation();
  fetchWhaleWallets();
  fetchLiqZones();
  _intervals.push(setInterval(fetchMacroTicker, 10000));
  _intervals.push(setInterval(fetchNews, 60000));
  _intervals.push(setInterval(fetchRealtimePrices, 10000));
  _intervals.push(setInterval(fetchLongShortRatio, 60000));
  _intervals.push(setInterval(fetchBriefing, 120000));
  _intervals.push(setInterval(fetchFundingRate, 60000));
  _intervals.push(setInterval(fetchWhaleFeed, 30000));
  _intervals.push(setInterval(fetchCalendar, 300000));
  _intervals.push(setInterval(fetchRiskGauge, 60000));
  _intervals.push(setInterval(fetchHeatmap, 60000));
  _intervals.push(setInterval(fetchHealthCheck, 30000));
  _intervals.push(setInterval(fetchFearGreedChart, 300000));
  _intervals.push(setInterval(fetchMultiTimeframe, 300000));
  _intervals.push(setInterval(fetchOnChainData, 300000));
  _intervals.push(setInterval(fetchScanner, 60000));
  _intervals.push(setInterval(fetchRegime, 300000));
  _intervals.push(setInterval(fetchCorrelation, 600000));
  _intervals.push(setInterval(fetchWhaleWallets, 120000));
  _intervals.push(setInterval(fetchLiqZones, 120000));
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
        <span style="color:${color};font-weight:700;">${icon} ${tr.side}</span>
        <span style="font-weight:600;">${tr.symbol}</span>
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
  // Smooth transition class
  document.documentElement.classList.add('theme-transitioning');
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('ryzm-theme', next);
  updateThemeIcon(next);
  // Remove transition class after animation
  setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 500);
  // Reload chart with correct theme
  const activeTab = document.querySelector('.chart-tab.active');
  if (activeTab) loadTradingViewChart(activeTab.dataset.symbol);
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

/* ── Systemic Risk Gauge (v2 — animated, contribution bars, pulse glow) ── */
let _prevRiskScore = null;

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

    if (!scoreSvg) return;

    const score = data.score || 0;
    const clampedScore = Math.max(-100, Math.min(100, score));

    // Color mapping
    const levelColors = {
      'CRITICAL': '#dc2626',
      'HIGH': '#f97316',
      'ELEVATED': '#eab308',
      'MODERATE': '#06b6d4',
      'LOW': '#059669'
    };
    const color = levelColors[data.level] || '#64748b';

    // Update SVG score/label with countup animation
    animateCountup(scoreSvg, score, { duration: 800, decimals: 1, useComma: false });
    scoreSvg.setAttribute('fill', color);
    labelSvg.textContent = `[${data.label}]`;
    labelSvg.setAttribute('fill', color);

    // Needle color matches risk
    if (needleLine) needleLine.setAttribute('stroke', color);

    // Needle rotation (CSS transition handles animation)
    const needleAngle = (clampedScore / 100) * 90;
    if (needleEl) {
      needleEl.setAttribute('transform', `rotate(${needleAngle}, 100, 100)`);
    }

    // Arc fill (CSS transition handles animation)
    const pct = (clampedScore + 100) / 200;
    const arcLen = 251;
    if (arcEl) arcEl.setAttribute('stroke-dashoffset', arcLen - (pct * arcLen));

    // Delta indicator (▲/▼)
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

    // Panel pulse glow based on risk level
    if (panel) {
      panel.classList.remove('risk-pulse-critical', 'risk-pulse-high', 'risk-pulse-elevated', 'risk-pulse-moderate', 'risk-pulse-low');
      const pulseClass = {
        'CRITICAL': 'risk-pulse-critical',
        'HIGH': 'risk-pulse-high',
        'ELEVATED': 'risk-pulse-elevated',
        'MODERATE': 'risk-pulse-moderate',
        'LOW': 'risk-pulse-low'
      }[data.level];
      if (pulseClass) panel.classList.add(pulseClass);
    }

    // Timestamp
    if (tsEl) tsEl.textContent = `Updated ${data.timestamp || new Date().toLocaleTimeString('en-US', {hour12:false})}`;

    // Component contribution bars
    const c = data.components || {};

    // Helper: render a component bar
    function updateBar(barId, valId, contrib, maxContrib, displayText, val) {
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
    }

    if (c.fear_greed) {
      const fgVal = c.fear_greed.value;
      const fgColor = fgVal < 30 ? '#dc2626' : fgVal > 70 ? '#059669' : '#eab308';
      updateBar('rc-fg-bar', 'rc-fg', c.fear_greed.contrib, 50,
        `<span style="color:${fgColor}">${fgVal}/100</span>`, fgVal);
    }
    if (c.vix) {
      const vColor = c.vix.value > 25 ? '#dc2626' : '#059669';
      updateBar('rc-vix-bar', 'rc-vix', c.vix.contrib, 25,
        `<span style="color:${vColor}">${c.vix.value}</span>`, c.vix.value);
    }
    if (c.long_short) {
      updateBar('rc-ls-bar', 'rc-ls', c.long_short.contrib, 30,
        `${c.long_short.value}% L`, c.long_short.value);
    }
    if (c.funding_rate) {
      const frVal = c.funding_rate.value;
      const frColor = Math.abs(frVal) > 0.05 ? '#dc2626' : '#059669';
      updateBar('rc-fr-bar', 'rc-fr', c.funding_rate.contrib, 20,
        `<span style="color:${frColor}">${frVal > 0 ? '+' : ''}${frVal}%</span>`, frVal);
    }
    if (c.kimchi) {
      const kpVal = c.kimchi.value;
      const kpColor = Math.abs(kpVal) > 3 ? '#f97316' : '#059669';
      updateBar('rc-kp-bar', 'rc-kp', c.kimchi.contrib, 15,
        `<span style="color:${kpColor}">${kpVal > 0 ? '+' : ''}${kpVal}%</span>`, kpVal);
    }

    // Auto-update Market Vibe from risk gauge (only if council hasn't set it)
    updateMarketVibe(data);

  } catch (e) {
    console.error('Risk Gauge Error:', e);
  }
}

/**
 * Auto-compute Market Vibe from risk gauge data.
 * Council renderCouncil() will override this when executed.
 */
let _vibeFromCouncil = false;
function updateMarketVibe(riskData) {
  if (_vibeFromCouncil) return; // Council already provided a vibe, skip auto
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

/* ══ Risk Index 30-Day History Chart ══ */
async function fetchRiskHistory() {
  try {
    const res = await fetch('/api/risk-gauge/history?days=30');
    const data = await res.json();
    if (data.history && data.history.length > 0) {
      drawRiskHistoryChart(data.history);
    }
  } catch (e) {
    console.error('[RiskHistory]', e);
  }
}

function drawRiskHistoryChart(history) {
  const canvas = document.getElementById('risk-history-canvas');
  const rangeEl = document.getElementById('risk-history-range');
  if (!canvas || !history.length) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = { top: 6, right: 8, bottom: 14, left: 28 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom;

  ctx.clearRect(0, 0, w, h);

  const scores = history.map(r => r.score);
  const minScore = -100;
  const maxScore = 100;

  // Range display
  const latest = scores[scores.length - 1];
  const min = Math.min(...scores);
  const max = Math.max(...scores);
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

  // Fill area
  ctx.beginPath();
  ctx.moveTo(pad.left, yOf(0));
  scores.forEach((s, i) => ctx.lineTo(pad.left + i * step, yOf(s)));
  ctx.lineTo(pad.left + (scores.length - 1) * step, yOf(0));
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Line
  ctx.beginPath();
  scores.forEach((s, i) => {
    const x = pad.left + i * step;
    const y = yOf(s);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });

  // Color the line based on latest value
  const lineColor = latest > 30 ? '#059669' : latest > 0 ? '#06b6d4' : latest > -30 ? '#eab308' : latest > -60 ? '#f97316' : '#dc2626';
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Latest point pulse
  const lastX = pad.left + (scores.length - 1) * step;
  const lastY = yOf(latest);
  ctx.beginPath();
  ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
  ctx.fillStyle = lineColor;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(lastX, lastY, 7, 0, Math.PI * 2);
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.3;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Level dots with color coding
  const levelColors = { 'CRITICAL': '#dc2626', 'HIGH': '#f97316', 'ELEVATED': '#eab308', 'MODERATE': '#06b6d4', 'LOW': '#059669' };
  history.forEach((r, i) => {
    const x = pad.left + i * step;
    const y = yOf(r.score);
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fillStyle = levelColors[r.level] || '#94a3b8';
    ctx.fill();
  });
}

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
    const kpDiv = document.querySelector('.kp-value');
    if (kpDiv && data.premium !== undefined) {
      const p = data.premium;
      kpDiv.innerText = (p > 0 ? '+' : '') + p + '%';
      kpDiv.style.color = p > 3 ? 'var(--neon-red)' : 'var(--neon-green)';
    }
  } catch (e) { console.error("KP Error:", e); }
}

/* ── Real-time Price Panel (Binance WebSocket + Backend Macro) ── */
const _livePrices = {};   // { BTC: {price, change, prevPrice, high, low, vol}, ... }
const _priceHistory = {};  // { BTC: [p1, p2, ...], ... } mini sparkline data (max 30 pts)
let _priceWs = null;
let _priceWsRetry = 0;

function initBinanceWebSocket() {
  if (_priceWs && _priceWs.readyState <= 1) return; // already open/connecting
  const streams = 'btcusdt@miniTicker/ethusdt@miniTicker/solusdt@miniTicker';
  const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;
  _priceWs = new WebSocket(url);

  _priceWs.onopen = () => { _priceWsRetry = 0; console.log('[WS] Binance connected'); };

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
        vol: vol
      };
      renderPriceCard(key);
    } catch (e) { /* ignore parse errors */ }
  };

  _priceWs.onclose = () => {
    console.log('[WS] Binance disconnected, reconnecting...');
    const delay = Math.min(30000, 1000 * Math.pow(2, _priceWsRetry++));
    setTimeout(initBinanceWebSocket, delay);
  };
  _priceWs.onerror = () => _priceWs.close();
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
async function fetchRealtimePrices() {
  try {
    const res = await fetch('/api/market');
    const data = await res.json();
    const market = data.market;
    if (!market) return;

    const macroKeys = ['VIX', 'DXY', 'USD/KRW', 'USD/JPY'];
    macroKeys.forEach(key => {
      if (!market[key]) return;
      const item = market[key];
      const cardKey = key.replace('/', '');
      const prev = _livePrices[key];
      _livePrices[key] = {
        price: item.price,
        change: item.change,
        prevPrice: prev ? prev.price : item.price,
        high: 0, low: 0, vol: 0
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
      valEl.textContent = isFx
        ? Number(item.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : item.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
                    <a href="${escapeHtml(n.link)}" target="_blank" rel="noopener noreferrer" class="news-link">${escapeHtml(n.title)}</a>
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
      btnCouncil.innerHTML = '<i data-lucide="loader-2" class="spin"></i> ' + t('accessing');
      btnCouncil.disabled = true;

      const agentsGrid = document.getElementById('agents-grid');
      if (agentsGrid) {
        agentsGrid.innerHTML = `
                    <div style="grid-column: span 5; text-align:center; padding:40px; color:var(--text-muted);">
                        <i data-lucide="radio-tower" style="width:32px; height:32px; margin-bottom:10px; animation:pulse 1s infinite;"></i><br>
                        ${t('summoning')}
                    </div>
                `;
        lucide.createIcons();
      }

      try {
        const res = await fetch('/api/council', { credentials: 'same-origin' });
        if (res.status === 403) {
          const err = await res.json().catch(() => ({}));
          showToast('warning', '⚡ Limit Reached', err.detail || 'Daily free council uses exhausted. Upgrade to Pro!');
          btnCouncil.innerHTML = '<i data-lucide="zap"></i> ' + t('re_run');
          btnCouncil.disabled = false;
          lucide.createIcons();
          return;
        }
        const data = await res.json();
        renderCouncil(data);
        playSound('alert');

        btnCouncil.innerHTML = '<i data-lucide="zap"></i> ' + t('re_run');
        if (btnCopy) btnCopy.style.display = 'flex';

        // Refresh council prediction history after each analysis
        setTimeout(() => fetchCouncilHistory(), 1500);

      } catch (e) {
        console.error(e);
        if (agentsGrid) agentsGrid.innerHTML = '<div style="color:var(--neon-red); grid-column:span 5; text-align:center;">' + t('connection_failed') + '</div>';
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
    _vibeFromCouncil = true; // Council vibe takes priority over auto-vibe
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

  // Edge Summary + Prediction/Confidence
  const edgeContainer = document.getElementById('edge-summary');
  const edgeBadge = document.getElementById('edge-badge');
  const edgeAgreement = document.getElementById('edge-agreement');
  if (edgeContainer && data.edge) {
    const e = data.edge;
    const sign = e.value > 0 ? '+' : '';
    const confLabel = data.confidence || '';
    const predLabel = data.prediction || '';
    const confColor = confLabel === 'HIGH' ? 'var(--neon-green)' : confLabel === 'MED' ? 'var(--neon-cyan)' : 'var(--text-muted)';
    edgeBadge.textContent = `EDGE: ${sign}${e.value.toFixed(2)} (${e.bias})`;
    edgeBadge.className = 'edge-badge ' + (e.bias === 'Bull Bias' ? 'bull' : e.bias === 'Bear Bias' ? 'bear' : 'neutral');
    edgeAgreement.innerHTML = `AGREEMENT: ${e.agreement}% │ ↑${e.bulls} ↓${e.bears}` +
      (confLabel ? ` │ <span style="color:${confColor};font-weight:700;">${escapeHtml(predLabel)} [${escapeHtml(confLabel)}]</span>` : '');
    edgeContainer.style.display = 'flex';
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
                    <div class="agent-icon" style="border-color:${color}; color:${color};">${escapeHtml(agent.name[0])}</div>
                    <div class="agent-name">${escapeHtml(agent.name)}</div>
                    <div class="agent-status" style="color:${color}; border-color:${color};">${escapeHtml(agent.status)}</div>
                    <div class="agent-msg">"${escapeHtml(agent.message)}"</div>
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
                    <span>${escapeHtml(s.name)}</span>
                    <span style="color:var(--neon-cyan); font-family:'Share Tech Mono'">${escapeHtml(s.prob)}</span>
                </div>
                <div style="font-size:0.8rem; line-height:1.3;">${escapeHtml(s.action)}</div>
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

/* ─── Matrix Rain Effect (disabled — canvas hidden, saves CPU/battery) ─── */
// Matrix rain is visually hidden via CSS (#matrix-bg { display: none; })
// No canvas rendering runs to save CPU and battery life.

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
        body: JSON.stringify({ symbol, entry_price: price, position }),
        credentials: 'same-origin'
      });

      if (res.status === 403) {
        const err = await res.json().catch(() => ({}));
        showToast('warning', '⚡ Limit Reached', err.detail || 'Daily free validations used up. Upgrade to Pro!');
        loadValidatorCredits();
        return;
      }
      if (!res.ok) throw new Error('Validation failed');

      const data = await res.json();

      // Refresh credits from server (server is source of truth)
      loadValidatorCredits();

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
  // Try server-side credit counting first, fall back to localStorage
  fetch('/api/me', { credentials: 'same-origin' })
    .then(r => r.json())
    .then(data => {
      if (data && data.usage && data.usage.validate) {
        const vu = data.usage.validate;
        validatorCredits = vu.remaining;
        MAX_FREE_VALIDATIONS_SERVER = vu.limit;
      }
      updateCreditsDisplay();
    })
    .catch(() => {
      const saved = localStorage.getItem('validatorCredits');
      if (saved !== null) {
        validatorCredits = parseInt(saved);
      }
      updateCreditsDisplay();
    });
}

let MAX_FREE_VALIDATIONS_SERVER = MAX_FREE_VALIDATIONS;

function saveValidatorCredits() {
  localStorage.setItem('validatorCredits', validatorCredits);
}

function updateCreditsDisplay() {
  const creditsEl = document.getElementById('val-credits');
  if (creditsEl) {
    const limit = MAX_FREE_VALIDATIONS_SERVER || MAX_FREE_VALIDATIONS;
    creditsEl.innerText = `${validatorCredits}/${limit} Free`;

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
          <span class="val-persona-name">${escapeHtml(p.name)}</span>
          <span class="val-persona-stance stance-${escapeHtml(p.stance)}">${escapeHtml(p.stance)} ${escapeHtml(p.score)}</span>
        </div>
        <div class="val-persona-reason">${escapeHtml(p.reason)}</div>
      </div>
    `;
  });

  resultDiv.innerHTML = `
    <div class="val-header">
      <span class="val-verdict">${escapeHtml(data.verdict)}</span>
      <span class="val-score" style="color:${scoreColor};">${escapeHtml(data.overall_score)}/100</span>
    </div>
    <div style="font-size:0.75rem; color:var(--neon-cyan); margin-bottom:8px;">
      Win Rate: <strong>${escapeHtml(data.win_rate)}</strong>
    </div>
    <div class="val-personas">${personasHTML}</div>
    <div class="val-summary">📊 ${escapeHtml(data.summary)}</div>
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
        body: JSON.stringify({ message }),
        credentials: 'same-origin'
      });

      if (res.status === 403) {
        const err = await res.json().catch(() => ({}));
        const thinkingEl = document.querySelector(`[data-id="${thinkingId}"]`);
        if (thinkingEl) thinkingEl.remove();
        addChatMessage('ai', '⚡ ' + (err.detail || 'Daily free chat limit reached. Upgrade to Pro!'));
        return;
      }

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
    }
  } catch (e) {
    console.error('KP Update Error:', e);
  }
}

// Update Kimchi Premium (removed duplicate — already called in fetchMacroTicker)
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

/* ── Alpha Scanner ── */
async function fetchScanner() {
  try {
    const res = await fetch('/api/scanner');
    if (!res.ok) return;
    const data = await res.json();
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
        }[a.type] || a.type;

        const icon = a.type === 'PUMP_ALERT' ? '🚀' : a.type === 'OVERSOLD_BOUNCE' ? '🎯' : '💥';

        return `<div class="scanner-alert" style="border-left-color:${a.color};">
          <div class="scanner-alert-left">
            <span class="scanner-symbol">${icon} ${a.symbol}</span>
            <span class="scanner-type" style="color:${a.color};">${typeLabel}</span>
          </div>
          <div class="scanner-alert-right">
            <span class="scanner-msg">${a.msg}</span>
            <span class="scanner-change" style="color:${a.change >= 0 ? 'var(--neon-green)' : 'var(--neon-red)'}">${a.change >= 0 ? '+' : ''}${a.change}%</span>
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
    const res = await fetch('/api/regime');
    if (!res.ok) return;
    const data = await res.json();
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
    const res = await fetch('/api/correlation');
    if (!res.ok) return;
    const data = await res.json();
    const el = document.getElementById('corr-matrix');
    if (!el || !data.matrix) return;

    const assets = data.assets || Object.keys(data.matrix);
    let html = '<table class="corr-table"><thead><tr><th></th>';
    assets.forEach(a => html += `<th>${a}</th>`);
    html += '</tr></thead><tbody>';

    assets.forEach(row => {
      html += `<tr><td class="corr-label">${row}</td>`;
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
        html += `<td class="corr-cell" style="background:${bg};" title="${row}↔${col}: ${val}">${val}</td>`;
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
    const res = await fetch('/api/whale-wallets');
    if (!res.ok) return;
    const data = await res.json();
    const feed = document.getElementById('whale-wallet-feed');
    if (!feed) return;

    if (data.transactions && data.transactions.length > 0) {
      feed.innerHTML = data.transactions.map(tx => {
        const icon = tx.type === 'INFLOW' ? '📥' : '📤';
        const color = tx.type === 'INFLOW' ? 'var(--neon-green)' : 'var(--neon-red)';
        return `<div class="whale-tx-item">
          <span class="whale-tx-icon">${icon}</span>
          <span class="whale-tx-amount" style="color:${color}">${tx.btc.toFixed(2)} BTC</span>
          <span class="whale-tx-usd">≈ $${(tx.usd/1e6).toFixed(1)}M</span>
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
    const res = await fetch('/api/liq-zones');
    if (!res.ok) return;
    const data = await res.json();
    const el = document.getElementById('liq-zones');
    if (!el) return;

    if (data.current_price && data.zones) {
      const price = data.current_price;
      let html = `<div class="liq-current-price">BTC: $${price.toLocaleString()}</div>`;
      html += `<div class="liq-bias" style="color:${data.bias_color || '#888'};">${data.bias || ''}</div>`;
      html += '<div class="liq-bar-container">';

      data.zones.forEach(z => {
        const dist = ((z.price - price) / price * 100).toFixed(1);
        const isAbove = z.price > price;
        const barColor = isAbove ? 'var(--neon-red)' : 'var(--neon-green)';
        const width = Math.min(Math.abs(dist) * 3, 80);
        html += `<div class="liq-zone-row">
          <span class="liq-lev">${z.leverage}x</span>
          <div class="liq-bar-track">
            <div class="liq-bar-fill ${isAbove ? 'liq-short' : 'liq-long'}" style="width:${width}%;background:${barColor};"></div>
          </div>
          <span class="liq-price">$${z.price.toLocaleString()} <small>(${dist > 0 ? '+' : ''}${dist}%)</small></span>
        </div>`;
      });

      html += '</div>';
      el.innerHTML = html;
    }
  } catch (e) { console.error('LiqZones Error:', e); }
}

/* ── TradingView Chart Modal ── */
function initTradingViewModal() {
  const modal = document.getElementById('tv-modal');
  const closeBtn = document.getElementById('tv-modal-close');
  if (!modal || !closeBtn) return;

  closeBtn.addEventListener('click', () => {
    modal.style.display = 'none';
    document.getElementById('tv-chart-container').innerHTML = '';
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
      document.getElementById('tv-chart-container').innerHTML = '';
    }
  });

  // Attach click to price cards
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.price-card');
    if (!card) return;
    const symbol = card.querySelector('.coin-name')?.textContent?.trim();
    if (!symbol) return;
    openTradingViewChart(symbol);
  });
}

function openTradingViewChart(symbol) {
  const modal = document.getElementById('tv-modal');
  const title = document.getElementById('tv-modal-title');
  const container = document.getElementById('tv-chart-container');
  if (!modal || !container) return;

  const tvSymbol = `BINANCE:${symbol.toUpperCase()}USDT`;
  title.textContent = `${symbol}/USDT`;
  modal.style.display = 'flex';

  container.innerHTML = '';
  const widgetDiv = document.createElement('div');
  widgetDiv.id = 'tv-widget-' + Date.now();
  widgetDiv.style.height = '100%';
  container.appendChild(widgetDiv);

  new TradingView.widget({
    container_id: widgetDiv.id,
    autosize: true,
    symbol: tvSymbol,
    interval: '60',
    timezone: 'Asia/Seoul',
    theme: document.body.classList.contains('white-theme') ? 'light' : 'dark',
    style: '1',
    locale: _currentLang === 'ko' ? 'kr' : 'en',
    toolbar_bg: '#0a0e17',
    hide_side_toolbar: false,
    allow_symbol_change: true,
    save_image: false,
    studies: ['RSI@tv-basicstudies', 'MACD@tv-basicstudies']
  });
}

/* ── PWA Service Worker Registration ── */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => console.log('SW registered:', reg.scope))
      .catch(err => console.warn('SW registration failed:', err));
  }
}

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

let _refreshDebounce = false;
async function refreshAllData() {
  if (_refreshDebounce) return;
  _refreshDebounce = true;
  setTimeout(() => { _refreshDebounce = false; }, 5000);
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
    const results = await Promise.allSettled(promises);
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    // Trigger pulse indicators
    pulsePanels(['pulse-narratives', 'pulse-kimchi']);

    // Update last refresh time
    updateLastRefreshTime();

    if (failed > 0 && succeeded > 0) {
      showToast('warning', '⚠ Partial Refresh', `${succeeded}/${results.length} sources updated`);
    } else if (failed > 0 && succeeded === 0) {
      showToast('error', '⚠ Refresh Failed', 'Could not update data sources');
    }

    return results;
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
  fetch('/health')
    .then(r => {
      if (r.ok) statusDot.classList.remove('offline');
      else statusDot.classList.add('offline');
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

  // F11: Fullscreen (browser default, but we show toast)
  if (e.key === 'F11') {
    setTimeout(() => {
      const isFullscreen = !!document.fullscreenElement;
      if (isFullscreen) {
        showToast('success', '⛶ Fullscreen', 'Entered fullscreen mode (Press F11 to exit)');
      }
    }, 100);
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
    const res = await fetch('/api/council/history?limit=30');
    const data = await res.json();
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
      <span class="ch-record-time">${time}</span>
      <span class="ch-record-score" style="color:${scoreColor}">${r.consensus_score}</span>
      <span class="ch-record-vibe">${r.vibe_status || '—'}</span>
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
  ctx.strokeStyle = 'var(--neon-cyan, #0284c7)';
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

/* ═══════════════════════════════════════
   #3 Fear & Greed 30-Day Chart
   ═══════════════════════════════════════ */
async function fetchFearGreedChart() {
  try {
    const res = await fetch('/api/fear-greed');
    if (!res.ok) return;
    const data = await res.json();

    // Update score display
    const scoreEl = document.getElementById('fg-score-big');
    const labelEl = document.getElementById('fg-label-big');
    if (scoreEl && data.score !== undefined) {
      scoreEl.textContent = data.score;
      const c = data.score < 25 ? '#dc2626' : data.score < 45 ? '#f97316' : data.score < 55 ? '#eab308' : data.score < 75 ? '#06b6d4' : '#059669';
      scoreEl.style.color = c;
    }
    if (labelEl && data.label) {
      labelEl.textContent = data.label;
    }

    // Draw 30-day chart
    if (data.history && data.history.length > 0) {
      drawFGChart(data.history);
    }
  } catch (e) {
    console.error('[FG Chart]', e);
  }
}

function drawFGChart(history) {
  const canvas = document.getElementById('fg-canvas');
  if (!canvas || !history.length) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = 6;

  ctx.clearRect(0, 0, w, h);

  // Zone backgrounds
  const zoneColors = [
    { y: 0, h: 0.25, color: 'rgba(5,150,105,0.08)' },     // 75-100 Greed
    { y: 0.25, h: 0.2, color: 'rgba(6,182,212,0.06)' },    // 55-75
    { y: 0.45, h: 0.1, color: 'rgba(234,179,8,0.06)' },    // 45-55 Neutral
    { y: 0.55, h: 0.2, color: 'rgba(249,115,22,0.06)' },   // 25-45
    { y: 0.75, h: 0.25, color: 'rgba(220,38,38,0.08)' }    // 0-25 Fear
  ];
  zoneColors.forEach(z => {
    ctx.fillStyle = z.color;
    ctx.fillRect(pad, pad + z.y * (h - 2 * pad), w - 2 * pad, z.h * (h - 2 * pad));
  });

  // 50-line
  const mid = pad + (h - 2 * pad) * 0.5;
  ctx.strokeStyle = 'rgba(100,116,139,0.3)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(pad, mid);
  ctx.lineTo(w - pad, mid);
  ctx.stroke();
  ctx.setLineDash([]);

  const values = history.map(h => h.value);
  const step = (w - 2 * pad) / Math.max(values.length - 1, 1);

  // Gradient fill
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, 'rgba(5,150,105,0.25)');
  gradient.addColorStop(0.5, 'rgba(234,179,8,0.1)');
  gradient.addColorStop(1, 'rgba(220,38,38,0.25)');

  ctx.beginPath();
  ctx.moveTo(pad, h - pad);
  values.forEach((v, i) => {
    const x = pad + i * step;
    const y = pad + (h - 2 * pad) * (1 - v / 100);
    ctx.lineTo(x, y);
  });
  ctx.lineTo(pad + (values.length - 1) * step, h - pad);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Line
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = pad + i * step;
    const y = pad + (h - 2 * pad) * (1 - v / 100);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#eab308';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Dots — color by zone
  values.forEach((v, i) => {
    const x = pad + i * step;
    const y = pad + (h - 2 * pad) * (1 - v / 100);
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = v < 25 ? '#dc2626' : v < 45 ? '#f97316' : v < 55 ? '#eab308' : v < 75 ? '#06b6d4' : '#059669';
    ctx.fill();
  });

  // Last value label
  const last = values[values.length - 1];
  const lx = pad + (values.length - 1) * step;
  const ly = pad + (h - 2 * pad) * (1 - last / 100);
  ctx.font = 'bold 9px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'right';
  ctx.fillText(last, lx - 4, ly - 5);
}

/* ═══════════════════════════════════════
   #4 Multi-Timeframe Analysis
   ═══════════════════════════════════════ */
async function fetchMultiTimeframe() {
  try {
    const res = await fetch('/api/multi-timeframe');
    const data = await res.json();
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
    const res = await fetch('/api/onchain');
    const data = await res.json();
    renderOnChainData(data);
  } catch (e) {
    console.error('[OnChain]', e);
  }
}

function renderOnChainData(data) {
  // Open Interest
  const oiGrid = document.getElementById('oc-oi');
  if (oiGrid && data.open_interest && data.open_interest.length > 0) {
    oiGrid.innerHTML = data.open_interest.map(o => {
      const oiStr = o.oi_usd >= 1e9 ? `$${(o.oi_usd/1e9).toFixed(2)}B` : `$${(o.oi_usd/1e6).toFixed(0)}M`;
      return `<div class="oc-oi-item">
        <span class="oc-oi-sym">${o.symbol}</span>
        <span class="oc-oi-val">${oiStr}</span>
        <span class="oc-oi-coins" style="font-size:0.65rem;color:var(--text-muted);">${o.oi_coins.toLocaleString()} coins</span>
      </div>`;
    }).join('');
  }

  // Mempool fees
  if (data.mempool) {
    const fm = data.mempool;
    const elFast = document.getElementById('oc-fee-fast');
    const el30m = document.getElementById('oc-fee-30m');
    const el1h = document.getElementById('oc-fee-1h');
    const elEco = document.getElementById('oc-fee-eco');
    if (elFast) elFast.textContent = fm.fastest || '—';
    if (el30m) el30m.textContent = fm.half_hour || '—';
    if (el1h) el1h.textContent = fm.hour || '—';
    if (elEco) elEco.textContent = fm.economy || '—';
  }

  // Hashrate
  const hrEl = document.getElementById('oc-hashrate');
  if (hrEl && data.hashrate) {
    hrEl.textContent = `${data.hashrate.value} ${data.hashrate.unit}`;
  }
}

/* ═══════════════════════════════════════
   #11 Panel Drag & Drop Customization
   ═══════════════════════════════════════ */
function initPanelDragDrop() {
  const panels = ['panel-left', 'panel-center', 'panel-right'];

  panels.forEach(panelId => {
    const container = document.getElementById(panelId);
    if (!container || typeof Sortable === 'undefined') return;

    // Restore saved order
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
        if (childMap[key]) container.appendChild(childMap[key]);
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
    fg_chart: "Fear & Greed (30D)",
    mtf_analysis: "Multi-TF Analysis",
    kimchi_premium: "Kimchi Premium",
    econ_calendar: "Economic Calendar",
    realtime_prices: "Realtime Prices",
    long_short: "Long/Short Ratio",
    whale_alert: "Whale Alert",
    onchain_radar: "On-Chain Radar",
    live_wire: "Live Wire",
    ai_tracker: "AI Prediction Tracker",
    market_heatmap: "Market Heatmap (24h)",
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
    mempool_fees: "BTC Mempool Fees (sat/vB)",
    network_hashrate: "Network Hashrate",
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
    fg_chart: "공포 & 탐욕 (30일)",
    mtf_analysis: "멀티 타임프레임 분석",
    kimchi_premium: "김치 프리미엄",
    econ_calendar: "경제 캘린더",
    realtime_prices: "실시간 시세",
    long_short: "롱/숏 비율",
    whale_alert: "고래 알림",
    onchain_radar: "온체인 레이더",
    live_wire: "뉴스 피드",
    ai_tracker: "AI 예측 추적기",
    market_heatmap: "시장 히트맵 (24h)",
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
    mempool_fees: "BTC 멤풀 수수료 (sat/vB)",
    network_hashrate: "네트워크 해시레이트",
    sessions: "세션", hit_rate: "적중률", hits: "적중",
    strategic_narrative: "전략적 내러티브",
    rc_sentiment: "심리지수",
    rc_volatility: "변동성",
    rc_leverage: "레버리지",
    rc_funding: "펀딩비",
    rc_kimchi: "김프",
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
  if (ocSubs[1]) ocSubs[1].textContent = dict.mempool_fees || 'BTC Mempool Fees (sat/vB)';
  if (ocSubs[2]) ocSubs[2].textContent = dict.network_hashrate || 'Network Hashrate';

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
    { keys: ['F11'], label: _currentLang === 'ko' ? '전체화면' : 'Fullscreen' },
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
    fetch('/api/layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ panels }),
      credentials: 'same-origin'
    }).catch(() => {}); // silent fail
  }, 2000);
}

// On startup, try loading server layout (merge with local)
function _loadServerLayout() {
  fetch('/api/layout', { credentials: 'same-origin' })
    .then(r => r.json())
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
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, target_price, direction }),
        credentials: 'same-origin'
      });
      if (res.status === 403) {
        const err = await res.json().catch(() => ({}));
        showToast('warning', 'Limit Reached', err.detail || 'Free alert limit reached.');
        return;
      }
      if (!res.ok) throw new Error('Failed');
      showToast('success', 'Alert Set', `${symbol} ${direction} $${target_price.toLocaleString()}`);
      document.getElementById('alert-price').value = '';
      refreshAlertList();
    } catch (e) {
      showToast('error', 'Error', 'Could not create alert.');
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
    const res = await fetch('/api/alerts', { credentials: 'same-origin' });
    const data = await res.json();
    let html = '';
    if (data.triggered && data.triggered.length > 0) {
      data.triggered.slice(0, 3).forEach(a => {
        html += `<div style="color:var(--neon-yellow); margin-bottom:3px;">🔔 ${a.symbol} hit $${a.target_price.toLocaleString()} (${a.direction})</div>`;
      });
    }
    if (data.alerts && data.alerts.length > 0) {
      data.alerts.forEach(a => {
        html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
          <span style="color:var(--text-secondary);">${a.symbol} ${a.direction} $${a.target_price.toLocaleString()}</span>
          <button onclick="deleteAlert(${a.id})" style="background:none; border:none; color:var(--neon-red); cursor:pointer; font-size:0.7rem;">✕</button>
        </div>`;
      });
    } else if (!data.triggered || data.triggered.length === 0) {
      html = '<div style="color:var(--text-tertiary); font-style:italic;">No active alerts</div>';
    }
    list.innerHTML = html;
  } catch {
    list.innerHTML = '<div style="color:var(--text-tertiary);">—</div>';
  }
}

async function deleteAlert(id) {
  try {
    await fetch(`/api/alerts/${id}`, { method: 'DELETE', credentials: 'same-origin' });
    refreshAlertList();
  } catch {}
}
