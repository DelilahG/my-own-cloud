import type {
  FileItem,
  FolderContents,
  FolderItem,
  SearchResults,
  SortField,
  SortOrder,
  StorageSummary,
  User,
} from './types';

/** Error returned by the API, with the server's machine-readable code. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// The server requires this header on state-changing requests (CSRF protection).
const CSRF_HEADERS = { 'X-Requested-With': 'MyOwnCloud' };

let onUnauthorized: (() => void) | null = null;
/** Lets the auth layer react when the session expires mid-use. */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = await res.json();
    return new ApiError(res.status, body?.error?.code ?? 'ERROR', body?.error?.message ?? res.statusText);
  } catch {
    return new ApiError(res.status, 'ERROR', `Request failed (${res.status}).`);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: {
        ...CSRF_HEADERS,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.');
  }
  if (!res.ok) {
    const error = await toApiError(res);
    if (res.status === 401 && !url.startsWith('/api/auth/')) onUnauthorized?.();
    throw error;
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const qs = (params: Record<string, string | undefined | null>) => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) search.set(k, v);
  const s = search.toString();
  return s ? `?${s}` : '';
};

export const api = {
  me: () => request<{ user: User | null }>('GET', '/api/auth/me'),
  login: (email: string, password: string) =>
    request<{ user: User }>('POST', '/api/auth/login', { email, password }),
  register: (input: { email: string; password: string; displayName: string }) =>
    request<{ user: User }>('POST', '/api/auth/register', input),
  logout: () => request<void>('POST', '/api/auth/logout'),

  folderContents: (folderId: string | null, sort: SortField, order: SortOrder) =>
    request<FolderContents>('GET', `/api/drive${qs({ folderId, sort, order })}`),
  search: (q: string, sort: SortField, order: SortOrder) =>
    request<SearchResults>('GET', `/api/drive/search${qs({ q, sort, order })}`),
  storage: () => request<StorageSummary>('GET', '/api/storage'),

  allFolders: () => request<{ folders: FolderItem[] }>('GET', '/api/folders'),
  createFolder: (name: string, parentId: string | null) =>
    request<{ folder: FolderItem }>('POST', '/api/folders', { name, parentId }),
  updateFolder: (id: string, changes: { name?: string; parentId?: string | null }) =>
    request<{ folder: FolderItem }>('PATCH', `/api/folders/${id}`, changes),
  deleteFolder: (id: string) => request<{ deletedFiles: number }>('DELETE', `/api/folders/${id}`),

  updateFile: (id: string, changes: { name?: string; folderId?: string | null }) =>
    request<{ file: FileItem }>('PATCH', `/api/files/${id}`, changes),
  deleteFile: (id: string) => request<void>('DELETE', `/api/files/${id}`),

  downloadUrl: (id: string) => `/api/files/${id}/download`,
  previewUrl: (id: string) => `/api/files/${id}/preview`,
};

export interface UploadHandle {
  promise: Promise<FileItem>;
  abort: () => void;
}

/**
 * Uploads one file with progress reporting. Uses XMLHttpRequest because
 * fetch() cannot report upload progress.
 */
export function uploadFile(file: File, folderId: string | null, onProgress: (fraction: number) => void): UploadHandle {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<FileItem>((resolve, reject) => {
    xhr.open('POST', `/api/files${qs({ folderId })}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-Requested-With', CSRF_HEADERS['X-Requested-With']);
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status === 201) return resolve((xhr.response as { file: FileItem }).file);
      const err = (xhr.response as { error?: { code?: string; message?: string } } | null)?.error;
      if (xhr.status === 401) onUnauthorized?.();
      reject(new ApiError(xhr.status, err?.code ?? 'UPLOAD_FAILED', err?.message ?? `Upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK_ERROR', 'Network error during upload.'));
    xhr.onabort = () => reject(new ApiError(0, 'ABORTED', 'Upload canceled.'));

    const form = new FormData();
    form.append('file', file, file.name);
    xhr.send(form);
  });
  return { promise, abort: () => xhr.abort() };
}

/** Human-readable message for any thrown error. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}
