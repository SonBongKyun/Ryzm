"""
Ryzm Terminal — Market Data Service
Crypto prices, forex, heatmap, fear/greed, kimchi premium, multi-timeframe.
"""
from typing import List

from app.core.logger import logger
from app.core.config import ENABLE_YAHOO, CG_HEADERS
from app.core.http_client import resilient_get
from app.core.cache import cache

# ── Yahoo Finance Headers ──
_YAHOO_HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}


def fetch_yahoo_chart(symbol: str, range_str: str = "5d", interval: str = "1d") -> List[float]:
    """Fetch closing prices from Yahoo Finance v8 chart API."""
    if not ENABLE_YAHOO:
        return []
    try:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range={range_str}&interval={interval}"
        resp = resilient_get(url, timeout=10, headers=_YAHOO_HEADERS)
        resp.raise_for_status()
        data = resp.json()
        result = data.get("chart", {}).get("result")
        if not result:
            return []
        closes = result[0].get("indicators", {}).get("quote", [{}])[0].get("close", [])
        return [c for c in closes if c is not None]
    except Exception as e:
        logger.warning(f"[Yahoo] Failed to fetch {symbol}: {e}")
        return []


def fetch_heatmap_data():
    """Top cryptocurrency heatmap with 24h & 7d changes + BTC dominance."""
    result = {"coins": [], "btc_dominance": None, "total_mcap": None}
    try:
        url = ("https://api.coingecko.com/api/v3/coins/markets"
               "?vs_currency=usd&order=market_cap_desc&per_page=20&page=1"
               "&sparkline=false&price_change_percentage=1h_in_currency,24h,7d")
        resp = resilient_get(url, timeout=10, headers=CG_HEADERS)
        resp.raise_for_status()
        coins = resp.json()
        for i, c in enumerate(coins, 1):
            result["coins"].append({
                "symbol": (c.get("symbol") or "???").upper(),
                "name": c.get("name", ""),
                "price": round(c.get("current_price", 0) or 0, 4),
                "change_1h": round(c.get("price_change_percentage_1h_in_currency", 0) or 0, 2),
                "change_24h": round(c.get("price_change_percentage_24h", 0) or 0, 2),
                "change_7d": round(c.get("price_change_percentage_7d_in_currency", 0) or 0, 2),
                "mcap": round(c.get("market_cap", 0) or 0, 0),
                "volume": round(c.get("total_volume", 0) or 0, 0),
                "market_cap_rank": i
            })
    except Exception as e:
        logger.error(f"[Heatmap] Coins error: {e}")

    # BTC Dominance from /global
    try:
        g_resp = resilient_get("https://api.coingecko.com/api/v3/global", timeout=8,
                               headers=CG_HEADERS)
        g_resp.raise_for_status()
        g_data = g_resp.json().get("data", {})
        result["btc_dominance"] = round(g_data.get("market_cap_percentage", {}).get("btc", 0), 1)
        result["total_mcap"] = round(g_data.get("total_market_cap", {}).get("usd", 0), 0)
    except Exception as e:
        logger.error(f"[Heatmap] Global error: {e}")

    return result


def fetch_coingecko_price(coin_id):
    """Fetch cryptocurrency prices via CoinGecko API."""
    try:
        url = f"https://api.coingecko.com/api/v3/simple/price?ids={coin_id}&vs_currencies=usd&include_24hr_change=true"
        resp = resilient_get(url, timeout=5)
        resp.raise_for_status()
        data = resp.json()
        if coin_id in data:
            price = data[coin_id].get('usd', 0)
            change = data[coin_id].get('usd_24h_change', 0)
            return price, change
    except Exception as e:
        logger.warning(f"[CoinGecko] Failed to fetch {coin_id}: {e}")
    return None, None


def fetch_forex_rates():
    """Fetch exchange rate data."""
    try:
        url = "https://api.exchangerate-api.com/v4/latest/USD"
        resp = resilient_get(url, timeout=5)
        resp.raise_for_status()
        data = resp.json()
        rates = data.get('rates', {})
        return {'JPY': rates.get('JPY', 0), 'KRW': rates.get('KRW', 0)}
    except Exception as e:
        logger.warning(f"[Forex] Failed to fetch rates: {e}")
        return {'JPY': 0, 'KRW': 0}


