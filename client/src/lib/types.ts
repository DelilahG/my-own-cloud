// Shapes of the JSON returned by the API (mirrors the server's DTOs).

export interface User {
  id: string;
  email: string;
  displayName: string;
  quotaBytes: number;
  createdAt: string;
}

export type FileCategory = 'images' | 'videos' | 'audio' | 'documents' | 'archives' | 'other';

export interface FileItem {
  id: string;
  name: string;
  folderId: string | null;
  sizeBytes: number;
  mimeType: string;
  category: FileCategory;
  previewable: boolean;
  createdAt: string;
  updatedAt: string;
  folderName?: string | null;
}

export interface FolderItem {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  itemCount?: number;
  parentName?: string | null;
}

export interface Breadcrumb {
  id: string;
  name: string;
}

export interface FolderContents {
  folder: FolderItem | null;
  breadcrumbs: Breadcrumb[];
  folders: FolderItem[];
  files: FileItem[];
}

export interface SearchResults {
  query: string;
  folders: FolderItem[];
  files: FileItem[];
  truncated: boolean;
}

export interface StorageSummary {
  maxFileSizeBytes: number;
  usedBytes: number;
  quotaBytes: number;
  availableBytes: number;
  fileCount: number;
  folderCount: number;
  categories: { category: FileCategory; count: number; bytes: number }[];
  recentFiles: FileItem[];
  largestFiles: FileItem[];
}

export type SortField = 'name' | 'size' | 'updated' | 'created';
export type SortOrder = 'asc' | 'desc';

/** A file or folder, used where both appear together. */
export type DriveItem = { kind: 'folder'; item: FolderItem } | { kind: 'file'; item: FileItem };
