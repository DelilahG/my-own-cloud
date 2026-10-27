import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, api, errorMessage, uploadFile, type UploadHandle } from '../lib/api';
import { formatBytes } from '../lib/format';

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'error' | 'canceled';

export interface UploadItem {
  id: number;
  file: File;
  folderId: string | null;
  status: UploadStatus;
  progress: number;
  error?: string;
  /** Final name chosen by the server (may differ, e.g. "report (1).pdf"). */
  savedName?: string;
}

interface UploadsContextValue {
  items: UploadItem[];
  enqueue: (files: File[], folderId: string | null) => void;
  cancel: (id: number) => void;
  retry: (id: number) => void;
  clearFinished: () => void;
}

const UploadsContext = createContext<UploadsContextValue | null>(null);
const CONCURRENCY = 2;

/**
 * Upload queue shared by the whole app: files are sent one per request,
 * two at a time, each with its own progress bar, cancel and retry. Every
 * file is validated again by the server (size, quota, type).
 */
export function UploadsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<UploadItem[]>([]);
  const handles = useRef(new Map<number, UploadHandle>());
  const nextId = useRef(1);

  const patch = useCallback((id: number, changes: Partial<UploadItem>) => {
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...changes } : it)));
  }, []);

  const enqueue = useCallback(
    (files: File[], folderId: string | null) => {
      if (files.length === 0) return;
      // Check against the server's limits up front so the user gets instant feedback.
      const summary = queryClient.getQueryData<{ maxFileSizeBytes: number }>(['storage']);
      const max = summary?.maxFileSizeBytes;
      setItems((list) => [
        ...list,
        ...files.map<UploadItem>((file) => {
          const tooBig = max !== undefined && file.size > max;
          return {
            id: nextId.current++,
            file,
            folderId,
            progress: 0,
            status: tooBig ? 'error' : 'queued',
            error: tooBig ? `Larger than the ${formatBytes(max!)} limit.` : undefined,
          };
        }),
      ]);
    },
    [queryClient],
  );

  // Start queued uploads whenever there is a free slot.
  useEffect(() => {
    const active = items.filter((i) => i.status === 'uploading').length;
    const ready = items.filter((i) => i.status === 'queued').slice(0, Math.max(0, CONCURRENCY - active));
    for (const item of ready) {
      patch(item.id, { status: 'uploading', progress: 0 });
      const handle = uploadFile(item.file, item.folderId, (p) => patch(item.id, { progress: p }));
      handles.current.set(item.id, handle);
      handle.promise
        .then((saved) => {
          patch(item.id, { status: 'done', progress: 1, savedName: saved.name });
          queryClient.invalidateQueries({ queryKey: ['drive'] });
          queryClient.invalidateQueries({ queryKey: ['search'] });
          queryClient.invalidateQueries({ queryKey: ['storage'] });
        })
        .catch((err: unknown) => {
          const canceled = err instanceof ApiError && err.code === 'ABORTED';
          patch(item.id, { status: canceled ? 'canceled' : 'error', error: canceled ? undefined : errorMessage(err) });
        })
        .finally(() => handles.current.delete(item.id));
    }
  }, [items, patch, queryClient]);

  const cancel = useCallback(
    (id: number) => {
      const handle = handles.current.get(id);
      if (handle) handle.abort();
      else patch(id, { status: 'canceled' });
    },
    [patch],
  );

  const retry = useCallback((id: number) => patch(id, { status: 'queued', progress: 0, error: undefined }), [patch]);

  const clearFinished = useCallback(() => {
    setItems((list) => list.filter((i) => i.status === 'queued' || i.status === 'uploading'));
  }, []);

  // Warn before leaving the page while uploads are still running.
  const busy = items.some((i) => i.status === 'queued' || i.status === 'uploading');
  useEffect(() => {
    if (!busy) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [busy]);

  const value = useMemo(
    () => ({ items, enqueue, cancel, retry, clearFinished }),
    [items, enqueue, cancel, retry, clearFinished],
  );
  return <UploadsContext.Provider value={value}>{children}</UploadsContext.Provider>;
}

export function useUploads(): UploadsContextValue {
  const ctx = useContext(UploadsContext);
  if (!ctx) throw new Error('useUploads must be used inside <UploadsProvider>');
  return ctx;
}

/** Ensures the storage summary (with the upload size limit) is loaded. */
export const storageQuery = { queryKey: ['storage'], queryFn: api.storage, staleTime: 30_000 };
