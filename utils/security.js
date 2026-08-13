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
