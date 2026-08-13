import {
  verifyAdminPassword,
  generateSessionToken,
  createSessionCookie,
  clearSessionCookie,
  getSessionFromCookie,
  verifySessionToken
} from '../../utils/auth.js';
import { rateLimit } from '../../utils/security.js';

export default async function handler(req, res) {
  const { action } = req.query;

  if (!action) {
    return res.status(400).json({ error: 'Action parameter is required' });
  }

  try {
    switch (action) {
      case 'login':
        return await handleLogin(req, res);
      case 'logout':
        return await handleLogout(req, res);
      case 'verify':
        return await handleVerify(req, res);
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(500).json({
      error: 'Authentication failed',
    });
  }
}

async function handleLogin(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate-limit login attempts to blunt password brute-forcing. Only the login
  // action is throttled — 'verify' runs on every admin page load and must not
  // be blocked.
  if (!rateLimit(req, res, { name: 'admin-login', limit: 10, windowMs: 15 * 60 * 1000 })) return;

  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  // Verify password
  if (!verifyAdminPassword(password)) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  // Generate session token
  const token = generateSessionToken();

  // Set HTTP-only cookie
  res.setHeader('Set-Cookie', createSessionCookie(token));

  return res.status(200).json({
    success: true,
    message: 'Login successful',
  });
}

async function handleLogout(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Clear session cookie
  res.setHeader('Set-Cookie', clearSessionCookie());

  return res.status(200).json({
    success: true,
    message: 'Logout successful',
  });
}

async function handleVerify(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cookieHeader = req.headers.cookie;
  const sessionToken = getSessionFromCookie(cookieHeader);

  if (!sessionToken || !verifySessionToken(sessionToken)) {
    return res.status(401).json({
      authenticated: false,
      error: 'Invalid or expired session',
    });
  }

  return res.status(200).json({
    authenticated: true,
  });
}
