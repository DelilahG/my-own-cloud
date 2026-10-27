import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { createApp } from './app.js';
import { config } from './config/env.js';
import { runMigrations } from './db/migrate.js';
import { pool } from './db/pool.js';
import { sessionRepository } from './modules/auth/session.repository.js';

async function main() {
  // Fail fast with a clear message if the database is unreachable.
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    console.error(`[server] Cannot connect to PostgreSQL: ${(err as Error).message}`);
    console.error('[server] Is the database running? Start it with `npm run db:start` (or start your own PostgreSQL).');
    process.exit(1);
  }

  const applied = await runMigrations(pool, (m) => console.log(`[migrate] ${m}`));
  if (applied.length) console.log(`[migrate] Applied ${applied.length} migration(s).`);

  const { app, storage } = createApp();
  await storage.init();

  // Remove partial uploads left over from a previous crash.
  const leftovers = await readdir(storage.tempDir);
  await Promise.all(leftovers.map((f) => rm(path.join(storage.tempDir, f), { force: true })));

  // Purge expired sessions hourly.
  const cleanup = setInterval(() => {
    sessionRepository.deleteExpired(pool).catch((err) => console.error('[sessions] cleanup failed:', err.message));
  }, 60 * 60_000);
  cleanup.unref();

  const server = app.listen(config.port, () => {
    console.log(`[server] My Own Cloud API listening on http://localhost:${config.port} (${config.env})`);
  });
  // Large uploads on slow connections can take a while.
  server.requestTimeout = 30 * 60_000;

  const shutdown = () => {
    console.log('[server] Shutting down ...');
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[server] Failed to start:', err);
  process.exit(1);
});
