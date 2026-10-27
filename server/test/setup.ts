import { rm } from 'node:fs/promises';
import { afterAll, beforeEach } from 'vitest';
import { config } from '../src/config/env.js';
import { pool } from '../src/db/pool.js';

if (!config.isTest || !new URL(config.databaseUrl!).pathname.endsWith('_test')) {
  throw new Error('Tests must run with NODE_ENV=test against a *_test database.');
}

beforeEach(async () => {
  // Start every test from an empty database and empty storage directory.
  await pool.query('TRUNCATE users CASCADE');
  await rm(config.storageDir, { recursive: true, force: true });
});

afterAll(async () => {
  await pool.end();
});
