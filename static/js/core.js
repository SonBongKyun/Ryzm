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

// Global state — credits loaded from server via /api/me
let validatorCredits = 0;

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

    // Generate a stable key: prefer data-panel-key attribute, fall back to id
    const key = panel.dataset.panelKey || panel.id || title.textContent.trim().replace(/\s+/g, '_').substring(0, 30);

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

/* ── Ryzm Custom Chart Tabs ── */

function initChartTabs() {
  const tabContainer = document.getElementById('chart-tabs');
  const intervalContainer = document.getElementById('chart-intervals');
  if (!tabContainer) return;

  // Create chart and load initial BTC
  setTimeout(() => {
    RyzmChart.create('ryzm-chart-container');
    RyzmChart.switchSymbol('BTCUSDT', '1h');
    startChartInfoBar();
  }, 200);

  // Symbol tab clicks
  tabContainer.addEventListener('click', (e) => {
    const tab = e.target.closest('.chart-tab');
    if (!tab) return;
    tabContainer.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    RyzmChart.switchSymbol(tab.dataset.binance);
    updateChartInfoBar();
    playSound('click');
  });

  // Interval button clicks
  if (intervalContainer) {
    intervalContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.interval-btn');
      if (!btn) return;
      intervalContainer.querySelectorAll('.interval-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      RyzmChart.switchInterval(btn.dataset.interval);
      playSound('click');
    });
  }

  // ── Chart Toolbar Event Handlers ──
  initChartToolbar();
}

function initChartToolbar() {
  const toolbar = document.getElementById('chart-toolbar');
  if (!toolbar) return;

  // Indicator toggles
  toolbar.querySelectorAll('.ind-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      RyzmChart.toggleIndicator(btn.dataset.ind);
      playSound('click');
    });
  });

  // Drawing tools
  toolbar.querySelectorAll('.draw-tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;
      if (tool === 'clear') {
        RyzmChart.clearAllDrawings();
      } else {
        RyzmChart.setDrawingMode(tool);
      }
      playSound('click');
    });
  });

  // Layout buttons
  toolbar.querySelectorAll('.layout-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      RyzmChart.setLayout(btn.dataset.layout);
      playSound('click');
    });
  });

  // AI Signals
  const signalsBtn = document.getElementById('btn-chart-signals');
  if (signalsBtn) {
    signalsBtn.addEventListener('click', () => {
      RyzmChart.loadCouncilSignals();
      playSound('click');
    });
  }

  // Journal on Chart
  const journalBtn = document.getElementById('btn-chart-journal');
  if (journalBtn) {
    journalBtn.addEventListener('click', () => {
      RyzmChart.loadJournalOnChart();
      playSound('click');
    });
  }

  // Snapshot
  const snapBtn = document.getElementById('btn-chart-snapshot');
  if (snapBtn) {
    snapBtn.addEventListener('click', () => {
      RyzmChart.shareSnapshot();
      playSound('click');
    });
  }

  // Comparison select
  const compSelect = document.getElementById('comp-select');
  if (compSelect) {
    compSelect.addEventListener('change', () => {
      const sym = compSelect.value;
      if (sym) {
        RyzmChart.enableComparison(sym);
      } else {
        RyzmChart.disableComparison();
      }
      playSound('click');
    });
  }

  // Chart Type toggle
  toolbar.querySelectorAll('.ctype-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      toolbar.querySelectorAll('.ctype-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      RyzmChart.setChartType(btn.dataset.ctype);
      playSound('click');
    });
  });

  // Fullscreen toggle
  const fsBtn = document.getElementById('btn-chart-fullscreen');
  if (fsBtn) {
    fsBtn.addEventListener('click', () => {
      const panel = document.getElementById('chart-panel');
      if (!panel) return;
      panel.classList.toggle('chart-fullscreen');
      // Trigger resize so chart re-fits
      setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
      playSound('click');
    });
    // ESC to exit fullscreen
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const panel = document.getElementById('chart-panel');
        if (panel && panel.classList.contains('chart-fullscreen')) {
          panel.classList.remove('chart-fullscreen');
          setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
        }
      }
    });
  }

  // Symbol Search
  initChartSymbolSearch();
}

