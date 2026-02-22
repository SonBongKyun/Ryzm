"""
Ryzm Terminal — Configuration & Constants
All environment variables, API keys, Pydantic models, and static data.
"""
import os
import pathlib
from typing import List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field
from dotenv import load_dotenv

# ── Project Root ──
PROJECT_ROOT = pathlib.Path(__file__).resolve().parent.parent.parent

# ── Environment ──
load_dotenv()

# ── AI Configuration (lazy — validated on first use, not at import time) ──
_GENAI_API_KEY: str | None = None

def get_genai_api_key() -> str:
    """Return the Gemini API key, raising only when actually needed."""
    global _GENAI_API_KEY
    if _GENAI_API_KEY is None:
        _GENAI_API_KEY = os.getenv("GENAI_API_KEY", "")
    if not _GENAI_API_KEY:
        raise ValueError("GENAI_API_KEY is required. Please check your .env file.")
    return _GENAI_API_KEY

# Backward-compat alias (DEPRECATED — use get_genai_api_key() instead)
# This is an empty string at import time; do NOT use for actual API calls.
GENAI_API_KEY = os.getenv("GENAI_API_KEY", "")

# ── Admin / Discord ──
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN")
ADMIN_EMAILS = [e.strip().lower() for e in os.getenv("ADMIN_EMAILS", "").split(",") if e.strip()]
DISCORD_WEBHOOK_URL = os.getenv("DISCORD_WEBHOOK_URL", "")

# ── CORS ──
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:8000,http://127.0.0.1:8000").split(",")

# ── Rate Limiter ──
RATE_LIMIT_WINDOW = 60   # seconds
RATE_LIMIT_MAX_GENERAL = 120
RATE_LIMIT_MAX_AI = 5

# ── Cache TTL ──
CACHE_TTL = int(os.getenv("CACHE_TTL", "300"))  # 5 minutes
MARKET_CACHE_TTL = int(os.getenv("MARKET_CACHE_TTL", "60"))  # 60s for market prices
RISK_CACHE_TTL = int(os.getenv("RISK_CACHE_TTL", "60"))  # 60s for risk-critical data (L/S, FR, FG, KP)

# ── Auto-Council / Alerts ──
AUTO_COUNCIL_INTERVAL = int(os.getenv("AUTO_COUNCIL_INTERVAL", "3600"))
CRITICAL_ALERT_COOLDOWN = 1800  # 30 min
RISK_SAVE_INTERVAL = 600  # 10 min

# ── SaaS Limits ──
DAILY_FREE_LIMITS = {"validate": 3, "chat": 20, "council": 10}
DAILY_PRO_LIMITS = {"validate": 9999, "chat": 9999, "council": 9999}
MAX_FREE_ALERTS = 5
MAX_PRO_ALERTS = 100
MAX_FREE_JOURNAL = 20
MAX_PRO_JOURNAL = 500

# ── Email / SMTP Configuration ──
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER or "noreply@ryzmterminal.com")
BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")

# ── ToS ──
TOS_VERSION = "1.0"

# ── Pro Plan Pricing ──
PRO_PRICE_USD = 20  # monthly price in USD
STRIPE_PRO_PRICE_ID = os.getenv("STRIPE_PRO_PRICE_ID", "")  # Stripe Price ID
PRO_TRIAL_DAYS = int(os.getenv("PRO_TRIAL_DAYS", "7"))  # Free trial period

PRO_FEATURES: frozenset[str] = frozenset({
    "unlimited_validate",
    "unlimited_council",
    "unlimited_chat",
    "price_alerts",
    "layout_sync",
    "export_csv",
    # "export_pdf",       # Coming soon — v2.0
    # "telegram_alerts",  # Coming soon — v2.0
    # "backtest",         # Coming soon — v2.0
})

# ── Yahoo Finance ──
ENABLE_YAHOO = os.getenv("ENABLE_YAHOO", "true").lower() in ("true", "1", "yes")

# ── CoinGecko API Key (free demo key → ~30 req/min instead of ~10) ──
CG_DEMO_API_KEY = os.getenv("CG_DEMO_API_KEY", "")
CG_HEADERS = {"Accept": "application/json"}
if CG_DEMO_API_KEY:
    CG_HEADERS["x-cg-demo-api-key"] = CG_DEMO_API_KEY

# ── Alpha Scanner Configuration ──
TARGET_COINS = [
    "BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT",
    "ADAUSDT", "AVAXUSDT", "TRXUSDT", "LINKUSDT", "POLUSDT",
    "DOTUSDT", "LTCUSDT", "SHIBUSDT", "UNIUSDT", "ATOMUSDT",
    "SUIUSDT", "ARBUSDT", "NEARUSDT", "OPUSDT", "PEPEUSDT"
]

