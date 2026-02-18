/* ═══════════════════════════════════════════════════════
   Ryzm Terminal — Central API Client & Fetch Utility
   PR-2: Unified fetch with timeout, retry, backoff,
         dedup, and 401/403 handling.
   ═══════════════════════════════════════════════════════ */

/**
 * apiFetch — resilient fetch wrapper.
 * @param {string} url
 * @param {object} opts — standard fetch options + { retries, timeoutMs, raw }
 * @returns {Promise<any>} parsed JSON (or Response if opts.raw)
 */
const _inflightRequests = new Map(); // url → Promise (dedup)

async function apiFetch(url, opts = {}) {
  const {
    retries = 2,
    timeoutMs = 8000,
    raw = false,
    dedupe = true,
    silent = false,   // suppress 401/403 modal popups (for background polling)
    ...fetchOpts
  } = opts;

  // Dedup: if the same GET URL is already in-flight, share the promise
  const method = (fetchOpts.method || 'GET').toUpperCase();
  const dedupeKey = method === 'GET' && dedupe ? url : null;
  if (dedupeKey && _inflightRequests.has(dedupeKey)) {
    return _inflightRequests.get(dedupeKey);
  }

  fetchOpts.credentials = fetchOpts.credentials || 'same-origin';

  // Auto-attach Bearer token from localStorage (dual-auth: cookie + header)
  const token = typeof localStorage !== 'undefined' && localStorage.getItem('ryzm_token');
  if (token && !fetchOpts.headers?.['Authorization']) {
    fetchOpts.headers = { ...fetchOpts.headers, 'Authorization': `Bearer ${token}` };
  }

  const doFetch = async (attempt) => {
    const controller = new AbortController();
    const timer = timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

    try {
      const res = await fetch(url, { ...fetchOpts, signal: controller.signal });
      if (timer) clearTimeout(timer);

      // 401 → redirect to login
      if (res.status === 401) {
        if (!silent && typeof toggleAuthModal === 'function') toggleAuthModal();
        throw new ApiError('Unauthorized', 401);
      }

      // 403 → show upgrade modal
      if (res.status === 403) {
        const body = await res.json().catch(() => ({}));
        const feature = body.feature || 'general';
        if (!silent && typeof openUpgradeModal === 'function') openUpgradeModal(feature + '_limit');
        throw new ApiError(body.detail || 'Forbidden', 403, body);
      }

      // 429 → rate limited, show toast with cooldown
      if (res.status === 429) {
        if (!silent && typeof showToast === 'function') {
          showToast('warning', 'Rate Limit', 'Too many requests — please wait a moment.');
        }
        throw new ApiError('Rate limit exceeded', 429);
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new ApiError(body.detail || `HTTP ${res.status}`, res.status, body);
      }

      if (raw) return res;
      return await res.json();
    } catch (err) {
      if (timer) clearTimeout(timer);

      // Don't retry on 401/403/429 or intentional abort
      if (err instanceof ApiError && [401, 403, 429].includes(err.status)) throw err;
      if (err.name === 'AbortError') {
        throw new ApiError('Request timeout', 408);
      }

      // Retry with exponential backoff + jitter
      if (attempt < retries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 8000) + Math.random() * 500;
        await new Promise(r => setTimeout(r, delay));
        return doFetch(attempt + 1);
      }
      throw err;
    }
  };

  const promise = doFetch(0).finally(() => {
    if (dedupeKey) _inflightRequests.delete(dedupeKey);
  });

  if (dedupeKey) _inflightRequests.set(dedupeKey, promise);
  return promise;
}

/** Custom error class with HTTP status */
class ApiError extends Error {
  constructor(message, status, body = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = body;        // canonical property
    this.body = body;        // alias for compat
  }
}

/**
 * extFetch — lightweight fetch wrapper for external APIs (Binance, etc.).
 * Adds timeout + retry but no auth/dedup logic.
 * @param {string} url
 * @param {object} opts — { timeoutMs, retries, ...fetchOpts }
 * @returns {Promise<any>} parsed JSON
 */
async function extFetch(url, opts = {}) {
  const { retries = 1, timeoutMs = 8000, ...fetchOpts } = opts;
  const doFetch = async (attempt) => {
    const controller = new AbortController();
    const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const res = await fetch(url, { ...fetchOpts, signal: controller.signal });
      if (timer) clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (timer) clearTimeout(timer);
      if (attempt < retries) {
        const delay = 1000 * Math.pow(2, attempt) + Math.random() * 300;
        await new Promise(r => setTimeout(r, delay));
        return doFetch(attempt + 1);
      }
      throw err;
    }
  };
  return doFetch(0);
}

// safeUrl() is defined in core.js — single source of truth (M-4 fix)
