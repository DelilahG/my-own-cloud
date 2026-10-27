import { Router } from 'express';
import type { createFolderController } from './folder.controller.js';

export function folderRoutes(controller: ReturnType<typeof createFolderController>) {
  const router = Router();
  router.get('/', controller.list);
  router.post('/', controller.create);
  router.patch('/:id', controller.update);
  router.delete('/:id', controller.remove);
  return router;
}
