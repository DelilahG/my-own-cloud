import { Router } from 'express';
import type { RequestHandler } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import type { createAuthController } from './auth.controller.js';

export function authRoutes(controller: ReturnType<typeof createAuthController>, authLimiter: RequestHandler) {
  const router = Router();
  router.post('/register', authLimiter, controller.register);
  router.post('/login', authLimiter, controller.login);
  router.post('/logout', requireAuth, controller.logout);
  router.get('/me', controller.me);
  return router;
}
