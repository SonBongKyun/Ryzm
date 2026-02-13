import os
import json
import time
import threading
import logging
import sqlite3
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import uvicorn
import feedparser
import requests
import yfinance as yf
import google.generativeai as genai

# Load environment variables
load_dotenv()

# Logging configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ── AI Configuration (Gemini API Key) ──
GENAI_API_KEY = os.getenv("GENAI_API_KEY")
if not GENAI_API_KEY:
    logger.error("GENAI_API_KEY not found in environment variables!")
    raise ValueError("GENAI_API_KEY is required. Please check your .env file.")

genai.configure(api_key=GENAI_API_KEY)

# ── Admin Configuration ──
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN")
DISCORD_WEBHOOK_URL = os.getenv("DISCORD_WEBHOOK_URL", "")

def require_admin(request: Request) -> None:
    if not ADMIN_TOKEN:
        logger.error("ADMIN_TOKEN is not configured")
        raise HTTPException(status_code=500, detail="Admin token not configured")

    token = request.headers.get("X-Admin-Token")
    if token != ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")

app = FastAPI(title="Ryzm Terminal API")

# Allow CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Pydantic Models ──
class InfographicRequest(BaseModel):
    topic: str

class BriefingRequest(BaseModel):
    title: str
    content: str

class TradeValidationRequest(BaseModel):
    symbol: str
    entry_price: float
    position: str  # "LONG" or "SHORT"

class ChatRequest(BaseModel):
    message: str

# ── Cache Storage ──
cache = {
    "news": {"data": [], "updated": 0},
    "market": {"data": {}, "updated": 0},
    "fear_greed": {"data": {}, "updated": 0},
    "kimchi": {"data": {}, "updated": 0},
    "long_short_ratio": {"data": {}, "updated": 0},
    "funding_rate": {"data": [], "updated": 0},
    "liquidations": {"data": [], "updated": 0},
    "heatmap": {"data": [], "updated": 0},
    "multi_tf": {"data": {}, "updated": 0},
    "onchain": {"data": {}, "updated": 0},
    "auto_council": {"data": {}, "updated": 0},
    "scanner": {"data": [], "updated": 0},
    "regime": {"data": {}, "updated": 0},
    "correlation": {"data": {}, "updated": 0},
    "whale_wallets": {"data": [], "updated": 0},
    "liq_zones": {"data": {}, "updated": 0},
    "latest_briefing": {"title": "", "content": "", "time": ""},
}
CACHE_TTL = int(os.getenv("CACHE_TTL", "300"))  # 5 minutes

# ── News RSS Feed Sources ──
RSS_FEEDS = [
    {"name": "CoinDesk", "url": "https://www.coindesk.com/arc/outboundfeeds/rss/"},
    {"name": "CoinTelegraph", "url": "https://cointelegraph.com/rss"},
    {"name": "The Block", "url": "https://www.theblock.co/rss.xml"},
    {"name": "Decrypt", "url": "https://decrypt.co/feed"},
]

def fetch_news():
    """Collect RSS news with sentiment tags"""
    articles = []
    for source in RSS_FEEDS:
        try:
            feed = feedparser.parse(source["url"])
            if not feed.entries:
                logger.warning(f"No entries found for {source['name']}")
                continue

            for entry in feed.entries[:5]:  # Max 5 per source
                # Time parsing
                pub_time = ""
                if hasattr(entry, "published_parsed") and entry.published_parsed:
                    dt = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
                    kst = dt + timedelta(hours=9)
                    pub_time = kst.strftime("%H:%M")
                elif hasattr(entry, "updated_parsed") and entry.updated_parsed:
                    dt = datetime(*entry.updated_parsed[:6], tzinfo=timezone.utc)
                    kst = dt + timedelta(hours=9)
                    pub_time = kst.strftime("%H:%M")

                articles.append({
                    "time": pub_time,
                    "title": entry.get("title", "No title"),
                    "source": source["name"],
                    "link": entry.get("link", "#"),
                    "sentiment": classify_headline_sentiment(entry.get("title", "")),
                })
        except Exception as e:
            logger.error(f"[News] Error fetching {source['name']}: {e}")

    # Sort by time descending, max 15
    articles.sort(key=lambda x: x["time"], reverse=True)
    return articles[:15]


def classify_headline_sentiment(title):
    """Simple headline sentiment analysis (keyword-based, fast)"""
    t = title.lower()
    bull_words = ['surge', 'soar', 'rally', 'bullish', 'breakout', 'highs', 'record',
                  'jump', 'gain', 'boom', 'moon', 'buy', 'upgrade', 'approval',
                  'adopt', 'etf approved', 'institutional', 'accumul', 'pump']
    bear_words = ['crash', 'plunge', 'bearish', 'dump', 'sell', 'liquidat', 'hack',
                  'ban', 'fraud', 'collapse', 'fear', 'warning', 'risk', 'drop',
                  'decline', 'sue', 'sec ', 'regulation', 'investigation', 'ponzi']
    bull_score = sum(1 for w in bull_words if w in t)
    bear_score = sum(1 for w in bear_words if w in t)
    if bull_score > bear_score:
        return "BULLISH"
    elif bear_score > bull_score:
        return "BEARISH"
    return "NEUTRAL"


def fetch_heatmap_data():
    """Top cryptocurrency 24h change heatmap (using coins/markets endpoint)"""
    try:
        url = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=16&page=1&sparkline=false&price_change_percentage=24h"
        resp = requests.get(url, timeout=10, headers={"Accept": "application/json"})
        resp.raise_for_status()
        coins = resp.json()

        result = []
        for i, c in enumerate(coins, 1):
            result.append({
                "symbol": (c.get("symbol") or "???").upper(),
                "name": c.get("name", ""),
                "price": round(c.get("current_price", 0) or 0, 4),
                "change_24h": round(c.get("price_change_percentage_24h", 0) or 0, 2),
                "mcap": round(c.get("market_cap", 0) or 0, 0),
                "market_cap_rank": i
            })
        return result
    except Exception as e:
        logger.error(f"[Heatmap] Error: {e}")
        return []


def fetch_coingecko_price(coin_id):
    """Fetch cryptocurrency prices via CoinGecko API (yfinance fallback)"""
    try:
        url = f"https://api.coingecko.com/api/v3/simple/price?ids={coin_id}&vs_currencies=usd&include_24hr_change=true"
        resp = requests.get(url, timeout=5)
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
    """Fetch exchange rate data (exchangerate-api.com - free)"""
    try:
        # Fetch USD-based exchange rates
        url = "https://api.exchangerate-api.com/v4/latest/USD"
        resp = requests.get(url, timeout=5)
        resp.raise_for_status()
        data = resp.json()
        rates = data.get('rates', {})

        return {
            'JPY': rates.get('JPY', 0),
            'KRW': rates.get('KRW', 0),
        }
    except Exception as e:
        logger.warning(f"[Forex] Failed to fetch rates: {e}")
        return {'JPY': 0, 'KRW': 0}


def fetch_market_data():
    """Fetch Crypto + Macro key indicators (Multi-source fallback)"""
    result = {}

    # CoinGecko mapping (cryptocurrencies)
    coingecko_map = {
        "BTC": "bitcoin",
        "ETH": "ethereum",
        "SOL": "solana"
    }

    # 1) Cryptocurrency prices (CoinGecko)
    for name, coin_id in coingecko_map.items():
        price, change = fetch_coingecko_price(coin_id)
        if price:
            result[name] = {
                "price": round(price, 2),
                "change": round(change, 2),
                "symbol": name
            }
        else:
            result[name] = {"price": 0, "change": 0, "symbol": name}

    # 2) Exchange rate data (Forex API)
    forex = fetch_forex_rates()
    if forex['JPY'] > 0:
        result["USD/JPY"] = {
            "price": round(forex['JPY'], 2),
            "change": 0,  # Change rate is 0 due to API limitation
            "symbol": "USD/JPY"
        }
    else:
        result["USD/JPY"] = {"price": 0, "change": 0, "symbol": "USD/JPY"}

    if forex['KRW'] > 0:
        result["USD/KRW"] = {
            "price": round(forex['KRW'], 2),
            "change": 0,
            "symbol": "USD/KRW"
        }
    else:
        result["USD/KRW"] = {"price": 0, "change": 0, "symbol": "USD/KRW"}

    # 3) Try yfinance for VIX and DXY (fallback values on failure)
    macro_tickers = {
        "^VIX": ("VIX", 18.5),      # VIX average value fallback
        "DX-Y.NYB": ("DXY", 104.0)  # DXY average value fallback
    }

    for symbol, (name, fallback_price) in macro_tickers.items():
        try:
            ticker = yf.Ticker(symbol)
            hist = ticker.history(period="5d")

            if hist is not None and not hist.empty and len(hist) >= 1:
                price = float(hist["Close"].iloc[-1])
                prev_close = float(hist["Close"].iloc[-2]) if len(hist) >= 2 else price
                change_pct = ((price - prev_close) / prev_close * 100) if prev_close else 0

                result[name] = {
                    "price": round(price, 2),
                    "change": round(change_pct, 2),
                    "symbol": name
                }
            else:
                # Use fallback value (when no data available)
                result[name] = {"price": fallback_price, "change": 0, "symbol": name}

        except Exception:
            # Use fallback value (on error)
            result[name] = {"price": fallback_price, "change": 0, "symbol": name}

    return result



