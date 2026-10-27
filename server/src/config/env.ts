import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

/** Absolute path of the server/ package directory. */
export const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** Absolute path of the repository root (where .env and database/ live). */
export const repoRoot = path.resolve(serverRoot, '..');

// One .env at the repository root configures everything.
// Real environment variables always win over values in the file.
dotenv.config({ path: path.join(repoRoot, '.env'), quiet: true });

const MB = 1024 * 1024;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (run `npm run setup`)').optional(),
  TEST_DATABASE_URL: z.string().optional(),
  STORAGE_DIR: z.string().default('./storage'),
  MAX_FILE_SIZE_MB: z.coerce.number().positive().max(10_240).default(100),
  DEFAULT_QUOTA_MB: z.coerce.number().nonnegative().default(1024),
  SESSION_TTL_DAYS: z.coerce.number().positive().max(365).default(7),
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  TRUST_PROXY: z.string().optional(),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).optional(),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().optional(),
});

function loadConfig() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  const env = parsed.data;
  const isProduction = env.NODE_ENV === 'production';
  const isTest = env.NODE_ENV === 'test';

  const databaseUrl = isTest ? env.TEST_DATABASE_URL : env.DATABASE_URL;

  return {
    env: env.NODE_ENV,
    isProduction,
    isTest,
    port: env.PORT,
    clientOrigins: env.CLIENT_ORIGIN.split(',')
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean),
    databaseUrl,
    storageDir: path.resolve(serverRoot, isTest ? './test-storage' : env.STORAGE_DIR),
    maxFileSizeBytes: Math.floor(env.MAX_FILE_SIZE_MB * MB),
    defaultQuotaBytes: Math.floor(env.DEFAULT_QUOTA_MB * MB),
    sessionTtlMs: env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : isProduction,
    trustProxy: env.TRUST_PROXY,
    bcryptRounds: env.BCRYPT_ROUNDS ?? (isTest ? 4 : 12),
    authRateLimitMax: env.AUTH_RATE_LIMIT_MAX ?? (isTest ? 1000 : 20),
  };
}

export type AppConfig = ReturnType<typeof loadConfig>;

export const config: AppConfig = loadConfig();
