"""
Ryzm Terminal — Analysis Service
Regime detector, correlation matrix, economic calendar, risk gauge.
"""
from datetime import datetime, timedelta

from app.core.logger import logger
from app.core.config import CORR_ASSETS, MUSEUM_OF_SCARS
from app.core.http_client import resilient_get
from app.core.cache import cache
from app.core.database import save_risk_record, get_risk_component_changes, get_component_sparklines
from app.services.market_service import fetch_yahoo_chart


def fetch_regime_data():
    """Regime Detector — BTC Dominance + USDT Dominance + Altcoin Season."""
    try:
        url = "https://api.coingecko.com/api/v3/global"
        resp = resilient_get(url, timeout=10, headers={"Accept": "application/json"})
        resp.raise_for_status()
        data = resp.json().get("data", {})
        btc_dom = round(data.get("market_cap_percentage", {}).get("btc", 0), 1)
        eth_dom = round(data.get("market_cap_percentage", {}).get("eth", 0), 1)
        usdt_dom = round(data.get("market_cap_percentage", {}).get("usdt", 0), 1)
        total_mcap = data.get("total_market_cap", {}).get("usd", 0)
        mcap_change = round(data.get("market_cap_change_percentage_24h_usd", 0), 2)
        alt_dom = round(100 - btc_dom - usdt_dom, 1)

        if btc_dom > 55 and mcap_change > 0:
            regime, label, color, advice = "BTC_SEASON", "Bitcoin Dominance", "#f59e0b", "Focus on BTC. Altcoins underperform."
        elif btc_dom < 45 and alt_dom > 40:
            regime, label, color, advice = "ALT_SEASON", "Altcoin Season", "#10b981", "Rotate into altcoins. BTC consolidating."
        elif usdt_dom > 8 and mcap_change < -2:
            regime, label, color, advice = "RISK_OFF", "Risk-Off / Bear", "#ef4444", "Capital fleeing to stables. Defensive mode."
        elif mcap_change > 3:
            regime, label, color, advice = "FULL_BULL", "Full Bull Market", "#06b6d4", "Rising tide lifts all boats. Stay long."
        else:
            regime, label, color, advice = "ROTATION", "Sector Rotation", "#8b5cf6", "Mixed signals. Selective positioning."

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
    """30-day correlation matrix: BTC, ETH, SOL, GOLD, NASDAQ."""
    prices = {}
    try:
        for name, cg_id in [("BTC", "bitcoin"), ("ETH", "ethereum"), ("SOL", "solana")]:
            url = f"https://api.coingecko.com/api/v3/coins/{cg_id}/market_chart?vs_currency=usd&days=30&interval=daily"
            resp = resilient_get(url, timeout=10, headers={"Accept": "application/json"})
            data = resp.json()
            prices[name] = [p[1] for p in data.get("prices", [])]

        for symbol, label in [("GC%3DF", "GOLD"), ("%5EIXIC", "NASDAQ")]:
            closes = fetch_yahoo_chart(symbol, range_str="1mo", interval="1d")
            prices[label] = closes if closes else []

        assets = ["BTC", "ETH", "SOL", "GOLD", "NASDAQ"]
        returns = {}
        for asset in assets:
            p = prices.get(asset, [])
            if len(p) > 1:
                returns[asset] = [(p[i] - p[i - 1]) / p[i - 1] for i in range(1, len(p))]
            else:
                returns[asset] = []

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
                std_a = (sum((x - mean_a) ** 2 for x in ra_s)) ** 0.5
                std_b = (sum((x - mean_b) ** 2 for x in rb_s)) ** 0.5
                if std_a == 0 or std_b == 0:
                    matrix[a][b] = 0
                else:
                    matrix[a][b] = round(cov / (std_a * std_b), 3)

        return {"assets": assets, "matrix": matrix}
    except Exception as e:
        logger.error(f"[Correlation] Error: {e}")
        return {"assets": [], "matrix": {}}