def fetch_fear_greed():
    """Alternative.me Fear & Greed Index API (30 days history)"""
    try:
        resp = requests.get("https://api.alternative.me/fng/?limit=30", timeout=10)
        resp.raise_for_status()
        data = resp.json()

        if data and "data" in data and len(data["data"]) > 0:
            fg_list = data["data"]
            latest = fg_list[0]
            # History for graph (timestamp, value)
            history = [{"ts": int(item["timestamp"]), "value": int(item["value"])} for item in fg_list]
            history.reverse() # Oldest to newest

            return {
                "score": int(latest["value"]),
                "label": latest["value_classification"],
                "history": history
            }
        else:
            logger.warning("[FG] No data in API response")
    except requests.RequestException as e:
        logger.error(f"[FG] Network error: {e}")
    except Exception as e:
        logger.error(f"[FG] Error: {e}")

    return {"score": 50, "label": "Neutral", "history": []}


def fetch_kimchi_premium():
    """Kimchi premium calculation: Upbit vs Binance BTC price comparison"""
    try:
        # Upbit BTC/KRW
        upbit_resp = requests.get(
            "https://api.upbit.com/v1/ticker?markets=KRW-BTC", timeout=10
        )
        upbit_resp.raise_for_status()
        upbit_data = upbit_resp.json()
        if not upbit_data or len(upbit_data) == 0:
            raise ValueError("Empty response from Upbit API")
        upbit_price = upbit_data[0]["trade_price"]

        # Binance BTC/USDT
        binance_resp = requests.get(
            "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT", timeout=10
        )
        binance_resp.raise_for_status()
        binance_price = float(binance_resp.json()["price"])

        # Exchange rate (USD/KRW)
        fx_resp = requests.get(
            "https://api.exchangerate-api.com/v4/latest/USD", timeout=10
        )
        fx_resp.raise_for_status()
        usd_krw = fx_resp.json()["rates"]["KRW"]

        # Kimchi premium calculation
        binance_krw = binance_price * usd_krw
        premium = ((upbit_price - binance_krw) / binance_krw) * 100

        return {
            "premium": round(premium, 2),
            "upbit_price": int(upbit_price),
            "binance_price": round(binance_price, 2),
            "usd_krw": round(usd_krw, 2),
        }
    except requests.RequestException as e:
        logger.error(f"[KP] Network error: {e}")
    except (ValueError, KeyError) as e:
        logger.error(f"[KP] Data parsing error: {e}")
    except Exception as e:
        logger.error(f"[KP] Unexpected error: {e}")



def fetch_long_short_ratio():
    """Binance Top Trader Long/Short Ratio (Accounts)"""
    try:
        url = "https://fapi.binance.com/futures/data/topLongShortAccountRatio"
        params = {
            "symbol": "BTCUSDT",
            "period": "1d",
            "limit": 1
        }
        resp = requests.get(url, params=params, timeout=5)
        resp.raise_for_status()
        data = resp.json()
        
        if data and len(data) > 0:
            latest = data[0]
            return {
                "longAccount": float(latest["longAccount"]),
                "shortAccount": float(latest["shortAccount"]),
                "ratio": float(latest["longShortRatio"]),
                "timestamp": latest["timestamp"]
            }
    except Exception as e:
        logger.error(f"[LS Ratio] Error: {e}")
    
    return {"longAccount": 50.0, "shortAccount": 50.0, "ratio": 1.0}


def fetch_funding_rate():
    """Binance Futures Funding Rate"""
    try:
        results = []
        for symbol in ["BTCUSDT", "ETHUSDT", "SOLUSDT"]:
            resp = requests.get(
                "https://fapi.binance.com/fapi/v1/premiumIndex",
                params={"symbol": symbol}, timeout=5
            )
            resp.raise_for_status()
            d = resp.json()
            rate = float(d["lastFundingRate"]) * 100
            results.append({
                "symbol": symbol.replace("USDT", ""),
                "rate": round(rate, 4),
                "nextTime": d["nextFundingTime"],
                "mark": round(float(d["markPrice"]), 2)
            })
        return results
    except Exception as e:
        logger.error(f"[Funding] Error: {e}")
        return []


def fetch_whale_trades():
    """Detect large-scale futures trades (liquidation proxy)"""
    try:
        results = []
        for symbol in ["BTCUSDT", "ETHUSDT"]:
            resp = requests.get(
                "https://fapi.binance.com/fapi/v1/aggTrades",
                params={"symbol": symbol, "limit": 80}, timeout=5
            )
            resp.raise_for_status()
            for t in resp.json():
                price = float(t["p"])
                qty = float(t["q"])
                usd = price * qty
                if usd >= 100000:  # $100k+ trades
                    results.append({
                        "symbol": symbol.replace("USDT", ""),
                        "side": "SELL" if t["m"] else "BUY",
                        "price": round(price, 2),
                        "qty": round(qty, 4),
                        "usd": round(usd, 0),
                        "time": t["T"]
                    })
        results.sort(key=lambda x: x["time"], reverse=True)
        return results[:12]
    except Exception as e:
        logger.error(f"[Whale] Error: {e}")
        return []


# ── Alpha Scanner Configuration ──
TARGET_COINS = [
    "BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT",
    "ADAUSDT", "AVAXUSDT", "TRXUSDT", "LINKUSDT", "MATICUSDT",
    "DOTUSDT", "LTCUSDT", "SHIBUSDT", "UNIUSDT", "ATOMUSDT"
]

# ── Correlation Matrix Assets ──
CORR_ASSETS = {
    "BTC": "bitcoin",
    "ETH": "ethereum",
    "SOL": "solana",
    "GOLD": None,   # yfinance GC=F
    "NASDAQ": None  # yfinance ^IXIC
}


# ── Technical Analysis Helpers ──
def calculate_rsi(closes, period=14):
    """Wilder's RSI calculation"""
    if len(closes) < period + 1:
        return None
    deltas = [closes[i] - closes[i-1] for i in range(1, len(closes))]
    gains = [max(d, 0) for d in deltas]
    losses = [max(-d, 0) for d in deltas]
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    for i in range(period, len(deltas)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100 - (100 / (1 + rs)), 1)


def calculate_ema(data, period):
    """Exponential Moving Average"""
    if len(data) < period:
        return None
    mult = 2 / (period + 1)
    ema = sum(data[:period]) / period
    for val in data[period:]:
        ema = (val - ema) * mult + ema
    return round(ema, 2)


def calculate_vol_spike(volumes, period=20):
    """Calculate volume spike ratio vs trailing average"""
    if len(volumes) < period:
        return 0
    avg_vol = sum(volumes[-period:-1]) / (period - 1)
    curr_vol = volumes[-1]
    if avg_vol == 0:
        return 0
    return round((curr_vol / avg_vol) * 100, 1)


def fetch_alpha_scanner():
    """
    Alpha Scanner — Scan top coins for:
    1. RSI Overbought (>70) + Volume Spike (>200%) → PUMP_ALERT
    2. RSI Oversold (<30) + Volume Spike (>150%) → OVERSOLD_BOUNCE
    3. Mega Volume (>300%) without RSI extreme → VOL_SPIKE
    """
    alerts = []
    for symbol in TARGET_COINS:
        try:
            url = "https://fapi.binance.com/fapi/v1/klines"
            params = {"symbol": symbol, "interval": "15m", "limit": 30}
            resp = requests.get(url, params=params, timeout=3)
            data = resp.json()
            if not data or not isinstance(data, list):
                continue

            closes = [float(x[4]) for x in data]
            volumes = [float(x[5]) for x in data]
            highs = [float(x[2]) for x in data]
            lows = [float(x[3]) for x in data]

            rsi = calculate_rsi(closes, 14) or 50
            vol_spike = calculate_vol_spike(volumes)
            price_change = round(((closes[-1] - closes[0]) / closes[0]) * 100, 2)
            price_range = round(((highs[-1] - lows[-1]) / lows[-1]) * 100, 2) if lows[-1] else 0

            coin = symbol.replace("USDT", "")

            # Pump alert: Overbought + massive volume
            if rsi > 70 and vol_spike > 200:
                alerts.append({
                    "symbol": coin, "type": "PUMP_ALERT",
                    "rsi": rsi, "vol": int(vol_spike), "change": price_change,
                    "msg": f"RSI {rsi} · Vol {int(vol_spike)}%",
                    "color": "#10b981", "priority": 1
                })
            # Oversold bounce: Oversold + volume building
            elif rsi < 30 and vol_spike > 150:
                alerts.append({
                    "symbol": coin, "type": "OVERSOLD_BOUNCE",
                    "rsi": rsi, "vol": int(vol_spike), "change": price_change,
                    "msg": f"RSI {rsi} · Vol {int(vol_spike)}%",
                    "color": "#f59e0b", "priority": 2
                })
            # Volume spike without RSI extreme
            elif vol_spike > 300:
                alerts.append({
                    "symbol": coin, "type": "VOL_SPIKE",
                    "rsi": rsi, "vol": int(vol_spike), "change": price_change,
                    "msg": f"Vol {int(vol_spike)}% · {'+' if price_change > 0 else ''}{price_change}%",
                    "color": "#8b5cf6", "priority": 3
                })
        except Exception:
            continue

    # Sort by priority
    alerts.sort(key=lambda x: x.get("priority", 99))
    return alerts


