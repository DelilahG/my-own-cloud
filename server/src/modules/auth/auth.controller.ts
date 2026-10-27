import type { CookieOptions, Request, Response } from 'express';
import type { AppConfig } from '../../config/env.js';
import { loginSchema, registerSchema } from './auth.schemas.js';
import type { AuthService, ClientInfo, NewSession } from './auth.service.js';

export const SESSION_COOKIE = 'moc_session';

export function sessionCookieOptions(config: AppConfig): CookieOptions {
  return {
    httpOnly: true, // not readable from JavaScript
    secure: config.cookieSecure, // HTTPS-only in production
    sameSite: 'lax', // not sent on cross-site POST/PUT/DELETE
    path: '/',
  };
}

function clientInfo(req: Request): ClientInfo {
  return { userAgent: req.get('user-agent'), ipAddress: req.ip };
}

export function createAuthController(auth: AuthService, config: AppConfig) {
  const setSessionCookie = (res: Response, session: NewSession) => {
    res.cookie(SESSION_COOKIE, session.token, { ...sessionCookieOptions(config), expires: session.expiresAt });
  };

  return {
    async register(req: Request, res: Response) {
      const input = registerSchema.parse(req.body);
      const session = await auth.register(input, clientInfo(req));
      setSessionCookie(res, session);
      res.status(201).json({ user: session.user });
    },

    async login(req: Request, res: Response) {
      const input = loginSchema.parse(req.body);
      const session = await auth.login(input, clientInfo(req));
      setSessionCookie(res, session);
      res.json({ user: session.user });
    },

    async logout(req: Request, res: Response) {
      if (req.sessionId) await auth.logout(req.sessionId);
      res.clearCookie(SESSION_COOKIE, sessionCookieOptions(config));
      res.status(204).end();
    },

    /** Current user, or `null` when signed out (lets the app check without a 401). */
    async me(req: Request, res: Response) {
      res.json({ user: req.user ?? null });
    },
  };
}
