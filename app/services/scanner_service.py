"""
Ryzm Terminal — Alpha Scanner Service
Technical analysis helpers + multi-coin scanner.
"""
from app.core.logger import logger
from app.core.config import TARGET_COINS
from app.core.http_client import resilient_get


def calculate_rsi(closes, period=14):
    """Wilder's RSI calculation."""
    if len(closes) < period + 1:
        return None
    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
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
    """Exponential Moving Average."""
    if len(data) < period:
        return None
    mult = 2 / (period + 1)
    ema = sum(data[:period]) / period
    for val in data[period:]:
        ema = (val - ema) * mult + ema
    return round(ema, 2)


def calculate_vol_spike(volumes, period=20):
    """Calculate volume spike ratio vs trailing average."""
    if len(volumes) < period:
        return 0
    avg_vol = sum(volumes[-period:-1]) / (period - 1)
    curr_vol = volumes[-1]
    if avg_vol == 0:
        return 0
    return round((curr_vol / avg_vol) * 100, 1)


def fetch_alpha_scanner():
    """Alpha Scanner — RSI/Volume based opportunity detection."""
    import time as _time
    alerts = []
    for idx, symbol in enumerate(TARGET_COINS):
        if idx > 0 and idx % 4 == 0:
            _time.sleep(0.5)  # Rate-limit protection: pause every 4 coins
        try:
            url = "https://api.binance.com/api/v3/klines"
            params = {"symbol": symbol, "interval": "15m", "limit": 30}
            resp = resilient_get(url, timeout=5, params=params)
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

            coin = symbol.replace("USDT", "")

            if rsi > 70 and vol_spike > 200:
                alerts.append({
                    "symbol": coin, "type": "PUMP_ALERT",
                    "rsi": rsi, "vol": int(vol_spike), "change": price_change,
                    "msg": f"RSI {rsi} · Vol {int(vol_spike)}%",
                    "color": "#10b981", "priority": 1
                })
            elif rsi < 30 and vol_spike > 150:
                alerts.append({
                    "symbol": coin, "type": "OVERSOLD_BOUNCE",
                    "rsi": rsi, "vol": int(vol_spike), "change": price_change,
                    "msg": f"RSI {rsi} · Vol {int(vol_spike)}%",
                    "color": "#f59e0b", "priority": 2
                })
            elif vol_spike > 300:
                alerts.append({
                    "symbol": coin, "type": "VOL_SPIKE",
                    "rsi": rsi, "vol": int(vol_spike), "change": price_change,
                    "msg": f"Vol {int(vol_spike)}% · {'+' if price_change > 0 else ''}{price_change}%",
                    "color": "#8b5cf6", "priority": 3
                })
        except Exception:
            continue

    alerts.sort(key=lambda x: x.get("priority", 99))
    return alerts
