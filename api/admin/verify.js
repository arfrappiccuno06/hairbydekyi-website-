import { getSessionFromCookie, verifySessionToken } from '../../utils/auth.js';

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
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

  } catch (error) {
    console.error('Verify error:', error);
    return res.status(500).json({
      authenticated: false,
      error: 'Verification failed',
      details: error.message,
    });
  }
}
