import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import type { Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { AppConfig } from '../../config/env.js';
import { AppError, badRequest } from '../../lib/errors.js';
import { PREVIEWABLE_IMAGE_TYPES } from '../../lib/file-types.js';
import { folderIdQuerySchema, idParamsSchema, itemNameSchema, nullableFolderIdSchema } from '../../lib/validation.js';
import { currentUserId } from '../../middleware/auth.js';
import type { StorageDriver } from '../../storage/storage-driver.js';
import type { FileRow } from './file.repository.js';
import type { FileService } from './file.service.js';

const uploadQuerySchema = z.object({ folderId: folderIdQuerySchema });

const updateFileSchema = z
  .object({
    name: itemNameSchema.optional(),
    folderId: nullableFolderIdSchema.optional(),
  })
  .refine((d) => d.name !== undefined || d.folderId !== undefined, 'Nothing to update.');

export function createFileController(config: AppConfig, files: FileService, storage: StorageDriver) {
  // Bytes are streamed to a private temp directory under a random name;
  // the client-supplied filename is never used as a path.
  const receiveSingleFile = multer({
    storage: multer.diskStorage({
      // Re-create the temp dir if it was removed while the server was running.
      destination: (_req, _file, cb) => {
        mkdir(storage.tempDir, { recursive: true }).then(
          () => cb(null, storage.tempDir),
          (err: Error) => cb(err, storage.tempDir),
        );
      },
      filename: (_req, _file, cb) => cb(null, `upload-${randomUUID()}`),
    }),
    limits: { fileSize: config.maxFileSizeBytes, files: 1, fields: 5, parts: 6, fieldSize: 1024 },
  }).single('file');

  const receive = (req: Request, res: Response) =>
    new Promise<void>((resolve, reject) => receiveSingleFile(req, res, (err: unknown) => (err ? reject(err) : resolve())));

  /** Streams stored bytes with headers that stop browsers from executing them. */
  async function streamFile(res: Response, file: FileRow, disposition: 'attachment' | 'inline') {
    const stream = await openStored(file);
    res.attachment(file.name); // sets a correctly encoded Content-Disposition filename
    if (disposition === 'inline') {
      res.setHeader('Content-Disposition', res.getHeader('Content-Disposition')!.toString().replace(/^attachment/, 'inline'));
    }
    res.setHeader('Content-Type', file.mime_type);
    res.setHeader('Content-Length', String(file.size_bytes));
    res.setHeader('ETag', `"${file.checksum_sha256}"`);
    res.setHeader('Cache-Control', 'private, no-cache');
    // Even if a file were opened directly, it can't run scripts or load anything.
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

    try {
      await pipeline(stream, res);
    } catch {
      // Client disconnected mid-download, or a read error after headers were sent.
      res.destroy();
    }
  }

  /** Opens the stored bytes, turning "missing object" into a clean 410 error. */
  async function openStored(file: FileRow) {
    try {
      return await storage.openReadStream(file.storage_key);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new AppError(410, 'CONTENT_MISSING', 'The contents of this file are no longer available.');
      }
      throw err;
    }
  }

  return {
    async upload(req: Request, res: Response) {
      const userId = currentUserId(req);
      const { folderId } = uploadQuerySchema.parse(req.query);
      await files.precheckUpload(userId, folderId, Number(req.get('content-length')) || 0);

      await receive(req, res);
      const received = req.file;
      if (!received) throw badRequest('No file was provided. Send it in a multipart field named "file".');
      try {
        const file = await files.upload(userId, folderId, received);
        res.status(201).json({ file });
      } finally {
        // No-op when the file was moved into storage; removes it otherwise.
        await rm(received.path, { force: true }).catch(() => {});
      }
    },

    async download(req: Request, res: Response) {
      const { id } = idParamsSchema.parse(req.params);
      const file = await files.getOwned(currentUserId(req), id);
      if (req.get('if-none-match') === `"${file.checksum_sha256}"`) {
        res.status(304).end();
        return;
      }
      await streamFile(res, file, 'attachment');
    },

    /** Inline display, only for raster image types (used for thumbnails and previews). */
    async preview(req: Request, res: Response) {
      const { id } = idParamsSchema.parse(req.params);
      const file = await files.getOwned(currentUserId(req), id);
      if (!PREVIEWABLE_IMAGE_TYPES.has(file.mime_type)) {
        throw new AppError(415, 'NOT_PREVIEWABLE', 'This file type cannot be previewed.');
      }
      if (req.get('if-none-match') === `"${file.checksum_sha256}"`) {
        res.status(304).end();
        return;
      }
      await streamFile(res, file, 'inline');
    },

    async update(req: Request, res: Response) {
      const { id } = idParamsSchema.parse(req.params);
      const changes = updateFileSchema.parse(req.body);
      res.json({ file: await files.update(currentUserId(req), id, changes) });
    },

    async remove(req: Request, res: Response) {
      const { id } = idParamsSchema.parse(req.params);
      await files.remove(currentUserId(req), id);
      res.status(204).end();
    },
  };
}