def generate_economic_calendar():
    """Auto-generate upcoming macro events for the next 6 months."""
    events = []
    now = datetime.now()

    fomc_dates = [
        "2026-01-28", "2026-03-18", "2026-05-06", "2026-06-17",
        "2026-07-29", "2026-09-16", "2026-11-04", "2026-12-16"
    ]
    for d in fomc_dates:
        events.append({"date": d, "event": "FOMC Rate Decision", "impact": "HIGH", "region": "US"})

    for month_offset in range(6):
        dt = now + timedelta(days=30 * month_offset)
        y, m = dt.year, dt.month
        first_day = datetime(y, m, 1)
        first_friday = first_day + timedelta(days=(4 - first_day.weekday()) % 7)
        events.append({"date": first_friday.strftime("%Y-%m-%d"), "event": "Non-Farm Payrolls", "impact": "HIGH", "region": "US"})
        events.append({"date": f"{y}-{m:02d}-12", "event": f"CPI ({datetime(y - 1 if m == 1 else y, 12 if m == 1 else m - 1, 1).strftime('%b')} YoY)", "impact": "HIGH", "region": "US"})

    today_str = now.strftime("%Y-%m-%d")
    events = [e for e in events if e["date"] >= today_str]
    events.sort(key=lambda x: x["date"])
    seen = set()
    unique = []
    for e in events:
        key = f"{e['date']}_{e['event']}"
        if key not in seen:
            seen.add(key)
            unique.append(e)
    return unique[:20]


def compute_risk_gauge():
    """Composite system risk score (-100 ~ +100). Negative = danger."""
    score = 0.0
    components = {}

    # 1) Fear & Greed (weight: -50 ~ +50)
    fg = cache["fear_greed"].get("data", {})
    fg_score = fg.get("score", 50)
    fg_contrib = (fg_score - 50)
    components["fear_greed"] = {"value": fg_score, "contrib": round(fg_contrib, 1), "label": fg.get("label", "Neutral")}
    score += fg_contrib

    # 2) Funding Rate (weight: -20 ~ +20)
    fr_data = cache["funding_rate"].get("data", [])
    if fr_data:
        avg_fr = sum(r["rate"] for r in fr_data) / len(fr_data)
        fr_contrib = max(-20, min(20, -avg_fr * 200))
        components["funding_rate"] = {"value": round(avg_fr, 4), "contrib": round(fr_contrib, 1)}
        score += fr_contrib

    # 3) Long/Short Ratio (weight: deviation * -0.6)
    ls = cache["long_short_ratio"].get("data", {})
    if ls and ls.get("longAccount"):
        long_pct = ls["longAccount"] * 100
        ls_deviation = abs(long_pct - 50)
        ls_contrib = -ls_deviation * 0.6
        components["long_short"] = {"value": round(long_pct, 1), "contrib": round(ls_contrib, 1)}
        score += ls_contrib

    # 4) VIX (weight: -25 / -10 / +5)
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

    # 5) Kimchi Premium (weight: 0 ~ -15)
    kp = cache["kimchi"].get("data", {})
    if kp and kp.get("premium") is not None:
        kp_val = abs(kp["premium"])
        kp_contrib = -min(15, kp_val * 3) if kp_val > 2 else 0
        components["kimchi"] = {"value": kp.get("premium", 0), "contrib": round(kp_contrib, 1)}
        score += kp_contrib

    # 6) Open Interest (weight: -15 ~ +5) — NEW
    onchain = cache.get("onchain", {}).get("data", {})
    oi_list = onchain.get("open_interest", [])
    btc_oi = next((o for o in oi_list if o.get("symbol") == "BTC"), None)
    if btc_oi:
        oi_usd = btc_oi.get("oi_usd", 0)
        # OI > 30B USD = overheated leverage
        if oi_usd > 30_000_000_000:
            oi_contrib = -15
        elif oi_usd > 25_000_000_000:
            oi_contrib = -8
        elif oi_usd > 20_000_000_000:
            oi_contrib = -3
        else:
            oi_contrib = 5
        components["open_interest"] = {
            "value": round(oi_usd / 1_000_000_000, 1),
            "contrib": oi_contrib,
            "unit": "B"
        }
        score += oi_contrib
    else:
        components["open_interest"] = {"value": 0, "contrib": 0, "unit": "B"}

    # 7) Stablecoin / USDT Dominance (weight: -10 ~ +5) — NEW
    regime = cache.get("regime", {}).get("data", {})
    usdt_dom = regime.get("usdt_dom", 0)
    if usdt_dom > 0:
        # High USDT dom = capital fleeing to stables = risk-off
        if usdt_dom > 8:
            sc_contrib = -10
        elif usdt_dom > 6:
            sc_contrib = -4
        elif usdt_dom < 4:
            sc_contrib = 5
        else:
            sc_contrib = 0
        components["stablecoin"] = {"value": round(usdt_dom, 1), "contrib": sc_contrib, "unit": "%"}
        score += sc_contrib
    else:
        components["stablecoin"] = {"value": 0, "contrib": 0, "unit": "%"}

    score = max(-100, min(100, score))

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

    save_risk_record(score, level, components)

    # AI Risk Commentary — identify biggest movers
    commentary = _generate_risk_commentary(components, score, level)

    # Component changes (1H/4H/24H) for heatmap
    changes = get_risk_component_changes()

    # Sparklines (7-day) for component trends
    sparklines = get_component_sparklines(7)

    return {
        "score": round(score, 1),
        "level": level,
        "label": label,
        "components": components,
        "commentary": commentary,
        "changes": changes,
        "sparklines": sparklines,
        "timestamp": datetime.now().strftime("%H:%M:%S")
    }