def fetch_regime_data():
    """Regime Detector — BTC Dominance + USDT Dominance + Altcoin Season"""
    try:
        url = "https://api.coingecko.com/api/v3/global"
        resp = requests.get(url, timeout=10, headers={"Accept": "application/json"})
        resp.raise_for_status()
        data = resp.json().get("data", {})
        btc_dom = round(data.get("market_cap_percentage", {}).get("btc", 0), 1)
        eth_dom = round(data.get("market_cap_percentage", {}).get("eth", 0), 1)
        usdt_dom = round(data.get("market_cap_percentage", {}).get("usdt", 0), 1)
        total_mcap = data.get("total_market_cap", {}).get("usd", 0)
        mcap_change = round(data.get("market_cap_change_percentage_24h_usd", 0), 2)
        alt_dom = round(100 - btc_dom - usdt_dom, 1)

        # Regime classification
        if btc_dom > 55 and mcap_change > 0:
            regime = "BTC_SEASON"
            label = "Bitcoin Dominance"
            color = "#f59e0b"
            advice = "Focus on BTC. Altcoins underperform."
        elif btc_dom < 45 and alt_dom > 40:
            regime = "ALT_SEASON"
            label = "Altcoin Season"
            color = "#10b981"
            advice = "Rotate into altcoins. BTC consolidating."
        elif usdt_dom > 8 and mcap_change < -2:
            regime = "RISK_OFF"
            label = "Risk-Off / Bear"
            color = "#ef4444"
            advice = "Capital fleeing to stables. Defensive mode."
        elif mcap_change > 3:
            regime = "FULL_BULL"
            label = "Full Bull Market"
            color = "#06b6d4"
            advice = "Rising tide lifts all boats. Stay long."
        else:
            regime = "ROTATION"
            label = "Sector Rotation"
            color = "#8b5cf6"
            advice = "Mixed signals. Selective positioning."

        return {
            "regime": regime, "label": label, "color": color, "advice": advice,
            "btc_dom": btc_dom, "eth_dom": eth_dom, "usdt_dom": usdt_dom,
            "alt_dom": alt_dom, "total_mcap": total_mcap, "mcap_change": mcap_change
        }
    except Exception as e:
        logger.error(f"[Regime] Error: {e}")
        return {"regime": "UNKNOWN", "label": "Unknown", "color": "#6b7280", "advice": "Data unavailable",
                "btc_dom": 0, "eth_dom": 0, "usdt_dom": 0, "alt_dom": 0, "total_mcap": 0, "mcap_change": 0}


def fetch_correlation_matrix():
    """30-day correlation matrix: BTC, ETH, SOL, GOLD, NASDAQ"""
    prices = {}
    try:
        # Crypto from CoinGecko
        for name, cg_id in [("BTC", "bitcoin"), ("ETH", "ethereum"), ("SOL", "solana")]:
            url = f"https://api.coingecko.com/api/v3/coins/{cg_id}/market_chart?vs_currency=usd&days=30&interval=daily"
            resp = requests.get(url, timeout=10, headers={"Accept": "application/json"})
            data = resp.json()
            prices[name] = [p[1] for p in data.get("prices", [])]

        # TradFi from yfinance
        for symbol, label in [("GC=F", "GOLD"), ("^IXIC", "NASDAQ")]:
            try:
                ticker = yf.Ticker(symbol)
                hist = ticker.history(period="1mo")
                prices[label] = hist["Close"].tolist() if not hist.empty else []
            except Exception:
                prices[label] = []

        # Calculate daily returns
        assets = ["BTC", "ETH", "SOL", "GOLD", "NASDAQ"]
        returns = {}
        for asset in assets:
            p = prices.get(asset, [])
            if len(p) > 1:
                returns[asset] = [(p[i] - p[i-1]) / p[i-1] for i in range(1, len(p))]
            else:
                returns[asset] = []

        # Pearson correlation
        matrix = {}
        for a in assets:
            matrix[a] = {}
            for b in assets:
                ra, rb = returns.get(a, []), returns.get(b, [])
                min_len = min(len(ra), len(rb))
                if min_len < 5:
                    matrix[a][b] = None
                    continue
                ra_s, rb_s = ra[:min_len], rb[:min_len]
                mean_a = sum(ra_s) / min_len
                mean_b = sum(rb_s) / min_len
                cov = sum((ra_s[i] - mean_a) * (rb_s[i] - mean_b) for i in range(min_len))
                std_a = (sum((x - mean_a)**2 for x in ra_s))**0.5
                std_b = (sum((x - mean_b)**2 for x in rb_s))**0.5
                if std_a == 0 or std_b == 0:
                    matrix[a][b] = 0
                else:
                    matrix[a][b] = round(cov / (std_a * std_b), 3)

        return {"assets": assets, "matrix": matrix}
    except Exception as e:
        logger.error(f"[Correlation] Error: {e}")
        return {"assets": [], "matrix": {}}


def fetch_whale_wallets():
    """Monitor large BTC transactions via blockchain.info"""
    try:
        # Recent unconfirmed large transactions
        url = "https://blockchain.info/unconfirmed-transactions?format=json"
        resp = requests.get(url, timeout=10)
        data = resp.json()
        txs = data.get("txs", [])

        large_txs = []
        for tx in txs:
            total_out = sum(o.get("value", 0) for o in tx.get("out", [])) / 1e8  # satoshi to BTC
            if total_out >= 10:  # >= 10 BTC
                btc_price = cache.get("market", {}).get("data", {}).get("BTC", {}).get("price", 68000)
                usd_val = total_out * btc_price
                # Determine direction
                is_exchange = any("exchange" in str(o.get("addr", "")).lower() or
                                  o.get("spending_outpoints", []) for o in tx.get("out", []))
                large_txs.append({
                    "hash": tx.get("hash", "")[:12] + "...",
                    "btc": round(total_out, 2),
                    "usd": round(usd_val),
                    "time": tx.get("time", 0),
                    "type": "EXCHANGE" if is_exchange else "WALLET"
                })
            if len(large_txs) >= 8:
                break

        large_txs.sort(key=lambda x: x["btc"], reverse=True)
        return large_txs
    except Exception as e:
        logger.error(f"[WhaleWallet] Error: {e}")
        return []


def fetch_liquidation_zones():
    """Estimate liquidation density zones from OI + funding + leverage data"""
    try:
        # Get current BTC price and OI
        price_url = "https://fapi.binance.com/fapi/v1/ticker/price?symbol=BTCUSDT"
        oi_url = "https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT"
        fr_url = "https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1"

        price_resp = requests.get(price_url, timeout=5)
        oi_resp = requests.get(oi_url, timeout=5)
        fr_resp = requests.get(fr_url, timeout=5)

        current_price = float(price_resp.json()["price"])
        oi_btc = float(oi_resp.json()["openInterest"])
        funding = float(fr_resp.json()[0]["fundingRate"])

        # Estimate liquidation density at leverage levels
        zones = []
        leverages = [5, 10, 25, 50, 100]
        for lev in leverages:
            # Long liquidation (price drops)
            long_liq = round(current_price * (1 - 1/lev), 0)
            # Short liquidation (price rises)
            short_liq = round(current_price * (1 + 1/lev), 0)
            # Estimate volume (more volume at lower leverage)
            estimated_vol = round(oi_btc * current_price * (0.3 / lev), 0)  # rough estimate
            zones.append({
                "leverage": f"{lev}x",
                "long_liq_price": long_liq,
                "short_liq_price": short_liq,
                "est_volume_usd": estimated_vol
            })

        # Bias: if funding positive → more longs → more long liq risk
        bias = "LONG_HEAVY" if funding > 0.0001 else "SHORT_HEAVY" if funding < -0.0001 else "BALANCED"

        return {
            "current_price": current_price,
            "total_oi_btc": round(oi_btc, 2),
            "total_oi_usd": round(oi_btc * current_price),
            "funding_rate": funding,
            "bias": bias,
            "zones": zones
        }
    except Exception as e:
        logger.error(f"[LiqZones] Error: {e}")
        return {}


