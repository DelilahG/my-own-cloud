import { existsSync } from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { config as defaultConfig, repoRoot, type AppConfig } from './config/env.js';
import { pool } from './db/pool.js';
import { loadSession, requireAuth } from './middleware/auth.js';
import { csrfProtection } from './middleware/csrf.js';
import { apiNotFound, errorHandler } from './middleware/error-handler.js';
import { createAuthController } from './modules/auth/auth.controller.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { createAuthService } from './modules/auth/auth.service.js';
import { driveController } from './modules/drive/drive.controller.js';
import { createFileController } from './modules/files/file.controller.js';
import { fileRoutes } from './modules/files/file.routes.js';
import { createFileService } from './modules/files/file.service.js';
import { createFolderController } from './modules/folders/folder.controller.js';
import { folderRoutes } from './modules/folders/folder.routes.js';
import { createFolderService } from './modules/folders/folder.service.js';
import { storageSummaryHandler } from './modules/storage-stats/storage-stats.service.js';
import { LocalDiskStorage } from './storage/local-disk-storage.js';
import type { StorageDriver } from './storage/storage-driver.js';

export interface AppOptions {
  config?: Partial<AppConfig>;
  storage?: StorageDriver;
}

function jsonRateLimitHandler(message: string) {
  return (_req: Request, res: Response) => {
    res.status(429).json({ error: { code: 'RATE_LIMITED', message } });
  };
}

/**
 * Builds the Express application. Kept separate from index.ts (which
 * starts listening) so tests can create an app without opening a port.
 */
export function createApp(options: AppOptions = {}) {
  const config: AppConfig = { ...defaultConfig, ...options.config };
  const storage = options.storage ?? new LocalDiskStorage(config.storageDir);

  const authService = createAuthService(config);
  const authController = createAuthController(authService, config);
  const folderController = createFolderController(createFolderService(storage));
  const fileController = createFileController(config, createFileService(config, storage), storage);

  const app = express();
  if (config.trustProxy) app.set('trust proxy', /^\d+$/.test(config.trustProxy) ? Number(config.trustProxy) : config.trustProxy);

  // Security headers (CSP, nosniff, frameguard, HSTS in production, ...).
  app.use(
    helmet({
      hsts: config.isProduction,
      contentSecurityPolicy: {
        directives: {
          // Fonts and styles are bundled by Vite, so everything is same-origin.
          'img-src': ["'self'", 'data:', 'blob:'],
          'upgrade-insecure-requests': config.isProduction ? [] : null,
        },
      },
    }),
  );

  // Only our own frontend may make credentialed cross-origin requests.
  app.use(
    '/api',
    cors({
      origin: (origin, cb) => cb(null, !origin || config.clientOrigins.includes(origin)),
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'X-Requested-With'],
      maxAge: 600,
    }),
  );

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // General API rate limit, plus stricter limits on authentication.
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: config.isTest ? 10_000 : 600,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: jsonRateLimitHandler('Too many requests. Please slow down.'),
    }),
  );
  const authLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: config.authRateLimitMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: jsonRateLimitHandler('Too many attempts. Please wait a few minutes and try again.'),
  });

  app.use('/api', csrfProtection(config.clientOrigins));
  app.use('/api', loadSession(authService));

  app.get('/api/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'ok' });
  });

  app.use('/api/auth', authRoutes(authController, authLimiter));

  // Everything below requires a signed-in user.
  app.get('/api/drive', requireAuth, driveController.contents);
  app.get('/api/drive/search', requireAuth, driveController.search);
  app.get('/api/storage', requireAuth, storageSummaryHandler);
  app.use('/api/folders', requireAuth, folderRoutes(folderController));
  app.use('/api/files', requireAuth, fileRoutes(fileController));

  app.use('/api', apiNotFound);

  // In production, serve the built React app from the same origin.
  const clientDist = path.join(repoRoot, 'client', 'dist');
  if (config.isProduction && existsSync(path.join(clientDist, 'index.html'))) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/).*/, (_req: Request, res: Response, next: NextFunction) => {
      res.sendFile(path.join(clientDist, 'index.html'), (err) => err && next(err));
    });
  }

  app.use(errorHandler(config.maxFileSizeBytes));

  return { app, storage };
}