def _generate_risk_commentary(components: dict, score: float, level: str) -> str:
    """Generate AI-style one-liner explaining the risk score."""
    # Find top 2 contributors by absolute value
    ranked = sorted(
        [(k, v.get("contrib", 0)) for k, v in components.items()],
        key=lambda x: abs(x[1]),
        reverse=True
    )
    labels = {
        "fear_greed": "Fear/Greed",
        "vix": "VIX",
        "long_short": "L/S Ratio",
        "funding_rate": "Funding Rate",
        "kimchi": "Kimchi Premium",
        "open_interest": "Open Interest",
        "stablecoin": "USDT Dominance"
    }
    parts = []
    for k, contrib in ranked[:2]:
        name = labels.get(k, k)
        val = components[k].get("value", 0)
        unit = components[k].get("unit", "")
        direction = "▲" if contrib > 0 else "▼"
        parts.append(f"{name} {val}{unit}({direction}{abs(contrib):.0f}p)")

    if score <= -30:
        prefix = "⚠ Risk drivers:"
    elif score <= 0:
        prefix = "Caution:"
    elif score <= 30:
        prefix = "Stable:"
    else:
        prefix = "Favorable:"

    return f"{prefix} {' / '.join(parts)}"


def simulate_risk_gauge(params: dict) -> dict:
    """Simulate risk score from user-provided component values."""
    score = 0.0
    fg_score = params.get("fg", 50)
    fg_contrib = fg_score - 50
    score += fg_contrib

    vix_val = params.get("vix", 15)
    if vix_val > 30:
        vix_contrib = -25
    elif vix_val > 20:
        vix_contrib = -10
    else:
        vix_contrib = 5
    score += vix_contrib

    long_pct = params.get("ls", 50)
    ls_contrib = -abs(long_pct - 50) * 0.6
    score += ls_contrib

    avg_fr = params.get("fr", 0)
    fr_contrib = max(-20, min(20, -avg_fr * 200))
    score += fr_contrib

    kp_val = abs(params.get("kp", 0))
    kp_contrib = -min(15, kp_val * 3) if kp_val > 2 else 0
    score += kp_contrib

    oi_usd = params.get("oi", 20)  # in billions
    if oi_usd > 30:
        oi_contrib = -15
    elif oi_usd > 25:
        oi_contrib = -8
    elif oi_usd > 20:
        oi_contrib = -3
    else:
        oi_contrib = 5
    score += oi_contrib

    usdt_dom = params.get("sc", 5)
    if usdt_dom > 8:
        sc_contrib = -10
    elif usdt_dom > 6:
        sc_contrib = -4
    elif usdt_dom < 4:
        sc_contrib = 5
    else:
        sc_contrib = 0
    score += sc_contrib

    score = max(-100, min(100, score))

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

    return {"score": round(score, 1), "level": level, "label": label}
