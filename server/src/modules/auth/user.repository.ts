import type { Queryable } from '../../db/pool.js';
import type { UserRow } from './auth.types.js';

const USER_COLUMNS = 'id, email, display_name, password_hash, quota_bytes, created_at';

export const userRepository = {
  async findByEmail(db: Queryable, email: string): Promise<UserRow | null> {
    const { rows } = await db.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE lower(email) = lower($1)`, [
      email,
    ]);
    return rows[0] ?? null;
  },

  async create(
    db: Queryable,
    input: { email: string; displayName: string; passwordHash: string; quotaBytes: number },
  ): Promise<UserRow> {
    const { rows } = await db.query<UserRow>(
      `INSERT INTO users (email, display_name, password_hash, quota_bytes)
       VALUES ($1, $2, $3, $4)
       RETURNING ${USER_COLUMNS}`,
      [input.email, input.displayName, input.passwordHash, input.quotaBytes],
    );
    return rows[0]!;
  },

  /**
   * Locks the user's row until the surrounding transaction ends. All
   * operations that change a user's storage usage or folder tree take this
   * lock first, so they run one at a time per user — this is what makes
   * the quota check and folder-cycle check race-free.
   */
  async lockForUpdate(db: Queryable, userId: string): Promise<{ quota_bytes: number } | null> {
    const { rows } = await db.query<{ quota_bytes: number }>(
      'SELECT quota_bytes FROM users WHERE id = $1 FOR UPDATE',
      [userId],
    );
    return rows[0] ?? null;
  },
};
