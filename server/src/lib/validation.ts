import { z } from 'zod';
import { validateItemName } from './names.js';

/** UUID path/query parameter. Invalid ids get a clean 400 instead of a database error. */
export const uuidSchema = z.uuid('Invalid id.');

export const idParamsSchema = z.object({ id: uuidSchema });

/** A file or folder name typed by the user. */
export const itemNameSchema = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    const problem = validateItemName(value);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
  });

/** Folder id where `null` means the top level ("My Cloud"). */
export const nullableFolderIdSchema = uuidSchema.nullable();

/** Optional `folderId` query parameter; empty/absent means the top level. */
export const folderIdQuerySchema = z
  .union([z.literal(''), z.literal('root'), uuidSchema])
  .optional()
  .transform((v) => (v && v !== 'root' ? v : null));