/* ── Chart Symbol Search ── */
const _POPULAR_SYMBOLS = [
  { sym: 'DOGEUSDT', name: 'Dogecoin' },
  { sym: 'BNBUSDT', name: 'BNB' },
  { sym: 'ADAUSDT', name: 'Cardano' },
  { sym: 'AVAXUSDT', name: 'Avalanche' },
  { sym: 'DOTUSDT', name: 'Polkadot' },
  { sym: 'MATICUSDT', name: 'Polygon' },
  { sym: 'LINKUSDT', name: 'Chainlink' },
  { sym: 'SHIBUSDT', name: 'Shiba Inu' },
  { sym: 'LTCUSDT', name: 'Litecoin' },
  { sym: 'ATOMUSDT', name: 'Cosmos' },
  { sym: 'UNIUSDT', name: 'Uniswap' },
  { sym: 'APTUSDT', name: 'Aptos' },
  { sym: 'NEARUSDT', name: 'NEAR' },
  { sym: 'ARBUSDT', name: 'Arbitrum' },
  { sym: 'OPUSDT', name: 'Optimism' },
  { sym: 'SUIUSDT', name: 'Sui' },
  { sym: 'PEPEUSDT', name: 'Pepe' },
  { sym: 'WIFUSDT', name: 'dogwifhat' },
  { sym: 'AAVEUSDT', name: 'Aave' },
  { sym: 'TRXUSDT', name: 'Tron' },
];

function initChartSymbolSearch() {
  const addBtn = document.getElementById('chart-tab-add');
  const popup = document.getElementById('chart-symbol-search');
  const input = document.getElementById('css-input');
  const results = document.getElementById('css-results');
  if (!addBtn || !popup || !input || !results) return;

  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    popup.style.display = popup.style.display === 'none' ? 'block' : 'none';
    if (popup.style.display === 'block') {
      input.value = '';
      input.focus();
      renderSymbolResults('');
    }
  });

  // Close popup on outside click
  document.addEventListener('click', (e) => {
    if (!popup.contains(e.target) && e.target !== addBtn) {
      popup.style.display = 'none';
    }
  });

  input.addEventListener('input', () => renderSymbolResults(input.value.trim().toUpperCase()));

  function renderSymbolResults(q) {
    // Filter existing tabs
    const existing = new Set();
    document.querySelectorAll('.chart-tab[data-binance]').forEach(t => existing.add(t.dataset.binance));

    let filtered = _POPULAR_SYMBOLS.filter(s => !existing.has(s.sym));
    if (q) {
      filtered = filtered.filter(s => s.sym.includes(q) || s.name.toUpperCase().includes(q));
    }
    filtered = filtered.slice(0, 8);

    results.innerHTML = filtered.map(s => {
      const label = s.sym.replace('USDT', '');
      return `<div class="css-result-item" data-sym="${s.sym}" data-name="${label}/USDT">
        <span class="css-result-sym">${label}</span>
        <span class="css-result-name">${s.name}</span>
      </div>`;
    }).join('') || '<div style="padding:6px;color:var(--text-muted);font-size:0.55rem;">No results</div>';
  }

  results.addEventListener('click', (e) => {
    const item = e.target.closest('.css-result-item');
    if (!item) return;
    const sym = item.dataset.sym;
    const name = item.dataset.name;
    const label = sym.replace('USDT', '');

    // Add new tab
    const tabContainer = document.getElementById('chart-tabs');
    const btn = document.createElement('button');
    btn.className = 'chart-tab';
    btn.dataset.binance = sym;
    btn.dataset.name = name;
    btn.innerHTML = `<span class="tab-label">${escapeHtml(label)}</span><span class="tab-price"></span>`;
    tabContainer.insertBefore(btn, addBtn);

    // Switch to it
    tabContainer.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    RyzmChart.switchSymbol(sym);

    popup.style.display = 'none';
    playSound('click');
  });
}

