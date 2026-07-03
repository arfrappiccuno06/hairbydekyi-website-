import { clearSessionCookie } from '../../utils/auth.js';

export default async function handler(req, res) {
  // Allow POST or GET for logout
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Clear session cookie
    res.setHeader('Set-Cookie', clearSessionCookie());

    return res.status(200).json({
      success: true,
      message: 'Logout successful',
    });

  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({
      error: 'Logout failed',
      details: error.message,
    });
  }
}
