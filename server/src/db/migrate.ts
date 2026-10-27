import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type pg from 'pg';
import { repoRoot } from '../config/env.js';

export const migrationsDir = path.join(repoRoot, 'database', 'migrations');

// Arbitrary constant used to make sure two processes never migrate at once.
const MIGRATION_LOCK_ID = 727_001;

interface MigrationFile {
  version: string;
  filename: string;
  sql: string;
  checksum: string;
}

async function loadMigrations(): Promise<MigrationFile[]> {
  const entries = (await readdir(migrationsDir)).filter((f) => /^\d{3,}_[\w-]+\.sql$/.test(f)).sort();
  return Promise.all(
    entries.map(async (filename) => {
      const sql = await readFile(path.join(migrationsDir, filename), 'utf8');
      return {
        version: filename.split('_')[0]!,
        filename,
        sql,
        checksum: createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex'),
      };
    }),
  );
}

/**
 * Applies every migration in database/migrations that has not run yet.
 * Each migration runs in its own transaction and is recorded in
 * schema_migrations together with a checksum, so edits to an
 * already-applied migration are detected instead of silently ignored.
 */
export async function runMigrations(pool: pg.Pool, log: (msg: string) => void = () => {}): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version     text PRIMARY KEY,
        filename    text NOT NULL,
        checksum    text NOT NULL,
        applied_at  timestamptz NOT NULL DEFAULT now()
      )`);

    const { rows } = await client.query<{ version: string; checksum: string; filename: string }>(
      'SELECT version, checksum, filename FROM schema_migrations',
    );
    const done = new Map(rows.map((r) => [r.version, r]));

    for (const migration of await loadMigrations()) {
      const existing = done.get(migration.version);
      if (existing) {
        if (existing.checksum !== migration.checksum) {
          throw new Error(
            `Migration ${migration.filename} was modified after it was applied. ` +
              'Create a new migration instead of editing an applied one.',
          );
        }
        continue;
      }
      log(`Applying ${migration.filename} ...`);
      try {
        await client.query('BEGIN');
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations (version, filename, checksum) VALUES ($1, $2, $3)', [
          migration.version,
          migration.filename,
          migration.checksum,
        ]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`Migration ${migration.filename} failed: ${(err as Error).message}`);
      }
      applied.push(migration.filename);
    }
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {});
    client.release();
  }
}
