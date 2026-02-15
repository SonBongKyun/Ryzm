"""
Ryzm Terminal — Centralized AI Client (google-genai SDK)
Single entry point for all Gemini calls with retry + validation.
Replaces scattered google.generativeai usage across the codebase.
"""
import time

from google import genai
from google.genai import types

from app.core.config import GENAI_API_KEY
from app.core.logger import logger
from app.core.security import parse_gemini_json

# ── Singleton client ──
_client = genai.Client(api_key=GENAI_API_KEY)

DEFAULT_MODEL = "gemini-2.0-flash"


def call_gemini(
    prompt: str,
    *,
    model: str = DEFAULT_MODEL,
    max_tokens: int = 1024,
    temperature: float = 0.7,
    json_mode: bool = True,
    max_retries: int = 2,
) -> str:
    """Call Gemini and return raw text. Retries on transient failures."""
    config_kwargs = {
        "max_output_tokens": max_tokens,
        "temperature": temperature,
    }
    if json_mode:
        config_kwargs["response_mime_type"] = "application/json"

    config = types.GenerateContentConfig(**config_kwargs)

    last_err = None
    for attempt in range(max_retries + 1):
        try:
            response = _client.models.generate_content(
                model=model,
                contents=prompt,
                config=config,
            )
            return response.text
        except Exception as e:
            last_err = e
            if attempt < max_retries:
                wait = 2 ** attempt
                logger.warning(f"[AI] Gemini attempt {attempt + 1} failed: {e}. Retrying in {wait}s...")
                time.sleep(wait)
            else:
                logger.error(f"[AI] Gemini call failed after {max_retries + 1} attempts: {e}")
    raise last_err


def call_gemini_json(
    prompt: str,
    *,
    model: str = DEFAULT_MODEL,
    max_tokens: int = 1024,
    temperature: float = 0.7,
    max_retries: int = 2,
) -> dict:
    """Call Gemini in JSON mode, parse response into dict."""
    text = call_gemini(
        prompt,
        model=model,
        max_tokens=max_tokens,
        temperature=temperature,
        json_mode=True,
        max_retries=max_retries,
    )
    return parse_gemini_json(text)