def fetch_multi_timeframe(symbol="BTCUSDT"):
    """Multi-timeframe RSI + MA cross analysis using Binance Klines"""
    intervals = {"1h": "1h", "4h": "4h", "1d": "1d", "1w": "1w"}
    results = {}
    for label, interval in intervals.items():
        try:
            url = "https://fapi.binance.com/fapi/v1/klines"
            resp = requests.get(url, params={"symbol": symbol, "interval": interval, "limit": 100}, timeout=8)
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
                "rsi": rsi or 50,
                "ema20": ema20 or 0,
                "ema50": ema50 or 0,
                "price": closes[-1] if closes else 0,
                "signal": signal,
                "trend": trend
            }
        except Exception as e:
            logger.error(f"[MTF] Error for {label}: {e}")
            results[label] = {"rsi": 50, "ema20": 0, "ema50": 0, "price": 0, "signal": "N/A", "trend": "N/A"}
    return {"symbol": symbol.replace("USDT", "/USDT"), "timeframes": results}


def fetch_onchain_data():
    """On-chain metrics: Open Interest + Mempool fees + Hashrate"""
    result = {"open_interest": [], "mempool": {}, "hashrate": None}

    # 1) Binance Futures Open Interest
    for sym in ["BTCUSDT", "ETHUSDT", "SOLUSDT"]:
        try:
            resp = requests.get("https://fapi.binance.com/fapi/v1/openInterest", params={"symbol": sym}, timeout=5)
            resp.raise_for_status()
            d = resp.json()
            oi_val = float(d.get("openInterest", 0))
            pr = requests.get("https://fapi.binance.com/fapi/v1/premiumIndex", params={"symbol": sym}, timeout=5)
            pr.raise_for_status()
            mark = float(pr.json().get("markPrice", 0))
            oi_usd = oi_val * mark
            result["open_interest"].append({
                "symbol": sym.replace("USDT", ""),
                "oi_coins": round(oi_val, 2),
                "oi_usd": round(oi_usd, 0),
                "mark_price": round(mark, 2)
            })
        except Exception as e:
            logger.error(f"[OnChain] OI error for {sym}: {e}")

    # 2) Mempool.space BTC fee estimates
    try:
        resp = requests.get("https://mempool.space/api/v1/fees/recommended", timeout=5)
        resp.raise_for_status()
        fees = resp.json()
        result["mempool"] = {
            "fastest": fees.get("fastestFee", 0),
            "half_hour": fees.get("halfHourFee", 0),
            "hour": fees.get("hourFee", 0),
            "economy": fees.get("economyFee", 0)
        }
    except Exception as e:
        logger.error(f"[OnChain] Mempool error: {e}")

    # 3) Mempool.space hashrate
    try:
        resp = requests.get("https://mempool.space/api/v1/mining/hashrate/3d", timeout=5)
        resp.raise_for_status()
        data = resp.json()
        if data.get("hashrates"):
            latest = data["hashrates"][-1]
            hashrate_eh = latest.get("avgHashrate", 0) / 1e18
            result["hashrate"] = {"value": round(hashrate_eh, 1), "unit": "EH/s"}
    except Exception as e:
        logger.error(f"[OnChain] Hashrate error: {e}")

    return result


# ── Economic Calendar (Major Macro Events) ──
ECONOMIC_CALENDAR = [
    {"date": "2026-02-12", "event": "CPI (Jan YoY)", "impact": "HIGH", "region": "US"},
    {"date": "2026-02-19", "event": "FOMC Minutes", "impact": "HIGH", "region": "US"},
    {"date": "2026-03-06", "event": "Non-Farm Payrolls", "impact": "HIGH", "region": "US"},
    {"date": "2026-03-12", "event": "CPI (Feb YoY)", "impact": "HIGH", "region": "US"},
    {"date": "2026-03-18", "event": "FOMC Rate Decision", "impact": "HIGH", "region": "US"},
    {"date": "2026-03-19", "event": "BOJ Rate Decision", "impact": "HIGH", "region": "JP"},
    {"date": "2026-04-03", "event": "Non-Farm Payrolls", "impact": "HIGH", "region": "US"},
    {"date": "2026-04-14", "event": "CPI (Mar YoY)", "impact": "HIGH", "region": "US"},
    {"date": "2026-05-01", "event": "Non-Farm Payrolls", "impact": "HIGH", "region": "US"},
    {"date": "2026-05-06", "event": "FOMC Rate Decision", "impact": "HIGH", "region": "US"},
    {"date": "2026-06-05", "event": "Non-Farm Payrolls", "impact": "HIGH", "region": "US"},
    {"date": "2026-06-10", "event": "CPI (May YoY)", "impact": "HIGH", "region": "US"},
    {"date": "2026-06-17", "event": "FOMC Rate Decision", "impact": "HIGH", "region": "US"},
    {"date": "2026-07-29", "event": "FOMC Rate Decision", "impact": "HIGH", "region": "US"},
    {"date": "2026-09-16", "event": "FOMC Rate Decision", "impact": "HIGH", "region": "US"},
    {"date": "2026-11-04", "event": "FOMC Rate Decision", "impact": "HIGH", "region": "US"},
    {"date": "2026-12-16", "event": "FOMC Rate Decision", "impact": "HIGH", "region": "US"},
]


# ── Museum of Scars (Historical Crash Archive) ──
MUSEUM_OF_SCARS = [
    {"date": "1929.10.24", "event": "The Great Depression", "drop": "-89%", "desc": "Black Thursday. Credit bubble burst. Market took 25 years to recover."},
    {"date": "1987.10.19", "event": "Black Monday", "drop": "-22%", "desc": "Single-day crash. Program trading cascaded sell orders."},
    {"date": "2000.03.10", "event": "Dot-Com Bubble", "drop": "-78%", "desc": "NASDAQ peak. Irrational exuberance in tech stocks."},
    {"date": "2008.09.15", "event": "Lehman Collapse", "drop": "-56%", "desc": "Systemic banking failure. MBS contagion. Global credit freeze."},
    {"date": "2013.12.05", "event": "China BTC Ban", "drop": "-50%", "desc": "PBoC bans financial institutions from Bitcoin. First major crypto crash."},
    {"date": "2017.12.17", "event": "ICO Bubble Peak", "drop": "-84%", "desc": "BTC ATH $20k. Retail FOMO peak. 12-month bear market followed."},
    {"date": "2020.03.12", "event": "COVID Liquidity Crisis", "drop": "-54%", "desc": "Global shutdown. BTC flash crash to $3.8k. Fed pivot."},
    {"date": "2021.05.19", "event": "China Mining Ban", "drop": "-53%", "desc": "BTC $64k to $30k. Hash rate exodus. Elon FUD."},
    {"date": "2022.05.09", "event": "LUNA/UST Collapse", "drop": "-99%", "desc": "Algorithmic stablecoin death spiral. $40B evaporated in days."},
    {"date": "2022.11.08", "event": "FTX Implosion", "drop": "-25%", "desc": "Exchange fraud. SBF arrested. Contagion across crypto."},
]


