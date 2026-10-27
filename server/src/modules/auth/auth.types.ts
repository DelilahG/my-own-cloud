export interface UserRow {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  quota_bytes: number;
  created_at: Date;
}

/** The authenticated user attached to each request. Never includes the password hash. */
export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  quotaBytes: number;
  createdAt: string;
}

export function toSessionUser(row: Omit<UserRow, 'password_hash'>): SessionUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    quotaBytes: row.quota_bytes,
    createdAt: row.created_at.toISOString(),
  };
}
