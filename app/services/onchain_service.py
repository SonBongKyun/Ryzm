"""
Ryzm Terminal — On-Chain Data Service
Long/Short ratio, funding rate, whale trades, whale wallets, liquidation zones, OI + mempool.
"""
from app.core.logger import logger
from app.core.http_client import resilient_get
from app.core.cache import cache


def fetch_long_short_ratio():
    """Binance Top Trader Long/Short Ratio (Accounts)."""
    try:
        url = "https://fapi.binance.com/futures/data/topLongShortAccountRatio"
        params = {"symbol": "BTCUSDT", "period": "1d", "limit": 1}
        resp = resilient_get(url, timeout=5, params=params)
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
    try:
        results = []
        for symbol in ["BTCUSDT", "ETHUSDT"]:
            resp = resilient_get(
                "https://fapi.binance.com/fapi/v1/aggTrades",
                timeout=5, params={"symbol": symbol, "limit": 80}
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
        results.sort(key=lambda x: x["time"], reverse=True)
        return results[:12]
    except Exception as e:
        logger.error(f"[Whale] Error: {e}")
        return []


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
    """Estimate liquidation density zones from OI + funding + leverage data."""
    try:
        price_resp = resilient_get("https://fapi.binance.com/fapi/v1/ticker/price?symbol=BTCUSDT", timeout=5)
        oi_resp = resilient_get("https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT", timeout=5)
        fr_resp = resilient_get("https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1", timeout=5)

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
    """On-chain metrics: Open Interest + Mempool fees + Hashrate."""
    result = {"open_interest": [], "mempool": {}, "hashrate": None}

    for sym in ["BTCUSDT", "ETHUSDT", "SOLUSDT"]:
        try:
            resp = resilient_get("https://fapi.binance.com/fapi/v1/openInterest", timeout=5, params={"symbol": sym})
            resp.raise_for_status()
            d = resp.json()
            oi_val = float(d.get("openInterest", 0))
            pr = resilient_get("https://fapi.binance.com/fapi/v1/premiumIndex", timeout=5, params={"symbol": sym})
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

    try:
        resp = resilient_get("https://mempool.space/api/v1/fees/recommended", timeout=5)
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

    try:
        resp = resilient_get("https://mempool.space/api/v1/mining/hashrate/3d", timeout=5)
        resp.raise_for_status()
        data = resp.json()
        if data.get("hashrates"):
            latest = data["hashrates"][-1]
            hashrate_eh = latest.get("avgHashrate", 0) / 1e18
            result["hashrate"] = {"value": round(hashrate_eh, 1), "unit": "EH/s"}
    except Exception as e:
        logger.error(f"[OnChain] Hashrate error: {e}")

    return result
