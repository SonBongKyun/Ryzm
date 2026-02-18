"""
Ryzm Terminal — On-Chain Data Service
Long/Short ratio, funding rate, whale trades, whale wallets, liquidation zones, OI + mempool.
"""
import time as _time

from app.core.logger import logger
from app.core.http_client import resilient_get
from app.core.cache import cache


def fetch_long_short_ratio():
    """Binance Top Trader Long/Short Ratio (Accounts) — BTC, ETH, SOL."""
    result = {}
    for symbol in ["BTCUSDT", "ETHUSDT", "SOLUSDT"]:
        coin = symbol.replace("USDT", "")
        try:
            url = "https://fapi.binance.com/futures/data/topLongShortAccountRatio"
            params = {"symbol": symbol, "period": "1d", "limit": 1}
            resp = resilient_get(url, timeout=5, params=params)
            resp.raise_for_status()
            data = resp.json()
            if data and len(data) > 0:
                latest = data[0]
                result[coin] = {
                    "longAccount": float(latest["longAccount"]),
                    "shortAccount": float(latest["shortAccount"]),
                    "ratio": float(latest["longShortRatio"]),
                    "timestamp": latest["timestamp"]
                }
            else:
                result[coin] = {"longAccount": 0.50, "shortAccount": 0.50, "ratio": 1.0}
        except Exception as e:
            logger.error(f"[LS Ratio] {coin} Error: {e}")
            result[coin] = {"longAccount": 0.50, "shortAccount": 0.50, "ratio": 1.0}
    # Keep backward-compat top-level fields from BTC
    btc = result.get("BTC", {})
    return {
        "longAccount": btc.get("longAccount", 0.50),
        "shortAccount": btc.get("shortAccount", 0.50),
        "ratio": btc.get("ratio", 1.0),
        "timestamp": btc.get("timestamp"),
        "coins": result
    }


def fetch_long_short_history():
    """Binance Top Trader L/S Ratio — 24 data points (last 24 hours, 1h period)."""
    result = {}
    for symbol in ["BTCUSDT", "ETHUSDT", "SOLUSDT"]:
        coin = symbol.replace("USDT", "")
        try:
            url = "https://fapi.binance.com/futures/data/topLongShortAccountRatio"
            params = {"symbol": symbol, "period": "1h", "limit": 24}
            resp = resilient_get(url, timeout=5, params=params)
            resp.raise_for_status()
            data = resp.json()
            result[coin] = [
                {"long": float(d["longAccount"]) * 100, "ts": d["timestamp"]}
                for d in data
            ] if data else []
        except Exception as e:
            logger.error(f"[LS History] {coin} Error: {e}")
            result[coin] = []
    return result


