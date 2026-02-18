/* ?�═??3. AI Council ??Multi-Framework Analysis Engine v6.0 ?�═??*/

/* ?�?� Framework Avatar SVGs ?�?� */
const _AGENT_AVATARS = {
  macro: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  onchain: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  technical: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>',
  synthesis: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18"/><path d="M3 12l4-4v8l-4-4z"/><path d="M21 12l-4-4v8l4-4z"/><circle cx="12" cy="3" r="1" fill="currentColor"/></svg>'
};
function _agentClass(name) {
  if (!name) return 'sys';
  const n = String(name).toLowerCase();
  if (n.includes('macro')) return 'macro';
  if (n.includes('onchain') || n.includes('on-chain')) return 'onchain';
  if (n.includes('technical')) return 'technical';
  if (n.includes('synthesis')) return 'synthesis';
  return 'sys';
}

/* ?�?� Loading Steps Controller ?�?� */
let _councilLoadTimers = [];
function showLoadingSteps() {
  const div = document.getElementById('council-steps');
  if (!div) return;
  div.style.display = 'flex';
  const steps = div.querySelectorAll('.cs-step');
  steps.forEach(s => { s.className = 'cs-step'; });
  _councilLoadTimers.forEach(t => clearTimeout(t));
  _councilLoadTimers = [];
  steps[0] && steps[0].classList.add('active');
  _councilLoadTimers.push(setTimeout(() => { steps[0] && steps[0].classList.replace('active', 'done'); steps[1] && steps[1].classList.add('active'); }, 1200));
  _councilLoadTimers.push(setTimeout(() => { steps[1] && steps[1].classList.replace('active', 'done'); steps[2] && steps[2].classList.add('active'); }, 2800));
  _councilLoadTimers.push(setTimeout(() => { steps[2] && steps[2].classList.replace('active', 'done'); steps[3] && steps[3].classList.add('active'); }, 4500));
}
function completeLoadingSteps() {
  _councilLoadTimers.forEach(t => clearTimeout(t));
  _councilLoadTimers = [];
  const div = document.getElementById('council-steps');
  if (!div) return;
  div.querySelectorAll('.cs-step').forEach(s => { s.className = 'cs-step done'; });
  setTimeout(() => { div.style.display = 'none'; }, 1500);
}
function hideLoadingSteps() {
  _councilLoadTimers.forEach(t => clearTimeout(t));
  _councilLoadTimers = [];
  const div = document.getElementById('council-steps');
  if (div) div.style.display = 'none';
}

/* ?�?� Consensus Gauge ?�?� */
function updateConsensusGauge(score) {
  const arc = document.getElementById('cg-value');
  const txt = document.getElementById('cg-score');
  const lbl = document.getElementById('cg-label');
  if (!arc || !txt) return;
  const pct = Math.max(0, Math.min(100, score));
  const arcLen = (pct / 100) * 157;
  arc.setAttribute('stroke-dasharray', `${arcLen} 157`);
  txt.textContent = score;
  if (lbl) {
    if (score > 60) { lbl.textContent = 'BULLISH'; lbl.setAttribute('fill', '#059669'); }
    else if (score < 40) { lbl.textContent = 'BEARISH'; lbl.setAttribute('fill', '#dc2626'); }
    else { lbl.textContent = 'NEUTRAL'; lbl.setAttribute('fill', 'var(--text-muted)'); }
  }
}

