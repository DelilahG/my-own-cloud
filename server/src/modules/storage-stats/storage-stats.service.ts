import type { Request, Response } from 'express';
import { config } from '../../config/env.js';
import { pool } from '../../db/pool.js';
import { categorize, type FileCategory } from '../../lib/file-types.js';
import { currentUserId } from '../../middleware/auth.js';
import { toFileDto, type FileDto, type FileRow } from '../files/file.repository.js';

export interface StorageSummary {
  /** Largest single upload the server accepts. */
  maxFileSizeBytes: number;
  usedBytes: number;
  quotaBytes: number;
  availableBytes: number;
  fileCount: number;
  folderCount: number;
  categories: { category: FileCategory; count: number; bytes: number }[];
  recentFiles: FileDto[];
  largestFiles: FileDto[];
}

const CATEGORY_ORDER: FileCategory[] = ['images', 'videos', 'audio', 'documents', 'archives', 'other'];
const FILE_COLUMNS = `f.id, f.user_id, f.folder_id, f.name, f.storage_key, f.size_bytes, f.mime_type,
  f.checksum_sha256, f.created_at, f.updated_at`;

export async function getStorageSummary(userId: string): Promise<StorageSummary> {
  const [user, byType, folders, recent, largest] = await Promise.all([
    pool.query<{ quota_bytes: number }>('SELECT quota_bytes FROM users WHERE id = $1', [userId]),
    pool.query<{ mime_type: string; count: number; bytes: number }>(
      `SELECT mime_type, count(*)::int AS count, sum(size_bytes)::bigint AS bytes
         FROM files WHERE user_id = $1 GROUP BY mime_type`,
      [userId],
    ),
    pool.query<{ count: number }>('SELECT count(*)::int AS count FROM folders WHERE user_id = $1', [userId]),
    pool.query<FileRow & { folder_name: string | null }>(
      `SELECT ${FILE_COLUMNS}, d.name AS folder_name FROM files f LEFT JOIN folders d ON d.id = f.folder_id
        WHERE f.user_id = $1 ORDER BY f.created_at DESC LIMIT 6`,
      [userId],
    ),
    pool.query<FileRow & { folder_name: string | null }>(
      `SELECT ${FILE_COLUMNS}, d.name AS folder_name FROM files f LEFT JOIN folders d ON d.id = f.folder_id
        WHERE f.user_id = $1 ORDER BY f.size_bytes DESC, f.name LIMIT 5`,
      [userId],
    ),
  ]);

  const totals = new Map<FileCategory, { count: number; bytes: number }>();
  let usedBytes = 0;
  let fileCount = 0;
  for (const row of byType.rows) {
    const category = categorize(row.mime_type);
    const entry = totals.get(category) ?? { count: 0, bytes: 0 };
    entry.count += row.count;
    entry.bytes += row.bytes;
    totals.set(category, entry);
    usedBytes += row.bytes;
    fileCount += row.count;
  }

  const quotaBytes = user.rows[0]?.quota_bytes ?? 0;
  return {
    maxFileSizeBytes: config.maxFileSizeBytes,
    usedBytes,
    quotaBytes,
    availableBytes: Math.max(0, quotaBytes - usedBytes),
    fileCount,
    folderCount: folders.rows[0]?.count ?? 0,
    categories: CATEGORY_ORDER.map((category) => ({ category, ...(totals.get(category) ?? { count: 0, bytes: 0 }) })),
    recentFiles: recent.rows.map(toFileDto),
    largestFiles: largest.rows.map(toFileDto),
  };
}

export async function storageSummaryHandler(req: Request, res: Response) {
  res.json(await getStorageSummary(currentUserId(req)));
}
