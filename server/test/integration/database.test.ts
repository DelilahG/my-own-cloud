import { describe, expect, it } from 'vitest';
import { pool } from '../../src/db/pool.js';

// These tests talk to PostgreSQL directly to prove that the schema itself
// enforces the important invariants — even if application code had a bug.

async function insertUser(email: string) {
  const { rows } = await pool.query(
    `INSERT INTO users (email, display_name, password_hash, quota_bytes)
     VALUES ($1, 'x', 'hash', 1000) RETURNING id`,
    [email],
  );
  return rows[0].id as string;
}

async function insertFolder(userId: string, name: string, parentId: string | null = null) {
  const { rows } = await pool.query(
    'INSERT INTO folders (user_id, name, parent_id) VALUES ($1, $2, $3) RETURNING id',
    [userId, name, parentId],
  );
  return rows[0].id as string;
}

describe('database schema', () => {
  it('has recorded the applied migrations', async () => {
    const { rows } = await pool.query('SELECT version, checksum FROM schema_migrations ORDER BY version');
    expect(rows[0].version).toBe('001');
    expect(rows[0].checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it('enforces case-insensitive unique emails', async () => {
    await insertUser('Same@Example.com');
    await expect(insertUser('same@example.com')).rejects.toMatchObject({ code: '23505' });
  });

  it('prevents a folder from being its own parent', async () => {
    const user = await insertUser('a@example.com');
    const folder = await insertFolder(user, 'F');
    await expect(pool.query('UPDATE folders SET parent_id = id WHERE id = $1', [folder])).rejects.toMatchObject({
      code: '23514',
    });
  });

  it('prevents a folder from having a parent owned by another user', async () => {
    const alice = await insertUser('alice@example.com');
    const bob = await insertUser('bob@example.com');
    const aliceFolder = await insertFolder(alice, 'A');
    await expect(insertFolder(bob, 'B', aliceFolder)).rejects.toMatchObject({ code: '23503' });
  });

  it('prevents a file from being placed in another user\'s folder', async () => {
    const alice = await insertUser('alice2@example.com');
    const bob = await insertUser('bob2@example.com');
    const aliceFolder = await insertFolder(alice, 'A');
    await expect(
      pool.query(
        `INSERT INTO files (user_id, folder_id, name, storage_key, size_bytes, mime_type, checksum_sha256)
         VALUES ($1, $2, 'x.txt', gen_random_uuid()::text, 1, 'text/plain', repeat('a', 64))`,
        [bob, aliceFolder],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('cascades: deleting a user removes their sessions, folders and files', async () => {
    const user = await insertUser('gone@example.com');
    const folder = await insertFolder(user, 'F');
    await pool.query(
      `INSERT INTO files (user_id, folder_id, name, storage_key, size_bytes, mime_type, checksum_sha256)
       VALUES ($1, $2, 'x.txt', gen_random_uuid()::text, 1, 'text/plain', repeat('a', 64))`,
      [user, folder],
    );
    await pool.query("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, '\\x01', now())", [user]);
    await pool.query('DELETE FROM users WHERE id = $1', [user]);
    for (const table of ['sessions', 'folders', 'files']) {
      const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE user_id = $1`, [user]);
      expect(rows[0].n).toBe(0);
    }
  });

  it('rejects negative sizes and quotas', async () => {
    await expect(
      pool.query(
        `INSERT INTO users (email, display_name, password_hash, quota_bytes) VALUES ('n@example.com', 'n', 'h', -1)`,
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
