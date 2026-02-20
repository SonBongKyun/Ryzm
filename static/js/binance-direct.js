/**
 * Ryzm Terminal — Client-Side Binance Futures API
 * 
 * Bypasses server-side IP bans by calling fapi.binance.com directly
 * from the user's browser. Render shared IPs get 418'd, but user
 * browsers do not.
 * 
 * Provides: BinanceDirect.fundingRate(), .openInterest(), .longShort(),
 *           .whaleTrades(), .liqZones(), .scanner()
 */
const BinanceDirect = (() => {
  const FAPI = 'https://fapi.binance.com';
  const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
  const SCANNER_SYMBOLS = [
    'BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','DOGEUSDT',
    'ADAUSDT','AVAXUSDT','TRXUSDT','LINKUSDT','MATICUSDT',
    'DOTUSDT','LTCUSDT','SHIBUSDT','UNIUSDT','ATOMUSDT'
  ];

  /** Simple fetch with timeout */
  async function _get(url, timeoutMs = 8000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { signal: ctrl.signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /** Delay helper */
  function _delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  /**
   * Funding Rate + Mark Price (premiumIndex)
   * Returns: { rates: [{symbol, rate, nextTime, mark}] }
   */
  async function fundingRate() {
    const results = [];
    for (let i = 0; i < SYMBOLS.length; i++) {
      if (i > 0) await _delay(200);
      try {
        const d = await _get(`${FAPI}/fapi/v1/premiumIndex?symbol=${SYMBOLS[i]}`);
        results.push({
          symbol: SYMBOLS[i].replace('USDT', ''),
          rate: Math.round(parseFloat(d.lastFundingRate) * 100 * 10000) / 10000,
          nextTime: d.nextFundingTime,
          mark: Math.round(parseFloat(d.markPrice) * 100) / 100
        });
      } catch (e) {
        console.warn(`[BinanceDirect] FR ${SYMBOLS[i]}:`, e.message);
      }
    }
    return { rates: results };
  }

  /**
   * Open Interest + Funding (combined for On-Chain Radar)
   * Returns: { open_interest: [...], funding_rates: [...], mempool: {}, hashrate: null, hashrate_spark: [] }
   */
  async function onchainData() {
    const oi = [];
    const fr = [];

    for (let i = 0; i < SYMBOLS.length; i++) {
      if (i > 0) await _delay(300);
      const sym = SYMBOLS[i];
      const coin = sym.replace('USDT', '');
      try {
        // premiumIndex → mark price + funding rate in ONE call
        const pi = await _get(`${FAPI}/fapi/v1/premiumIndex?symbol=${sym}`);
        const mark = parseFloat(pi.markPrice);
        const rate = parseFloat(pi.lastFundingRate) * 100;

        fr.push({
          symbol: coin,
          rate: Math.round(rate * 10000) / 10000,
          nextTime: pi.nextFundingTime,
          mark: Math.round(mark * 100) / 100
        });

        await _delay(200);

        // openInterest
        const oiData = await _get(`${FAPI}/fapi/v1/openInterest?symbol=${sym}`);
        const oiVal = parseFloat(oiData.openInterest);
        const oiUsd = oiVal * mark;

        // OI 24h change from klines
        let changePct = 0;
        try {
          await _delay(200);
          const kl = await _get(`${FAPI}/fapi/v1/klines?symbol=${sym}&interval=1d&limit=2`);
          if (kl.length >= 2) {
            const prevClose = parseFloat(kl[0][4]);
            const currClose = parseFloat(kl[1][4]);
            if (prevClose > 0) changePct = Math.round((currClose - prevClose) / prevClose * 10000) / 100;
          }
        } catch {}

        oi.push({
          symbol: coin,
          oi_coins: Math.round(oiVal * 100) / 100,
          oi_usd: Math.round(oiUsd),
          mark_price: Math.round(mark * 100) / 100,
          change_pct: changePct
        });
      } catch (e) {
        console.warn(`[BinanceDirect] OI ${coin}:`, e.message);
      }
    }

    // Mempool & hashrate still come from server (non-Binance APIs, no IP ban)
    let mempool = {}, hashrate = null, hashrateSpark = [];
    try {
      const serverData = await fetch('/api/onchain', { signal: AbortSignal.timeout(5000) }).then(r => r.json()).catch(() => ({}));
      mempool = serverData.mempool || {};
      hashrate = serverData.hashrate || null;
      hashrateSpark = serverData.hashrate_spark || [];
    } catch {}

    return {
      open_interest: oi,
      funding_rates: fr,
      mempool: mempool,
      hashrate: hashrate,
      hashrate_spark: hashrateSpark
    };
  }

  /**
   * Long/Short Ratio (Top Traders)
   * Returns same format as /api/long-short
   */
  async function longShort() {
    const coins = {};
    const history = {};

    for (let i = 0; i < SYMBOLS.length; i++) {
      if (i > 0) await _delay(300);
      const sym = SYMBOLS[i];
      const coin = sym.replace('USDT', '');
      try {
        // Current ratio
        const d = await _get(`${FAPI}/futures/data/topLongShortAccountRatio?symbol=${sym}&period=1d&limit=1`);
        if (d && d.length > 0) {
          coins[coin] = {
            longAccount: parseFloat(d[0].longAccount),
            shortAccount: parseFloat(d[0].shortAccount),
            ratio: parseFloat(d[0].longShortRatio),
            timestamp: d[0].timestamp
          };
        } else {
          coins[coin] = { longAccount: 0.50, shortAccount: 0.50, ratio: 1.0 };
        }

        // History (24 data points)
        await _delay(200);
        const h = await _get(`${FAPI}/futures/data/topLongShortAccountRatio?symbol=${sym}&period=1h&limit=24`);
        history[coin] = h ? h.map(item => ({
          long: parseFloat(item.longAccount) * 100,
          ts: item.timestamp
        })) : [];
      } catch (e) {
        console.warn(`[BinanceDirect] L/S ${coin}:`, e.message);
        coins[coin] = { longAccount: 0.50, shortAccount: 0.50, ratio: 1.0 };
        history[coin] = [];
      }
    }

    const btc = coins.BTC || {};
    return {
      longAccount: btc.longAccount || 0.50,
      shortAccount: btc.shortAccount || 0.50,
      ratio: btc.ratio || 1.0,
      timestamp: btc.timestamp,
      coins: coins,
      history: history
    };
  }

  /**
   * Whale Trades (large aggregate trades)
   * Returns: { trades: [...] }
   */
  async function whaleTrades() {
    const results = [];
    const syms = ['BTCUSDT', 'ETHUSDT'];
    for (let i = 0; i < syms.length; i++) {
      if (i > 0) await _delay(300);
      try {
        const trades = await _get(`${FAPI}/fapi/v1/aggTrades?symbol=${syms[i]}&limit=80`);
        for (const t of trades) {
          const price = parseFloat(t.p);
          const qty = parseFloat(t.q);
          const usd = price * qty;
          if (usd >= 100000) {
            results.push({
              symbol: syms[i].replace('USDT', ''),
              side: t.m ? 'SELL' : 'BUY',
              price: Math.round(price * 100) / 100,
              qty: Math.round(qty * 10000) / 10000,
              usd: Math.round(usd),
              time: t.T
            });
          }
        }
      } catch (e) {
        console.warn(`[BinanceDirect] Whale ${syms[i]}:`, e.message);
      }
    }
    results.sort((a, b) => b.time - a.time);
    return { trades: results.slice(0, 12) };
  }

  /**
   * Liquidation Kill Zones
   * Returns same format as /api/liq-zones
   */
  async function liqZones() {
    try {
      const pi = await _get(`${FAPI}/fapi/v1/premiumIndex?symbol=BTCUSDT`);
      await _delay(200);
      const oiResp = await _get(`${FAPI}/fapi/v1/openInterest?symbol=BTCUSDT`);
      
      const currentPrice = parseFloat(pi.markPrice);
      const oiBtc = parseFloat(oiResp.openInterest);
      const funding = parseFloat(pi.lastFundingRate);

      const leverages = [5, 10, 25, 50, 100];
      const zones = leverages.map(lev => ({
        leverage: `${lev}x`,
        long_liq_price: Math.round(currentPrice * (1 - 1 / lev)),
        short_liq_price: Math.round(currentPrice * (1 + 1 / lev)),
        est_volume_usd: Math.round(oiBtc * currentPrice * (0.3 / lev))
      }));

      const bias = funding > 0.0001 ? 'LONG_HEAVY' : funding < -0.0001 ? 'SHORT_HEAVY' : 'BALANCED';
      const biasColor = bias === 'LONG_HEAVY' ? '#dc2626' : bias === 'SHORT_HEAVY' ? '#059669' : '#888';

      return {
        current_price: currentPrice,
        total_oi_btc: Math.round(oiBtc * 100) / 100,
        total_oi_usd: Math.round(oiBtc * currentPrice),
        funding_rate: funding,
        bias: bias,
        bias_color: biasColor,
        zones: zones
      };
    } catch (e) {
      console.warn('[BinanceDirect] LiqZones:', e.message);
      return {};
    }
  }

  /**
   * Alpha Scanner (pump detection, RSI bounce, volume spike)
   * Returns: { alerts: [...], count: N }
   */
  async function scanner() {
    const alerts = [];
    // Process in batches of 5 to avoid overwhelming the API
    for (let batch = 0; batch < SCANNER_SYMBOLS.length; batch += 5) {
      if (batch > 0) await _delay(500);
      const batchSyms = SCANNER_SYMBOLS.slice(batch, batch + 5);
      const promises = batchSyms.map(async (sym) => {
        try {
          const klines = await _get(`${FAPI}/fapi/v1/klines?symbol=${sym}&interval=5m&limit=30`);
          if (!klines || klines.length < 20) return;

          const closes = klines.map(k => parseFloat(k[4]));
          const volumes = klines.map(k => parseFloat(k[5]));
          const coin = sym.replace('USDT', '');

          // Last close & change
          const last = closes[closes.length - 1];
          const prev = closes[closes.length - 2];
          const change5m = ((last - prev) / prev) * 100;

          // Volume spike detection
          const avgVol = volumes.slice(0, -1).reduce((a, b) => a + b, 0) / (volumes.length - 1);
          const lastVol = volumes[volumes.length - 1];
          const volRatio = lastVol / (avgVol || 1);

          // Simple RSI (14-period)
          const gains = [], losses = [];
          for (let i = closes.length - 15; i < closes.length; i++) {
            const diff = closes[i] - closes[i - 1];
            gains.push(diff > 0 ? diff : 0);
            losses.push(diff < 0 ? -diff : 0);
          }
          const avgGain = gains.reduce((a, b) => a + b, 0) / 14;
          const avgLoss = losses.reduce((a, b) => a + b, 0) / 14;
          const rs = avgLoss > 0 ? avgGain / avgLoss : 100;
          const rsi = 100 - (100 / (1 + rs));

          // Pump alert: >2% in 5 min with high volume
          if (change5m > 2 && volRatio > 2) {
            alerts.push({
              symbol: coin, type: 'PUMP_ALERT',
              msg: `+${change5m.toFixed(1)}% in 5m, Vol ${volRatio.toFixed(1)}x`,
              change: Math.round(change5m * 10) / 10,
              color: '#059669'
            });
          }
          // Oversold bounce: RSI < 30 and price recovering
          else if (rsi < 30 && change5m > 0.5) {
            alerts.push({
              symbol: coin, type: 'OVERSOLD_BOUNCE',
              msg: `RSI ${rsi.toFixed(0)}, bouncing +${change5m.toFixed(1)}%`,
              change: Math.round(change5m * 10) / 10,
              color: '#06b6d4'
            });
          }
          // Volume spike without major price move
          else if (volRatio > 3 && Math.abs(change5m) < 1) {
            alerts.push({
              symbol: coin, type: 'VOL_SPIKE',
              msg: `Vol ${volRatio.toFixed(1)}x avg, price flat`,
              change: Math.round(change5m * 10) / 10,
              color: '#f59e0b'
            });
          }
        } catch {}
      });
      await Promise.all(promises);
    }
    
    return { alerts: alerts, count: alerts.length, ts: Date.now() };
  }

  /**
   * Check if Binance fapi is accessible from this browser.
   * We try a lightweight call and cache the result for 5 min.
   */
  let _fapiOk = null;
  let _fapiCheckTs = 0;
  async function isFapiAvailable() {
    if (_fapiOk !== null && Date.now() - _fapiCheckTs < 300000) return _fapiOk;
    try {
      await _get(`${FAPI}/fapi/v1/time`, 3000);
      _fapiOk = true;
    } catch {
      _fapiOk = false;
    }
    _fapiCheckTs = Date.now();
    return _fapiOk;
  }

  return { fundingRate, onchainData, longShort, whaleTrades, liqZones, scanner, isFapiAvailable };
})();
