import type { Request, Response } from 'express';
import { z } from 'zod';
import { sortFieldSchema, sortOrderSchema } from '../../lib/sorting.js';
import { folderIdQuerySchema } from '../../lib/validation.js';
import { currentUserId } from '../../middleware/auth.js';
import { driveService } from './drive.service.js';

const contentsQuerySchema = z.object({
  folderId: folderIdQuerySchema,
  sort: sortFieldSchema,
  order: sortOrderSchema,
});

const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Enter something to search for.').max(100, 'Search text is too long.'),
  sort: sortFieldSchema,
  order: sortOrderSchema,
});

export const driveController = {
  async contents(req: Request, res: Response) {
    const { folderId, sort, order } = contentsQuerySchema.parse(req.query);
    res.json(await driveService.contents(currentUserId(req), folderId, sort, order));
  },

  async search(req: Request, res: Response) {
    const { q, sort, order } = searchQuerySchema.parse(req.query);
    res.json(await driveService.search(currentUserId(req), q, sort, order));
  },
};
