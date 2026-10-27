import type { Queryable } from '../../db/pool.js';
import { categorize, PREVIEWABLE_IMAGE_TYPES, type FileCategory } from '../../lib/file-types.js';
import { likePattern, orderByClause, prefixPattern, type SortField, type SortOrder } from '../../lib/sorting.js';

export interface FileRow {
  id: string;
  user_id: string;
  folder_id: string | null;
  name: string;
  storage_key: string;
  size_bytes: number;
  mime_type: string;
  checksum_sha256: string;
  created_at: Date;
  updated_at: Date;
}

/** What clients see. Note: no storage_key — internal storage details stay private. */
export interface FileDto {
  id: string;
  name: string;
  folderId: string | null;
  sizeBytes: number;
  mimeType: string;
  category: FileCategory;
  previewable: boolean;
  createdAt: string;
  updatedAt: string;
  /** Name of the containing folder (search results only; null = top level). */
  folderName?: string | null;
}

type ListedFileRow = FileRow & { folder_name?: string | null };

export function toFileDto(row: ListedFileRow): FileDto {
  return {
    id: row.id,
    name: row.name,
    folderId: row.folder_id,
    sizeBytes: row.size_bytes,
    mimeType: row.mime_type,
    category: categorize(row.mime_type),
    previewable: PREVIEWABLE_IMAGE_TYPES.has(row.mime_type),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    ...(row.folder_name !== undefined ? { folderName: row.folder_name } : {}),
  };
}

const COLUMNS = `f.id, f.user_id, f.folder_id, f.name, f.storage_key, f.size_bytes, f.mime_type,
  f.checksum_sha256, f.created_at, f.updated_at`;
const RETURNING = `RETURNING id, user_id, folder_id, name, storage_key, size_bytes, mime_type,
  checksum_sha256, created_at, updated_at`;

export const fileRepository = {
  /** Returns the file only if it belongs to `userId`. */
  async findOwned(db: Queryable, userId: string, fileId: string): Promise<FileRow | null> {
    const { rows } = await db.query<FileRow>(`SELECT ${COLUMNS} FROM files f WHERE f.id = $1 AND f.user_id = $2`, [
      fileId,
      userId,
    ]);
    return rows[0] ?? null;
  },

  async listInFolder(db: Queryable, userId: string, folderId: string | null, sort: SortField, order: SortOrder) {
    const { rows } = await db.query<FileRow>(
      `SELECT ${COLUMNS} FROM files f
        WHERE f.user_id = $1 AND f.folder_id IS NOT DISTINCT FROM $2
        ${orderByClause('files', sort, order, 'f')}`,
      [userId, folderId],
    );
    return rows;
  },

  async search(db: Queryable, userId: string, text: string, sort: SortField, order: SortOrder, limit: number) {
    const { rows } = await db.query<ListedFileRow>(
      `SELECT ${COLUMNS}, d.name AS folder_name
         FROM files f
         LEFT JOIN folders d ON d.id = f.folder_id
        WHERE f.user_id = $1 AND f.name ILIKE $2
        ${orderByClause('files', sort, order, 'f')}
        LIMIT $3`,
      [userId, likePattern(text), limit],
    );
    return rows;
  },

  /** Existing names in a folder that start with `prefix` (for picking a free name). */
  async namesWithPrefix(db: Queryable, userId: string, folderId: string | null, prefix: string): Promise<string[]> {
    const { rows } = await db.query<{ name: string }>(
      `SELECT name FROM files
        WHERE user_id = $1 AND folder_id IS NOT DISTINCT FROM $2 AND name ILIKE $3`,
      [userId, folderId, prefixPattern(prefix)],
    );
    return rows.map((r) => r.name);
  },

  async totalUsage(db: Queryable, userId: string): Promise<number> {
    const { rows } = await db.query<{ used: number }>(
      'SELECT coalesce(sum(size_bytes), 0)::bigint AS used FROM files WHERE user_id = $1',
      [userId],
    );
    return rows[0]?.used ?? 0;
  },

  async create(
    db: Queryable,
    input: {
      userId: string;
      folderId: string | null;
      name: string;
      storageKey: string;
      sizeBytes: number;
      mimeType: string;
      checksum: string;
    },
  ): Promise<FileRow> {
    const { rows } = await db.query<FileRow>(
      `INSERT INTO files (user_id, folder_id, name, storage_key, size_bytes, mime_type, checksum_sha256)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ${RETURNING}`,
      [input.userId, input.folderId, input.name, input.storageKey, input.sizeBytes, input.mimeType, input.checksum],
    );
    return rows[0]!;
  },

  async update(
    db: Queryable,
    userId: string,
    fileId: string,
    changes: { name: string; folderId: string | null },
  ): Promise<FileRow | null> {
    const { rows } = await db.query<FileRow>(
      `UPDATE files SET name = $3, folder_id = $4 WHERE id = $1 AND user_id = $2 ${RETURNING}`,
      [fileId, userId, changes.name, changes.folderId],
    );
    return rows[0] ?? null;
  },

  /** Deletes the record and returns its storage key (so the bytes can be removed). */
  async delete(db: Queryable, userId: string, fileId: string): Promise<string | null> {
    const { rows } = await db.query<{ storage_key: string }>(
      'DELETE FROM files WHERE id = $1 AND user_id = $2 RETURNING storage_key',
      [fileId, userId],
    );
    return rows[0]?.storage_key ?? null;
  },
};
