import { z } from 'zod';

export const sortFieldSchema = z.enum(['name', 'size', 'updated', 'created']).default('name');
export const sortOrderSchema = z.enum(['asc', 'desc']).default('asc');

export type SortField = z.infer<typeof sortFieldSchema>;
export type SortOrder = z.infer<typeof sortOrderSchema>;

/**
 * Builds an ORDER BY clause from a fixed whitelist. User input only ever
 * selects one of these constant strings — it is never interpolated into SQL.
 */
export function orderByClause(kind: 'files' | 'folders', field: SortField, order: SortOrder, alias = ''): string {
  const p = alias ? `${alias}.` : '';
  const dir = order === 'desc' ? 'DESC' : 'ASC';
  const columns: Record<SortField, string> = {
    name: `lower(${p}name)`,
    // Folders have no size of their own; sort them by name instead.
    size: kind === 'files' ? `${p}size_bytes` : `lower(${p}name)`,
    updated: `${p}updated_at`,
    created: `${p}created_at`,
  };
  // Secondary keys make the order deterministic for ties.
  return `ORDER BY ${columns[field]} ${dir}, lower(${p}name) ${dir}, ${p}id ${dir}`;
}

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

/** "Contains" pattern for (I)LIKE with wildcards in user text matched literally. */
export function likePattern(text: string): string {
  return `%${escapeLike(text)}%`;
}

/** "Starts with" pattern for (I)LIKE with wildcards in user text matched literally. */
export function prefixPattern(text: string): string {
  return `${escapeLike(text)}%`;
}
