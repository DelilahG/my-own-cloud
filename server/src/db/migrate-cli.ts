import { config } from '../config/env.js';
import { runMigrations } from './migrate.js';
import { pool } from './pool.js';

try {
  const dbName = new URL(config.databaseUrl!).pathname.slice(1);
  console.log(`[migrate] Database: ${dbName}`);
  const applied = await runMigrations(pool, (m) => console.log(`[migrate] ${m}`));
  console.log(applied.length ? `[migrate] Applied ${applied.length} migration(s).` : '[migrate] Already up to date.');
} catch (err) {
  console.error('[migrate] Error:', (err as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
