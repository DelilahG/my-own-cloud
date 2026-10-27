import { pool, withTransaction } from '../../db/pool.js';
import { badRequest, conflict, isUniqueViolation, notFound } from '../../lib/errors.js';
import type { StorageDriver } from '../../storage/storage-driver.js';
import { userRepository } from '../auth/user.repository.js';
import { folderRepository, toFolderDto, type FolderDto } from './folder.repository.js';

/** Maximum nesting depth, to keep recursive queries and paths bounded. */
export const MAX_FOLDER_DEPTH = 32;

const duplicateName = () => conflict('A folder with this name already exists here.');

export function createFolderService(storage: StorageDriver) {
  return {
    async listAll(userId: string): Promise<FolderDto[]> {
      return (await folderRepository.listAll(pool, userId)).map(toFolderDto);
    },

    async create(userId: string, input: { name: string; parentId: string | null }): Promise<FolderDto> {
      return withTransaction(async (tx) => {
        await userRepository.lockForUpdate(tx, userId);
        if (input.parentId) {
          const parent = await folderRepository.findOwned(tx, userId, input.parentId);
          if (!parent) throw notFound('Parent folder');
          const depth = (await folderRepository.ancestry(tx, userId, parent.id)).length;
          if (depth + 1 > MAX_FOLDER_DEPTH) {
            throw badRequest(`Folders can be nested at most ${MAX_FOLDER_DEPTH} levels deep.`);
          }
        }
        try {
          return toFolderDto(await folderRepository.create(tx, userId, input.parentId, input.name));
        } catch (err) {
          if (isUniqueViolation(err, 'folders_sibling_name_key')) throw duplicateName();
          throw err;
        }
      });
    },

    /** Renames and/or moves a folder. `parentId: null` moves it to the top level. */
    async update(
      userId: string,
      folderId: string,
      changes: { name?: string; parentId?: string | null },
    ): Promise<FolderDto> {
      return withTransaction(async (tx) => {
        // Serialises tree changes per user, so two concurrent moves can't
        // combine into a cycle (A into B while B goes into A).
        await userRepository.lockForUpdate(tx, userId);
        const folder = await folderRepository.findOwned(tx, userId, folderId);
        if (!folder) throw notFound('Folder');

        const newParentId = changes.parentId === undefined ? folder.parent_id : changes.parentId;
        if (newParentId !== folder.parent_id && newParentId !== null) {
          const parent = await folderRepository.findOwned(tx, userId, newParentId);
          if (!parent) throw notFound('Destination folder');
          if (await folderRepository.isInSubtree(tx, userId, folderId, newParentId)) {
            throw badRequest('A folder cannot be moved into itself or one of its subfolders.');
          }
          const parentDepth = (await folderRepository.ancestry(tx, userId, newParentId)).length;
          const height = await folderRepository.subtreeHeight(tx, folderId);
          if (parentDepth + height > MAX_FOLDER_DEPTH) {
            throw badRequest(`Folders can be nested at most ${MAX_FOLDER_DEPTH} levels deep.`);
          }
        }

        try {
          const updated = await folderRepository.update(tx, userId, folderId, {
            name: changes.name ?? folder.name,
            parentId: newParentId,
          });
          if (!updated) throw notFound('Folder');
          return toFolderDto(updated);
        } catch (err) {
          if (isUniqueViolation(err, 'folders_sibling_name_key')) throw duplicateName();
          throw err;
        }
      });
    },

    /**
     * Deletes a folder with everything inside it.
     * Order matters: the database rows are deleted (and committed) FIRST,
     * then the bytes. If deleting bytes fails, we are left with an orphaned
     * blob (wasted disk, invisible to users) — never with a database record
     * pointing at missing data.
     */
    async remove(userId: string, folderId: string): Promise<{ deletedFiles: number }> {
      const keys = await withTransaction(async (tx) => {
        await userRepository.lockForUpdate(tx, userId);
        const folder = await folderRepository.findOwned(tx, userId, folderId);
        if (!folder) throw notFound('Folder');
        const storageKeys = await folderRepository.subtreeStorageKeys(tx, userId, folderId);
        await folderRepository.delete(tx, userId, folderId);
        return storageKeys;
      });
      await deleteBlobs(storage, keys);
      return { deletedFiles: keys.length };
    },
  };
}

/** Best-effort removal of stored bytes after their records are gone. */
export async function deleteBlobs(storage: StorageDriver, keys: string[]): Promise<void> {
  const results = await Promise.allSettled(keys.map((k) => storage.delete(k)));
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) console.error(`[storage] Failed to delete ${failed} orphaned object(s); they can be cleaned up later.`);
}

export type FolderService = ReturnType<typeof createFolderService>;
