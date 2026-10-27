import type { NextFunction, Request, Response } from 'express';
import { forbidden } from '../lib/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Header the frontend adds to every state-changing request. */
export const CSRF_HEADER = 'x-requested-with';
export const CSRF_HEADER_VALUE = 'MyOwnCloud';

/**
 * Cross-site request forgery protection for cookie-authenticated requests.
 * Three independent layers:
 *  1. The session cookie is SameSite=Lax, so browsers don't attach it to
 *     cross-site POST/PATCH/DELETE requests.
 *  2. If the browser sends an Origin header, it must be our own origin or an
 *     explicitly allowed one (CLIENT_ORIGIN).
 *  3. A custom header is required. HTML forms cannot set custom headers and
 *     cross-origin fetch() needs a CORS preflight, which only allowed origins pass.
 */
export function csrfProtection(allowedOrigins: string[]) {
  const allowed = new Set(allowedOrigins);
  return (req: Request, _res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method)) return next();

    const origin = req.get('origin');
    if (origin) {
      const ownOrigin = `${req.protocol}://${req.get('host')}`;
      if (origin !== ownOrigin && !allowed.has(origin)) {
        throw forbidden('Cross-origin request blocked.');
      }
    }
    if (req.get(CSRF_HEADER) !== CSRF_HEADER_VALUE) {
      throw forbidden('Missing or invalid request header.');
    }
    next();
  };
}
