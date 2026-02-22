"""
Ryzm Terminal — API Diagnostic Script
Run this locally or on the deployed server to test each external API endpoint.
Usage: python debug_apis.py
"""
import time
import requests
import json
import sys

TIMEOUT = 10
RESULTS = []

def test_api(name, url, params=None, headers=None):
    """Test a single API endpoint and report results."""
    start = time.time()
    try:
        resp = requests.get(url, timeout=TIMEOUT, params=params, headers=headers)
        elapsed = round((time.time() - start) * 1000)
        status = resp.status_code
        try:
            body = resp.json()
            preview = json.dumps(body, ensure_ascii=False)[:200]
        except Exception:
            preview = resp.text[:200]

        ok = status == 200
        result = {
            "name": name, "url": url, "status": status,
            "ok": ok, "elapsed_ms": elapsed, "preview": preview
        }
        icon = "✅" if ok else "❌"
        print(f"  {icon} [{status}] {name} ({elapsed}ms)")
        if not ok:
            print(f"     → Response: {preview}")
        RESULTS.append(result)
        return ok
    except requests.exceptions.Timeout:
        elapsed = round((time.time() - start) * 1000)
        print(f"  ❌ [TIMEOUT] {name} ({elapsed}ms)")
        RESULTS.append({"name": name, "url": url, "status": "TIMEOUT", "ok": False, "elapsed_ms": elapsed})
        return False
    except Exception as e:
        elapsed = round((time.time() - start) * 1000)
        print(f"  ❌ [ERROR] {name}: {e}")
        RESULTS.append({"name": name, "url": url, "status": "ERROR", "ok": False, "elapsed_ms": elapsed, "error": str(e)})
        return False


def main():
    print("=" * 60)
    print("  Ryzm Terminal — External API Diagnostic")
    print("=" * 60)

    # ── Group 1: Binance Spot (should work) ──
    print("\n[1] Binance SPOT API (api.binance.com)")
    test_api("Binance Spot Ticker",
             "https://api.binance.com/api/v3/ticker/price",
             params={"symbol": "BTCUSDT"})
    time.sleep(0.3)
    test_api("Binance Spot Klines",
             "https://api.binance.com/api/v3/klines",
             params={"symbol": "BTCUSDT", "interval": "15m", "limit": 5})

    # ── Group 2: Binance Futures (likely failing) ──
    print("\n[2] Binance FUTURES API (fapi.binance.com)")
    time.sleep(0.5)
    test_api("Futures Ticker/Price",
             "https://fapi.binance.com/fapi/v1/ticker/price",
             params={"symbol": "BTCUSDT"})
    time.sleep(0.5)
    test_api("Futures OpenInterest",
             "https://fapi.binance.com/fapi/v1/openInterest",
             params={"symbol": "BTCUSDT"})
    time.sleep(0.5)
    test_api("Futures PremiumIndex (Funding)",
             "https://fapi.binance.com/fapi/v1/premiumIndex",
             params={"symbol": "BTCUSDT"})
    time.sleep(0.5)
    test_api("Futures AggTrades",
             "https://fapi.binance.com/fapi/v1/aggTrades",
             params={"symbol": "BTCUSDT", "limit": 10})
    time.sleep(0.5)
    test_api("Futures FundingRate",
             "https://fapi.binance.com/fapi/v1/fundingRate",
             params={"symbol": "BTCUSDT", "limit": 1})
    time.sleep(0.5)
    test_api("Futures L/S Ratio",
             "https://fapi.binance.com/futures/data/topLongShortAccountRatio",
             params={"symbol": "BTCUSDT", "period": "1d", "limit": 1})

    # ── Group 3: CoinGecko (likely rate-limited) ──
    print("\n[3] CoinGecko API (api.coingecko.com)")
    time.sleep(1)
    test_api("CoinGecko /global",
             "https://api.coingecko.com/api/v3/global",
             headers={"Accept": "application/json"})
    time.sleep(2)
    test_api("CoinGecko /coins/markets",
             "https://api.coingecko.com/api/v3/coins/markets",
             params={"vs_currency": "usd", "order": "market_cap_desc", "per_page": 3, "page": 1},
             headers={"Accept": "application/json"})
    time.sleep(2)
    test_api("CoinGecko /market_chart (BTC)",
             "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart",
             params={"vs_currency": "usd", "days": 7, "interval": "daily"},
             headers={"Accept": "application/json"})

    # ── Group 4: Yahoo Finance ──
    print("\n[4] Yahoo Finance (query1.finance.yahoo.com)")
    time.sleep(0.5)
    yh = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    test_api("Yahoo VIX",
             "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?range=5d&interval=1d",
             headers=yh)
    time.sleep(0.5)
    test_api("Yahoo Gold",
             "https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?range=1mo&interval=1d",
             headers=yh)

    # ── Group 5: Other working APIs ──
    print("\n[5] Other APIs")
    test_api("Fear & Greed",
             "https://api.alternative.me/fng/?limit=1")
    time.sleep(0.3)
    test_api("Blockchain.info (Whale Wallets)",
             "https://blockchain.info/unconfirmed-transactions?format=json")
    time.sleep(0.3)
    test_api("ExchangeRate (Forex)",
             "https://api.exchangerate-api.com/v4/latest/USD")
    time.sleep(0.3)
    test_api("Mempool.space (Fees)",
             "https://mempool.space/api/v1/fees/recommended")

    # ── Summary ──
    print("\n" + "=" * 60)
    ok_count = sum(1 for r in RESULTS if r["ok"])
    fail_count = len(RESULTS) - ok_count
    print(f"  TOTAL: {ok_count}/{len(RESULTS)} passed, {fail_count} failed")

    if fail_count > 0:
        print("\n  Failed endpoints:")
        for r in RESULTS:
            if not r["ok"]:
                print(f"    ❌ {r['name']} → {r['status']}")

    # Check resilient_get backoff state if running inside the app
    try:
        from app.core.http_client import _api_429_backoff, _api_fail_count
        print("\n  HTTP Client Backoff State:")
        now = time.time()
        for domain, earliest in _api_429_backoff.items():
            remaining = max(0, round(earliest - now))
            fails = _api_fail_count.get(domain, 0)
            status = f"BACKED OFF ({remaining}s remaining)" if now < earliest else "OK"
            print(f"    {domain}: {status} (fails: {fails})")
        if not _api_429_backoff:
            print("    (no domains in backoff)")
    except ImportError:
        pass

    print("=" * 60)


if __name__ == "__main__":
    main()