def fetch_funding_rate():
    """Binance Futures Funding Rate."""
    try:
        results = []
        for symbol in ["BTCUSDT", "ETHUSDT", "SOLUSDT"]:
            resp = resilient_get(
                "https://fapi.binance.com/fapi/v1/premiumIndex",
                timeout=5, params={"symbol": symbol}
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
    """Detect large-scale futures trades (liquidation proxy)."""
    results = []
    for idx, symbol in enumerate(["BTCUSDT", "ETHUSDT"]):
        if idx > 0:
            _time.sleep(0.5)  # Stagger fapi.binance.com calls
        try:
            resp = resilient_get(
                "https://fapi.binance.com/fapi/v1/aggTrades",
                timeout=8, params={"symbol": symbol, "limit": 80}
            )
            resp.raise_for_status()
            for t in resp.json():
                price = float(t["p"])
                qty = float(t["q"])
                usd = price * qty
                if usd >= 100000:
                    results.append({
                        "symbol": symbol.replace("USDT", ""),
                        "side": "SELL" if t["m"] else "BUY",
                        "price": round(price, 2),
                        "qty": round(qty, 4),
                        "usd": round(usd, 0),
                        "time": t["T"]
                    })
        except Exception as e:
            logger.error(f"[Whale] {symbol} Error: {e}")
    results.sort(key=lambda x: x["time"], reverse=True)
    return results[:12]


def fetch_whale_wallets():
    """Monitor large BTC transactions via blockchain.info."""
    try:
        url = "https://blockchain.info/unconfirmed-transactions?format=json"
        resp = resilient_get(url, timeout=10)
        data = resp.json()
        txs = data.get("txs", [])

        large_txs = []
        for tx in txs:
            total_out = sum(o.get("value", 0) for o in tx.get("out", [])) / 1e8
            if total_out >= 10:
                btc_price = cache.get("market", {}).get("data", {}).get("BTC", {}).get("price", 68000)
                usd_val = total_out * btc_price
                is_exchange = any(
                    ("exchange" in str(o.get("addr", "")).lower()) or bool(o.get("spending_outpoints"))
                    for o in tx.get("out", [])
                )
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
    """Estimate liquidation density zones from OI + funding + leverage data."""
    try:
        price_resp = resilient_get("https://fapi.binance.com/fapi/v1/ticker/price?symbol=BTCUSDT", timeout=8)
        price_resp.raise_for_status()
        _time.sleep(0.3)
        oi_resp = resilient_get("https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT", timeout=8)
        oi_resp.raise_for_status()
        _time.sleep(0.3)
        fr_resp = resilient_get("https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1", timeout=8)
        fr_resp.raise_for_status()

        current_price = float(price_resp.json()["price"])
        oi_btc = float(oi_resp.json()["openInterest"])
        funding = float(fr_resp.json()[0]["fundingRate"])

        zones = []
        leverages = [5, 10, 25, 50, 100]
        for lev in leverages:
            long_liq = round(current_price * (1 - 1 / lev), 0)
            short_liq = round(current_price * (1 + 1 / lev), 0)
            estimated_vol = round(oi_btc * current_price * (0.3 / lev), 0)
            zones.append({
                "leverage": f"{lev}x",
                "long_liq_price": long_liq,
                "short_liq_price": short_liq,
                "est_volume_usd": estimated_vol
            })

        bias = "LONG_HEAVY" if funding > 0.0001 else "SHORT_HEAVY" if funding < -0.0001 else "BALANCED"
        bias_color = "#dc2626" if bias == "LONG_HEAVY" else "#059669" if bias == "SHORT_HEAVY" else "#888"

        return {
            "current_price": current_price,
            "total_oi_btc": round(oi_btc, 2),
            "total_oi_usd": round(oi_btc * current_price),
            "funding_rate": funding,
            "bias": bias,
            "bias_color": bias_color,
            "zones": zones
        }
    except Exception as e:
        logger.error(f"[LiqZones] Error: {e}")
        return {}


def fetch_onchain_data():
    """On-chain metrics: Open Interest (with 24h change) + Mempool fees + Hashrate sparkline."""
    result = {"open_interest": [], "mempool": {}, "hashrate": None, "hashrate_spark": []}

    for sym in ["BTCUSDT", "ETHUSDT", "SOLUSDT"]:
        try:
            resp = resilient_get("https://fapi.binance.com/fapi/v1/openInterest", timeout=8, params={"symbol": sym})
            resp.raise_for_status()
            d = resp.json()
            oi_val = float(d.get("openInterest", 0))
            _time.sleep(0.3)
            pr = resilient_get("https://fapi.binance.com/fapi/v1/premiumIndex", timeout=8, params={"symbol": sym})
            pr.raise_for_status()
            mark = float(pr.json().get("markPrice", 0))
            oi_usd = oi_val * mark

            # OI 24h change from kline data
            oi_change_pct = 0.0
            try:
                kl = resilient_get(
                    "https://fapi.binance.com/fapi/v1/klines",
                    timeout=5,
                    params={"symbol": sym, "interval": "1d", "limit": 2}
                )
                kl.raise_for_status()
                klines = kl.json()
                if len(klines) >= 2:
                    prev_close = float(klines[0][4])
                    curr_close = float(klines[1][4])
                    if prev_close > 0:
                        price_change = (curr_close - prev_close) / prev_close
                        oi_change_pct = round(price_change * 100, 2)
            except Exception:
                pass

            result["open_interest"].append({
                "symbol": sym.replace("USDT", ""),
                "oi_coins": round(oi_val, 2),
                "oi_usd": round(oi_usd, 0),
                "mark_price": round(mark, 2),
                "change_pct": oi_change_pct
            })
        except Exception as e:
            logger.error(f"[OnChain] OI error for {sym}: {e}")

    try:
        resp = resilient_get("https://mempool.space/api/v1/fees/recommended", timeout=5)
        resp.raise_for_status()
        fees = resp.json()
        fastest = fees.get("fastestFee", 0)
        result["mempool"] = {
            "fastest": fastest,
            "half_hour": fees.get("halfHourFee", 0),
            "hour": fees.get("hourFee", 0),
            "economy": fees.get("economyFee", 0),
            "congestion": "high" if fastest > 50 else "medium" if fastest > 15 else "low"
        }
    except Exception as e:
        logger.error(f"[OnChain] Mempool error: {e}")

    try:
        resp = resilient_get("https://mempool.space/api/v1/mining/hashrate/3d", timeout=5)
        resp.raise_for_status()
        data = resp.json()
        if data.get("hashrates"):
            hashrates = data["hashrates"]
            latest = hashrates[-1]
            hashrate_eh = latest.get("avgHashrate", 0) / 1e18
            result["hashrate"] = {"value": round(hashrate_eh, 1), "unit": "EH/s"}
            # Sparkline: sample up to 20 points from the 3-day data
            step = max(1, len(hashrates) // 20)
            result["hashrate_spark"] = [
                round(h.get("avgHashrate", 0) / 1e18, 1)
                for h in hashrates[::step]
            ][-20:]
    except Exception as e:
        logger.error(f"[OnChain] Hashrate error: {e}")

    return result