def compute_risk_gauge():
    """
    Composite system risk score calculation (-100 ~ +100)
    Negative = danger, Positive = safe
    """
    score = 0.0
    components = {}

    # 1. Fear & Greed (0~100) -> -50 ~ +50
    fg = cache["fear_greed"].get("data", {})
    fg_score = fg.get("score", 50)
    fg_contrib = (fg_score - 50)   # 0=-50, 50=0, 100=+50
    components["fear_greed"] = {"value": fg_score, "contrib": round(fg_contrib, 1), "label": fg.get("label", "Neutral")}
    score += fg_contrib

    # 2. Funding Rate (average) -> More extreme = more dangerous
    fr_data = cache["funding_rate"].get("data", [])
    if fr_data:
        avg_fr = sum(r["rate"] for r in fr_data) / len(fr_data)
        # Overheated if absolute funding rate >= 0.1%
        fr_contrib = max(-20, min(20, -avg_fr * 200))  # Positive funding rate = long overheated = risky
        components["funding_rate"] = {"value": round(avg_fr, 4), "contrib": round(fr_contrib, 1)}
        score += fr_contrib

    # 3. Long/Short Ratio -> Excessive skew = risk
    ls = cache["long_short_ratio"].get("data", {})
    if ls and ls.get("longAccount"):
        long_pct = ls["longAccount"] * 100
        ls_deviation = abs(long_pct - 50)  # Degree of deviation from 50% balance
        ls_contrib = -ls_deviation * 0.6   # Max -30
        components["long_short"] = {"value": round(long_pct, 1), "contrib": round(ls_contrib, 1)}
        score += ls_contrib

    # 4. VIX (Volatility Index)
    market = cache["market"].get("data", {})
    vix = market.get("VIX", {})
    if vix and vix.get("price"):
        vix_val = vix["price"]
        if vix_val > 30:
            vix_contrib = -25
        elif vix_val > 20:
            vix_contrib = -10
        else:
            vix_contrib = 5
        components["vix"] = {"value": vix_val, "contrib": vix_contrib}
        score += vix_contrib

    # 5. Kimchi Premium (>= 5% = overheating risk)
    kp = cache["kimchi"].get("data", {})
    if kp and kp.get("premium") is not None:
        kp_val = abs(kp["premium"])
        kp_contrib = -min(15, kp_val * 3) if kp_val > 2 else 0
        components["kimchi"] = {"value": kp.get("premium", 0), "contrib": round(kp_contrib, 1)}
        score += kp_contrib

    # Score clamp
    score = max(-100, min(100, score))

    # Level determination
    if score <= -60:
        level, label = "CRITICAL", "CRITICAL FAILURE"
    elif score <= -30:
        level, label = "HIGH", "HIGH RISK"
    elif score <= 0:
        level, label = "ELEVATED", "ELEVATED"
    elif score <= 30:
        level, label = "MODERATE", "MODERATE"
    else:
        level, label = "LOW", "STABLE"

    return {
        "score": round(score, 1),
        "level": level,
        "label": label,
        "components": components,
        "timestamp": datetime.now().strftime("%H:%M:%S")
    }


# ── Council History Database (SQLite) ──
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "council_history.db")

def init_council_db():
    """Initialize SQLite DB for council history"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS council_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            consensus_score INTEGER,
            vibe_status TEXT,
            btc_price REAL,
            btc_price_after TEXT DEFAULT NULL,
            hit INTEGER DEFAULT NULL,
            full_result TEXT
        )
    """)
    conn.commit()
    conn.close()
    logger.info("[DB] Council history database initialized")

def save_council_record(result: dict, btc_price: float = 0.0):
    """Save a council analysis to the DB"""
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute(
            "INSERT INTO council_history (timestamp, consensus_score, vibe_status, btc_price, full_result) VALUES (?, ?, ?, ?, ?)",
            (
                datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                result.get("consensus_score", 50),
                result.get("vibe", {}).get("status", "UNKNOWN"),
                btc_price,
                json.dumps(result, ensure_ascii=False)
            )
        )
        conn.commit()
        conn.close()
        logger.info(f"[DB] Council record saved — score={result.get('consensus_score')}, btc=${btc_price:.0f}")
    except Exception as e:
        logger.error(f"[DB] Failed to save council record: {e}")

def get_council_history(limit: int = 50) -> List[dict]:
    """Retrieve recent council records"""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute(
            "SELECT id, timestamp, consensus_score, vibe_status, btc_price, btc_price_after, hit FROM council_history ORDER BY id DESC LIMIT ?",
            (limit,)
        )
        rows = [dict(r) for r in c.fetchall()]
        conn.close()
        return rows
    except Exception as e:
        logger.error(f"[DB] Failed to read council history: {e}")
        return []

def evaluate_council_accuracy():
    """Check past predictions: if score>50 meant bullish, did BTC go up?"""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        # Get records older than 1 hour that haven't been evaluated yet
        c.execute("""
            SELECT id, consensus_score, btc_price FROM council_history
            WHERE hit IS NULL AND btc_price > 0
            AND datetime(timestamp) < datetime('now', '-1 hour')
            ORDER BY id ASC LIMIT 20
        """)
        rows = c.fetchall()

        if not rows:
            conn.close()
            return

        # Get current BTC price from cache
        market = cache.get("market", {}).get("data", {})
        current_btc = 0.0
        if isinstance(market, dict):
            current_btc = market.get("BTC", {}).get("price", 0.0)
        elif isinstance(market, list):
            for coin in market:
                if coin.get("symbol", "").upper() == "BTC":
                    current_btc = coin.get("price", 0.0)
                    break

        if current_btc <= 0:
            conn.close()
            return

        for row in rows:
            score = row["consensus_score"]
            old_price = row["btc_price"]
            predicted_bull = score > 50
            actual_bull = current_btc > old_price
            hit = 1 if predicted_bull == actual_bull else 0
            c.execute(
                "UPDATE council_history SET btc_price_after = ?, hit = ? WHERE id = ?",
                (f"{current_btc:.2f}", hit, row["id"])
            )

        conn.commit()
        conn.close()
        logger.info(f"[DB] Evaluated {len(rows)} council predictions")
    except Exception as e:
        logger.error(f"[DB] Accuracy evaluation error: {e}")

# Initialize DB on module load
init_council_db()


# ── AI Round Table (The Council) Logic ──
def generate_council_debate(market_data, news_data):
    """
    Request [debate + theme analysis + strategy] from Gemini 2.0 Flash in one call (save tokens)
    """

    system_prompt = f"""
    You are "Ryzm", the AI Crypto Terminal. Analyze the market deeply.

    [Input Data]
    - Market: {json.dumps(market_data)}
    - News Headlines: {json.dumps(news_data[:5])}

    [Required Output - JSON Only]
    Create a JSON object with this exact structure:
    {{
        "vibe": {{
            "status": "EUPHORIA",
            "color": "#10b981",
            "message": "Retail is FOMOing hard. Whales are watching."
        }},
        "narratives": [
            {{"name": "AI Agents", "score": 95, "trend": "UP"}},
            {{"name": "Meme Coins", "score": 82, "trend": "UP"}},
            {{"name": "RWA", "score": 40, "trend": "DOWN"}}
        ],
        "strategies": [
            {{"name": "Plan A (Bull)", "prob": "60%", "action": "Breakout trading above $98k"}},
            {{"name": "Plan B (Bear)", "prob": "30%", "action": "Short if $95k breaks"}}
        ],
        "agents": [
            {{"name": "Grok", "status": "BULL", "message": "X is exploding with $BTC tweets!"}},
            {{"name": "GPT", "status": "BEAR", "message": "RSI 85. Mathematically unsustainable."}},
            {{"name": "Vision", "status": "NEUTRAL", "message": "Consolidating in a pennant pattern."}},
            {{"name": "Claude", "status": "CONCLUSION", "message": "Wait for the breakout. Don't gamble."}}
        ],
        "consensus_score": 72
    }}

    Also include a "strategic_narrative" field with 3 layers:
    - Layer 1: TACTICAL (IMMEDIATE) - short-term action for the next 24-48h
    - Layer 2: FRACTAL (PATTERN) - historical pattern comparison
    - Layer 3: SOVEREIGN (MACRO) - long-term macro thesis

    Example:
    "strategic_narrative": [
        {{"layer": 1, "title": "TACTICAL (IMMEDIATE)", "content": "Reduce exposure above resistance. Accumulate on dips."}},
        {{"layer": 2, "title": "FRACTAL (PATTERN)", "content": "Resembles 2019 pre-halving accumulation. Expect volatility."}},
        {{"layer": 3, "title": "SOVEREIGN (MACRO)", "content": "Fed pivot narrative strengthening. DXY weakening supports risk assets."}}  
    ]
    """

    try:
        model = genai.GenerativeModel('gemini-2.0-flash')
        response = model.generate_content(system_prompt)
        text = response.text.replace("```json", "").replace("```", "").strip()
        result = json.loads(text)
        logger.info("[Council] Successfully generated AI analysis")
        return result
    except json.JSONDecodeError as e:
        logger.error(f"[Ryzm Brain] JSON parsing error: {e}")
    except Exception as e:
        logger.error(f"[Ryzm Brain] Error: {e}")

    # Return default value on error
    return {
        "vibe": {"status": "OFFLINE", "color": "#555", "message": "System Reconnecting..."},
        "narratives": [],
        "strategies": [],
        "agents": [],
        "consensus_score": 50,
        "strategic_narrative": []
    }


# ── Auto-Council & Discord Alert ──
AUTO_COUNCIL_INTERVAL = int(os.getenv("AUTO_COUNCIL_INTERVAL", "3600"))  # 1 hour default
_last_auto_council = 0


