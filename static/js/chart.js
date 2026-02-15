/* ═══════════════════════════════════════════════════════════
   Ryzm Terminal — Chart Engine v2.0
   TradingView Lightweight Charts + Binance Data Feed
   ═══════════════════════════════════════════════════════════
   Features:
   [1]  Bollinger Bands (BB 20,2)
   [2]  RSI Sub-chart (14)
   [3]  Indicator Toggle Menu (EMA/BB/RSI/MACD/Vol)
   [4]  AI Council Signal Markers
   [5]  Drawing Tools (horizontal line, trend line, fib)
   [6]  Multi-Chart Layout (1x1 / 2x2)
   [7]  Funding Rate Overlay
   [8]  Liquidation Heatmap Layer
   [9]  Snapshot + Share
   [10] Alert Price Lines
   [11] Order Book Depth Chart
   [12] Backtest / Journal Visualization
   [13] Symbol Comparison Mode
   ═══════════════════════════════════════════════════════════ */

const RyzmChart = (() => {
  'use strict';

  /* ═══════════════════════════════════════
     §0  STATE
     ═══════════════════════════════════════ */
  let _chart = null;
  let _candleSeries = null;
  let _volumeSeries = null;
  // EMA
  let _ema7 = null, _ema25 = null, _ema99 = null;
  // Bollinger Bands
  let _bbUpper = null, _bbMiddle = null, _bbLower = null;
  // Comparison overlay
  let _compSeries = null;
  let _compWs = null;
  let _compSymbol = null;
  // MACD (main pane overlay using histogram)
  let _macdHist = null, _macdLine = null, _macdSignal = null;

  // WebSocket
  let _ws = null;
  let _currentSymbol = 'BTCUSDT';
  let _currentInterval = '1h';
  let _klineData = [];
  let _legendEl = null;
  let _containerId = 'ryzm-chart-container';

  // Drawing state
  let _drawingMode = null;       // 'hline' | 'trendline' | 'fib' | null
  let _drawingPoints = [];       // temp points for current drawing
  let _drawnLines = [];          // persisted drawings [{type, points, line}]
  let _nextDrawId = 1;

  // Alert lines
  let _alertLines = {};          // alertId → priceLine

  // AI signal markers
  let _signalMarkers = [];

  // Indicator visibility
  let _indicators = {
    ema: true,
    bb: false,
    rsi: false,
    macd: false,
    vol: true,
    funding: false,
    liqmap: false,
    depth: false,
  };

  // Multi-chart
  let _layoutMode = '1x1';      // '1x1' | '2x2'
  let _subCharts = {};           // { slot: { chart, candle, ws, symbol } }

  // Live EMA state
  let _liveEma7 = null, _liveEma25 = null, _liveEma99 = null;

  // ── Constants ──
  const BINANCE_REST = 'https://api.binance.com/api/v3/klines';
  const BINANCE_WS   = 'wss://stream.binance.com:9443/ws';
  const INTERVALS = { '1m':'1m','5m':'5m','15m':'15m','1H':'1h','4H':'4h','1D':'1d','1W':'1w' };

  /* ═══════════════════════════════════════
     §1  THEME
     ═══════════════════════════════════════ */
  function getTheme() {
    const d = document.documentElement.getAttribute('data-theme') !== 'light';
    return d ? {
      bg:'rgba(5,8,18,0)', textColor:'rgba(140,160,190,0.65)',
      gridColor:'rgba(30,45,70,0.35)', crosshair:'rgba(6,182,212,0.35)',
      borderColor:'rgba(30,45,70,0.5)',
      upColor:'#06d6a0', downColor:'#ef476f', upWick:'#06d6a0', downWick:'#ef476f',
      volUp:'rgba(6,214,160,0.18)', volDown:'rgba(239,71,111,0.18)',
      ema7:'#06b6d4', ema25:'#f59e0b', ema99:'#a855f7',
      bbColor:'rgba(6,182,212,0.25)', bbFill:'rgba(6,182,212,0.04)',
      rsiColor:'#06b6d4', macdUp:'#06d6a0', macdDown:'#ef476f', macdLine:'#06b6d4', macdSignal:'#f59e0b',
      watermark:'rgba(6,182,212,0.06)',
      fundingUp:'rgba(6,214,160,0.55)', fundingDown:'rgba(239,71,111,0.55)',
      compColor:'#f59e0b',
      alertLine:'#f59e0b',
      liqLong:'rgba(6,214,160,0.35)', liqShort:'rgba(239,71,111,0.35)',
      depthBid:'rgba(6,214,160,0.3)', depthAsk:'rgba(239,71,111,0.3)',
    } : {
      bg:'rgba(250,250,252,0)', textColor:'rgba(70,80,100,0.65)',
      gridColor:'rgba(0,0,0,0.06)', crosshair:'rgba(6,100,150,0.25)',
      borderColor:'rgba(0,0,0,0.08)',
      upColor:'#059669', downColor:'#dc2626', upWick:'#059669', downWick:'#dc2626',
      volUp:'rgba(5,150,105,0.15)', volDown:'rgba(220,38,38,0.15)',
      ema7:'#0891b2', ema25:'#d97706', ema99:'#7c3aed',
      bbColor:'rgba(8,145,178,0.25)', bbFill:'rgba(8,145,178,0.04)',
      rsiColor:'#0891b2', macdUp:'#059669', macdDown:'#dc2626', macdLine:'#0891b2', macdSignal:'#d97706',
      watermark:'rgba(0,0,0,0.03)',
      fundingUp:'rgba(5,150,105,0.55)', fundingDown:'rgba(220,38,38,0.55)',
      compColor:'#d97706',
      alertLine:'#d97706',
      liqLong:'rgba(5,150,105,0.3)', liqShort:'rgba(220,38,38,0.3)',
      depthBid:'rgba(5,150,105,0.25)', depthAsk:'rgba(220,38,38,0.25)',
    };
  }

  /* ═══════════════════════════════════════
     §2  CREATE / DESTROY CHART
     ═══════════════════════════════════════ */
  function createChart(containerId) {
    _containerId = containerId || _containerId;
    const container = document.getElementById(_containerId);
    if (!container) return;
    if (_chart) { _chart.remove(); _chart = null; }

    const t = getTheme();
    _chart = LightweightCharts.createChart(container, {
      width: container.clientWidth, height: container.clientHeight,
      layout: {
        background: { type: 'solid', color: t.bg },
        textColor: t.textColor,
        fontFamily: "'Share Tech Mono','Fira Code',monospace",
        fontSize: 11,
      },
      grid: { vertLines: { color: t.gridColor }, horzLines: { color: t.gridColor } },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: { color: t.crosshair, width: 1, style: LightweightCharts.LineStyle.Dashed, labelBackgroundColor: 'rgba(6,182,212,0.9)' },
        horzLine: { color: t.crosshair, width: 1, style: LightweightCharts.LineStyle.Dashed, labelBackgroundColor: 'rgba(6,182,212,0.9)' },
      },
      rightPriceScale: { borderColor: t.borderColor, scaleMargins: { top: 0.08, bottom: 0.22 } },
      timeScale: { borderColor: t.borderColor, timeVisible: true, secondsVisible: false, barSpacing: 8 },
      watermark: { visible: true, fontSize: 42, horzAlign: 'center', vertAlign: 'center', color: t.watermark, text: 'RYZM' },
      handleScroll: { vertTouchDrag: false },
    });

    // ── Candlestick ──
    _candleSeries = _chart.addCandlestickSeries({
      upColor: t.upColor, downColor: t.downColor,
      wickUpColor: t.upWick, wickDownColor: t.downWick,
      borderVisible: false,
      priceFormat: { type: 'price', precision: getPrecision(_currentSymbol), minMove: getMinMove(_currentSymbol) },
    });

    // ── Volume ──
    _volumeSeries = _chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'volume' });
    _chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    if (!_indicators.vol) _volumeSeries.applyOptions({ visible: false });

    // ── EMA ──
    const emaOpts = (color, dash) => ({
      color, lineWidth: 1, lineStyle: dash ? LightweightCharts.LineStyle.Dashed : LightweightCharts.LineStyle.Solid,
      priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      visible: _indicators.ema,
    });
    _ema7  = _chart.addLineSeries(emaOpts(t.ema7, false));
    _ema25 = _chart.addLineSeries(emaOpts(t.ema25, false));
    _ema99 = _chart.addLineSeries(emaOpts(t.ema99, true));

    // ── Bollinger Bands ──
    const bbOpts = { color: t.bbColor, lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Solid,
      priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, visible: _indicators.bb };
    _bbUpper  = _chart.addLineSeries({ ...bbOpts });
    _bbMiddle = _chart.addLineSeries({ ...bbOpts, lineStyle: LightweightCharts.LineStyle.Dashed });
    _bbLower  = _chart.addLineSeries({ ...bbOpts });

    // ── MACD (on main pane as histogram) ──
    _macdHist = _chart.addHistogramSeries({
      priceScaleId: 'macd', priceFormat: { type: 'price', precision: 2 },
      visible: _indicators.macd,
    });
    _macdLine = _chart.addLineSeries({
      color: t.macdLine, lineWidth: 1, priceScaleId: 'macd',
      priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      visible: _indicators.macd,
    });
    _macdSignal = _chart.addLineSeries({
      color: t.macdSignal, lineWidth: 1, priceScaleId: 'macd', lineStyle: LightweightCharts.LineStyle.Dashed,
      priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      visible: _indicators.macd,
    });
    _chart.priceScale('macd').applyOptions({ scaleMargins: { top: 0.75, bottom: 0.02 }, visible: _indicators.macd });

    // ── Crosshair legend ──
    _legendEl = document.getElementById('ryzm-chart-legend');
    if (_legendEl) {
      _chart.subscribeCrosshairMove(param => {
        if (!param || !param.time || !param.seriesData) return;
        const candle = param.seriesData.get(_candleSeries);
        const vol = param.seriesData.get(_volumeSeries);
        if (candle) updateLegend(candle, vol);
      });
    }

    // ── Click handler for drawings ──
    _chart.subscribeClick(param => {
      if (!param.time || !param.point) return;
      const price = _candleSeries.coordinateToPrice(param.point.y);
      if (_drawingMode === 'hline') {
        addHorizontalLine(price);
        setDrawingMode(null);
      } else if (_drawingMode === 'trendline') {
        _drawingPoints.push({ time: param.time, price });
        if (_drawingPoints.length === 2) {
          addTrendLine(_drawingPoints[0], _drawingPoints[1]);
          _drawingPoints = [];
          setDrawingMode(null);
        }
      } else if (_drawingMode === 'fib') {
        _drawingPoints.push({ time: param.time, price });
        if (_drawingPoints.length === 2) {
          addFibonacci(_drawingPoints[0].price, _drawingPoints[1].price);
          _drawingPoints = [];
          setDrawingMode(null);
        }
      }
    });

    // ── Resize ──
    const ro = new ResizeObserver(() => {
      if (_chart) _chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
    });
    ro.observe(container);

    return _chart;
  }

  /* ═══════════════════════════════════════
     §3  LOAD HISTORICAL DATA
     ═══════════════════════════════════════ */
  async function loadKlines(symbol, interval, limit = 500) {
    const binInt = INTERVALS[interval] || interval;
    const url = `${BINANCE_REST}?symbol=${symbol}&interval=${binInt}&limit=${limit}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Binance ${res.status}`);
      const data = await res.json();
      _klineData = data;
      const t = getTheme();

      const candles = data.map(k => ({ time: Math.floor(k[0]/1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4] }));
      const volumes = data.map(k => ({ time: Math.floor(k[0]/1000), value: +k[5], color: +k[4] >= +k[1] ? t.volUp : t.volDown }));

      if (_candleSeries) _candleSeries.setData(candles);
      if (_volumeSeries) _volumeSeries.setData(volumes);

      const closes = candles.map(c => c.close);
      const times  = candles.map(c => c.time);

      // EMA
      if (_ema7)  _ema7.setData(calcEMA(closes, 7, times));
      if (_ema25) _ema25.setData(calcEMA(closes, 25, times));
      if (_ema99) _ema99.setData(calcEMA(closes, 99, times));

      // Bollinger Bands
      plotBB(closes, times);

      // MACD
      plotMACD(closes, times);

      // RSI (external pane)
      plotRSIExternal(closes, times);

      // Legend
      if (candles.length > 0) updateLegend(candles[candles.length-1], volumes[volumes.length-1]);

      // AI signal markers
      replotSignalMarkers();

      _chart.timeScale().fitContent();
    } catch (err) { console.error('[RyzmChart] loadKlines:', err); }
  }

  /* ═══════════════════════════════════════
     §4  WEBSOCKET REAL-TIME
     ═══════════════════════════════════════ */
  function connectWebSocket(symbol, interval) {
    disconnectWebSocket();
    const binInt = INTERVALS[interval] || interval;
    const wsUrl = `${BINANCE_WS}/${symbol.toLowerCase()}@kline_${binInt}`;
    try {
      _ws = new WebSocket(wsUrl);
      _ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data);
        if (!msg.k) return;
        const k = msg.k, t = getTheme();
        const candle = { time: Math.floor(k.t/1000), open: +k.o, high: +k.h, low: +k.l, close: +k.c };
        const vol = { time: Math.floor(k.t/1000), value: +k.v, color: candle.close >= candle.open ? t.volUp : t.volDown };

        if (_candleSeries) _candleSeries.update(candle);
        if (_volumeSeries) _volumeSeries.update(vol);
        updateEMALive(candle);
        updateLegend(candle, vol);
        updateTabPrice(symbol, candle.close, candle.close >= candle.open);
      };
      _ws.onerror = () => {};
      _ws.onclose = () => {};
    } catch (e) { console.error('[RyzmChart] WS:', e); }
  }

  function disconnectWebSocket() {
    if (_ws) { _ws.onmessage = null; _ws.close(); _ws = null; }
  }

  /* ═══════════════════════════════════════
     §5  INDICATOR CALCULATIONS
     ═══════════════════════════════════════ */

  // ── EMA ──
  function calcEMA(prices, period, times) {
    if (prices.length < period) return [];
    const k = 2 / (period + 1);
    let sum = 0;
    for (let i = 0; i < period; i++) sum += prices[i];
    let ema = sum / period;
    const r = [{ time: times[period-1], value: rd(ema) }];
    for (let i = period; i < prices.length; i++) {
      ema = prices[i] * k + ema * (1 - k);
      r.push({ time: times[i], value: rd(ema) });
    }
    return r;
  }

  function updateEMALive(candle) {
    const c = candle.close;
    if (_liveEma7 !== null) { _liveEma7 = c * (2/8) + _liveEma7 * (1 - 2/8); if (_ema7) _ema7.update({ time: candle.time, value: rd(_liveEma7) }); }
    if (_liveEma25 !== null) { _liveEma25 = c * (2/26) + _liveEma25 * (1 - 2/26); if (_ema25) _ema25.update({ time: candle.time, value: rd(_liveEma25) }); }
    if (_liveEma99 !== null) { _liveEma99 = c * (2/100) + _liveEma99 * (1 - 2/100); if (_ema99) _ema99.update({ time: candle.time, value: rd(_liveEma99) }); }
  }

  function initLiveEMA(closes) {
    const make = (p) => { const d = calcEMA(closes, p, closes.map((_,i)=>i)); return d.length ? d[d.length-1].value : null; };
    _liveEma7  = closes.length >= 7  ? make(7)  : null;
    _liveEma25 = closes.length >= 25 ? make(25) : null;
    _liveEma99 = closes.length >= 99 ? make(99) : null;
  }

  // ── Bollinger Bands (20, 2) ──
  function calcBB(prices, period, mult, times) {
    if (prices.length < period) return { upper: [], middle: [], lower: [] };
    const upper = [], middle = [], lower = [];
    for (let i = period - 1; i < prices.length; i++) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += prices[j];
      const sma = sum / period;
      let sq = 0;
      for (let j = i - period + 1; j <= i; j++) sq += (prices[j] - sma) ** 2;
      const std = Math.sqrt(sq / period);
      const t = times[i];
      upper.push({ time: t, value: rd(sma + mult * std) });
      middle.push({ time: t, value: rd(sma) });
      lower.push({ time: t, value: rd(sma - mult * std) });
    }
    return { upper, middle, lower };
  }

  function plotBB(closes, times) {
    const bb = calcBB(closes, 20, 2, times);
    if (_bbUpper) _bbUpper.setData(bb.upper);
    if (_bbMiddle) _bbMiddle.setData(bb.middle);
    if (_bbLower) _bbLower.setData(bb.lower);
  }

  // ── RSI (14) — rendered in external div ──
  function calcRSI(prices, period) {
    if (prices.length < period + 1) return [];
    const result = [];
    let gainSum = 0, lossSum = 0;
    for (let i = 1; i <= period; i++) {
      const d = prices[i] - prices[i-1];
      if (d > 0) gainSum += d; else lossSum += Math.abs(d);
    }
    let avgGain = gainSum / period, avgLoss = lossSum / period;
    result.push(avgLoss === 0 ? 100 : rd(100 - 100 / (1 + avgGain / avgLoss)));
    for (let i = period + 1; i < prices.length; i++) {
      const d = prices[i] - prices[i-1];
      avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
      avgLoss = (avgLoss * (period - 1) + (d < 0 ? Math.abs(d) : 0)) / period;
      result.push(avgLoss === 0 ? 100 : rd(100 - 100 / (1 + avgGain / avgLoss)));
    }
    return result;
  }

  let _rsiChart = null, _rsiSeries = null;
  function plotRSIExternal(closes, times) {
    const rsiContainer = document.getElementById('ryzm-rsi-container');
    if (!rsiContainer) return;
    rsiContainer.style.display = _indicators.rsi ? 'block' : 'none';
    if (!_indicators.rsi) { if (_rsiChart) { _rsiChart.remove(); _rsiChart = null; } return; }

    if (_rsiChart) { _rsiChart.remove(); _rsiChart = null; }
    const t = getTheme();
    _rsiChart = LightweightCharts.createChart(rsiContainer, {
      width: rsiContainer.clientWidth, height: rsiContainer.clientHeight || 80,
      layout: { background: { type: 'solid', color: t.bg }, textColor: t.textColor, fontFamily: "'Share Tech Mono',monospace", fontSize: 10 },
      grid: { vertLines: { color: t.gridColor }, horzLines: { color: t.gridColor } },
      rightPriceScale: { borderColor: t.borderColor, scaleMargins: { top: 0.05, bottom: 0.05 } },
      timeScale: { visible: false },
      crosshair: { vertLine: { visible: false }, horzLine: { color: t.crosshair, labelBackgroundColor: 'rgba(6,182,212,0.9)' } },
      handleScroll: false, handleScale: false,
    });

    // 70/30 reference lines
    const lineOpts = (clr) => ({ color: clr, lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted,
      priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    const rsi70 = _rsiChart.addLineSeries(lineOpts('rgba(239,71,111,0.3)'));
    const rsi30 = _rsiChart.addLineSeries(lineOpts('rgba(6,214,160,0.3)'));
    _rsiSeries = _rsiChart.addLineSeries({ color: t.rsiColor, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false });

    const rsiVals = calcRSI(closes, 14);
    const offset = closes.length - rsiVals.length;
    const rsiData = rsiVals.map((v, i) => ({ time: times[i + offset], value: v }));

    rsi70.setData(rsiData.map(d => ({ time: d.time, value: 70 })));
    rsi30.setData(rsiData.map(d => ({ time: d.time, value: 30 })));
    _rsiSeries.setData(rsiData);

    // Sync time scales
    if (_chart) {
      _chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range && _rsiChart) _rsiChart.timeScale().setVisibleLogicalRange(range);
      });
    }

    const ro = new ResizeObserver(() => { if (_rsiChart) _rsiChart.applyOptions({ width: rsiContainer.clientWidth }); });
    ro.observe(rsiContainer);
  }

  // ── MACD (12, 26, 9) ──
  function calcMACD(prices, fast, slow, signal) {
    const emaFast = calcEMA(prices, fast, prices.map((_,i) => i));
    const emaSlow = calcEMA(prices, slow, prices.map((_,i) => i));
    if (emaFast.length === 0 || emaSlow.length === 0) return { macd: [], signal: [] };

    const off = slow - fast;
    const macdLine = [];
    for (let i = 0; i < emaSlow.length; i++) {
      macdLine.push(emaFast[i + off].value - emaSlow[i].value);
    }
    const sigLine = [];
    if (macdLine.length >= signal) {
      const k = 2 / (signal + 1);
      let s = macdLine.slice(0, signal).reduce((a,b) => a + b, 0) / signal;
      sigLine.push(s);
      for (let i = signal; i < macdLine.length; i++) { s = macdLine[i] * k + s * (1 - k); sigLine.push(s); }
    }
    return { macd: macdLine, signal: sigLine };
  }

  function plotMACD(closes, times) {
    const { macd, signal } = calcMACD(closes, 12, 26, 9);
    if (macd.length === 0) return;
    const t = getTheme();
    const dataOff = closes.length - macd.length;
    const sigOff = macd.length - signal.length;

    const histData = signal.map((s, i) => {
      const m = macd[i + sigOff];
      const h = m - s;
      return { time: times[i + sigOff + dataOff], value: rd(h), color: h >= 0 ? t.macdUp : t.macdDown };
    });
    const macdData = macd.map((v, i) => ({ time: times[i + dataOff], value: rd(v) }));
    const sigData = signal.map((v, i) => ({ time: times[i + sigOff + dataOff], value: rd(v) }));

    if (_macdHist) _macdHist.setData(histData);
    if (_macdLine) _macdLine.setData(macdData);
    if (_macdSignal) _macdSignal.setData(sigData);
  }

  /* ═══════════════════════════════════════
     §6  INDICATOR TOGGLE
     ═══════════════════════════════════════ */
  function toggleIndicator(name) {
    _indicators[name] = !_indicators[name];
    const v = _indicators[name];

    switch (name) {
      case 'ema':
        [_ema7, _ema25, _ema99].forEach(s => { if (s) s.applyOptions({ visible: v }); });
        break;
      case 'bb':
        [_bbUpper, _bbMiddle, _bbLower].forEach(s => { if (s) s.applyOptions({ visible: v }); });
        break;
      case 'vol':
        if (_volumeSeries) _volumeSeries.applyOptions({ visible: v });
        break;
      case 'macd':
        [_macdHist, _macdLine, _macdSignal].forEach(s => { if (s) s.applyOptions({ visible: v }); });
        if (_chart) _chart.priceScale('macd').applyOptions({ visible: v });
        break;
      case 'rsi':
        if (_klineData.length > 0) {
          const closes = _klineData.map(k => +k[4]);
          const times = _klineData.map(k => Math.floor(k[0]/1000));
          plotRSIExternal(closes, times);
        }
        break;
      case 'funding':
        if (v) fetchFundingOverlay(); else clearFundingOverlay();
        break;
      case 'liqmap':
        if (v) fetchLiqOverlay(); else clearLiqOverlay();
        break;
      case 'depth':
        if (v) fetchDepthChart(); else clearDepthChart();
        break;
    }

    // Update toggle button styles
    const btn = document.querySelector(`.ind-toggle[data-ind="${name}"]`);
    if (btn) btn.classList.toggle('active', v);
  }

  function getIndicators() { return { ..._indicators }; }

  /* ═══════════════════════════════════════
     §7  DRAWING TOOLS
     ═══════════════════════════════════════ */
  function setDrawingMode(mode) {
    _drawingMode = mode;
    _drawingPoints = [];
    const container = document.getElementById(_containerId);
    if (container) container.style.cursor = mode ? 'crosshair' : 'default';
    document.querySelectorAll('.draw-tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === mode));
  }

  function addHorizontalLine(price, opts = {}) {
    if (!_candleSeries) return;
    const id = _nextDrawId++;
    const color = opts.color || 'rgba(6,182,212,0.7)';
    const line = _candleSeries.createPriceLine({
      price, color, lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dashed,
      axisLabelVisible: true,
      title: opts.title || `$${fmtPrice(price)}`,
    });
    _drawnLines.push({ id, type: 'hline', price, line });
    return id;
  }

  function addTrendLine(p1, p2) {
    if (!_chart) return;
    const series = _chart.addLineSeries({
      color: 'rgba(6,182,212,0.6)', lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.LargeDashed,
      priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
    });
    series.setData([
      { time: p1.time, value: rd(p1.price) },
      { time: p2.time, value: rd(p2.price) },
    ]);
    const id = _nextDrawId++;
    _drawnLines.push({ id, type: 'trendline', series });
    return id;
  }

  function addFibonacci(highPrice, lowPrice) {
    if (!_candleSeries) return;
    const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
    const colors = ['#ef476f','#f59e0b','#06b6d4','#a855f7','#06d6a0','#f59e0b','#ef476f'];
    const diff = highPrice - lowPrice;
    const lines = levels.map((lvl, i) => {
      const price = highPrice - diff * lvl;
      return _candleSeries.createPriceLine({
        price, color: colors[i], lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dotted,
        axisLabelVisible: true,
        title: `${(lvl * 100).toFixed(1)}%`,
      });
    });
    const id = _nextDrawId++;
    _drawnLines.push({ id, type: 'fib', lines });
    return id;
  }

  function clearAllDrawings() {
    _drawnLines.forEach(d => {
      if (d.type === 'hline' && d.line) try { _candleSeries.removePriceLine(d.line); } catch {}
      if (d.type === 'trendline' && d.series) try { _chart.removeSeries(d.series); } catch {}
      if (d.type === 'fib' && d.lines) d.lines.forEach(l => { try { _candleSeries.removePriceLine(l); } catch {} });
    });
    _drawnLines = [];
    _nextDrawId = 1;
  }

  /* ═══════════════════════════════════════
     §8  AI SIGNAL MARKERS
     ═══════════════════════════════════════ */
  function addSignalMarker(time, position, text, color) {
    _signalMarkers.push({
      time, position: position === 'LONG' ? 'belowBar' : 'aboveBar',
      shape: position === 'LONG' ? 'arrowUp' : 'arrowDown',
      color: color || (position === 'LONG' ? '#06d6a0' : '#ef476f'),
      text: text || position, size: 2,
    });
    replotSignalMarkers();
  }

  function replotSignalMarkers() {
    if (_candleSeries && _signalMarkers.length > 0) {
      _candleSeries.setMarkers([..._signalMarkers].sort((a, b) => a.time - b.time));
    }
  }

  function clearSignalMarkers() {
    _signalMarkers = [];
    if (_candleSeries) _candleSeries.setMarkers([]);
  }

  async function loadCouncilSignals() {
    try {
      const res = await fetch('/api/council/history?limit=20', { credentials: 'same-origin' });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.history) return;
      _signalMarkers = [];
      data.history.forEach(h => {
        if (!h.timestamp || !h.edge_score) return;
        const ts = Math.floor(new Date(h.timestamp).getTime() / 1000);
        const pos = h.edge_score >= 60 ? 'LONG' : h.edge_score <= 40 ? 'SHORT' : null;
        if (pos) {
          _signalMarkers.push({
            time: ts,
            position: pos === 'LONG' ? 'belowBar' : 'aboveBar',
            shape: pos === 'LONG' ? 'arrowUp' : 'arrowDown',
            color: pos === 'LONG' ? '#06d6a0' : '#ef476f',
            text: `AI ${h.edge_score}`, size: 2,
          });
        }
      });
      replotSignalMarkers();
    } catch (e) { console.warn('[RyzmChart] Council signals:', e); }
  }

  /* ═══════════════════════════════════════
     §9  ALERT PRICE LINES
     ═══════════════════════════════════════ */
  function syncAlertLines() {
    Object.values(_alertLines).forEach(l => { try { _candleSeries.removePriceLine(l); } catch {} });
    _alertLines = {};
    fetch('/api/alerts', { credentials: 'same-origin' })
      .then(r => r.json())
      .then(data => {
        if (!data.alerts || !_candleSeries) return;
        const t = getTheme();
        data.alerts.forEach(a => {
          const sym = (a.symbol || '').toUpperCase();
          if (_currentSymbol.includes(sym)) {
            const line = _candleSeries.createPriceLine({
              price: +a.target_price, color: t.alertLine, lineWidth: 1,
              lineStyle: LightweightCharts.LineStyle.SparseDotted,
              axisLabelVisible: true,
              title: `⚡ ${a.direction} $${Number(a.target_price).toLocaleString()}`,
            });
            _alertLines[a.id] = line;
          }
        });
      }).catch(() => {});
  }

  /* ═══════════════════════════════════════
     §10  FUNDING RATE OVERLAY
     ═══════════════════════════════════════ */
  let _fundingSeries = null;

  async function fetchFundingOverlay() {
    if (!_chart) return;
    clearFundingOverlay();
    try {
      const res = await fetch(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${_currentSymbol}&limit=100`);
      if (!res.ok) return;
      const data = await res.json();
      const t = getTheme();
      _fundingSeries = _chart.addHistogramSeries({ priceScaleId: 'funding', priceFormat: { type: 'price', precision: 4 } });
      _chart.priceScale('funding').applyOptions({ scaleMargins: { top: 0.92, bottom: 0 }, visible: false });
      _fundingSeries.setData(data.map(d => ({
        time: Math.floor(d.fundingTime / 1000),
        value: +d.fundingRate * 100,
        color: +d.fundingRate >= 0 ? t.fundingUp : t.fundingDown,
      })));
    } catch (e) { console.warn('[RyzmChart] Funding:', e); }
  }

  function clearFundingOverlay() {
    if (_fundingSeries && _chart) { try { _chart.removeSeries(_fundingSeries); } catch {} _fundingSeries = null; }
  }

  /* ═══════════════════════════════════════
     §11  LIQUIDATION HEATMAP OVERLAY
     ═══════════════════════════════════════ */
  let _liqLines = [];

  async function fetchLiqOverlay() {
    clearLiqOverlay();
    try {
      const res = await fetch('/api/liq-zones');
      if (!res.ok) return;
      const data = await res.json();
      if (!data.zones || !_candleSeries) return;
      const t = getTheme();
      data.zones.forEach(z => {
        _liqLines.push(_candleSeries.createPriceLine({
          price: z.long_liq_price, color: t.liqLong, lineWidth: 2,
          lineStyle: LightweightCharts.LineStyle.Dotted, axisLabelVisible: true,
          title: `Liq ${z.leverage} L`,
        }));
        _liqLines.push(_candleSeries.createPriceLine({
          price: z.short_liq_price, color: t.liqShort, lineWidth: 2,
          lineStyle: LightweightCharts.LineStyle.Dotted, axisLabelVisible: true,
          title: `Liq ${z.leverage} S`,
        }));
      });
    } catch (e) { console.warn('[RyzmChart] Liq:', e); }
  }

  function clearLiqOverlay() {
    _liqLines.forEach(l => { try { _candleSeries.removePriceLine(l); } catch {} });
    _liqLines = [];
  }

  /* ═══════════════════════════════════════
     §12  ORDER BOOK DEPTH CHART
     ═══════════════════════════════════════ */
  let _depthChart = null;

  async function fetchDepthChart() {
    clearDepthChart();
    const container = document.getElementById('ryzm-depth-container');
    if (!container) return;
    container.style.display = 'block';
    try {
      const res = await fetch(`https://api.binance.com/api/v3/depth?symbol=${_currentSymbol}&limit=50`);
      if (!res.ok) return;
      const data = await res.json();
      const t = getTheme();

      _depthChart = LightweightCharts.createChart(container, {
        width: container.clientWidth, height: container.clientHeight || 100,
        layout: { background: { type: 'solid', color: t.bg }, textColor: t.textColor, fontFamily: "'Share Tech Mono',monospace", fontSize: 10 },
        grid: { vertLines: { visible: false }, horzLines: { color: t.gridColor } },
        rightPriceScale: { visible: false },
        leftPriceScale: { visible: true, borderColor: t.borderColor },
        timeScale: { visible: false },
        handleScroll: false, handleScale: false,
      });

      const bidArea = _depthChart.addAreaSeries({
        topColor: t.depthBid, bottomColor: 'transparent', lineColor: t.depthBid,
        lineWidth: 1, priceScaleId: 'left', priceLineVisible: false, lastValueVisible: false,
      });
      const askArea = _depthChart.addAreaSeries({
        topColor: t.depthAsk, bottomColor: 'transparent', lineColor: t.depthAsk,
        lineWidth: 1, priceScaleId: 'left', priceLineVisible: false, lastValueVisible: false,
      });

      let cumBid = 0;
      const bids = data.bids.reverse().map((b, i) => { cumBid += +b[1]; return { time: i + 1, value: cumBid }; });
      let cumAsk = 0;
      const asks = data.asks.map((a, i) => { cumAsk += +a[1]; return { time: i + 1 + bids.length, value: cumAsk }; });

      bidArea.setData(bids);
      askArea.setData(asks);
      _depthChart.timeScale().fitContent();

      const ro = new ResizeObserver(() => { if (_depthChart) _depthChart.applyOptions({ width: container.clientWidth }); });
      ro.observe(container);
    } catch (e) { console.warn('[RyzmChart] Depth:', e); }
  }

  function clearDepthChart() {
    const c = document.getElementById('ryzm-depth-container');
    if (c) c.style.display = 'none';
    if (_depthChart) { _depthChart.remove(); _depthChart = null; }
  }

  /* ═══════════════════════════════════════
     §13  SNAPSHOT + SHARE
     ═══════════════════════════════════════ */
  async function takeSnapshot() {
    const container = document.getElementById(_containerId);
    if (!container || typeof html2canvas === 'undefined') return null;
    try {
      const canvas = await html2canvas(container, { backgroundColor: null, scale: 2, useCORS: true });
      const ctx = canvas.getContext('2d');
      ctx.font = 'bold 14px Share Tech Mono';
      ctx.fillStyle = 'rgba(6,182,212,0.6)';
      ctx.textAlign = 'right';
      ctx.fillText('Ryzm Terminal', canvas.width - 20, canvas.height - 15);
      ctx.fillText(`${_currentSymbol.replace('USDT','/USDT')} | ${_currentInterval}`, canvas.width - 20, canvas.height - 35);
      return canvas.toDataURL('image/png');
    } catch (e) { console.error('[RyzmChart] Snapshot:', e); return null; }
  }

  async function shareSnapshot() {
    const dataUrl = await takeSnapshot();
    if (!dataUrl) return;
    if (navigator.share && navigator.canShare) {
      try {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], `ryzm-${_currentSymbol}-${Date.now()}.png`, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ title: `Ryzm Terminal — ${_currentSymbol.replace('USDT','/USDT')}`, files: [file] });
          return;
        }
      } catch {}
    }
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `ryzm-${_currentSymbol}-${_currentInterval}-${Date.now()}.png`;
    link.click();
  }

  /* ═══════════════════════════════════════
     §14  JOURNAL / BACKTEST VISUALIZATION
     ═══════════════════════════════════════ */
  async function loadJournalOnChart() {
    try {
      const res = await fetch('/api/journal?limit=50', { credentials: 'same-origin' });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.entries || !_candleSeries) return;
      const markers = [];
      data.entries.forEach(entry => {
        if (!entry.created_at) return;
        const ts = Math.floor(new Date(entry.created_at).getTime() / 1000);
        markers.push({
          time: ts,
          position: entry.position_type === 'LONG' ? 'belowBar' : 'aboveBar',
          shape: entry.position_type === 'LONG' ? 'arrowUp' : 'arrowDown',
          color: entry.outcome === 'WIN' ? '#06d6a0' : entry.outcome === 'LOSS' ? '#ef476f' : '#f59e0b',
          text: `${entry.position_type || '?'} ${entry.outcome || ''}`, size: 1,
        });
        if (entry.stop_loss) {
          try { _candleSeries.createPriceLine({ price: +entry.stop_loss, color: 'rgba(239,71,111,0.5)', lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dotted, axisLabelVisible: false, title: `SL` }); } catch {}
        }
        if (entry.take_profit) {
          try { _candleSeries.createPriceLine({ price: +entry.take_profit, color: 'rgba(6,214,160,0.5)', lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dotted, axisLabelVisible: false, title: `TP` }); } catch {}
        }
      });
      const combined = [..._signalMarkers, ...markers].sort((a, b) => a.time - b.time);
      _candleSeries.setMarkers(combined);
    } catch (e) { console.warn('[RyzmChart] Journal:', e); }
  }

  /* ═══════════════════════════════════════
     §15  SYMBOL COMPARISON MODE
     ═══════════════════════════════════════ */
  async function enableComparison(symbol2) {
    disableComparison();
    _compSymbol = symbol2;
    const t = getTheme();
    _compSeries = _chart.addLineSeries({
      color: t.compColor, lineWidth: 2, priceScaleId: 'comp',
      priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: true,
      title: symbol2.replace('USDT', ''),
    });
    _chart.priceScale('comp').applyOptions({ scaleMargins: { top: 0.08, bottom: 0.22 } });

    try {
      const binInt = INTERVALS[_currentInterval] || _currentInterval;
      const res = await fetch(`${BINANCE_REST}?symbol=${symbol2}&interval=${binInt}&limit=500`);
      const data = await res.json();
      _compSeries.setData(data.map(k => ({ time: Math.floor(k[0]/1000), value: +k[4] })));

      _compWs = new WebSocket(`${BINANCE_WS}/${symbol2.toLowerCase()}@kline_${binInt}`);
      _compWs.onmessage = (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.k && _compSeries) _compSeries.update({ time: Math.floor(msg.k.t/1000), value: +msg.k.c });
      };
    } catch (e) { console.warn('[RyzmChart] Comparison:', e); }
  }

  function disableComparison() {
    if (_compSeries && _chart) { try { _chart.removeSeries(_compSeries); } catch {} _compSeries = null; }
    if (_compWs) { _compWs.onmessage = null; _compWs.close(); _compWs = null; }
    _compSymbol = null;
  }

  /* ═══════════════════════════════════════
     §16  MULTI-CHART LAYOUT
     ═══════════════════════════════════════ */
  function setLayout(mode) {
    _layoutMode = mode;
    const wrapper = document.getElementById('chart-layout-wrapper');
    if (!wrapper) return;

    // Destroy sub-charts
    Object.values(_subCharts).forEach(sc => { if (sc.ws) sc.ws.close(); if (sc.chart) sc.chart.remove(); });
    _subCharts = {};

    if (mode === '1x1') {
      wrapper.className = 'chart-layout-1x1';
      wrapper.innerHTML = `
        <div class="ryzm-chart-legend" id="ryzm-chart-legend"></div>
        <div id="ryzm-chart-container" style="height:calc(100% - 18px); width:100%;"></div>`;
      setTimeout(() => { createChart('ryzm-chart-container'); switchSymbol(_currentSymbol, _currentInterval); }, 50);
    } else if (mode === '2x2') {
      const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'];
      wrapper.className = 'chart-layout-2x2';
      wrapper.innerHTML = symbols.map((s, i) =>
        `<div class="multi-chart-cell" id="multi-cell-${i}">
          <div class="multi-chart-label">${s.replace('USDT','/USDT')}</div>
          <div id="multi-chart-${i}" style="width:100%;height:calc(100% - 18px);"></div>
        </div>`
      ).join('');

      setTimeout(() => {
        symbols.forEach((sym, i) => {
          const t = getTheme();
          const ch = LightweightCharts.createChart(document.getElementById(`multi-chart-${i}`), {
            width: 0, height: 0,
            layout: { background: { type: 'solid', color: t.bg }, textColor: t.textColor, fontFamily: "'Share Tech Mono',monospace", fontSize: 9 },
            grid: { vertLines: { color: t.gridColor }, horzLines: { color: t.gridColor } },
            rightPriceScale: { borderColor: t.borderColor, scaleMargins: { top: 0.1, bottom: 0.2 } },
            timeScale: { borderColor: t.borderColor, timeVisible: true, secondsVisible: false },
            watermark: { visible: true, fontSize: 20, horzAlign: 'center', vertAlign: 'center', color: t.watermark, text: sym.replace('USDT','') },
            crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
          });
          const cs = ch.addCandlestickSeries({ upColor: t.upColor, downColor: t.downColor, wickUpColor: t.upWick, wickDownColor: t.downWick, borderVisible: false });
          const vs = ch.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol' });
          ch.priceScale('vol').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

          const cell = document.getElementById(`multi-chart-${i}`);
          const ro = new ResizeObserver(() => { ch.applyOptions({ width: cell.clientWidth, height: cell.clientHeight }); });
          ro.observe(cell);
          ch.applyOptions({ width: cell.clientWidth, height: cell.clientHeight });

          const binInt = INTERVALS[_currentInterval] || _currentInterval;
          fetch(`${BINANCE_REST}?symbol=${sym}&interval=${binInt}&limit=200`)
            .then(r => r.json())
            .then(data => {
              cs.setData(data.map(k => ({ time: Math.floor(k[0]/1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4] })));
              vs.setData(data.map(k => ({ time: Math.floor(k[0]/1000), value: +k[5], color: +k[4] >= +k[1] ? t.volUp : t.volDown })));
              ch.timeScale().fitContent();
            });

          const ws = new WebSocket(`${BINANCE_WS}/${sym.toLowerCase()}@kline_${binInt}`);
          ws.onmessage = (evt) => {
            const msg = JSON.parse(evt.data);
            if (msg.k) {
              const k = msg.k;
              cs.update({ time: Math.floor(k.t/1000), open: +k.o, high: +k.h, low: +k.l, close: +k.c });
              vs.update({ time: Math.floor(k.t/1000), value: +k.v, color: +k.c >= +k.o ? t.volUp : t.volDown });
            }
          };
          _subCharts[i] = { chart: ch, candle: cs, ws, symbol: sym };
        });
      }, 100);
    }

    document.querySelectorAll('.layout-btn').forEach(b => b.classList.toggle('active', b.dataset.layout === mode));
  }

  /* ═══════════════════════════════════════
     §17  SWITCH SYMBOL / INTERVAL
     ═══════════════════════════════════════ */
  async function switchSymbol(symbol, interval) {
    _currentSymbol = symbol;
    _currentInterval = interval || _currentInterval;
    _liveEma7 = null; _liveEma25 = null; _liveEma99 = null;

    if (_layoutMode === '2x2') return;

    createChart(_containerId);
    if (_chart) _chart.applyOptions({ watermark: { text: symbol.replace('USDT', '/USDT') } });

    await loadKlines(symbol, _currentInterval);
    if (_klineData.length > 0) initLiveEMA(_klineData.map(k => +k[4]));
    connectWebSocket(symbol, _currentInterval);

    syncAlertLines();
    if (_indicators.funding) fetchFundingOverlay();
    if (_indicators.liqmap) fetchLiqOverlay();
    if (_indicators.depth) fetchDepthChart();
    disableComparison();
  }

  async function switchInterval(interval) {
    _currentInterval = interval;
    _liveEma7 = null; _liveEma25 = null; _liveEma99 = null;

    await loadKlines(_currentSymbol, interval);
    if (_klineData.length > 0) initLiveEMA(_klineData.map(k => +k[4]));
    connectWebSocket(_currentSymbol, interval);
    syncAlertLines();
    if (_indicators.funding) fetchFundingOverlay();
  }

  /* ═══════════════════════════════════════
     §18  THEME UPDATE
     ═══════════════════════════════════════ */
  function updateTheme() {
    if (!_chart) return;
    const t = getTheme();
    _chart.applyOptions({
      layout: { background: { type: 'solid', color: t.bg }, textColor: t.textColor },
      grid: { vertLines: { color: t.gridColor }, horzLines: { color: t.gridColor } },
      crosshair: { vertLine: { color: t.crosshair }, horzLine: { color: t.crosshair } },
      rightPriceScale: { borderColor: t.borderColor },
      timeScale: { borderColor: t.borderColor },
      watermark: { color: t.watermark },
    });
    if (_candleSeries) _candleSeries.applyOptions({ upColor: t.upColor, downColor: t.downColor, wickUpColor: t.upWick, wickDownColor: t.downWick });
    [_ema7, _ema25, _ema99].forEach((s, i) => { if (s) s.applyOptions({ color: [t.ema7, t.ema25, t.ema99][i] }); });
    [_bbUpper, _bbMiddle, _bbLower].forEach(s => { if (s) s.applyOptions({ color: t.bbColor }); });
    if (_macdLine) _macdLine.applyOptions({ color: t.macdLine });
    if (_macdSignal) _macdSignal.applyOptions({ color: t.macdSignal });

    if (_volumeSeries && _klineData.length > 0) {
      _volumeSeries.setData(_klineData.map(k => ({
        time: Math.floor(k[0]/1000), value: +k[5],
        color: +k[4] >= +k[1] ? t.volUp : t.volDown,
      })));
    }
  }

  /* ═══════════════════════════════════════
     §19  LEGEND
     ═══════════════════════════════════════ */
  function updateLegend(candle, vol) {
    if (!_legendEl) return;
    const chg = candle.close - candle.open;
    const pct = candle.open ? ((chg / candle.open) * 100).toFixed(2) : '0.00';
    const clr = chg >= 0 ? 'var(--neon-green)' : 'var(--neon-red)';
    const sign = chg >= 0 ? '+' : '';
    const t = getTheme();
    const vs = vol ? formatVolume(vol.value) : '—';

    _legendEl.innerHTML =
      `<span style="color:var(--text-muted)">O</span> <span style="color:${clr}">${fmtPrice(candle.open)}</span> ` +
      `<span style="color:var(--text-muted)">H</span> <span style="color:${clr}">${fmtPrice(candle.high)}</span> ` +
      `<span style="color:var(--text-muted)">L</span> <span style="color:${clr}">${fmtPrice(candle.low)}</span> ` +
      `<span style="color:var(--text-muted)">C</span> <span style="color:${clr}">${fmtPrice(candle.close)}</span> ` +
      `<span style="color:${clr};font-weight:700">${sign}${pct}%</span> ` +
      `<span style="color:var(--text-muted);margin-left:6px">Vol ${vs}</span>` +
      (_indicators.ema ? ` <span style="color:${t.ema7};margin-left:6px;font-size:0.55rem">EMA7</span>` +
        ` <span style="color:${t.ema25};font-size:0.55rem">25</span>` +
        ` <span style="color:${t.ema99};font-size:0.55rem">99</span>` : '') +
      (_indicators.bb ? ` <span style="color:${t.bbColor};margin-left:4px;font-size:0.55rem">BB</span>` : '') +
      (_indicators.macd ? ` <span style="color:${t.macdLine};margin-left:4px;font-size:0.55rem">MACD</span>` : '') +
      (_compSymbol ? ` <span style="color:${t.compColor};margin-left:4px;font-size:0.55rem">vs ${_compSymbol.replace('USDT','')}</span>` : '');
  }

  function updateTabPrice(symbol, price, isUp) {
    const tab = document.querySelector(`.chart-tab[data-binance="${symbol}"]`);
    if (!tab) return;
    const el = tab.querySelector('.tab-price');
    if (el) { el.textContent = `$${fmtPrice(price)}`; el.style.color = isUp ? 'var(--neon-green)' : 'var(--neon-red)'; }
  }

  /* ═══════════════════════════════════════
     §20  HELPERS
     ═══════════════════════════════════════ */
  function rd(v) { return Math.round(v * 100) / 100; }
  function getPrecision(s) { return s.includes('XRP') ? 4 : s.includes('DOGE') ? 5 : 2; }
  function getMinMove(s) { return s.includes('XRP') ? 0.0001 : s.includes('DOGE') ? 0.00001 : 0.01; }
  function fmtPrice(p) {
    if (p >= 10000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p >= 1) return p.toFixed(2); if (p >= 0.01) return p.toFixed(4); return p.toFixed(6);
  }
  function formatVolume(v) {
    if (v >= 1e9) return (v/1e9).toFixed(2)+'B'; if (v >= 1e6) return (v/1e6).toFixed(2)+'M';
    if (v >= 1e3) return (v/1e3).toFixed(1)+'K'; return v.toFixed(0);
  }

  /* ═══════════════════════════════════════
     §21  PUBLIC API
     ═══════════════════════════════════════ */
  return {
    create: createChart, switchSymbol, switchInterval, updateTheme,
    disconnect: disconnectWebSocket,
    toggleIndicator, getIndicators,
    setDrawingMode, clearAllDrawings,
    addSignalMarker, clearSignalMarkers, loadCouncilSignals,
    syncAlertLines,
    fetchFundingOverlay, fetchLiqOverlay, fetchDepthChart,
    takeSnapshot, shareSnapshot,
    loadJournalOnChart,
    enableComparison, disableComparison,
    setLayout,
    get currentSymbol() { return _currentSymbol; },
    get currentInterval() { return _currentInterval; },
    get layoutMode() { return _layoutMode; },
  };
})();
