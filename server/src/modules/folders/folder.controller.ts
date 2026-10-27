import type { Request, Response } from 'express';
import { z } from 'zod';
import { currentUserId } from '../../middleware/auth.js';
import { idParamsSchema, itemNameSchema, nullableFolderIdSchema } from '../../lib/validation.js';
import type { FolderService } from './folder.service.js';

const createFolderSchema = z.object({
  name: itemNameSchema,
  parentId: nullableFolderIdSchema.default(null),
});

const updateFolderSchema = z
  .object({
    name: itemNameSchema.optional(),
    parentId: nullableFolderIdSchema.optional(),
  })
  .refine((d) => d.name !== undefined || d.parentId !== undefined, 'Nothing to update.');

export function createFolderController(folders: FolderService) {
  return {
    async list(req: Request, res: Response) {
      res.json({ folders: await folders.listAll(currentUserId(req)) });
    },

    async create(req: Request, res: Response) {
      const input = createFolderSchema.parse(req.body);
      res.status(201).json({ folder: await folders.create(currentUserId(req), input) });
    },

    async update(req: Request, res: Response) {
      const { id } = idParamsSchema.parse(req.params);
      const changes = updateFolderSchema.parse(req.body);
      res.json({ folder: await folders.update(currentUserId(req), id, changes) });
    },

    async remove(req: Request, res: Response) {
      const { id } = idParamsSchema.parse(req.params);
      res.json(await folders.remove(currentUserId(req), id));
    },
  };
}