def send_discord_alert(title, message, color=0xdc2626):
    """Send alert to Discord webhook"""
    if not DISCORD_WEBHOOK_URL or DISCORD_WEBHOOK_URL == "YOUR_DISCORD_WEBHOOK_URL_HERE":
        return
    try:
        payload = {
            "username": "Ryzm Alert",
            "avatar_url": "https://i.imgur.com/8QZ7r7s.png",
            "embeds": [{
                "title": title,
                "description": message[:2000],
                "color": color,
                "footer": {"text": "Ryzm Terminal Auto-Alert"},
                "timestamp": datetime.now(timezone.utc).isoformat()
            }]
        }
        requests.post(DISCORD_WEBHOOK_URL, json=payload, timeout=10)
        logger.info(f"[Discord] Alert sent: {title}")
    except Exception as e:
        logger.error(f"[Discord] Alert error: {e}")


# ── Background Data Refresh ──
def refresh_cache():
    """Cache refresh (every 5 minutes)"""
    logger.info("[Cache] Background refresh thread started")
    while True:
        now = time.time()
        try:
            if now - cache["news"]["updated"] > CACHE_TTL:
                cache["news"]["data"] = fetch_news()
                cache["news"]["updated"] = now
                logger.info(f"[Cache] News refreshed: {len(cache['news']['data'])} articles")
        except Exception as e:
            logger.error(f"[Cache] News refresh error: {e}")

        try:
            if now - cache["market"]["updated"] > CACHE_TTL:
                cache["market"]["data"] = fetch_market_data()
                cache["market"]["updated"] = now
                logger.info(f"[Cache] Market data refreshed")
        except Exception as e:
            logger.error(f"[Cache] Market refresh error: {e}")

        try:
            if now - cache["fear_greed"]["updated"] > CACHE_TTL:
                cache["fear_greed"]["data"] = fetch_fear_greed()
                cache["fear_greed"]["updated"] = now
                logger.info(f"[Cache] Fear/Greed refreshed: score={cache['fear_greed']['data'].get('score')}")
        except Exception as e:
            logger.error(f"[Cache] F&G refresh error: {e}")

        try:
            if now - cache["kimchi"]["updated"] > CACHE_TTL:
                cache["kimchi"]["data"] = fetch_kimchi_premium()
                cache["kimchi"]["updated"] = now
                logger.info(f"[Cache] Kimchi Premium refreshed: {cache['kimchi']['data'].get('premium', 0)}%")
        except Exception as e:
            logger.error(f"[Cache] KP refresh error: {e}")

        try:
            if now - cache["long_short_ratio"]["updated"] > CACHE_TTL:
                cache["long_short_ratio"]["data"] = fetch_long_short_ratio()
                cache["long_short_ratio"]["updated"] = now
                logger.info(f"[Cache] L/S Ratio refreshed")
        except Exception as e:
            logger.error(f"[Cache] L/S Ratio refresh error: {e}")

        try:
            if now - cache["funding_rate"]["updated"] > CACHE_TTL:
                cache["funding_rate"]["data"] = fetch_funding_rate()
                cache["funding_rate"]["updated"] = now
                logger.info(f"[Cache] Funding Rate refreshed")
        except Exception as e:
            logger.error(f"[Cache] Funding Rate refresh error: {e}")

        try:
            if now - cache["liquidations"]["updated"] > 120:  # Every 2 minutes
                cache["liquidations"]["data"] = fetch_whale_trades()
                cache["liquidations"]["updated"] = now
                logger.info(f"[Cache] Whale trades refreshed: {len(cache['liquidations']['data'])} trades")
        except Exception as e:
            logger.error(f"[Cache] Whale trades refresh error: {e}")

        try:
            if now - cache["heatmap"]["updated"] > CACHE_TTL:
                cache["heatmap"]["data"] = fetch_heatmap_data()
                cache["heatmap"]["updated"] = now
                logger.info(f"[Cache] Heatmap refreshed: {len(cache['heatmap']['data'])} coins")
        except Exception as e:
            logger.error(f"[Cache] Heatmap refresh error: {e}")

        # Multi-timeframe analysis (every 5 mins)
        try:
            if now - cache["multi_tf"]["updated"] > CACHE_TTL:
                cache["multi_tf"]["data"] = fetch_multi_timeframe()
                cache["multi_tf"]["updated"] = now
                logger.info("[Cache] Multi-timeframe refreshed")
        except Exception as e:
            logger.error(f"[Cache] MTF refresh error: {e}")

        # On-chain data (every 5 mins)
        try:
            if now - cache["onchain"]["updated"] > CACHE_TTL:
                cache["onchain"]["data"] = fetch_onchain_data()
                cache["onchain"]["updated"] = now
                logger.info("[Cache] On-chain data refreshed")
        except Exception as e:
            logger.error(f"[Cache] On-chain refresh error: {e}")

        # Auto Council (hourly) — uses gemini-2.0-flash (cheap)
        global _last_auto_council
        try:
            if now - _last_auto_council > AUTO_COUNCIL_INTERVAL:
                market = cache["market"]["data"]
                news = cache["news"]["data"]
                if market:
                    logger.info("[AutoCouncil] Running scheduled analysis...")
                    result = generate_council_debate(market, news)
                    cache["auto_council"]["data"] = result
                    cache["auto_council"]["updated"] = now
                    _last_auto_council = now
                    btc_price = market.get("BTC", {}).get("price", 0.0) if isinstance(market, dict) else 0.0
                    save_council_record(result, btc_price)
                    score = result.get("consensus_score", 50)
                    vibe = result.get("vibe", {}).get("status", "UNKNOWN")
                    send_discord_alert(
                        f"\U0001f9e0 Auto Council — Score: {score}/100",
                        f"**Vibe:** {vibe}\n**Score:** {score}/100\n\n" +
                        "\n".join([f"• {a['name']}: {a['message']}" for a in result.get("agents", [])[:4]]),
                        color=0x06b6d4
                    )
                    evaluate_council_accuracy()
                    logger.info(f"[AutoCouncil] Completed — score={score}, vibe={vibe}")
        except Exception as e:
            logger.error(f"[Cache] Auto-council error: {e}")

        # Alpha Scanner (every 60s)
        try:
            if now - cache["scanner"]["updated"] > 60:
                cache["scanner"]["data"] = fetch_alpha_scanner()
                cache["scanner"]["updated"] = now
                cnt = len(cache["scanner"]["data"])
                if cnt > 0:
                    logger.info(f"[Scanner] Found {cnt} opportunities")
        except Exception as e:
            logger.error(f"[Scanner] Error: {e}")

        # Regime Detector (every 5 mins)
        try:
            if now - cache["regime"]["updated"] > CACHE_TTL:
                cache["regime"]["data"] = fetch_regime_data()
                cache["regime"]["updated"] = now
                logger.info(f"[Regime] {cache['regime']['data'].get('regime')}")
        except Exception as e:
            logger.error(f"[Regime] Error: {e}")

        # Correlation Matrix (every 10 mins)
        try:
            if now - cache["correlation"]["updated"] > 600:
                cache["correlation"]["data"] = fetch_correlation_matrix()
                cache["correlation"]["updated"] = now
                logger.info("[Correlation] Matrix refreshed")
        except Exception as e:
            logger.error(f"[Correlation] Error: {e}")

        # Whale Wallet Tracker (every 2 mins)
        try:
            if now - cache["whale_wallets"]["updated"] > 120:
                cache["whale_wallets"]["data"] = fetch_whale_wallets()
                cache["whale_wallets"]["updated"] = now
                logger.info(f"[WhaleWallet] {len(cache['whale_wallets']['data'])} large txs")
        except Exception as e:
            logger.error(f"[WhaleWallet] Error: {e}")

        # Liquidation Zones (every 2 mins)
        try:
            if now - cache["liq_zones"]["updated"] > 120:
                cache["liq_zones"]["data"] = fetch_liquidation_zones()
                cache["liq_zones"]["updated"] = now
                logger.info("[LiqZones] Zones refreshed")
        except Exception as e:
            logger.error(f"[LiqZones] Error: {e}")

        # Risk gauge critical alert to Discord
        try:
            risk = compute_risk_gauge()
            if risk.get("level") == "CRITICAL":
                send_discord_alert(
                    "\U0001f6a8 CRITICAL RISK ALERT",
                    f"Risk Score: {risk['score']}\nLevel: {risk['label']}\n\nImmediate attention required!",
                    color=0xdc2626
                )
        except Exception:
            pass

        time.sleep(60)  # Check every 1 minute

# Start background thread
bg_thread = threading.Thread(target=refresh_cache, daemon=True)
bg_thread.start()


# ── API Endpoints ──

@app.get("/")
async def read_index():
    return FileResponse("index.html")

@app.get("/manifest.json")
async def get_manifest():
    return FileResponse("manifest.json", media_type="application/manifest+json")

@app.get("/service-worker.js")
async def get_sw():
    return FileResponse("static/service-worker.js", media_type="application/javascript")

