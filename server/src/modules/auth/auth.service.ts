import bcrypt from 'bcryptjs';
import type { AppConfig } from '../../config/env.js';
import { pool } from '../../db/pool.js';
import { AppError, conflict, isUniqueViolation } from '../../lib/errors.js';
import { generateSessionToken, hashSessionToken } from '../../lib/tokens.js';
import type { LoginInput, RegisterInput } from './auth.schemas.js';
import { toSessionUser, type SessionUser } from './auth.types.js';
import { sessionRepository } from './session.repository.js';
import { userRepository } from './user.repository.js';

export interface ClientInfo {
  userAgent?: string;
  ipAddress?: string;
}

export interface NewSession {
  user: SessionUser;
  token: string;
  expiresAt: Date;
}

const invalidCredentials = () => new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.');

export function createAuthService(config: AppConfig) {
  // A real bcrypt hash of a random string. Comparing against it when the
  // email doesn't exist makes "unknown email" take as long as "wrong
  // password", so response timing doesn't reveal which accounts exist.
  const dummyHash = bcrypt.hashSync(generateSessionToken(), config.bcryptRounds);

  async function startSession(user: SessionUser, client: ClientInfo): Promise<NewSession> {
    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + config.sessionTtlMs);
    await sessionRepository.create(pool, {
      userId: user.id,
      tokenHash: hashSessionToken(token),
      expiresAt,
      userAgent: client.userAgent,
      ipAddress: client.ipAddress,
    });
    return { user, token, expiresAt };
  }

  return {
    async register(input: RegisterInput, client: ClientInfo): Promise<NewSession> {
      const passwordHash = await bcrypt.hash(input.password, config.bcryptRounds);
      try {
        const row = await userRepository.create(pool, {
          email: input.email,
          displayName: input.displayName,
          passwordHash,
          quotaBytes: config.defaultQuotaBytes,
        });
        return startSession(toSessionUser(row), client);
      } catch (err) {
        if (isUniqueViolation(err, 'users_email_lower_key')) {
          throw conflict('An account with this email already exists.');
        }
        throw err;
      }
    },

    async login(input: LoginInput, client: ClientInfo): Promise<NewSession> {
      const row = await userRepository.findByEmail(pool, input.email);
      const ok = await bcrypt.compare(input.password, row?.password_hash ?? dummyHash);
      if (!row || !ok) throw invalidCredentials();
      // Opportunistic cleanup of expired sessions (cheap, indexed).
      await sessionRepository.deleteExpired(pool);
      return startSession(toSessionUser(row), client);
    },

    async logout(sessionId: string): Promise<void> {
      await sessionRepository.deleteById(pool, sessionId);
    },

    /** Resolves a cookie token to its user, or null if missing/expired/unknown. */
    async authenticate(token: string): Promise<{ user: SessionUser; sessionId: string } | null> {
      const row = await sessionRepository.findValid(pool, hashSessionToken(token));
      if (!row) return null;
      await sessionRepository.touch(pool, row.session_id);
      return { user: toSessionUser(row), sessionId: row.session_id };
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
