import pg from 'pg';
import { config } from '../config/env.js';

// Return BIGINT (int8) columns as JS numbers. File sizes and quotas are far
// below Number.MAX_SAFE_INTEGER (9 PB), so this is safe here.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));

if (!config.databaseUrl) {
  throw new Error(
    config.isTest
      ? 'TEST_DATABASE_URL is not set. Add it to .env (see .env.example).'
      : 'DATABASE_URL is not set. Run `npm run setup` or add it to .env (see .env.example).',
  );
}

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  // An idle client errored (e.g. the database restarted). The pool discards it.
  console.error('[db] Unexpected idle client error:', err.message);
});

/** Anything that can run a query: the pool or a client inside a transaction. */
export type Queryable = Pick<pg.Pool, 'query'> | pg.PoolClient;

/** Runs `fn` inside a transaction, committing on success and rolling back on error. */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
