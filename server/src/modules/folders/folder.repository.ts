import type { Queryable } from '../../db/pool.js';
import { likePattern, orderByClause, type SortField, type SortOrder } from '../../lib/sorting.js';

export interface FolderRow {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  created_at: Date;
  updated_at: Date;
}

export interface FolderDto {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Number of direct children (subfolders + files). Only on listings. */
  itemCount?: number;
  /** Name of the parent folder (search results only). */
  parentName?: string | null;
}

type ListedFolderRow = FolderRow & { item_count?: number; parent_name?: string | null };

export function toFolderDto(row: ListedFolderRow): FolderDto {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    ...(row.item_count !== undefined ? { itemCount: row.item_count } : {}),
    ...(row.parent_name !== undefined ? { parentName: row.parent_name } : {}),
  };
}

const COLUMNS = 'f.id, f.user_id, f.parent_id, f.name, f.created_at, f.updated_at';
const ITEM_COUNT = `(
  (SELECT count(*) FROM folders c WHERE c.parent_id = f.id) +
  (SELECT count(*) FROM files x WHERE x.folder_id = f.id)
)::int AS item_count`;

export const folderRepository = {
  /** Returns the folder only if it belongs to `userId`. */
  async findOwned(db: Queryable, userId: string, folderId: string): Promise<FolderRow | null> {
    const { rows } = await db.query<FolderRow>(`SELECT ${COLUMNS} FROM folders f WHERE f.id = $1 AND f.user_id = $2`, [
      folderId,
      userId,
    ]);
    return rows[0] ?? null;
  },

  async listChildren(
    db: Queryable,
    userId: string,
    parentId: string | null,
    sort: SortField,
    order: SortOrder,
  ): Promise<ListedFolderRow[]> {
    const { rows } = await db.query<ListedFolderRow>(
      `SELECT ${COLUMNS}, ${ITEM_COUNT}
         FROM folders f
        WHERE f.user_id = $1 AND f.parent_id IS NOT DISTINCT FROM $2
        ${orderByClause('folders', sort, order, 'f')}`,
      [userId, parentId],
    );
    return rows;
  },

  /** Every folder of the user (used by the "Move to" picker). */
  async listAll(db: Queryable, userId: string): Promise<FolderRow[]> {
    const { rows } = await db.query<FolderRow>(
      `SELECT ${COLUMNS} FROM folders f WHERE f.user_id = $1 ORDER BY lower(f.name)`,
      [userId],
    );
    return rows;
  },

  async search(db: Queryable, userId: string, text: string, sort: SortField, order: SortOrder, limit: number) {
    const { rows } = await db.query<ListedFolderRow>(
      `SELECT ${COLUMNS}, ${ITEM_COUNT}, p.name AS parent_name
         FROM folders f
         LEFT JOIN folders p ON p.id = f.parent_id
        WHERE f.user_id = $1 AND f.name ILIKE $2
        ${orderByClause('folders', sort, order, 'f')}
        LIMIT $3`,
      [userId, likePattern(text), limit],
    );
    return rows;
  },

  /** Path from the top level down to `folderId` (inclusive). */
  async ancestry(db: Queryable, userId: string, folderId: string): Promise<{ id: string; name: string }[]> {
    const { rows } = await db.query<{ id: string; name: string }>(
      `WITH RECURSIVE chain AS (
         SELECT id, parent_id, name, 0 AS depth FROM folders WHERE id = $1 AND user_id = $2
         UNION ALL
         SELECT p.id, p.parent_id, p.name, c.depth + 1
           FROM folders p JOIN chain c ON p.id = c.parent_id
          WHERE p.user_id = $2 AND c.depth < 1000
       )
       SELECT id, name FROM chain ORDER BY depth DESC`,
      [folderId, userId],
    );
    return rows;
  },

  /** True if `candidateId` is `folderId` itself or anywhere inside its subtree. */
  async isInSubtree(db: Queryable, userId: string, folderId: string, candidateId: string): Promise<boolean> {
    const { rows } = await db.query<{ found: boolean }>(
      `WITH RECURSIVE subtree AS (
         SELECT id FROM folders WHERE id = $1 AND user_id = $2
         UNION
         SELECT c.id FROM folders c JOIN subtree s ON c.parent_id = s.id
       )
       SELECT EXISTS (SELECT 1 FROM subtree WHERE id = $3) AS found`,
      [folderId, userId, candidateId],
    );
    return rows[0]?.found ?? false;
  },

  /** Number of levels in the subtree rooted at `folderId` (1 = no subfolders). */
  async subtreeHeight(db: Queryable, folderId: string): Promise<number> {
    const { rows } = await db.query<{ height: number }>(
      `WITH RECURSIVE subtree AS (
         SELECT id, 1 AS level FROM folders WHERE id = $1
         UNION ALL
         SELECT c.id, s.level + 1 FROM folders c JOIN subtree s ON c.parent_id = s.id WHERE s.level < 1000
       )
       SELECT max(level)::int AS height FROM subtree`,
      [folderId],
    );
    return rows[0]?.height ?? 1;
  },

  /** Storage keys of every file inside the folder's subtree (for deleting bytes). */
  async subtreeStorageKeys(db: Queryable, userId: string, folderId: string): Promise<string[]> {
    const { rows } = await db.query<{ storage_key: string }>(
      `WITH RECURSIVE subtree AS (
         SELECT id FROM folders WHERE id = $1 AND user_id = $2
         UNION
         SELECT c.id FROM folders c JOIN subtree s ON c.parent_id = s.id
       )
       SELECT storage_key FROM files WHERE user_id = $2 AND folder_id IN (SELECT id FROM subtree)`,
      [folderId, userId],
    );
    return rows.map((r) => r.storage_key);
  },

  async create(db: Queryable, userId: string, parentId: string | null, name: string): Promise<FolderRow> {
    const { rows } = await db.query<FolderRow>(
      `INSERT INTO folders (user_id, parent_id, name) VALUES ($1, $2, $3)
       RETURNING id, user_id, parent_id, name, created_at, updated_at`,
      [userId, parentId, name],
    );
    return rows[0]!;
  },

  async update(
    db: Queryable,
    userId: string,
    folderId: string,
    changes: { name: string; parentId: string | null },
  ): Promise<FolderRow | null> {
    const { rows } = await db.query<FolderRow>(
      `UPDATE folders SET name = $3, parent_id = $4
        WHERE id = $1 AND user_id = $2
       RETURNING id, user_id, parent_id, name, created_at, updated_at`,
      [folderId, userId, changes.name, changes.parentId],
    );
    return rows[0] ?? null;
  },

  /** Deletes the folder; the database cascades to subfolders and files. */
  async delete(db: Queryable, userId: string, folderId: string): Promise<boolean> {
    const { rowCount } = await db.query('DELETE FROM folders WHERE id = $1 AND user_id = $2', [folderId, userId]);
    return (rowCount ?? 0) > 0;
  },
};