/* ?�?� Auto Analysis Status Bar ?�?� */
let _autoBarInterval = null;
function startAutoBar() {
  updateAutoBar();
  if (_autoBarInterval) clearInterval(_autoBarInterval);
  _autoBarInterval = setInterval(updateAutoBar, 60000);
}
function updateAutoBar() {
  apiFetch('/api/council/history?limit=10', { silent: true })
    .then(data => {
      if (!data || !data.records || !data.records.length) return;
      const lastRec = data.records[0];
      const lastEl = document.getElementById('cab-last');
      const nextEl = document.getElementById('cab-next');
      if (lastRec.timestamp && lastEl) {
        const ts = new Date(lastRec.timestamp.replace(' ', 'T') + 'Z');
        const ago = Math.floor((Date.now() - ts.getTime()) / 60000);
        lastEl.textContent = ago < 60 ? `Last: ${ago}m ago` : `Last: ${Math.floor(ago / 60)}h${ago % 60}m`;
        if (nextEl) {
          const nxt = Math.max(0, 60 - (ago % 60));
          nextEl.textContent = `Next: ~${nxt}m`;
        }
      }
      // Mini sparkline
      drawAutoSparkline(data.records.map(r => r.consensus_score || 50).reverse());
    })
    .catch(() => {});
}
function drawAutoSparkline(scores) {
  const c = document.getElementById('cab-spark');
  if (!c || !scores || scores.length < 2) return;
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);
  ctx.beginPath();
  scores.forEach((s, i) => {
    const x = (i / (scores.length - 1)) * W;
    const y = H - (s / 100) * H;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = 'rgba(163,126,58,0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

/* ?�═??setupEventListeners ?�═??*/
function setupEventListeners() {
  const btnCouncil = document.getElementById('btn-council-start');
  const btnCopy = document.getElementById('btn-copy-report');

  if (btnCouncil) {
    btnCouncil.addEventListener('click', async () => {
      playSound('click');
      const startTime = Date.now();

      // Show loading sequence
      showLoadingSteps();
      btnCouncil.innerHTML = '<i data-lucide="loader-2" class="spin"></i> ' + t('accessing');
      btnCouncil.disabled = true;

      const agentsGrid = document.getElementById('agents-grid');
      if (agentsGrid) {
        agentsGrid.innerHTML = `
          <div style="grid-column: span 4; text-align:center; padding:32px; color:var(--text-muted);">
            <i data-lucide="radio-tower" style="width:28px; height:28px; margin-bottom:8px; animation:pulse 1s infinite;"></i><br>
            ${t('summoning')}
          </div>`;
        lucide.createIcons();
      }

      try {
        const data = await apiFetch('/api/council');
        window._lastCouncilData = data;
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        completeLoadingSteps();
        renderCouncil(data);
        playSound('alert');

        btnCouncil.innerHTML = '<i data-lucide="zap"></i> ' + t('re_run');
        if (btnCopy) btnCopy.style.display = 'flex';
        const btnJournal = document.getElementById('btn-save-journal');
        if (btnJournal) btnJournal.style.display = 'flex';

        // Show last run info
        const lrDiv = document.getElementById('council-last-run');
        const lrTime = document.getElementById('clr-time');
        const lrDur = document.getElementById('clr-duration');
        if (lrDiv && lrTime && lrDur) {
          lrTime.textContent = new Date().toLocaleTimeString();
          lrDur.textContent = `${elapsed}s`;
          lrDiv.style.display = 'block';
        }

        setTimeout(() => fetchCouncilHistory(), 1500);
        setTimeout(() => updateAutoBar(), 2000);

      } catch (e) {
        hideLoadingSteps();
        if (e.status === 403) {
          showToast('warning', '\u26A1 Limit Reached', e.data?.detail || 'Daily free council uses exhausted. Upgrade to Pro!');
          btnCouncil.innerHTML = '<i data-lucide="zap"></i> ' + t('re_run');
          btnCouncil.disabled = false;
          lucide.createIcons();
          refreshAllQuotas();
          return;
        }
        console.error(e);
        if (agentsGrid) agentsGrid.innerHTML = '<div style="color:var(--neon-red); grid-column:span 4; text-align:center;">' + t('connection_failed') + '</div>';
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
      const scoreTxt = document.getElementById('cg-score');
      const vibeEl = document.getElementById('vibe-status');

      const score = scoreTxt ? scoreTxt.textContent : 'N/A';
      const vibe = vibeEl ? vibeEl.innerText : 'N/A';

      let debateLog = "";
      document.querySelectorAll('.agent-card').forEach(card => {
        const nameEl = card.querySelector('.ac-name');
        if (nameEl) {
          const name = nameEl.innerText;
          if (name !== 'SYSTEM') {
            const msg = card.querySelector('.ac-msg')?.innerText.replace(/"/g, '') || '';
            let icon = '\uD83E\uDD16';
            if (name.includes('Macro')) icon = '\uD83C\uDF10';
            if (name.includes('OnChain')) icon = '\u26D3\uFE0F';
            if (name.includes('Technical')) icon = '\uD83D\uDCC8';
            if (name.includes('Synthesis')) icon = '\u2696\uFE0F';
            debateLog += `${icon} **${name}**: ${msg}\n`;
          }
        }
      });

      const text = `\uD83D\uDEA8 **Ryzm Terminal Alert**\n\n` +
        `\uD83E\uDDE0 Vibe: ${vibe}\n` +
        `\uD83C\uDFAF Score: ${score}/100\n\n` +
        `**[Council Debate]**\n${debateLog}\n` +
        `#Bitcoin #Crypto #Ryzm`;

      navigator.clipboard.writeText(text).then(() => {
        const origin = btnCopy.innerHTML;
        btnCopy.innerHTML = '<i data-lucide="check"></i> COPIED!';
        setTimeout(() => { btnCopy.innerHTML = origin; lucide.createIcons(); }, 2000);
      });
    });
  }

  // Start auto bar on init
  startAutoBar();

  // Load auto-council cache to show initial state
  apiFetch('/api/council/auto', { silent: true })
    .then(data => {
      if (data && data.vibe && data.vibe.status !== 'OFFLINE' && data.vibe.status !== 'STANDBY') {
        renderCouncil(data);
      }
    })
    .catch(() => {});
}

/* ?�═??renderCouncil ?�═??*/
function renderCouncil(data) {
  // Vibe
  if (data.vibe) {
    _vibeFromCouncil = true;
    const vStat = document.getElementById('vibe-status');
    const vMsg = document.getElementById('vibe-message');
    if (vStat) {
      vStat.innerText = data.vibe.status;
      vStat.style.color = data.vibe.color;
      vStat.style.textShadow = `0 0 8px ${data.vibe.color}`;
    }
    if (vMsg) vMsg.innerText = `/// SYSTEM: ${data.vibe.message}`;
  }

  // Consensus Gauge (arc + score)
  const cscore = data.consensus_score || 50;
  updateConsensusGauge(cscore);
  // Backward compat hidden element
  const sHidden = document.getElementById('consensus-score');
  if (sHidden) sHidden.innerText = `SCORE: ${cscore}`;

  // Edge Panel
  const edgePanel = document.getElementById('edge-panel');
  if (edgePanel && data.edge) {
    const e = data.edge;
    // Bull/Bear bias bar
    const totalVotes = (e.bulls || 0) + (e.bears || 0);
    const bullPct = totalVotes > 0 ? ((e.bulls || 0) / totalVotes) * 100 : 50;
    const bearPct = 100 - bullPct;
    const bullFill = document.getElementById('ep-bull-fill');
    const bearFill = document.getElementById('ep-bear-fill');
    if (bullFill) bullFill.style.width = bullPct + '%';
    if (bearFill) bearFill.style.width = bearPct + '%';
    const bullCt = document.getElementById('ep-bull-ct');
    const bearCt = document.getElementById('ep-bear-ct');
    if (bullCt) bullCt.textContent = `${e.bulls || 0} BULL`;
    if (bearCt) bearCt.textContent = `${e.bears || 0} BEAR`;

    // Agreement ring
    const agreeArc = document.getElementById('ep-agree-arc');
    const agreeVal = document.getElementById('ep-agree-val');
    const agreement = e.agreement || 0;
    if (agreeArc) {
      const circumf = 2 * Math.PI * 16; // ~100.5
      agreeArc.setAttribute('stroke-dasharray', `${(agreement / 100) * circumf} ${circumf}`);
    }
    if (agreeVal) agreeVal.textContent = agreement + '%';

    // Prediction + Confidence badges
    const predBadge = document.getElementById('ep-pred');
    const confBadge = document.getElementById('ep-conf');
    const predLabel = data.prediction || '';
    const confLabel = data.confidence || '';
    if (predBadge) {
      predBadge.textContent = predLabel || '--';
      predBadge.className = 'ep-badge pred' + (predLabel === 'LONG' ? ' long' : predLabel === 'SHORT' ? ' short' : '');
    }
    if (confBadge) {
      confBadge.textContent = confLabel || '--';
      confBadge.className = 'ep-badge conf' + (confLabel === 'HIGH' ? ' high' : confLabel === 'MED' ? ' med' : ' low');
    }

    // Edge value
    const edgeNum = document.getElementById('ep-edge-num');
    if (edgeNum) {
      const sign = e.value > 0 ? '+' : '';
      edgeNum.textContent = `EDGE: ${sign}${e.value.toFixed(2)}`;
    }
    edgePanel.style.display = 'block';
  }

  // Narrative Radar Chart
  if (data.narratives && data.narratives.length >= 3) {
    renderRadarChart(data.narratives);
  }

  // Agent Cards (premium redesign)
  const grid = document.getElementById('agents-grid');
  if (grid) {
    grid.innerHTML = '';
    data.agents.forEach((agent, i) => {
      const isBull = agent.status.includes('BULL');
      const isBear = agent.status.includes('BEAR');
      const stanceClass = isBull ? 'bull' : isBear ? 'bear' : 'neutral';
      const agentKey = _agentClass(agent.name);
      const avatarSvg = _AGENT_AVATARS[agentKey] || _AGENT_AVATARS.macro;

      setTimeout(() => {
        const div = document.createElement('div');
        div.className = `agent-card speaking ${stanceClass}-card`;
        div.innerHTML = `
          <div class="ac-top">
            <div class="ac-avatar ${escapeHtml(agentKey)}">${avatarSvg}</div>
            <span class="ac-led ${stanceClass}"></span>
          </div>
          <div class="ac-name">${escapeHtml(agent.name)}</div>
          <div class="ac-stance ${stanceClass}">${escapeHtml(agent.status)}</div>
          <div class="ac-msg">"${escapeHtml(agent.message)}"</div>
        `;
        grid.appendChild(div);
        playSound('hover');
        setTimeout(() => div.classList.remove('speaking'), 600);
      }, i * 300);
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

/* ?�═??Narrative Radar Chart ?�═??*/
function renderRadarChart(narratives) {
  const canvas = document.getElementById('radar-canvas');
  const wrap = document.getElementById('narrative-radar');
  if (!canvas || !wrap || !narratives || narratives.length < 3) return;

  wrap.style.display = 'block';
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = 260 * dpr;
  canvas.height = 180 * dpr;
  ctx.scale(dpr, dpr);

  const W = 260, H = 180;
  const cx = W / 2, cy = H / 2 + 8;
  const R = Math.min(cx, cy) - 28;
  const n = narratives.length;

  ctx.clearRect(0, 0, W, H);

  // Grid rings
  for (let ring = 1; ring <= 4; ring++) {
    const r = (ring / 4) * R;
    ctx.beginPath();
    for (let j = 0; j <= n; j++) {
      const a = (Math.PI * 2 * j / n) - Math.PI / 2;
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(100,116,139,0.12)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  // Axis lines
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i / n) - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
    ctx.strokeStyle = 'rgba(100,116,139,0.08)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  // Data polygon
  ctx.beginPath();
  narratives.forEach((nd, i) => {
    const a = (Math.PI * 2 * i / n) - Math.PI / 2;
    const r = (nd.score / 100) * R;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.closePath();
  // Gradient fill
  const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  grd.addColorStop(0, 'rgba(163,126,58,0.2)');
  grd.addColorStop(1, 'rgba(219,39,119,0.08)');
  ctx.fillStyle = grd;
  ctx.fill();
  ctx.strokeStyle = 'rgba(163,126,58,0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Points + Labels
  narratives.forEach((nd, i) => {
    const a = (Math.PI * 2 * i / n) - Math.PI / 2;
    const r = (nd.score / 100) * R;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);

    // Glow
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    const ptColor = nd.trend === 'UP' ? '#059669' : nd.trend === 'DOWN' ? '#dc2626' : '#a37e3a';
    ctx.fillStyle = ptColor + '30';
    ctx.fill();
    // Dot
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = ptColor;
    ctx.fill();

    // Label
    const lx = cx + (R + 18) * Math.cos(a);
    const ly = cy + (R + 18) * Math.sin(a);
    ctx.fillStyle = 'rgba(100,116,139,0.7)';
    ctx.font = '8px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = nd.name.length > 9 ? nd.name.substring(0, 8) + '\u2026' : nd.name;
    ctx.fillText(label, lx, ly);

    // Score near point
    ctx.fillStyle = ptColor;
    ctx.font = 'bold 7px monospace';
    ctx.fillText(nd.score, x, y - 8);
  });
}

/* ?�?�?� Matrix Rain Effect (disabled ??canvas hidden, saves CPU/battery) ?�?�?� */
// Matrix rain is visually hidden via CSS (#matrix-bg { display: none; })
// No canvas rendering runs to save CPU and battery life.

/* ?�?�?� Snapshot Export ?�?�?� */
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

/* ?�?�?� Trade Validator ?�?�?� */
function initValidator() {
  const btnValidate = document.getElementById('btn-validate');
  if (!btnValidate) return;

  btnValidate.addEventListener('click', async () => {
    const symbol = document.getElementById('val-symbol').value.toUpperCase().trim();
    const price = parseFloat(document.getElementById('val-price').value);
    const position = document.getElementById('val-position').value;

    if (!symbol || !price || price <= 0) {
      showToast('warning', '??Invalid Input', 'Please fill all fields correctly!');
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
      const data = await apiFetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, entry_price: price, position })
      });

      // Refresh credits from server (server is source of truth)
      loadValidatorCredits();

      displayValidationResult(data);
      playSound('alert');
      showToast('success', '??Validation Complete', `Trade analyzed by 5 AI personas. Score: ${data.overall_score}/100`);

    } catch (e) {
      if (e.status === 403) {
        showToast('warning', '??Limit Reached', e.data?.detail || 'Daily free validations used up. Upgrade to Pro!');
        loadValidatorCredits();
        return;
      }
      console.error(e);
      resultDiv.innerHTML = '<div style="color:var(--neon-red); font-size:0.8rem;">??Validation Failed. Try again.</div>';
      resultDiv.style.display = 'block';
      showToast('error', '??Validation Failed', 'Please try again or contact support.');
    } finally {
      btnValidate.disabled = false;
      btnValidate.innerHTML = '<i data-lucide="zap"></i> VALIDATE TRADE';
      btnValidate.classList.remove('scanning');
      lucide.createIcons();
    }
  });
}

function loadValidatorCredits() {
  // Server is the single source of truth for credits
  apiFetch('/api/me', { silent: true })
    .then(data => {
      if (data && data.usage && data.usage.validate) {
        const vu = data.usage.validate;
        validatorCredits = vu.remaining;
        _serverCreditLimit = vu.limit;
      }
      updateCreditsDisplay();
    })
    .catch(() => {
      // Server unreachable ??display stale value, don't block
      updateCreditsDisplay();
    });
}

let _serverCreditLimit = 3;

// saveValidatorCredits removed ??server is the source of truth (PR-4)

function updateCreditsDisplay() {
  const creditsEl = document.getElementById('val-credits');
  if (creditsEl) {
    const limit = _serverCreditLimit;
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
    <div class="val-summary">?�� ${escapeHtml(data.summary)}</div>
  `;

  resultDiv.style.display = 'block';
  lucide.createIcons();
}

/* ?�?�?� Ask Ryzm Chat ?�?�?� */
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
      const data = await apiFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });

      // Remove thinking message
      const thinkingEl = document.querySelector(`[data-id="${thinkingId}"]`);
      if (thinkingEl) thinkingEl.remove();

      // Display AI response
      addChatMessage('ai', data.response, null, data.confidence);
      playSound('alert');

    } catch (e) {
      const thinkingEl = document.querySelector(`[data-id="${thinkingId}"]`);
      if (thinkingEl) thinkingEl.remove();
      if (e.status === 403) {
        addChatMessage('ai', '??' + (e.data?.detail || 'Daily free chat limit reached. Upgrade to Pro!'));
        refreshAllQuotas();
        return;
      }
      console.error(e);
      addChatMessage('ai', '??Connection lost. Try again.');
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

/* ?�?� Quota Refresh (called after any 403) ?�?� */
function refreshAllQuotas() {
  apiFetch('/api/me', { silent: true })
    .then(data => {
      if (!data || !data.usage) return;
      // Update validator credits
      if (data.usage.validate) {
        validatorCredits = data.usage.validate.remaining;
        // server limit (informational only)
        window.MAX_FREE_VALIDATIONS_SERVER = data.usage.validate.limit;
      }
      updateCreditsDisplay();
    })
    .catch(() => {});
}

