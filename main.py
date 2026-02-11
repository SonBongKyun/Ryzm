import os
import json
import time
import threading
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any
from fastapi import FastAPI, HTTPException
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

# 환경변수 로드
load_dotenv()

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ── AI 설정 (Gemini API Key) ──
GENAI_API_KEY = os.getenv("GENAI_API_KEY")
if not GENAI_API_KEY:
    logger.error("GENAI_API_KEY not found in environment variables!")
    raise ValueError("GENAI_API_KEY is required. Please check your .env file.")

genai.configure(api_key=GENAI_API_KEY)

app = FastAPI(title="Ryzm Terminal API")

# CORS 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Pydantic 모델 ──
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

# ── 캐시 저장소 ──
cache = {
    "news": {"data": [], "updated": 0},
    "market": {"data": {}, "updated": 0},
    "fear_greed": {"data": {}, "updated": 0},
    "kimchi": {"data": {}, "updated": 0},
    "latest_briefing": {"title": "", "content": "", "time": ""},
}
CACHE_TTL = int(os.getenv("CACHE_TTL", "300"))  # 5분

# ── 뉴스 RSS 피드 소스 ──
RSS_FEEDS = [
    {"name": "CoinDesk", "url": "https://www.coindesk.com/arc/outboundfeeds/rss/"},
    {"name": "CoinTelegraph", "url": "https://cointelegraph.com/rss"},
    {"name": "The Block", "url": "https://www.theblock.co/rss.xml"},
    {"name": "Decrypt", "url": "https://decrypt.co/feed"},
]

def fetch_news():
    """RSS 피드에서 뉴스를 수집"""
    articles = []
    for source in RSS_FEEDS:
        try:
            feed = feedparser.parse(source["url"])
            if not feed.entries:
                logger.warning(f"No entries found for {source['name']}")
                continue

            for entry in feed.entries[:5]:  # 소스당 최대 5개
                # 시간 파싱
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
                })
        except Exception as e:
            logger.error(f"[News] Error fetching {source['name']}: {e}")

    # 시간 역순 정렬 후 최대 15개
    articles.sort(key=lambda x: x["time"], reverse=True)
    return articles[:15]


