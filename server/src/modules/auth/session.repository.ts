import type { Queryable } from '../../db/pool.js';
import type { UserRow } from './auth.types.js';

export type SessionWithUser = Omit<UserRow, 'password_hash'> & { session_id: string };

export const sessionRepository = {
  async create(
    db: Queryable,
    input: { userId: string; tokenHash: Buffer; expiresAt: Date; userAgent?: string; ipAddress?: string },
  ): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO sessions (user_id, token_hash, expires_at, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [input.userId, input.tokenHash, input.expiresAt, input.userAgent?.slice(0, 500) ?? null, input.ipAddress ?? null],
    );
    return rows[0]!.id;
  },

  /** Finds a non-expired session by token hash and returns it with its user. */
  async findValid(db: Queryable, tokenHash: Buffer): Promise<SessionWithUser | null> {
    const { rows } = await db.query<SessionWithUser>(
      `SELECT s.id AS session_id, u.id, u.email, u.display_name, u.quota_bytes, u.created_at
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [tokenHash],
    );
    return rows[0] ?? null;
  },

  /** Records activity, but at most once every 5 minutes to avoid a write per request. */
  async touch(db: Queryable, sessionId: string): Promise<void> {
    await db.query(
      `UPDATE sessions SET last_seen_at = now()
        WHERE id = $1 AND last_seen_at < now() - interval '5 minutes'`,
      [sessionId],
    );
  },

  async deleteById(db: Queryable, sessionId: string): Promise<void> {
    await db.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
  },

  async deleteExpired(db: Queryable): Promise<number> {
    const { rowCount } = await db.query('DELETE FROM sessions WHERE expires_at <= now()');
    return rowCount ?? 0;
  },
};
