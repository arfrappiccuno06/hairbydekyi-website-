import { verifyAdminPassword, generateSessionToken, createSessionCookie } from '../../utils/auth.js';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
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

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      error: 'Login failed',
      details: error.message,
    });
  }
}