/* ── Chart Info Bar (24h Ticker) ── */
let _cibInterval = null;
function startChartInfoBar() {
  updateChartInfoBar();
  if (_cibInterval) clearInterval(_cibInterval);
  _cibInterval = setInterval(updateChartInfoBar, 5000);
}

async function updateChartInfoBar() {
  const sym = (typeof RyzmChart !== 'undefined' && RyzmChart.currentSymbol) || 'BTCUSDT';
  try {
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${sym}`;
    const data = await extFetch(url, { timeoutMs: 5000, retries: 0 });
    if (!data) return;

    const price = parseFloat(data.lastPrice);
    const change = parseFloat(data.priceChangePercent);
    const high = parseFloat(data.highPrice);
    const low = parseFloat(data.lowPrice);
    const vol = parseFloat(data.quoteVolume);

    const priceEl = document.getElementById('cib-price');
    const changeEl = document.getElementById('cib-change');
    const highEl = document.getElementById('cib-high');
    const lowEl = document.getElementById('cib-low');
    const volEl = document.getElementById('cib-vol');

    if (priceEl) {
      priceEl.textContent = '$' + (price >= 1 ? price.toLocaleString('en-US', { maximumFractionDigits: 2 }) : price.toPrecision(4));
      priceEl.style.color = change >= 0 ? 'var(--neon-green)' : 'var(--neon-red)';
    }
    if (changeEl) {
      changeEl.textContent = (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
      changeEl.className = 'cib-change ' + (change >= 0 ? 'up' : 'down');
    }
    if (highEl) highEl.textContent = '$' + (high >= 1 ? high.toLocaleString('en-US', { maximumFractionDigits: 2 }) : high.toPrecision(4));
    if (lowEl) lowEl.textContent = '$' + (low >= 1 ? low.toLocaleString('en-US', { maximumFractionDigits: 2 }) : low.toPrecision(4));

    const _v = vol;
    if (volEl) volEl.textContent = _v >= 1e9 ? '$' + (_v/1e9).toFixed(1) + 'B' : _v >= 1e6 ? '$' + (_v/1e6).toFixed(1) + 'M' : '$' + (_v/1e3).toFixed(0) + 'K';

    // Range bar
    const rangeLo = document.getElementById('cib-range-lo');
    const rangeHi = document.getElementById('cib-range-hi');
    const rangeFill = document.getElementById('cib-range-fill');
    const rangeDot = document.getElementById('cib-range-dot');

    if (rangeLo) rangeLo.textContent = (low >= 1 ? low.toLocaleString('en-US', { maximumFractionDigits: 0 }) : low.toPrecision(3));
    if (rangeHi) rangeHi.textContent = (high >= 1 ? high.toLocaleString('en-US', { maximumFractionDigits: 0 }) : high.toPrecision(3));

    if (rangeFill && high > low) {
      const pct = Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100));
      rangeFill.style.width = pct + '%';
      if (rangeDot) rangeDot.style.left = pct + '%';
    }
  } catch (e) { /* silent */ }
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
      job._lastAttempt = 0;
      _exec(name);                          // initial fire
      const id = setInterval(() => {
        // backoff: exponential delay capped at 2^5 = 32x interval
        if (job.fails > 0) {
          const backoffMs = job.interval * Math.pow(2, Math.min(job.fails, 5));
          const elapsed = Date.now() - (job._lastAttempt || 0);
          if (elapsed < backoffMs) return;   // still within backoff window
        }
        job._lastAttempt = Date.now();
        _exec(name);
      }, job.interval);
      job.handle = id;
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
  RyzmScheduler.register('riskHistory',  600000,  fetchRiskHistory);
  RyzmScheduler.register('riskCorr',     600000,  _fetchCorrelationMatrix);

  // Non-scheduler init
  buildPriceCards();
  initBinanceWebSocket();
  fetchRealtimePrices(); // Immediate first fetch so prices show instantly
  fetchMuseumOfScars(); // static data, no polling needed

  // Start all intervals
  RyzmScheduler.startAll();
}
