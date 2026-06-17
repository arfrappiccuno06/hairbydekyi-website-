import crypto from 'crypto';

/**
 * Generate a secure random UUID token for booking Accept/Deny links
 * @returns {string} UUID token
 */
export function generateToken() {
  return crypto.randomUUID();
}