@app.get("/health")
async def health_check():
    return {"status": "ok", "ryzm_os": "online"}


@app.get("/api/long-short")
async def get_long_short():
    """Long/Short Ratio"""
    try:
        return cache["long_short_ratio"]["data"]
    except Exception as e:
        logger.error(f"[API] L/S endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch L/S data")

@app.get("/api/briefing")
async def get_briefing():
    """View latest briefing"""
    try:
        briefing = cache["latest_briefing"]
        if not briefing.get("title"):
            return {"status": "empty", "title": "", "content": "", "time": ""}
        return {"status": "ok", **briefing}
    except Exception as e:
        logger.error(f"[API] Briefing endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch briefing")

@app.get("/api/funding-rate")
async def get_funding_rate():
    """Funding Rate"""
    try:
        return {"rates": cache["funding_rate"]["data"]}
    except Exception as e:
        logger.error(f"[API] Funding rate error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch funding rate")

@app.get("/api/liquidations")
async def get_liquidations():
    """Large trades (Whale Alerts)"""
    try:
        return {"trades": cache["liquidations"]["data"]}
    except Exception as e:
        logger.error(f"[API] Liquidations error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch liquidation data")

@app.get("/api/calendar")
async def get_calendar():
    """Economic Calendar"""
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        upcoming = [e for e in ECONOMIC_CALENDAR if e["date"] >= today][:8]
        return {"events": upcoming}
    except Exception as e:
        logger.error(f"[API] Calendar error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch calendar")

@app.get("/api/risk-gauge")
async def get_risk_gauge():
    """Composite System Risk Gauge"""
    try:
        return compute_risk_gauge()
    except Exception as e:
        logger.error(f"[API] Risk gauge error: {e}")
        raise HTTPException(status_code=500, detail="Failed to compute risk gauge")

@app.get("/api/scars")
async def get_museum_of_scars():
    """Historical Crash Archive"""
    return {"scars": MUSEUM_OF_SCARS}

@app.get("/api/heatmap")
async def get_heatmap():
    """Top Coins 24h Heatmap"""
    try:
        return {"coins": cache["heatmap"]["data"]}
    except Exception as e:
        logger.error(f"[API] Heatmap error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch heatmap")

@app.get("/api/health-check")
async def health_check_sources():
    """Data Source Status Check"""
    now = time.time()
    sources = [
        {"name": "CoinGecko", "key": "market", "icon": "🟢"},
        {"name": "RSS News", "key": "news", "icon": "🟢"},
        {"name": "Fear/Greed", "key": "fear_greed", "icon": "🟢"},
        {"name": "Upbit/KP", "key": "kimchi", "icon": "🟢"},
        {"name": "Binance L/S", "key": "long_short_ratio", "icon": "🟢"},
        {"name": "Binance FR", "key": "funding_rate", "icon": "🟢"},
        {"name": "Whale Trades", "key": "liquidations", "icon": "🟢"},
        {"name": "Heatmap", "key": "heatmap", "icon": "🟢"},
    ]
    active = 0
    for s in sources:
        updated = cache.get(s["key"], {}).get("updated", 0)
        age = now - updated if updated else 9999
        if age < CACHE_TTL * 2:
            s["status"] = "ok"
            s["icon"] = "🟢"
            s["age"] = round(age)
            active += 1
        elif age < CACHE_TTL * 5:
            s["status"] = "stale"
            s["icon"] = "🟡"
            s["age"] = round(age)
        else:
            s["status"] = "offline"
            s["icon"] = "🔴"
            s["age"] = -1
    return {"sources": sources, "active": active, "total": len(sources)}

@app.get("/api/news")
async def get_news():
    """Real-time News Feed"""
    try:
        return {"news": cache["news"]["data"]}
    except Exception as e:
        logger.error(f"[API] News endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch news data")

@app.get("/api/market")
async def get_market():
    """Market Data (BTC, ETH, SOL)"""
    try:
        return {"market": cache["market"]["data"]}
    except Exception as e:
        logger.error(f"[API] Market endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch market data")

@app.get("/api/fear-greed")
async def get_fear_greed():
    """Fear/Greed Index"""
    try:
        return cache["fear_greed"]["data"]
    except Exception as e:
        logger.error(f"[API] Fear/Greed endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch fear & greed data")

@app.get("/api/kimchi")
async def get_kimchi():
    """Kimchi Premium"""
    try:
        return cache["kimchi"]["data"]
    except Exception as e:
        logger.error(f"[API] Kimchi premium endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch kimchi premium data")

@app.get("/api/council")
async def get_council():
    """Convene AI Round Table"""
    try:
        # Use current cached data
        market = cache["market"]["data"]
        news = cache["news"]["data"]

        if not market:
            logger.warning("[Council] Empty market data")
            raise HTTPException(status_code=503, detail="Market data not available yet")

        # Request analysis from Gemini
        result = generate_council_debate(market, news)

        # Save to SQLite history
        btc_price = 0.0
        if isinstance(market, dict):
            btc_price = market.get("BTC", {}).get("price", 0.0)
        elif isinstance(market, list):
            for coin in market:
                if coin.get("symbol", "").upper() == "BTC":
                    btc_price = coin.get("price", 0.0)
                    break
        save_council_record(result, btc_price)

        # Evaluate past predictions in background
        threading.Thread(target=evaluate_council_accuracy, daemon=True).start()

        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[API] Council endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate council analysis")

@app.get("/api/council/history")
async def get_council_history_api(limit: int = 50):
    """Retrieve AI Council prediction history & accuracy stats"""
    records = get_council_history(limit)
    # Compute accuracy stats
    evaluated = [r for r in records if r["hit"] is not None]
    total_eval = len(evaluated)
    hits = sum(1 for r in evaluated if r["hit"] == 1)
    accuracy = round((hits / total_eval) * 100, 1) if total_eval > 0 else None
    return {
        "records": records,
        "stats": {
            "total_sessions": len(records),
            "evaluated": total_eval,
            "hits": hits,
            "accuracy_pct": accuracy
        }
    }

@app.get("/api/multi-timeframe")
async def get_multi_timeframe():
    """Multi-Timeframe Technical Analysis (RSI + EMA Cross)"""
    try:
        return cache["multi_tf"]["data"] or fetch_multi_timeframe()
    except Exception as e:
        logger.error(f"[API] MTF error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch multi-timeframe data")

@app.get("/api/onchain")
async def get_onchain():
    """On-Chain Data (Open Interest + Mempool + Hashrate)"""
    try:
        return cache["onchain"]["data"] or fetch_onchain_data()
    except Exception as e:
        logger.error(f"[API] On-chain error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch on-chain data")

@app.get("/api/scanner")
async def get_scanner():
    """Alpha Scanner — Oversold/Overbought + Volume Spike Alerts"""
    try:
        data = cache["scanner"]["data"]
        if not data:
            data = fetch_alpha_scanner()
        return {"alerts": data, "count": len(data), "ts": int(time.time())}
    except Exception as e:
        logger.error(f"[API] Scanner error: {e}")
        raise HTTPException(status_code=500, detail="Failed to scan markets")


# ─── Trade Validator ───

@app.get("/api/regime")
async def get_regime():
    """Market Regime Detector"""
    try:
        data = cache["regime"]["data"]
        return data if data else fetch_regime_data()
    except Exception as e:
        logger.error(f"[API] Regime error: {e}")
        raise HTTPException(status_code=500, detail="Failed to detect regime")

@app.get("/api/correlation")
async def get_correlation():
    """30-Day Correlation Matrix"""
    try:
        data = cache["correlation"]["data"]
        return data if data else fetch_correlation_matrix()
    except Exception as e:
        logger.error(f"[API] Correlation error: {e}")
        raise HTTPException(status_code=500, detail="Failed to compute correlation")

@app.get("/api/whale-wallets")
async def get_whale_wallets():
    """Large BTC Wallet Transactions"""
    try:
        data = cache["whale_wallets"]["data"]
        return {"transactions": data, "count": len(data)}
    except Exception as e:
        logger.error(f"[API] WhaleWallet error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch whale wallets")

@app.get("/api/liq-zones")
async def get_liq_zones():
    """Liquidation Heatmap Zones"""
    try:
        data = cache["liq_zones"]["data"]
        return data if data else fetch_liquidation_zones()
    except Exception as e:
        logger.error(f"[API] LiqZones error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch liquidation zones")