def fetch_market_data():
    """Fetch Crypto + Macro key indicators (Multi-source fallback).
    Crypto: Binance REST (primary) → CoinGecko (fallback)
    Macro: Yahoo Finance + ExchangeRate API
    """
    result = {}

    # ── Crypto: Binance REST API (fast, no rate limit) ── 3 coins
    binance_map = {
        "BTCUSDT": "BTC", "ETHUSDT": "ETH", "SOLUSDT": "SOL"
    }
    binance_symbols = list(binance_map.keys())
    symbols_param = "%5B" + "%2C".join(f"%22{s}%22" for s in binance_symbols) + "%5D"
    try:
        resp = resilient_get(
            "https://api.binance.com/api/v3/ticker/24hr?symbols=" + symbols_param,
            timeout=8
        )
        if resp.status_code == 200:
            tickers = resp.json()
            for t in tickers:
                name = binance_map.get(t.get("symbol"))
                if not name:
                    continue
                price = float(t.get("lastPrice", 0))
                change = float(t.get("priceChangePercent", 0))
                high = float(t.get("highPrice", 0))
                low = float(t.get("lowPrice", 0))
                vol = float(t.get("volume", 0))
                result[name] = {
                    "price": round(price, 6 if price < 1 else 2),
                    "change": round(change, 2),
                    "high": round(high, 6 if high < 1 else 2),
                    "low": round(low, 6 if low < 1 else 2),
                    "vol": round(vol, 0),
                    "symbol": name
                }
            logger.debug(f"[Market] Binance REST: {list(result.keys())}")
        else:
            raise Exception(f"Binance status {resp.status_code}")
    except Exception as e:
        logger.warning(f"[Market] Binance REST failed ({e}), trying CoinGecko...")
        # Fallback: CoinGecko
        coingecko_map = {
            "BTC": "bitcoin", "ETH": "ethereum", "SOL": "solana"
        }
        for name, coin_id in coingecko_map.items():
            if name not in result:
                price, change = fetch_coingecko_price(coin_id)
                if price:
                    result[name] = {"price": round(price, 6 if price < 1 else 2), "change": round(change, 2), "symbol": name}
                else:
                    result[name] = {"price": 0, "change": 0, "symbol": name}

    # Ensure all crypto keys exist
    crypto_cg_map = {
        "BTC": "bitcoin", "ETH": "ethereum", "SOL": "solana"
    }
    for name, coin_id in crypto_cg_map.items():
        if name not in result:
            price, change = fetch_coingecko_price(coin_id)
            result[name] = {"price": round(price or 0, 6 if (price or 0) < 1 else 2), "change": round(change or 0, 2), "symbol": name}

    forex = fetch_forex_rates()
    if forex['JPY'] > 0:
        result["USD/JPY"] = {"price": round(forex['JPY'], 2), "change": 0, "symbol": "USD/JPY"}
    else:
        result["USD/JPY"] = {"price": 0, "change": 0, "symbol": "USD/JPY"}

    if forex['KRW'] > 0:
        result["USD/KRW"] = {"price": round(forex['KRW'], 2), "change": 0, "symbol": "USD/KRW"}
    else:
        result["USD/KRW"] = {"price": 0, "change": 0, "symbol": "USD/KRW"}

    macro_tickers = {
        "%5EVIX": ("VIX", 18.5),
        "DX-Y.NYB": ("DXY", 104.0),
        "GC%3DF": ("GOLD", 2650.0),
        "SI%3DF": ("SILVER", 31.0),
    }
    for symbol, (name, fallback_price) in macro_tickers.items():
        closes = fetch_yahoo_chart(symbol, range_str="5d", interval="1d")
        if len(closes) >= 1:
            price = closes[-1]
            prev_close = closes[-2] if len(closes) >= 2 else price
            change_pct = ((price - prev_close) / prev_close * 100) if prev_close else 0
            result[name] = {"price": round(price, 2), "change": round(change_pct, 2), "symbol": name}
        else:
            result[name] = {"price": fallback_price, "change": 0, "symbol": name, "est": True}

    for fx_symbol, fx_name in [("JPY%3DX", "USD/JPY"), ("KRW%3DX", "USD/KRW")]:
        if fx_name in result and result[fx_name].get("price", 0) > 0:
            closes = fetch_yahoo_chart(fx_symbol, range_str="5d", interval="1d")
            if len(closes) >= 2:
                prev = closes[-2]
                curr = closes[-1]
                if prev > 0:
                    result[fx_name]["change"] = round((curr - prev) / prev * 100, 2)

    return result


