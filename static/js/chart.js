/* ═══════════════════════════════════════════════════════
   Ryzm Terminal — Custom Chart Engine
   TradingView Lightweight Charts + Binance Data Feed
   ═══════════════════════════════════════════════════════ */

/**
 * RyzmChart — cyberpunk-styled candlestick chart with real-time data.
 *
 * Features:
 *  - Candlestick + Volume histogram
 *  - EMA overlays (7, 25, 99)
 *  - Real-time Binance WebSocket stream
 *  - Multi-symbol / multi-timeframe
 *  - Crosshair with OHLCV legend
 *  - Watermark branding
 *  - Light/dark theme support
 */

const RyzmChart = (() => {
  // ── State ──
  let _chart = null;
  let _candleSeries = null;
  let _volumeSeries = null;
  let _ema7 = null;
  let _ema25 = null;
  let _ema99 = null;
  let _ws = null;
  let _currentSymbol = 'BTCUSDT';
  let _currentInterval = '1h';
  let _klineData = [];          // raw kline data for EMA recalc
  let _legendEl = null;
  let _containerId = 'ryzm-chart-container';

  // ── Binance REST → Kline data ──
  const BINANCE_REST = 'https://api.binance.com/api/v3/klines';
  const BINANCE_WS = 'wss://stream.binance.com:9443/ws';

  // ── Interval map (label → Binance code) ──
  const INTERVALS = {
    '1m': '1m', '5m': '5m', '15m': '15m',
    '1H': '1h', '4H': '4h', '1D': '1d', '1W': '1w',
  };

  // ── Theme palettes ──
  function getTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    return isDark ? {
      bg: 'rgba(5, 8, 18, 0)',
      textColor: 'rgba(140, 160, 190, 0.65)',
      gridColor: 'rgba(30, 45, 70, 0.35)',
      crosshair: 'rgba(6, 182, 212, 0.35)',
      borderColor: 'rgba(30, 45, 70, 0.5)',
      upColor: '#06d6a0',
      downColor: '#ef476f',
      upWick: '#06d6a0',
      downWick: '#ef476f',
      volUp: 'rgba(6, 214, 160, 0.18)',
      volDown: 'rgba(239, 71, 111, 0.18)',
      ema7: '#06b6d4',
      ema25: '#f59e0b',
      ema99: '#a855f7',
      watermark: 'rgba(6, 182, 212, 0.06)',
    } : {
      bg: 'rgba(250, 250, 252, 0)',
      textColor: 'rgba(70, 80, 100, 0.65)',
      gridColor: 'rgba(0, 0, 0, 0.06)',
      crosshair: 'rgba(6, 100, 150, 0.25)',
      borderColor: 'rgba(0, 0, 0, 0.08)',
      upColor: '#059669',
      downColor: '#dc2626',
      upWick: '#059669',
      downWick: '#dc2626',
      volUp: 'rgba(5, 150, 105, 0.15)',
      volDown: 'rgba(220, 38, 38, 0.15)',
      ema7: '#0891b2',
      ema25: '#d97706',
      ema99: '#7c3aed',
      watermark: 'rgba(0, 0, 0, 0.03)',
    };
  }

  // ── Create / recreate chart ──
  function createChart(containerId) {
    _containerId = containerId || _containerId;
    const container = document.getElementById(_containerId);
    if (!container) return;

    // Destroy existing
    if (_chart) {
      _chart.remove();
      _chart = null;
    }

    const t = getTheme();

    _chart = LightweightCharts.createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: 'solid', color: t.bg },
        textColor: t.textColor,
        fontFamily: "'Share Tech Mono', 'Fira Code', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: t.gridColor },
        horzLines: { color: t.gridColor },
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: {
          color: t.crosshair,
          width: 1,
          style: LightweightCharts.LineStyle.Dashed,
          labelBackgroundColor: 'rgba(6, 182, 212, 0.9)',
        },
        horzLine: {
          color: t.crosshair,
          width: 1,
          style: LightweightCharts.LineStyle.Dashed,
          labelBackgroundColor: 'rgba(6, 182, 212, 0.9)',
        },
      },
      rightPriceScale: {
        borderColor: t.borderColor,
        scaleMargins: { top: 0.08, bottom: 0.22 },
      },
      timeScale: {
        borderColor: t.borderColor,
        timeVisible: true,
        secondsVisible: false,
        barSpacing: 8,
      },
      watermark: {
        visible: true,
        fontSize: 42,
        horzAlign: 'center',
        vertAlign: 'center',
        color: t.watermark,
        text: 'RYZM',
      },
      handleScroll: { vertTouchDrag: false },
    });

    // ── Candlestick series ──
    _candleSeries = _chart.addCandlestickSeries({
      upColor: t.upColor,
      downColor: t.downColor,
      wickUpColor: t.upWick,
      wickDownColor: t.downWick,
      borderVisible: false,
      priceFormat: { type: 'price', precision: getPrecision(_currentSymbol), minMove: getMinMove(_currentSymbol) },
    });

    // ── Volume histogram ──
    _volumeSeries = _chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    _chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    // ── EMA lines ──
    _ema7 = _chart.addLineSeries({
      color: t.ema7, lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Solid,
      priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
    });
    _ema25 = _chart.addLineSeries({
      color: t.ema25, lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Solid,
      priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
    });
    _ema99 = _chart.addLineSeries({
      color: t.ema99, lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed,
      priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
    });

    // ── Crosshair legend ──
    _legendEl = document.getElementById('ryzm-chart-legend');
    if (_legendEl) {
      _chart.subscribeCrosshairMove(param => {
        if (!param || !param.time || !param.seriesData) {
          updateLegendDefault();
          return;
        }
        const candle = param.seriesData.get(_candleSeries);
        const vol = param.seriesData.get(_volumeSeries);
        if (candle) {
          updateLegend(candle, vol);
        }
      });
    }

    // ── Resize observer ──
    const ro = new ResizeObserver(() => {
      if (_chart) {
        _chart.applyOptions({
          width: container.clientWidth,
          height: container.clientHeight,
        });
      }
    });
    ro.observe(container);

    return _chart;
  }

  // ── Load historical klines from Binance ──
  async function loadKlines(symbol, interval, limit = 500) {
    const binanceInterval = INTERVALS[interval] || interval;
    const url = `${BINANCE_REST}?symbol=${symbol}&interval=${binanceInterval}&limit=${limit}`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Binance API ${res.status}`);
      const data = await res.json();

      _klineData = data;
      const t = getTheme();

      const candles = data.map(k => ({
        time: Math.floor(k[0] / 1000),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
      }));

      const volumes = data.map(k => ({
        time: Math.floor(k[0] / 1000),
        value: parseFloat(k[5]),
        color: parseFloat(k[4]) >= parseFloat(k[1]) ? t.volUp : t.volDown,
      }));

      if (_candleSeries) _candleSeries.setData(candles);
      if (_volumeSeries) _volumeSeries.setData(volumes);

      // Calculate and plot EMAs
      const closes = candles.map(c => c.close);
      const times = candles.map(c => c.time);
      if (_ema7) _ema7.setData(calcEMA(closes, 7, times));
      if (_ema25) _ema25.setData(calcEMA(closes, 25, times));
      if (_ema99) _ema99.setData(calcEMA(closes, 99, times));

      // Update default legend
      if (candles.length > 0) {
        const last = candles[candles.length - 1];
        const lastVol = volumes[volumes.length - 1];
        updateLegend(last, lastVol);
      }

      _chart.timeScale().fitContent();

    } catch (err) {
      console.error('[RyzmChart] Failed to load klines:', err);
    }
  }

  // ── WebSocket real-time stream ──
  function connectWebSocket(symbol, interval) {
    disconnectWebSocket();

    const binanceInterval = INTERVALS[interval] || interval;
    const stream = `${symbol.toLowerCase()}@kline_${binanceInterval}`;
    const wsUrl = `${BINANCE_WS}/${stream}`;

    try {
      _ws = new WebSocket(wsUrl);
      _ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (!msg.k) return;

        const k = msg.k;
        const t = getTheme();
        const candle = {
          time: Math.floor(k.t / 1000),
          open: parseFloat(k.o),
          high: parseFloat(k.h),
          low: parseFloat(k.l),
          close: parseFloat(k.c),
        };
        const vol = {
          time: Math.floor(k.t / 1000),
          value: parseFloat(k.v),
          color: candle.close >= candle.open ? t.volUp : t.volDown,
        };

        if (_candleSeries) _candleSeries.update(candle);
        if (_volumeSeries) _volumeSeries.update(vol);

        // Update EMA with latest close (lightweight approximate)
        updateEMAWithNewCandle(candle);

        // Update legend with live data
        updateLegend(candle, vol);

        // Update price in tab
        updateTabPrice(symbol, candle.close, candle.close >= candle.open);
      };
      _ws.onerror = (err) => console.warn('[RyzmChart] WS error:', err);
      _ws.onclose = () => console.log('[RyzmChart] WS closed');
    } catch (err) {
      console.error('[RyzmChart] WS connect error:', err);
    }
  }

  function disconnectWebSocket() {
    if (_ws) {
      _ws.onmessage = null;
      _ws.onerror = null;
      _ws.onclose = null;
      _ws.close();
      _ws = null;
    }
  }

  // ── EMA calculation ──
  function calcEMA(prices, period, times) {
    if (prices.length < period) return [];
    const k = 2 / (period + 1);
    const result = [];

    // SMA for initial value
    let sum = 0;
    for (let i = 0; i < period; i++) sum += prices[i];
    let ema = sum / period;
    result.push({ time: times[period - 1], value: round(ema) });

    for (let i = period; i < prices.length; i++) {
      ema = prices[i] * k + ema * (1 - k);
      result.push({ time: times[i], value: round(ema) });
    }
    return result;
  }

  // Incremental EMA update for live candle
  let _liveEma7 = null, _liveEma25 = null, _liveEma99 = null;

  function updateEMAWithNewCandle(candle) {
    const k7 = 2 / 8, k25 = 2 / 26, k99 = 2 / 100;
    const c = candle.close;

    if (_liveEma7 !== null) {
      _liveEma7 = c * k7 + _liveEma7 * (1 - k7);
      if (_ema7) _ema7.update({ time: candle.time, value: round(_liveEma7) });
    }
    if (_liveEma25 !== null) {
      _liveEma25 = c * k25 + _liveEma25 * (1 - k25);
      if (_ema25) _ema25.update({ time: candle.time, value: round(_liveEma25) });
    }
    if (_liveEma99 !== null) {
      _liveEma99 = c * k99 + _liveEma99 * (1 - k99);
      if (_ema99) _ema99.update({ time: candle.time, value: round(_liveEma99) });
    }
  }

  function initLiveEMA(closes) {
    // Initialize live EMA values from historical data
    if (closes.length >= 7) {
      const ema7Data = calcEMA(closes, 7, closes.map((_, i) => i));
      _liveEma7 = ema7Data.length > 0 ? ema7Data[ema7Data.length - 1].value : null;
    }
    if (closes.length >= 25) {
      const ema25Data = calcEMA(closes, 25, closes.map((_, i) => i));
      _liveEma25 = ema25Data.length > 0 ? ema25Data[ema25Data.length - 1].value : null;
    }
    if (closes.length >= 99) {
      const ema99Data = calcEMA(closes, 99, closes.map((_, i) => i));
      _liveEma99 = ema99Data.length > 0 ? ema99Data[ema99Data.length - 1].value : null;
    }
  }

  // ── Legend update ──
  function updateLegend(candle, vol) {
    if (!_legendEl) return;
    const chg = candle.close - candle.open;
    const chgPct = candle.open !== 0 ? ((chg / candle.open) * 100).toFixed(2) : '0.00';
    const color = chg >= 0 ? 'var(--neon-green)' : 'var(--neon-red)';
    const sign = chg >= 0 ? '+' : '';

    const t = getTheme();
    const volStr = vol ? formatVolume(vol.value) : '—';

    _legendEl.innerHTML =
      `<span style="color:var(--text-muted);">O</span> <span style="color:${color}">${fmtPrice(candle.open)}</span> ` +
      `<span style="color:var(--text-muted);">H</span> <span style="color:${color}">${fmtPrice(candle.high)}</span> ` +
      `<span style="color:var(--text-muted);">L</span> <span style="color:${color}">${fmtPrice(candle.low)}</span> ` +
      `<span style="color:var(--text-muted);">C</span> <span style="color:${color}">${fmtPrice(candle.close)}</span> ` +
      `<span style="color:${color};font-weight:700;">${sign}${chgPct}%</span> ` +
      `<span style="color:var(--text-muted);margin-left:6px;">Vol ${volStr}</span> ` +
      `<span style="color:${t.ema7};margin-left:6px;font-size:0.6rem;">EMA7</span> ` +
      `<span style="color:${t.ema25};font-size:0.6rem;">EMA25</span> ` +
      `<span style="color:${t.ema99};font-size:0.6rem;">EMA99</span>`;
  }

  function updateLegendDefault() {
    // Show last candle data when crosshair is not active
  }

  // ── Public: switch symbol ──
  async function switchSymbol(symbol, interval) {
    _currentSymbol = symbol;
    _currentInterval = interval || _currentInterval;

    // Reset live EMA
    _liveEma7 = null;
    _liveEma25 = null;
    _liveEma99 = null;

    // Recreate chart for new symbol precision
    createChart(_containerId);

    // Update watermark
    const pair = symbol.replace('USDT', '/USDT');
    if (_chart) {
      _chart.applyOptions({
        watermark: { text: pair },
      });
    }

    await loadKlines(symbol, _currentInterval);

    // Initialize live EMA from loaded data
    if (_klineData.length > 0) {
      const closes = _klineData.map(k => parseFloat(k[4]));
      initLiveEMA(closes);
    }

    connectWebSocket(symbol, _currentInterval);
  }

  // ── Public: switch interval ──
  async function switchInterval(interval) {
    _currentInterval = interval;
    _liveEma7 = null;
    _liveEma25 = null;
    _liveEma99 = null;

    await loadKlines(_currentSymbol, interval);

    if (_klineData.length > 0) {
      const closes = _klineData.map(k => parseFloat(k[4]));
      initLiveEMA(closes);
    }

    connectWebSocket(_currentSymbol, interval);
  }

  // ── Public: update theme ──
  function updateTheme() {
    if (!_chart) return;
    const t = getTheme();

    _chart.applyOptions({
      layout: { background: { type: 'solid', color: t.bg }, textColor: t.textColor },
      grid: { vertLines: { color: t.gridColor }, horzLines: { color: t.gridColor } },
      crosshair: {
        vertLine: { color: t.crosshair, labelBackgroundColor: 'rgba(6, 182, 212, 0.9)' },
        horzLine: { color: t.crosshair, labelBackgroundColor: 'rgba(6, 182, 212, 0.9)' },
      },
      rightPriceScale: { borderColor: t.borderColor },
      timeScale: { borderColor: t.borderColor },
      watermark: { color: t.watermark },
    });

    if (_candleSeries) {
      _candleSeries.applyOptions({
        upColor: t.upColor, downColor: t.downColor,
        wickUpColor: t.upWick, wickDownColor: t.downWick,
      });
    }
    if (_ema7) _ema7.applyOptions({ color: t.ema7 });
    if (_ema25) _ema25.applyOptions({ color: t.ema25 });
    if (_ema99) _ema99.applyOptions({ color: t.ema99 });

    // Reload volume colors
    if (_volumeSeries && _klineData.length > 0) {
      const volumes = _klineData.map(k => ({
        time: Math.floor(k[0] / 1000),
        value: parseFloat(k[5]),
        color: parseFloat(k[4]) >= parseFloat(k[1]) ? t.volUp : t.volDown,
      }));
      _volumeSeries.setData(volumes);
    }
  }

  // ── Update live price in tab ──
  function updateTabPrice(symbol, price, isUp) {
    const tab = document.querySelector(`.chart-tab[data-binance="${symbol}"]`);
    if (!tab) return;
    const priceEl = tab.querySelector('.tab-price');
    if (priceEl) {
      priceEl.textContent = `$${fmtPrice(price)}`;
      priceEl.style.color = isUp ? 'var(--neon-green)' : 'var(--neon-red)';
    }
  }

  // ── Helpers ──
  function round(v) { return Math.round(v * 100) / 100; }

  function getPrecision(symbol) {
    if (symbol.includes('BTC')) return 2;
    if (symbol.includes('ETH')) return 2;
    if (symbol.includes('SOL')) return 2;
    if (symbol.includes('XRP')) return 4;
    if (symbol.includes('DOGE')) return 5;
    return 2;
  }

  function getMinMove(symbol) {
    if (symbol.includes('XRP')) return 0.0001;
    if (symbol.includes('DOGE')) return 0.00001;
    return 0.01;
  }

  function fmtPrice(price) {
    if (price >= 10000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 1) return price.toFixed(2);
    if (price >= 0.01) return price.toFixed(4);
    return price.toFixed(6);
  }

  function formatVolume(v) {
    if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return v.toFixed(0);
  }

  // ── Public API ──
  return {
    create: createChart,
    switchSymbol,
    switchInterval,
    updateTheme,
    disconnect: disconnectWebSocket,
    get currentSymbol() { return _currentSymbol; },
    get currentInterval() { return _currentInterval; },
  };
})();