# ── Altcoin Catalog (available for user selection in Price panel) ──
ALTCOIN_CATALOG = [
    {"key": "XRP",  "symbol": "XRPUSDT",  "name": "Ripple",    "color": "#00aae4"},
    {"key": "DOGE", "symbol": "DOGEUSDT", "name": "Dogecoin",  "color": "#c2a633"},
    {"key": "ADA",  "symbol": "ADAUSDT",  "name": "Cardano",   "color": "#0033ad"},
    {"key": "AVAX", "symbol": "AVAXUSDT", "name": "Avalanche", "color": "#e84142"},
    {"key": "DOT",  "symbol": "DOTUSDT",  "name": "Polkadot",  "color": "#e6007a"},
    {"key": "LINK", "symbol": "LINKUSDT", "name": "Chainlink", "color": "#375bd2"},
    {"key": "SUI",  "symbol": "SUIUSDT",  "name": "Sui",       "color": "#6fbcf0"},
    {"key": "ARB",  "symbol": "ARBUSDT",  "name": "Arbitrum",  "color": "#28a0f0"},
    {"key": "OP",   "symbol": "OPUSDT",   "name": "Optimism",  "color": "#ff0420"},
    {"key": "NEAR", "symbol": "NEARUSDT", "name": "NEAR",      "color": "#00ec97"},
    {"key": "TRX",  "symbol": "TRXUSDT",  "name": "Tron",      "color": "#eb0029"},
    {"key": "LTC",  "symbol": "LTCUSDT",  "name": "Litecoin",  "color": "#bfbbbb"},
    {"key": "UNI",  "symbol": "UNIUSDT",  "name": "Uniswap",   "color": "#ff007a"},
    {"key": "ATOM", "symbol": "ATOMUSDT", "name": "Cosmos",    "color": "#6f7390"},
    {"key": "POL",  "symbol": "POLUSDT",  "name": "Polygon",   "color": "#8247e5"},
    {"key": "PEPE", "symbol": "PEPEUSDT", "name": "Pepe",      "color": "#4ca22c"},
    {"key": "SHIB", "symbol": "SHIBUSDT", "name": "Shiba Inu", "color": "#ffa409"},
    {"key": "APT",  "symbol": "APTUSDT",  "name": "Aptos",     "color": "#2ed8a3"},
    {"key": "AAVE", "symbol": "AAVEUSDT", "name": "Aave",      "color": "#b6509e"},
    {"key": "BNB",  "symbol": "BNBUSDT",  "name": "BNB",       "color": "#f0b90b"},
]

# ── Correlation Matrix Assets ──
CORR_ASSETS = {
    "BTC": "bitcoin",
    "ETH": "ethereum",
    "SOL": "solana",
    "GOLD": None,
    "NASDAQ": None
}

# ── News RSS Feed Sources ──
RSS_FEEDS = [
    {"name": "CoinDesk", "url": "https://www.coindesk.com/arc/outboundfeeds/rss/"},
    {"name": "CoinTelegraph", "url": "https://cointelegraph.com/rss"},
    {"name": "The Block", "url": "https://www.theblock.co/rss.xml"},
    {"name": "Decrypt", "url": "https://decrypt.co/feed"},
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
    {"date": "2023.03.10", "event": "SVB Bank Run", "drop": "-10%", "desc": "Silicon Valley Bank collapse. USDC depeg to $0.87. Contagion fear."},
    {"date": "2024.08.05", "event": "Yen Carry Unwind", "drop": "-18%", "desc": "BOJ rate hike triggered global carry trade unwind. BTC $65k→$49k."},
    {"date": "2025.01.27", "event": "DeepSeek AI Shock", "drop": "-7%", "desc": "Chinese AI model disrupted NVIDIA narrative. Tech sell-off spilled into crypto."},
    {"date": "2025.02.03", "event": "Trump Tariff War", "drop": "-12%", "desc": "US slapped 25% tariffs on Canada/Mexico, 10% on China. Risk-off cascade across crypto."},
]


# ───────────────────────────────────────
# Pydantic Models (Request)
# ───────────────────────────────────────
class InfographicRequest(BaseModel):
    topic: str = Field(..., max_length=200)

class BriefingRequest(BaseModel):
    title: str = Field(..., max_length=200)
    content: str = Field(..., max_length=5000)

class SetTierRequest(BaseModel):
    uid: str = Field(..., min_length=1, max_length=128)
    tier: Literal["free", "pro"]

class TradeValidationRequest(BaseModel):
    symbol: str = Field(..., max_length=20)
    entry_price: float = Field(..., gt=0, le=1_000_000)
    position: str = Field(..., pattern="^(LONG|SHORT)$")