def fetch_fear_greed():
    """Alternative.me Fear & Greed Index API (30 days history)."""
    try:
        resp = resilient_get("https://api.alternative.me/fng/?limit=30", timeout=10)
        resp.raise_for_status()
        data = resp.json()
        if data and "data" in data and len(data["data"]) > 0:
            fg_list = data["data"]
            latest = fg_list[0]
            history = [{"ts": int(item["timestamp"]), "value": int(item["value"])} for item in fg_list]
            history.reverse()
            score = int(latest["value"])
            prev_score = int(fg_list[1]["value"]) if len(fg_list) > 1 else score
            delta = score - prev_score
            # Compute 7d and 14d averages
            values = [int(item["value"]) for item in fg_list]
            avg_7d = round(sum(values[:7]) / min(7, len(values)), 1) if values else score
            avg_14d = round(sum(values[:14]) / min(14, len(values)), 1) if values else score
            avg_30d = round(sum(values[:30]) / min(30, len(values)), 1) if values else score
            # Min/max in 30 days
            all_vals = [int(item["value"]) for item in fg_list]
            min_30d = min(all_vals) if all_vals else 0
            max_30d = max(all_vals) if all_vals else 100
            return {
                "score": score,
                "label": latest["value_classification"],
                "delta": delta,
                "prev_score": prev_score,
                "avg_7d": avg_7d,
                "avg_14d": avg_14d,
                "avg_30d": avg_30d,
                "min_30d": min_30d,
                "max_30d": max_30d,
                "history": history,
            }
        else:
            logger.warning("[FG] No data in API response")
    except Exception as e:
        logger.error(f"[FG] Error: {e}")
    return {"score": 50, "label": "Neutral", "delta": 0, "prev_score": 50, "avg_7d": 50, "avg_14d": 50, "avg_30d": 50, "min_30d": 50, "max_30d": 50, "history": [], "_is_estimate": True}


def fetch_kimchi_premium():
    """Kimchi premium: Upbit vs Binance BTC price comparison."""
    try:
        upbit_resp = resilient_get("https://api.upbit.com/v1/ticker?markets=KRW-BTC", timeout=10)
        upbit_resp.raise_for_status()
        upbit_data = upbit_resp.json()
        if not upbit_data or len(upbit_data) == 0:
            raise ValueError("Empty response from Upbit API")
        upbit_price = upbit_data[0]["trade_price"]

        binance_resp = resilient_get("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT", timeout=10)
        binance_resp.raise_for_status()
        binance_price = float(binance_resp.json()["price"])

        fx_resp = resilient_get("https://api.exchangerate-api.com/v4/latest/USD", timeout=10)
        fx_resp.raise_for_status()
        usd_krw = fx_resp.json()["rates"]["KRW"]

        binance_krw = binance_price * usd_krw
        premium = ((upbit_price - binance_krw) / binance_krw) * 100

        return {
            "premium": round(premium, 2),
            "upbit_price": int(upbit_price),
            "binance_price": round(binance_price, 2),
            "usd_krw": round(usd_krw, 2),
        }
    except Exception as e:
        logger.error(f"[KP] Error: {e}")
    return {"premium": 0, "upbit_price": 0, "binance_price": 0, "usd_krw": 0, "error": True, "_is_estimate": True}


def fetch_multi_timeframe(symbol="BTCUSDT"):
    """Multi-timeframe RSI + MA cross analysis using Binance Klines."""
    import time as _time
    from app.services.scanner_service import calculate_rsi, calculate_ema

    intervals = {"1h": "1h", "4h": "4h", "1d": "1d", "1w": "1w"}
    results = {}
    for idx, (label, interval) in enumerate(intervals.items()):
        if idx > 0:
            _time.sleep(0.5)  # Rate-limit protection
        try:
            url = "https://api.binance.com/api/v3/klines"
            resp = resilient_get(url, timeout=8, params={"symbol": symbol, "interval": interval, "limit": 100})
            resp.raise_for_status()
            klines = resp.json()
            closes = [float(k[4]) for k in klines]
            rsi = calculate_rsi(closes)
            ema20 = calculate_ema(closes, 20)
            ema50 = calculate_ema(closes, 50)

            if rsi is None or ema20 is None or ema50 is None:
                signal, trend = "N/A", "N/A"
            else:
                if rsi > 70 and ema20 < ema50:
                    signal, trend = "SELL", "OVERBOUGHT"
                elif rsi < 30 and ema20 > ema50:
                    signal, trend = "BUY", "OVERSOLD"
                elif ema20 > ema50 and rsi > 50:
                    signal, trend = "BUY", "BULLISH"
                elif ema20 < ema50 and rsi < 50:
                    signal, trend = "SELL", "BEARISH"
                else:
                    signal, trend = "HOLD", "NEUTRAL"

            results[label] = {
                "rsi": rsi or 50, "ema20": ema20 or 0, "ema50": ema50 or 0,
                "price": closes[-1] if closes else 0, "signal": signal, "trend": trend
            }
        except Exception as e:
            logger.error(f"[MTF] Error for {label}: {e}")
            results[label] = {"rsi": 50, "ema20": 0, "ema50": 0, "price": 0, "signal": "N/A", "trend": "N/A"}
    return {"symbol": symbol.replace("USDT", "/USDT"), "timeframes": results}