@app.post("/api/validate")
async def validate_trade(request: TradeValidationRequest):
    """AI evaluates user's trading plan"""
    try:
        market = cache["market"]["data"]
        news = cache["news"]["data"]
        fg_data = cache["fear_greed"]["data"]
        kimchi = cache["kimchi"]["data"]

        # Gemini evaluation prompt
        prompt = f"""
        You are the Ryzm Trade Validator. A trader wants to enter this position:

        **Trade Plan:**
        - Symbol: {request.symbol}
        - Entry Price: ${request.entry_price:,.2f}
        - Position: {request.position}

        **Current Market Context:**
        - Market Data: {json.dumps(market)}
        - Latest News: {json.dumps(news[:3])}
        - Fear & Greed Index: {fg_data.get('score', 50)} ({fg_data.get('label', 'Neutral')})
        - Kimchi Premium: {kimchi.get('premium', 0)}%

        **Task:**
        Evaluate this trade from 5 different AI personas and assign a WIN RATE (0-100).

        Return JSON ONLY with this structure:
        {{
            "overall_score": 75,
            "verdict": "CAUTIOUS LONG",
            "win_rate": "65%",
            "personas": [
                {{"name": "Quant", "stance": "BULLISH", "score": 80, "reason": "RSI oversold, good entry."}},
                {{"name": "News Analyst", "stance": "BEARISH", "score": 40, "reason": "Negative headlines dominate."}},
                {{"name": "Risk Manager", "stance": "NEUTRAL", "score": 60, "reason": "Volatility too high."}},
                {{"name": "Chart Reader", "stance": "BULLISH", "score": 75, "reason": "Support level confirmed."}},
                {{"name": "Macro Analyst", "stance": "BEARISH", "score": 50, "reason": "DXY rising, risk-off mode."}}
            ],
            "summary": "Mixed signals. Proceed with tight stop-loss."
        }}
        """

        model = genai.GenerativeModel('gemini-2.0-flash')
        response = model.generate_content(prompt)

        text = response.text.replace("```json", "").replace("```", "").strip()
        result = json.loads(text)
        logger.info(f"[Validator] Trade validated: {request.symbol} @ ${request.entry_price}")

        return result

    except json.JSONDecodeError as e:
        logger.error(f"[Validator] JSON parsing error: {e}")
        raise HTTPException(status_code=500, detail="Failed to parse AI response")
    except Exception as e:
        logger.error(f"[Validator] Error: {e}")
        raise HTTPException(status_code=500, detail=f"Validation failed: {str(e)}")

# ─── Ask Ryzm Chat ───
@app.post("/api/chat")
async def chat_with_ryzm(request: ChatRequest):
    """Real-time AI Chat"""
    try:
        market = cache["market"]["data"]
        news = cache["news"]["data"]
        fg_data = cache["fear_greed"]["data"]

        prompt = f"""
        You are "Ryzm", a ruthless crypto market analyst AI. Answer user questions with sharp, direct insights.

        **Current Market State:**
        - BTC: ${market.get('BTC', {}).get('price', 'N/A')} ({market.get('BTC', {}).get('change', 0):+.2f}%)
        - ETH: ${market.get('ETH', {}).get('price', 'N/A')} ({market.get('ETH', {}).get('change', 0):+.2f}%)
        - Fear & Greed: {fg_data.get('score', 50)}/100 ({fg_data.get('label', 'Neutral')})
        - Latest News: {json.dumps([n['title'] for n in news[:3]])}

        **User Question:** {request.message}

        **Instructions:**
        - Be concise (max 3 sentences).
        - Use crypto slang (FOMO, rekt, moon, etc.).
        - Reference actual data when possible.
        - If asked about a specific coin not in the data, say "No live data on that, anon."

        Return JSON:
        {{
            "response": "Your sharp, data-backed answer here.",
            "confidence": "HIGH/MED/LOW"
        }}
        """

        model = genai.GenerativeModel('gemini-2.0-flash')
        response = model.generate_content(prompt)

        text = response.text.replace("```json", "").replace("```", "").strip()
        result = json.loads(text)
        logger.info(f"[Chat] User asked: {request.message[:50]}...")

        return result

    except json.JSONDecodeError as e:
        logger.error(f"[Chat] JSON parsing error: {e}")
        return {"response": "System glitch. Try rephrasing.", "confidence": "LOW"}
    except Exception as e:
        logger.error(f"[Chat] Error: {e}")
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")

# ─── Admin: Infographic Generator (Gemini SVG) ───
@app.post("/api/admin/generate-infographic")
async def generate_infographic_api(request: InfographicRequest, http_request: Request):
    """
    Receive a topic and generate Ryzm-style SVG infographic code
    """
    require_admin(http_request)

    topic = request.topic or "Bitcoin Market Cycle"

    if not topic.strip():
        raise HTTPException(status_code=400, detail="Topic is required")
    
    prompt = f"""
    You are a visionary UI Data Designer for 'Ryzm Terminal'.
    Create a **Cyberpunk-style SVG Infographic** explaining: "{topic}".
    
    [Design System Specs]
    - Canvas: 800x500 pixels.
    - Background: #05050a (Deep Void).
    - Palette: Neon Cyan (#06b6d4), Magenta (#ec4899), Yellow (#facc15).
    - Font: sans-serif (ensure readable text).
    
    [Content Requirement]
    1. **Central Visual**: A minimal, geometric abstraction representing '{topic}' (e.g., charts, flows, nodes).
    2. **Title**: Large, centered at top ("{topic}").
    3. **Key Points**: 3 short bullet points at the bottom explaining the concept.
    4. **Watermark**: "Ryzm Terminal Analysis" (bottom right, small, opacity 0.5).
    
    [Output]
    Return ONLY the raw <svg>...</svg> code. No markdown formatting.
    """
    
    try:
        model = genai.GenerativeModel('gemini-2.0-flash')
        response = model.generate_content(prompt)
        svg_code = response.text.replace("```svg", "").replace("```xml", "").replace("```", "").strip()
        logger.info(f"[Admin] Generated infographic for topic: {topic}")
        return {"status": "success", "svg": svg_code}
    except Exception as e:
        logger.error(f"[Admin] Infographic generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate infographic: {str(e)}")


# ─── Admin: Discord Briefing Publisher ───

@app.post("/api/admin/publish-briefing")
async def publish_briefing(request: BriefingRequest, http_request: Request):
    """
    Send written report to Discord and save to server memory (for web publishing)
    """
    require_admin(http_request)

    if not request.title or not request.content:
        raise HTTPException(status_code=400, detail="Title and content are required")

    title = request.title
    content = request.content
    
    # 1. Save to server memory (Cache)
    cache["latest_briefing"] = {"title": title, "content": content, "time": datetime.now().strftime("%Y-%m-%d %H:%M")}
    logger.info(f"[Admin] Briefing saved: {title}")

    # 2. Send to Discord
    if not DISCORD_WEBHOOK_URL or DISCORD_WEBHOOK_URL == "YOUR_DISCORD_WEBHOOK_URL_HERE":
        logger.warning("[Admin] Discord webhook URL not configured")
        return {"status": "warning", "message": "Please set the webhook URL in your .env file!"}

    discord_data = {
        "username": "Ryzm Operator",
        "avatar_url": "https://i.imgur.com/8QZ7r7s.png",
        "embeds": [{
            "title": f"📜 {title}",
            "description": content,
            "color": 5763719,
            "footer": {"text": "Ryzm Terminal • Daily Insight"}
        }]
    }

    try:
        resp = requests.post(DISCORD_WEBHOOK_URL, json=discord_data, timeout=10)
        resp.raise_for_status()
        logger.info(f"[Admin] Successfully published to Discord")
        return {"status": "success", "message": "Published to Discord & Web"}
    except requests.RequestException as e:
        logger.error(f"[Admin] Discord publish error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to publish to Discord: {str(e)}")


# ─── Admin Page Route ───
@app.get("/admin")
async def admin_page():
    return FileResponse("admin.html")


# Static file mount (place after API routes!)
app.mount("/static", StaticFiles(directory="static"), name="static")

if __name__ == "__main__":
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))

    logger.info("🚀 Ryzm Terminal Engine Starting...")
    logger.info(f"👉 Access URL: http://{host}:{port}")
    logger.info("📡 API Endpoints:")
    logger.info("   /api/news        — Real-time News")
    logger.info("   /api/market      — BTC/ETH/SOL Prices")
    logger.info("   /api/fear-greed  — Fear/Greed Index")
    logger.info("   /api/kimchi      — Kimchi Premium")
    logger.info("   /api/council     — AI Round Table")
    logger.info("   /api/funding-rate— Funding Rate")
    logger.info("   /api/liquidations— Whale Alerts")
    logger.info("   /api/calendar    — Economic Calendar")
    logger.info("   /api/multi-timeframe — Multi-TF Analysis")
    logger.info("   /api/onchain     — On-Chain Data")
    logger.info("   /admin           — Operator Console")

    uvicorn.run(app, host=host, port=port)
