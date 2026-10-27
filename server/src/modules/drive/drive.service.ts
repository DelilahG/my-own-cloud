import { pool } from '../../db/pool.js';
import { notFound } from '../../lib/errors.js';
import type { SortField, SortOrder } from '../../lib/sorting.js';
import { fileRepository, toFileDto, type FileDto } from '../files/file.repository.js';
import { folderRepository, toFolderDto, type FolderDto } from '../folders/folder.repository.js';

export const SEARCH_RESULT_LIMIT = 200;

export interface FolderContents {
  /** The folder being viewed, or null for the top level ("My Cloud"). */
  folder: FolderDto | null;
  /** Path from the top level to the current folder (excluding "My Cloud" itself). */
  breadcrumbs: { id: string; name: string }[];
  folders: FolderDto[];
  files: FileDto[];
}

export const driveService = {
  async contents(userId: string, folderId: string | null, sort: SortField, order: SortOrder): Promise<FolderContents> {
    let folder: FolderDto | null = null;
    let breadcrumbs: { id: string; name: string }[] = [];
    if (folderId) {
      const row = await folderRepository.findOwned(pool, userId, folderId);
      // Same 404 whether the folder doesn't exist or belongs to someone else.
      if (!row) throw notFound('Folder');
      folder = toFolderDto(row);
      breadcrumbs = await folderRepository.ancestry(pool, userId, folderId);
    }
    const [folders, files] = await Promise.all([
      folderRepository.listChildren(pool, userId, folderId, sort, order),
      fileRepository.listInFolder(pool, userId, folderId, sort, order),
    ]);
    return { folder, breadcrumbs, folders: folders.map(toFolderDto), files: files.map(toFileDto) };
  },

  /** Case-insensitive name search across ALL of the user's folders and files. */
  async search(userId: string, query: string, sort: SortField, order: SortOrder) {
    const [folders, files] = await Promise.all([
      folderRepository.search(pool, userId, query, sort, order, SEARCH_RESULT_LIMIT),
      fileRepository.search(pool, userId, query, sort, order, SEARCH_RESULT_LIMIT),
    ]);
    return {
      query,
      folders: folders.map(toFolderDto),
      files: files.map(toFileDto),
      truncated: folders.length === SEARCH_RESULT_LIMIT || files.length === SEARCH_RESULT_LIMIT,
    };
  },
};
