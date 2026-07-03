import crypto from 'crypto';

const SECRET_KEY = process.env.AUTH_SECRET || 'hairbydekyi-admin-secret-2026';
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

/**
 * Generate a signed session token with timestamp
 * @returns {string} Signed session token
 */
export function generateSessionToken() {
  const timestamp = Date.now();
  const signature = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(`${timestamp}`)
    .digest('hex');

  return `${timestamp}.${signature}`;
}

/**
 * Verify a session token is valid and not expired
 * @param {string} token - Session token to verify
 * @returns {boolean} True if valid and not expired
 */
export function verifySessionToken(token) {
  if (!token) return false;

  try {
    const [timestamp, signature] = token.split('.');

    if (!timestamp || !signature) return false;

    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', SECRET_KEY)
      .update(timestamp)
      .digest('hex');

    if (signature !== expectedSignature) return false;

    // Check expiration (24 hours)
    const tokenAge = Date.now() - parseInt(timestamp, 10);
    if (tokenAge > SESSION_DURATION) return false;

    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Create Set-Cookie header value for session token
 * @param {string} token - Session token
 * @returns {string} Set-Cookie header value
 */
export function createSessionCookie(token) {
  const maxAge = SESSION_DURATION / 1000; // Convert to seconds

  return `session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

/**
 * Create Set-Cookie header to clear session
 * @returns {string} Set-Cookie header value to clear cookie
 */
export function clearSessionCookie() {
  return 'session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0';
}

/**
 * Extract session token from cookie header
 * @param {string} cookieHeader - Cookie header from request
 * @returns {string|null} Session token or null
 */
export function getSessionFromCookie(cookieHeader) {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').map(c => c.trim());
  const sessionCookie = cookies.find(c => c.startsWith('session='));

  if (!sessionCookie) return null;

  return sessionCookie.split('=')[1];
}

/**
 * Verify admin password
 * @param {string} password - Password to verify
 * @returns {boolean} True if password is correct
 */
export function verifyAdminPassword(password) {
  const adminPassword = process.env.ADMIN_PASSWORD || 'arfasthebest420';
  return password === adminPassword;
}