def fetch_coingecko_price(coin_id):
    """CoinGecko API로 암호화폐 가격 가져오기 (yfinance fallback)"""
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
    """환율 데이터 가져오기 (exchangerate-api.com - 무료)"""
    try:
        # USD 기준 환율 가져오기
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
    """Crypto + Macro 핵심 지표 가져오기 (Multi-source fallback)"""
    result = {}

    # CoinGecko 매핑 (암호화폐)
    coingecko_map = {
        "BTC": "bitcoin",
        "ETH": "ethereum",
        "SOL": "solana"
    }

    # 1) 암호화폐 가격 (CoinGecko)
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

    # 2) 환율 데이터 (Forex API)
    forex = fetch_forex_rates()
    if forex['JPY'] > 0:
        result["USD/JPY"] = {
            "price": round(forex['JPY'], 2),
            "change": 0,  # 변화율은 API 한계로 0
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

    # 3) VIX와 DXY는 yfinance 시도 (실패 시 fallback 값)
    macro_tickers = {
        "^VIX": ("VIX", 18.5),      # VIX 평균값 fallback
        "DX-Y.NYB": ("DXY", 104.0)  # DXY 평균값 fallback
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
                # fallback 값 사용 (데이터 없을 때)
                result[name] = {"price": fallback_price, "change": 0, "symbol": name}

        except Exception:
            # fallback 값 사용 (오류 시)
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
    """김프 계산: 업비트 vs 바이낸스 BTC 가격 비교"""
    try:
        # 업비트 BTC/KRW
        upbit_resp = requests.get(
            "https://api.upbit.com/v1/ticker?markets=KRW-BTC", timeout=10
        )
        upbit_resp.raise_for_status()
        upbit_data = upbit_resp.json()
        if not upbit_data or len(upbit_data) == 0:
            raise ValueError("Empty response from Upbit API")
        upbit_price = upbit_data[0]["trade_price"]

        # 바이낸스 BTC/USDT
        binance_resp = requests.get(
            "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT", timeout=10
        )
        binance_resp.raise_for_status()
        binance_price = float(binance_resp.json()["price"])

        # 환율 (USD/KRW)
        fx_resp = requests.get(
            "https://api.exchangerate-api.com/v4/latest/USD", timeout=10
        )
        fx_resp.raise_for_status()
        usd_krw = fx_resp.json()["rates"]["KRW"]

        # 김프 계산
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

    return {"premium": 0, "upbit_price": 0, "binance_price": 0, "usd_krw": 0}


# ── AI 원탁회의 (The Council) 로직 ──
def generate_council_debate(market_data, news_data):
    """
    Gemini 2.0 Flash에게 [토론 + 테마분석 + 전략수립]을 한 번에 요청 (토큰 절약)
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
    """

    try:
        model = genai.GenerativeModel('gemini-pro')
        response = model.generate_content(system_prompt)
        text = response.text.replace("```json", "").replace("```", "").strip()
        result = json.loads(text)
        logger.info("[Council] Successfully generated AI analysis")
        return result
    except json.JSONDecodeError as e:
        logger.error(f"[Ryzm Brain] JSON parsing error: {e}")
    except Exception as e:
        logger.error(f"[Ryzm Brain] Error: {e}")

    # 에러 시 기본값 반환
    return {
        "vibe": {"status": "OFFLINE", "color": "#555", "message": "System Reconnecting..."},
        "narratives": [],
        "strategies": [],
        "agents": [],
        "consensus_score": 50
    }


# ── 백그라운드 데이터 갱신 ──
def refresh_cache():
    """캐시 갱신 (5분마다)"""
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

        time.sleep(60)  # 1분마다 체크

# 백그라운드 스레드 시작
bg_thread = threading.Thread(target=refresh_cache, daemon=True)
bg_thread.start()


# ── API 엔드포인트 ──

@app.get("/")
async def read_index():
    return FileResponse("index.html")

@app.get("/health")
async def health_check():
    return {"status": "ok", "ryzm_os": "online"}

@app.get("/api/news")
async def get_news():
    """실시간 뉴스 피드"""
    try:
        return {"news": cache["news"]["data"]}
    except Exception as e:
        logger.error(f"[API] News endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch news data")

@app.get("/api/market")
async def get_market():
    """시장 데이터 (BTC, ETH, SOL)"""
    try:
        return {"market": cache["market"]["data"]}
    except Exception as e:
        logger.error(f"[API] Market endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch market data")

@app.get("/api/fear-greed")
async def get_fear_greed():
    """공포/탐욕 지수"""
    try:
        return cache["fear_greed"]["data"]
    except Exception as e:
        logger.error(f"[API] Fear/Greed endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch fear & greed data")

@app.get("/api/kimchi")
async def get_kimchi():
    """김치 프리미엄"""
    try:
        return cache["kimchi"]["data"]
    except Exception as e:
        logger.error(f"[API] Kimchi premium endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch kimchi premium data")

@app.get("/api/council")
async def get_council():
    """AI 원탁회의 소집"""
    try:
        # 현재 캐시된 데이터 활용
        market = cache["market"]["data"]
        news = cache["news"]["data"]

        if not market:
            logger.warning("[Council] Empty market data")
            raise HTTPException(status_code=503, detail="Market data not available yet")

        # Gemini에게 분석 요청
        result = generate_council_debate(market, news)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[API] Council endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate council analysis")

# ─── Trade Validator ───
@app.post("/api/validate")
async def validate_trade(request: TradeValidationRequest):
    """사용자의 매매 계획을 AI가 평가"""
    try:
        market = cache["market"]["data"]
        news = cache["news"]["data"]
        fg_data = cache["fear_greed"]["data"]
        kimchi = cache["kimchi"]["data"]

        # Gemini 평가 프롬프트
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

        model = genai.GenerativeModel('gemini-pro')
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
    """실시간 AI 채팅"""
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

        model = genai.GenerativeModel('gemini-pro')
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

# ─── Admin: 인포그래픽 생성기 (Gemini SVG) ───
@app.post("/api/admin/generate-infographic")
async def generate_infographic_api(request: InfographicRequest):
    """
    주제(topic)를 받아서 Ryzm 스타일의 SVG 인포그래픽 코드를 생성
    """
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
        model = genai.GenerativeModel('gemini-pro')
        response = model.generate_content(prompt)
        svg_code = response.text.replace("```svg", "").replace("```xml", "").replace("```", "").strip()
        logger.info(f"[Admin] Generated infographic for topic: {topic}")
        return {"status": "success", "svg": svg_code}
    except Exception as e:
        logger.error(f"[Admin] Infographic generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate infographic: {str(e)}")


# ─── Admin: 디스코드 브리핑 발송기 ───
DISCORD_WEBHOOK_URL = os.getenv("DISCORD_WEBHOOK_URL", "")

@app.post("/api/admin/publish-briefing")
async def publish_briefing(request: BriefingRequest):
    """
    작성된 리포트를 디스코드에 전송하고, 서버 메모리에 저장(웹 게시용)
    """
    if not request.title or not request.content:
        raise HTTPException(status_code=400, detail="Title and content are required")

    title = request.title
    content = request.content
    
    # 1. 서버 메모리(Cache)에 저장
    cache["latest_briefing"] = {"title": title, "content": content, "time": datetime.now().strftime("%Y-%m-%d %H:%M")}
    logger.info(f"[Admin] Briefing saved: {title}")

    # 2. 디스코드 전송
    if not DISCORD_WEBHOOK_URL or DISCORD_WEBHOOK_URL == "여기에_너의_디스코드_웹후크_URL_입력":
        logger.warning("[Admin] Discord webhook URL not configured")
        return {"status": "warning", "message": "웹후크 URL을 .env 파일에 설정해주세요!"}

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


# ─── Admin 페이지 라우트 ───
@app.get("/admin")
async def admin_page():
    return FileResponse("admin.html")


# 정적 파일 마운트 (API 라우트 뒤에 배치!)
app.mount("/static", StaticFiles(directory="static"), name="static")

if __name__ == "__main__":
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))

    logger.info("🚀 Ryzm Terminal Engine Starting...")
    logger.info(f"👉 접속 주소: http://{host}:{port}")
    logger.info("📡 API 엔드포인트:")
    logger.info("   /api/news        — 실시간 뉴스")
    logger.info("   /api/market      — BTC/ETH/SOL 시세")
    logger.info("   /api/fear-greed  — 공포/탐욕 지수")
    logger.info("   /api/kimchi      — 김치 프리미엄")
    logger.info("   /api/council     — AI 원탁회의")
    logger.info("   /admin           — Operator Console")

    uvicorn.run(app, host=host, port=port)
