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
    ...fetchOpts
  } = opts;

  // Dedup: if the same GET URL is already in-flight, share the promise
  const method = (fetchOpts.method || 'GET').toUpperCase();
  const dedupeKey = method === 'GET' && dedupe ? url : null;
  if (dedupeKey && _inflightRequests.has(dedupeKey)) {
    return _inflightRequests.get(dedupeKey);
  }

  fetchOpts.credentials = fetchOpts.credentials || 'same-origin';

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
        if (typeof toggleAuthModal === 'function') toggleAuthModal();
        throw new ApiError('Unauthorized', 401);
      }

      // 403 → show upgrade modal
      if (res.status === 403) {
        const body = await res.json().catch(() => ({}));
        const feature = body.feature || 'general';
        if (typeof openUpgradeModal === 'function') openUpgradeModal(feature + '_limit');
        throw new ApiError(body.detail || 'Forbidden', 403, body);
      }

      if (!res.ok) {
        throw new ApiError(`HTTP ${res.status}`, res.status);
      }

      if (raw) return res;
      return await res.json();
    } catch (err) {
      if (timer) clearTimeout(timer);

      // Don't retry on 401/403 or intentional abort
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) throw err;
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
    this.body = body;
  }
}

/**
 * safeUrl — allow only http/https URLs, block javascript: etc.
 * Moved here as shared utility; original in core.js preserved for compat.
 */
function safeUrl(url) {
  if (typeof url !== 'string') return '#';
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return '#';
}
