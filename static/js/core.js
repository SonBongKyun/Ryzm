/* static/app.js - Ryzm Neural Network v3.2 */

// ── XSS Defense: HTML entity escaping for all external data ──
function escapeHtml(str) {
  if (typeof str !== 'string') return String(str ?? '');
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** safeUrl — only allow http/https URLs, reject javascript: etc. */
function safeUrl(url) {
  if (typeof url !== 'string') return '#';
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return '#';
}

/** safeColor — only allow hex, rgb/rgba, hsl/hsla, CSS variables */
function safeColor(str) {
  if (typeof str !== 'string') return 'var(--text-muted)';
  const s = str.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return s;
  if (/^(rgb|rgba|hsl|hsla)\(\s*[\d.,\s%]+\)$/i.test(s)) return s;
  if (/^var\(--.+\)$/i.test(s)) return s;
  return 'var(--text-muted)';
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
  if (slider) slider.value = 30;  // Match initial volume (30%)
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

/* ── 2. Data Feeds — Central Scheduler ── */

/**
 * RyzmScheduler: central polling manager with visibility-pause,
 * dedup (skip if running), and per-feed error backoff.
 */
const RyzmScheduler = (() => {
  const _jobs = new Map();       // name → {fn, interval, handle, running, fails, paused}
  let _visible = true;

  function register(name, intervalMs, fn) {
    _jobs.set(name, { fn, interval: intervalMs, handle: null, running: false, fails: 0, paused: false });
  }

  async function _exec(name) {
    const job = _jobs.get(name);
    if (!job || job.running) return;      // skip if still executing
    if (!_visible && job.interval < 300000) return; // skip non-critical when hidden
    job.running = true;
    try {
      await job.fn();
      job.fails = 0;                       // reset backoff on success
    } catch (e) {
      job.fails = Math.min(job.fails + 1, 5);
      console.warn(`[Scheduler] ${name} fail #${job.fails}:`, e.message || e);
    } finally {
      job.running = false;
    }
  }

  function startAll() {
    for (const [name, job] of _jobs) {
      _exec(name);                          // initial fire
      const id = setInterval(() => {
        // backoff: multiply interval by 2^fails (capped at 5)
        if (job.fails > 0) {
          const backoffMs = job.interval * Math.pow(2, job.fails);
          // Skip this tick if within backoff window
          if (backoffMs > job.interval * 2) return;
        }
        _exec(name);
      }, job.interval);
      job.handle = id;
      _intervals.push(id);
    }
  }

  function pauseAll() {
    _visible = false;
    for (const [, job] of _jobs) {
      if (job.handle !== null) { clearInterval(job.handle); job.handle = null; }
    }
  }

  function resumeAll() {
    _visible = true;
    // Immediate refresh on resume, then restart intervals
    for (const [name, job] of _jobs) {
      _exec(name);
      const id = setInterval(() => _exec(name), job.interval);
      job.handle = id;
      _intervals.push(id);
    }
  }

  /** Trigger all jobs immediately (for manual refresh button). Returns a Promise. */
  function triggerAll() {
    return Promise.allSettled([..._jobs.keys()].map(n => _exec(n)));
  }

  return { register, startAll, pauseAll, resumeAll, triggerAll };
})();

function initDataFeeds() {
  // Register all feeds: (name, intervalMs, fn)
  RyzmScheduler.register('macroTicker',   10000,  fetchMacroTicker);
  RyzmScheduler.register('news',          60000,  fetchNews);
  RyzmScheduler.register('realtimePrices',10000,  fetchRealtimePrices);
  RyzmScheduler.register('lsRatio',       60000,  fetchLongShortRatio);
  RyzmScheduler.register('briefing',     120000,  fetchBriefing);
  RyzmScheduler.register('fundingRate',   60000,  fetchFundingRate);
  RyzmScheduler.register('whaleFeed',     30000,  fetchWhaleFeed);
  RyzmScheduler.register('calendar',     300000,  fetchCalendar);
  RyzmScheduler.register('riskGauge',     60000,  fetchRiskGauge);
  RyzmScheduler.register('heatmap',       60000,  fetchHeatmap);
  RyzmScheduler.register('healthCheck',   30000,  fetchHealthCheck);
  RyzmScheduler.register('fearGreed',    300000,  fetchFearGreedChart);
  RyzmScheduler.register('multiTF',      300000,  fetchMultiTimeframe);
  RyzmScheduler.register('onChain',      300000,  fetchOnChainData);
  RyzmScheduler.register('scanner',       60000,  fetchScanner);
  RyzmScheduler.register('regime',       300000,  fetchRegime);
  RyzmScheduler.register('correlation',  600000,  fetchCorrelation);
  RyzmScheduler.register('whaleWallets', 120000,  fetchWhaleWallets);
  RyzmScheduler.register('liqZones',     120000,  fetchLiqZones);
  RyzmScheduler.register('kimchi',        60000,  fetchKimchi);

  // Non-scheduler init
  buildPriceCards();
  initBinanceWebSocket();
  fetchMuseumOfScars(); // static data, no polling needed

  // Start all intervals
  RyzmScheduler.startAll();
}
