import { Router } from 'express';
import type { createFileController } from './file.controller.js';

export function fileRoutes(controller: ReturnType<typeof createFileController>) {
  const router = Router();
  router.post('/', controller.upload);
  router.get('/:id/download', controller.download);
  router.get('/:id/preview', controller.preview);
  router.patch('/:id', controller.update);
  router.delete('/:id', controller.remove);
  return router;
}
