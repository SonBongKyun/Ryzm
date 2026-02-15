"""
Ryzm Terminal — News Service
RSS feed aggregation and headline sentiment analysis.
"""
from datetime import datetime, timezone, timedelta

from app.core.logger import logger
from app.core.config import RSS_FEEDS

import feedparser


def classify_headline_sentiment(title):
    """Improved headline sentiment analysis (phrase-aware)."""
    t = title.lower()
    bull_phrases = ['etf approved', 'rate cut', 'drops investigation', 'ends probe',
                    'institutional buy', 'all-time high', 'mass adoption', 'clears regulation']
    bear_phrases = ['files lawsuit', 'under investigation', 'exchange hack', 'rug pull',
                    'ponzi scheme', 'market crash', 'bank run', 'rate hike']
    for p in bull_phrases:
        if p in t:
            return "BULLISH"
    for p in bear_phrases:
        if p in t:
            return "BEARISH"
    bull_words = ['surge', 'soar', 'rally', 'bullish', 'breakout', 'highs', 'record',
                  'jump', 'gain', 'boom', 'moon', 'buy', 'upgrade', 'approval',
                  'adopt', 'institutional', 'accumul', 'pump']
    bear_words = ['crash', 'plunge', 'bearish', 'dump', 'sell', 'liquidat', 'hack',
                  'ban', 'fraud', 'collapse', 'fear', 'warning', 'drop',
                  'decline', 'sue', 'regulation', 'ponzi']
    bull_score = sum(1 for w in bull_words if w in t)
    bear_score = sum(1 for w in bear_words if w in t)
    if bull_score > bear_score:
        return "BULLISH"
    elif bear_score > bull_score:
        return "BEARISH"
    return "NEUTRAL"


def fetch_news():
    """Collect RSS news with sentiment tags — ISO timestamps for reliable sorting."""
    articles = []
    for source in RSS_FEEDS:
        try:
            feed = feedparser.parse(source["url"])
            if not feed.entries:
                logger.warning(f"No entries found for {source['name']}")
                continue
            for entry in feed.entries[:5]:
                dt_utc = None
                if hasattr(entry, "published_parsed") and entry.published_parsed:
                    dt_utc = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
                elif hasattr(entry, "updated_parsed") and entry.updated_parsed:
                    dt_utc = datetime(*entry.updated_parsed[:6], tzinfo=timezone.utc)

                if dt_utc:
                    published_at_utc = dt_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
                    kst = dt_utc + timedelta(hours=9)
                    pub_time = kst.strftime("%H:%M")
                else:
                    published_at_utc = ""
                    pub_time = ""

                articles.append({
                    "time": pub_time,
                    "published_at_utc": published_at_utc,
                    "title": entry.get("title", "No title"),
                    "source": source["name"],
                    "link": entry.get("link", "#"),
                    "sentiment": classify_headline_sentiment(entry.get("title", "")),
                })
        except Exception as e:
            logger.error(f"[News] Error fetching {source['name']}: {e}")

    articles.sort(key=lambda x: x.get("published_at_utc", ""), reverse=True)
    return articles[:15]
