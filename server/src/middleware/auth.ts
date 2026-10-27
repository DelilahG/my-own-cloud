import type { NextFunction, Request, Response } from 'express';
import { unauthorized } from '../lib/errors.js';
import { SESSION_COOKIE } from '../modules/auth/auth.controller.js';
import type { AuthService } from '../modules/auth/auth.service.js';

/** Reads the session cookie (if any) and attaches the user to the request. */
export function loadSession(auth: AuthService) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string' && token.length > 0 && token.length <= 128) {
      const result = await auth.authenticate(token);
      if (result) {
        req.user = result.user;
        req.sessionId = result.sessionId;
      }
    }
    next();
  };
}

/** Rejects the request with 401 unless a valid session was loaded. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) throw unauthorized();
  next();
}

/** Returns the authenticated user's id (only call behind requireAuth). */
export function currentUserId(req: Request): string {
  if (!req.user) throw unauthorized();
  return req.user.id;
}