class ChatRequest(BaseModel):
    message: str = Field(..., max_length=500)

class PriceAlertRequest(BaseModel):
    symbol: str = Field(..., max_length=20)
    target_price: float = Field(..., gt=0, le=10_000_000)
    direction: str = Field(..., pattern="^(above|below)$")
    note: str = Field(default="", max_length=200)

class LayoutSaveRequest(BaseModel):
    panels: dict = Field(default_factory=dict)


# ── Email pattern (basic RFC-ish check without extra dependency) ──
_EMAIL_RE = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"

# ── Auth Request Models ──
class RegisterRequest(BaseModel):
    email: str = Field(..., max_length=200, pattern=_EMAIL_RE)
    password: str = Field(..., min_length=8, max_length=200)
    display_name: str = Field(default="", max_length=50)
    accept_tos: bool = Field(default=False)
    invite_code: str = Field(default="", max_length=50)

class LoginRequest(BaseModel):
    email: str = Field(..., max_length=200, pattern=_EMAIL_RE)
    password: str = Field(..., max_length=200)

class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., max_length=200, pattern=_EMAIL_RE)

class ResetPasswordRequest(BaseModel):
    token: str = Field(..., max_length=200)
    new_password: str = Field(..., min_length=8, max_length=200)

class UpdateProfileRequest(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=50)

class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., max_length=200)
    new_password: str = Field(..., min_length=8, max_length=200)

# ── Admin Request Models ──
class AdminChangeTierRequest(BaseModel):
    tier: Literal["free", "pro"]

class AdminAnnouncementRequest(BaseModel):
    title: str = Field(..., max_length=200)
    content: str = Field(..., max_length=5000)
    level: Literal["info", "warning", "critical"] = "info"

class AdminToggleAnnouncementRequest(BaseModel):
    active: bool = True

class PortfolioHoldingRequest(BaseModel):
    symbol: str = Field(..., max_length=20)
    amount: float = Field(..., gt=0)
    avg_price: float = Field(default=0, ge=0)

class JournalCreateRequest(BaseModel):
    council_id: int = Field(default=0)
    snapshot: dict = Field(default_factory=dict)
    position_type: str = Field(default="", pattern="^(LONG|SHORT|)$")
    entry_price: float = Field(default=0, ge=0)
    stop_loss: float = Field(default=0, ge=0)
    take_profit: float = Field(default=0, ge=0)
    user_note: str = Field(default="", max_length=2000)
    tags: str = Field(default="", max_length=200)

class JournalUpdateRequest(BaseModel):
    position_type: Optional[str] = Field(default=None, pattern="^(LONG|SHORT|)$")
    entry_price: Optional[float] = Field(default=None, ge=0)
    stop_loss: Optional[float] = Field(default=None, ge=0)
    take_profit: Optional[float] = Field(default=None, ge=0)
    user_note: Optional[str] = Field(default=None, max_length=2000)
    tags: Optional[str] = Field(default=None, max_length=200)
    outcome: Optional[str] = Field(default=None, pattern="^(WIN|LOSS|BREAKEVEN|)$")
    outcome_price: Optional[float] = Field(default=None, ge=0)
    outcome_note: Optional[str] = Field(default=None, max_length=2000)


# ───────────────────────────────────────
# Pydantic Models (AI Response Validation)
# ───────────────────────────────────────
class CouncilVibe(BaseModel):
    model_config = ConfigDict(frozen=True)
    status: str = "UNKNOWN"
    color: str = "#555"
    message: str = ""

class CouncilAgent(BaseModel):
    model_config = ConfigDict(frozen=True)
    name: str = ""
    status: str = "NEUTRAL"
    message: str = ""

class CouncilNarrative(BaseModel):
    model_config = ConfigDict(frozen=True)
    name: str = ""
    score: int = 50
    trend: str = "FLAT"

class CouncilResponse(BaseModel):
    model_config = ConfigDict(frozen=True)
    vibe: CouncilVibe = CouncilVibe()
    narratives: List[CouncilNarrative] = []
    strategies: List[dict] = []
    agents: List[CouncilAgent] = []
    consensus_score: int = Field(default=50, ge=0, le=100)
    strategic_narrative: List[dict] = []

class ValidatorResponse(BaseModel):
    model_config = ConfigDict(frozen=True)
    overall_score: int = Field(default=50, ge=0, le=100)
    verdict: str = "UNKNOWN"
    win_rate: str = "N/A"
    personas: List[dict] = []
    summary: str = ""

class ChatResponse(BaseModel):
    model_config = ConfigDict(frozen=True)
    response: str = "System maintenance."
    confidence: str = "LOW"
