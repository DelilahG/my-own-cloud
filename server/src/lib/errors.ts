/**
 * An error that is safe to show to API clients. Anything that is NOT an
 * AppError is treated as an internal error and its details are hidden.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'You need to sign in to do that.') =>
  new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'This request is not allowed.') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found.`);
export const conflict = (message: string) => new AppError(409, 'CONFLICT', message);
export const payloadTooLarge = (message: string) => new AppError(413, 'PAYLOAD_TOO_LARGE', message);
export const quotaExceeded = (message: string) => new AppError(413, 'QUOTA_EXCEEDED', message);

/** PostgreSQL error code for unique_violation. */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = err as { code?: string; constraint?: string };
  return e?.code === '23505' && (!constraint || e.constraint === constraint);
}
