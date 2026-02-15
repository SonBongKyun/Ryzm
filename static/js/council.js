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
          if (typeof openUpgradeModal === 'function') openUpgradeModal('council_limit');
          btnCouncil.innerHTML = '<i data-lucide="zap"></i> ' + t('re_run');
          btnCouncil.disabled = false;
          lucide.createIcons();
          refreshAllQuotas();
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
        if (typeof openUpgradeModal === 'function') openUpgradeModal('validator_limit');
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
        if (typeof openUpgradeModal === 'function') openUpgradeModal('chat_limit');
        refreshAllQuotas();
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

/* ── Quota Refresh (called after any 403) ── */
function refreshAllQuotas() {
  fetch('/api/me', { credentials: 'same-origin' })
    .then(r => r.json())
    .then(data => {
      if (!data || !data.usage) return;
      // Update validator credits
      if (data.usage.validate) {
        validatorCredits = data.usage.validate.remaining;
        MAX_FREE_VALIDATIONS_SERVER = data.usage.validate.limit;
      }
      updateCreditsDisplay();
    })
    .catch(() => {});
}

