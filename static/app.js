/* static/app.js - Ryzm Neural Network v2.0 */

// Global state
let validatorCredits = 3;
const MAX_FREE_VALIDATIONS = 3;

document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initDataFeeds();
  setupEventListeners();
  initAudioEngine(); // 오디오 엔진 가동
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
  { title: "Cyber City (Synth)", url: "https://files.freemusicarchive.org/storage-freemusicarchive-org/music/no_curator/KieLoKaz/Free_Ganymed/KieLoKaz_-_01_-_Reunion_of_the_Spaceducks.mp3" },
  { title: "Night Drive", url: "https://files.freemusicarchive.org/storage-freemusicarchive-org/music/ccCommunity/Chad_Crouch/Arps/Chad_Crouch_-_Elips.mp3" }
];
let currentTrack = 0;
let bgmAudio = new Audio();
let isPlaying = false;

function initAudioEngine() {
  sfx.click.volume = 0.2;
  sfx.alert.volume = 0.3;
  sfx.hover.volume = 0.05;

  bgmAudio.src = playlist[0].url;
  bgmAudio.loop = true;
  bgmAudio.volume = 0.3;

  const btnPlay = document.getElementById('bgm-play');
  const slider = document.getElementById('bgm-volume');
  const trackName = document.getElementById('bgm-track-name');

  if (trackName) trackName.innerText = `READY: ${playlist[0].title}`;

  if (btnPlay) {
    btnPlay.addEventListener('click', () => {
      toggleBGM();
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
  } else {
    bgmAudio.play().catch(e => alert("Please interact with the page first!"));
    if (btnPlay) btnPlay.innerHTML = '<i data-lucide="pause" style="width:14px;height:14px;"></i>';
    if (trackName) {
      trackName.style.color = 'var(--neon-cyan)';
      trackName.style.textShadow = '0 0 5px var(--neon-cyan)';
    }
  }
  isPlaying = !isPlaying;
  lucide.createIcons();
}

function playSound(type) {
  if (sfx[type]) {
    sfx[type].currentTime = 0;
    sfx[type].play().catch(() => { });
  }
}

/* ── 1. 시계 ── */
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

/* ── 2. 데이터 피드 ── */
function initDataFeeds() {
  fetchMacroTicker();
  fetchNews();
  fetchRealtimePrices(); // NEW
  setInterval(fetchMacroTicker, 10000);
  setInterval(fetchNews, 60000);
  setInterval(fetchRealtimePrices, 5000); // Update every 5 seconds
}

async function fetchMacroTicker() {
  try {
    const res = await fetch('/api/market');
    const data = await res.json();
    const market = data.market;
    const container = document.getElementById('macro-ticker');

    if (!market || Object.keys(market).length === 0) return;

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
      feed.innerHTML = data.news.map(n => `
                <div style="padding:10px; border-bottom:1px solid rgba(255,255,255,0.05); transition: background 0.2s;" onmouseenter="this.style.background='rgba(255,255,255,0.05)'" onmouseleave="this.style.background='transparent'">
                    <div style="display:flex; justify-content:space-between; color:var(--text-muted); font-size:0.7rem; margin-bottom:4px;">
                        <span style="color:var(--neon-cyan);">${n.source}</span>
                        <span>${n.time}</span>
                    </div>
                    <a href="${n.link}" target="_blank" style="color:#fff; text-decoration:none; font-size:0.85rem; line-height:1.4; display:block;">${n.title}</a>
                </div>
            `).join('');
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
    ctx.fillStyle = "rgba(0, 0, 0, 0.05)"; // 잔상 효과
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
async function refreshAllData() {
  const promises = [
    fetch('/api/market').then(r => r.json()),
    fetch('/api/news').then(r => r.json()),
    fetch('/api/kimchi').then(r => r.json()),
    fetch('/api/fear-greed').then(r => r.json())
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
