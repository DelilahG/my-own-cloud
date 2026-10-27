import clsx from 'clsx';
import { CheckCircle2, ChevronDown, ChevronUp, CircleSlash, RotateCcw, TriangleAlert, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useUploads, type UploadItem } from '../../hooks/useUploads';
import { formatBytes } from '../../lib/format';
import { IconButton, Spinner } from '../ui/primitives';

function StatusIcon({ item }: { item: UploadItem }) {
  switch (item.status) {
    case 'done':
      return <CheckCircle2 size={18} className="text-success" aria-label="Uploaded" />;
    case 'error':
      return <TriangleAlert size={18} className="text-danger" aria-label="Failed" />;
    case 'canceled':
      return <CircleSlash size={18} className="text-fg-subtle" aria-label="Canceled" />;
    default:
      return <Spinner className="text-accent" label="Uploading" />;
  }
}

/** Floating panel listing uploads with live progress, cancel and retry. */
export function UploadPanel() {
  const { items, cancel, retry, clearFinished } = useUploads();
  const [collapsed, setCollapsed] = useState(false);

  const active = items.filter((i) => i.status === 'queued' || i.status === 'uploading');
  const failed = items.filter((i) => i.status === 'error').length;
  const done = items.filter((i) => i.status === 'done').length;

  // Re-expand when new uploads start.
  useEffect(() => {
    if (active.length > 0) setCollapsed(false);
  }, [active.length]);

  if (items.length === 0) return null;

  const title = active.length
    ? `Uploading ${active.length} file${active.length === 1 ? '' : 's'}…`
    : failed
      ? `${done} uploaded, ${failed} failed`
      : `${done} upload${done === 1 ? '' : 's'} complete`;

  const totalBytes = active.reduce((s, i) => s + i.file.size, 0);
  const sentBytes = active.reduce((s, i) => s + i.file.size * i.progress, 0);

  return (
    <section
      aria-label="Uploads"
      className="fixed right-4 bottom-4 z-40 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-surface shadow-pop animate-in"
    >
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold" aria-live="polite">
            {title}
          </h2>
          {active.length > 0 && (
            <p className="text-xs text-fg-subtle">
              {formatBytes(sentBytes)} of {formatBytes(totalBytes)}
            </p>
          )}
        </div>
        <IconButton label={collapsed ? 'Expand uploads' : 'Collapse uploads'} size="sm" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </IconButton>
        {active.length === 0 && (
          <IconButton label="Close uploads panel" size="sm" onClick={clearFinished}>
            <X size={18} />
          </IconButton>
        )}
      </header>
      {!collapsed && (
        <ul className="max-h-72 divide-y divide-line overflow-y-auto">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
              <StatusIcon item={item} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium" title={item.savedName ?? item.file.name}>
                  {item.savedName ?? item.file.name}
                </p>
                {item.status === 'uploading' || item.status === 'queued' ? (
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full rounded-full bg-accent transition-[width] duration-200"
                      style={{ width: `${Math.round(item.progress * 100)}%` }}
                    />
                  </div>
                ) : (
                  <p className={clsx('truncate text-xs', item.status === 'error' ? 'text-danger' : 'text-fg-subtle')}>
                    {item.status === 'error'
                      ? item.error
                      : item.status === 'canceled'
                        ? 'Canceled'
                        : formatBytes(item.file.size)}
                  </p>
                )}
              </div>
              {(item.status === 'uploading' || item.status === 'queued') && (
                <IconButton label={`Cancel upload of ${item.file.name}`} size="sm" onClick={() => cancel(item.id)}>
                  <X size={16} />
                </IconButton>
              )}
              {(item.status === 'error' || item.status === 'canceled') && (
                <IconButton label={`Retry upload of ${item.file.name}`} size="sm" onClick={() => retry(item.id)}>
                  <RotateCcw size={15} />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
