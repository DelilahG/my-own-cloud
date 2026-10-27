import { createHash, randomBytes } from 'node:crypto';

/** A new random session token (256 bits) for the cookie. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** The value stored in the database: SHA-256 of the token. */
export function hashSessionToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}
