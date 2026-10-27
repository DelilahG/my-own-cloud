import type { SessionUser } from '../modules/auth/auth.types.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by the session middleware when a valid session cookie is present. */
      user?: SessionUser;
      /** Id of the current session row (used for logout). */
      sessionId?: string;
    }
  }
}

export {};
