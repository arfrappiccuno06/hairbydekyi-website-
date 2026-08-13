import crypto from 'crypto';

/**
 * Shared request-gating helpers for the serverless API.
 *
 * These live in utils/ (NOT api/) on purpose: they are imported by the existing
 * handlers, so they add ZERO new Vercel serverless functions (the Hobby plan
 * caps us at 12). Keeping them here also avoids copy-pasting the same auth /
 * rate-limit logic into every endpoint.
 */

/**
 * Constant-time string comparison that never throws on a length mismatch.
 * Using timingSafeEqual prevents an attacker from learning how much of a
 * guessed secret is correct by measuring response time.
 */
function safeEqual(provided, expected) {
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  // timingSafeEqual requires equal-length buffers; a length difference is
  // already a definitive mismatch, so short-circuit before comparing.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Gate a cron-only endpoint behind a shared secret (CRON_SECRET env var).
 *
 * cron-job.org must send the secret one of these ways:
 *   1. Header (preferred, kept out of URL logs):
 *        Authorization: Bearer <CRON_SECRET>
 *        x-cron-secret: <CRON_SECRET>
 *   2. Query param (fallback — appears in server/access logs):
 *        ?key=<CRON_SECRET>
 *
 * Fails CLOSED: if CRON_SECRET is not configured on the server the request is
 * rejected rather than allowed through, so a forgotten env var can never
 * silently disable protection.
 *
 * @returns {boolean} true if authorized (caller continues); false if a 401/503
 *   response was already sent (caller must `return` immediately).
 */
export function requireCron(req, res) {
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    console.error('requireCron: CRON_SECRET is not set; rejecting request.');
    res.status(503).json({ error: 'Service unavailable' });
    return false;
  }

  const authHeader = req.headers['authorization'] || '';
  const bearer = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const provided =
    bearer ||
    req.headers['x-cron-secret'] ||
    (req.query && req.query.key) ||
    '';

  if (!safeEqual(provided, expected)) {
    console.warn('requireCron: rejected request with missing/invalid secret.');
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }

  return true;
}

/**
 * In-memory fixed-window rate limiter.
 *
 * IMPORTANT (Vercel serverless caveat): this Map lives in a SINGLE function
 * instance's memory. Vercel may run several instances concurrently and recycles
 * them on cold starts, so the counter is PER-INSTANCE, not global. The real
 * ceiling is therefore roughly `limit × warm_instances`, and it resets whenever
 * an instance cold-starts. For a low-traffic site (usually 1 warm instance)
 * this is an effective, $0 abuse throttle — just not a hard, cluster-wide
 * guarantee. If you ever need that, back it with Upstash Redis (free tier) via
 * @upstash/ratelimit; the call sites would not change.
 */
const rlStore = new Map();
const RL_MAX_KEYS = 20000; // sweep expired entries once the map grows past this

/**
 * Best-effort client IP. Vercel sets x-real-ip to the true client address, so
 * prefer it: the left-most x-forwarded-for entry can be spoofed by the client
 * (Vercel appends the real IP *after* whatever the client sent).
 */
function getClientIp(req) {
  const realIp = req.headers['x-real-ip'];
  if (realIp) return String(realIp).trim();
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function sweepExpired(now) {
  for (const [k, v] of rlStore) {
    if (v.resetAt <= now) rlStore.delete(k);
  }
}

/**
 * Throttle a request by client IP.
 *
 * @param {object} opts
 * @param {string} opts.name     - bucket name (keeps endpoints' counters separate)
 * @param {number} opts.limit    - max requests allowed per window, per IP
 * @param {number} opts.windowMs - window length in milliseconds
 * @param {'json'|'html'} [opts.format='json'] - how to render the 429 body
 * @returns {boolean} true if allowed (caller continues); false if a 429 was
 *   already sent (caller must `return` immediately).
 */
export function rateLimit(req, res, { name, limit, windowMs, format = 'json' }) {
  const now = Date.now();
  const key = `${name}:${getClientIp(req)}`;

  let entry = rlStore.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    rlStore.set(key, entry);
  }
  entry.count++;

  // Bound memory: only sweeps once the map is large, so it's cheap in the
  // common case. The current key is never swept (its resetAt is in the future).
  if (rlStore.size > RL_MAX_KEYS) sweepExpired(now);

  const remaining = Math.max(0, limit - entry.count);
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

  if (entry.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    if (format === 'html') {
      res.status(429).send(
        `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Too many requests</title></head>` +
        `<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:60px auto;padding:0 20px;text-align:center;color:#5A4A41;">` +
        `<h1 style="color:#8B6D7B;">Too many requests</h1>` +
        `<p>You've made too many requests in a short time. Please wait a little while and try again.</p></body></html>`
      );
    } else {
      res.status(429).json({ error: 'Too many requests. Please slow down and try again shortly.' });
    }
    return false;
  }

  return true;
}
