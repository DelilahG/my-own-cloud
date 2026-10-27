import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { AppConfig } from '../../config/env.js';
import { pool, withTransaction } from '../../db/pool.js';
import { conflict, isUniqueViolation, notFound, payloadTooLarge, quotaExceeded, unauthorized } from '../../lib/errors.js';
import { detectMimeType } from '../../lib/file-types.js';
import { decodeMultipartFilename, sanitizeUploadName, uniqueName } from '../../lib/names.js';
import type { StorageDriver } from '../../storage/storage-driver.js';
import { userRepository } from '../auth/user.repository.js';
import { folderRepository } from '../folders/folder.repository.js';
import { deleteBlobs } from '../folders/folder.service.js';
import { fileRepository, toFileDto, type FileDto, type FileRow } from './file.repository.js';

export interface ReceivedUpload {
  /** Temporary path where multer wrote the bytes. */
  path: string;
  /** Filename as sent by the client (untrusted). */
  originalname: string;
}

async function sha256OfFile(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(filePath), hash);
  return hash.digest('hex');
}

const formatMb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export function createFileService(config: AppConfig, storage: StorageDriver) {
  return {
    /**
     * Cheap checks done BEFORE the upload body is received, based on the
     * request's Content-Length, so obviously oversized uploads are rejected
     * without writing anything to disk. The authoritative checks happen
     * again in `upload()` using the real size on disk.
     */
    async precheckUpload(userId: string, folderId: string | null, contentLength: number): Promise<void> {
      if (folderId && !(await folderRepository.findOwned(pool, userId, folderId))) throw notFound('Folder');
      if (!contentLength) return;
      // Multipart framing adds a little overhead; allow 64 KB of slack.
      const slack = 64 * 1024;
      if (contentLength > config.maxFileSizeBytes + slack) {
        throw payloadTooLarge(`Files can be at most ${Math.round(config.maxFileSizeBytes / (1024 * 1024))} MB.`);
      }
      const [user, used] = await Promise.all([
        pool.query<{ quota_bytes: number }>('SELECT quota_bytes FROM users WHERE id = $1', [userId]),
        fileRepository.totalUsage(pool, userId),
      ]);
      const quota = user.rows[0]?.quota_bytes ?? 0;
      if (used + contentLength - slack > quota) {
        throw quotaExceeded(`Not enough storage space. You have ${formatMb(Math.max(0, quota - used))} left.`);
      }
    },

    /**
     * Stores a fully received upload:
     *   1. derive a safe display name and detect the real type from the bytes;
     *   2. in one transaction (holding the per-user lock): verify the folder,
     *      enforce the quota, pick a non-conflicting name, insert the record
     *      and move the bytes into permanent storage;
     *   3. if anything fails, the transaction rolls back and the bytes are removed.
     */
    async upload(userId: string, folderId: string | null, upload: ReceivedUpload): Promise<FileDto> {
      const displayName = sanitizeUploadName(decodeMultipartFilename(upload.originalname));
      const [{ size }, mimeType, checksum] = await Promise.all([
        stat(upload.path),
        detectMimeType(upload.path, displayName),
        sha256OfFile(upload.path),
      ]);
      if (size > config.maxFileSizeBytes) {
        throw payloadTooLarge(`Files can be at most ${Math.round(config.maxFileSizeBytes / (1024 * 1024))} MB.`);
      }

      const storageKey = randomUUID();
      let bytesCommitted = false;
      try {
        const row = await withTransaction(async (tx) => {
          const user = await userRepository.lockForUpdate(tx, userId);
          if (!user) throw unauthorized();
          if (folderId && !(await folderRepository.findOwned(tx, userId, folderId))) throw notFound('Folder');

          const used = await fileRepository.totalUsage(tx, userId);
          if (used + size > user.quota_bytes) {
            throw quotaExceeded(
              `Not enough storage space for "${displayName}". You have ${formatMb(Math.max(0, user.quota_bytes - used))} left.`,
            );
          }

          const stem = displayName.slice(0, displayName.length - path.extname(displayName).length) || displayName;
          const taken = await fileRepository.namesWithPrefix(tx, userId, folderId, stem);
          const created = await fileRepository.create(tx, {
            userId,
            folderId,
            name: uniqueName(displayName, taken),
            storageKey,
            sizeBytes: size,
            mimeType,
            checksum,
          });
          await storage.commitUpload(upload.path, storageKey);
          bytesCommitted = true;
          return created;
        });
        return toFileDto(row);
      } catch (err) {
        // The record was rolled back; make sure no bytes are left behind.
        if (bytesCommitted) await storage.delete(storageKey).catch(() => {});
        throw err;
      }
    },

    /** Returns the file record (with storage key) for streaming, only if owned. */
    async getOwned(userId: string, fileId: string): Promise<FileRow> {
      const file = await fileRepository.findOwned(pool, userId, fileId);
      if (!file) throw notFound('File');
      return file;
    },

    /** Renames and/or moves a file. `folderId: null` moves it to the top level. */
    async update(
      userId: string,
      fileId: string,
      changes: { name?: string; folderId?: string | null },
    ): Promise<FileDto> {
      return withTransaction(async (tx) => {
        await userRepository.lockForUpdate(tx, userId);
        const file = await fileRepository.findOwned(tx, userId, fileId);
        if (!file) throw notFound('File');
        const folderId = changes.folderId === undefined ? file.folder_id : changes.folderId;
        if (folderId && folderId !== file.folder_id && !(await folderRepository.findOwned(tx, userId, folderId))) {
          throw notFound('Destination folder');
        }
        try {
          const updated = await fileRepository.update(tx, userId, fileId, {
            name: changes.name ?? file.name,
            folderId,
          });
          if (!updated) throw notFound('File');
          return toFileDto(updated);
        } catch (err) {
          if (isUniqueViolation(err, 'files_sibling_name_key')) {
            throw conflict('A file with this name already exists in that folder.');
          }
          throw err;
        }
      });
    },

    /** Deletes the record first (committed), then the bytes — see folder deletion for why. */
    async remove(userId: string, fileId: string): Promise<void> {
      const key = await fileRepository.delete(pool, userId, fileId);
      if (!key) throw notFound('File');
      await deleteBlobs(storage, [key]);
    },
  };
}

export type FileService = ReturnType<typeof createFileService>;
