import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Files, FolderClosed, HardDrive, Inbox, PieChart } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { DriveDialogs, type DialogState } from '../components/drive/DriveDialogs';
import { Button, EmptyState } from '../components/ui/primitives';
import { useAuth } from '../hooks/useAuth';
import { storageQuery } from '../hooks/useUploads';
import { errorMessage } from '../lib/api';
import { CATEGORY_META, CATEGORY_ORDER, FileTypeIcon } from '../lib/file-visuals';
import { formatBytes, formatRelative, percent, percentLabel } from '../lib/format';
import type { FileItem, StorageSummary } from '../lib/types';

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function StatTile({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <div className="flex items-center gap-2 text-[13px] text-fg-muted">
        <span className="text-fg-subtle" aria-hidden="true">
          {icon}
        </span>
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-fg-subtle">{hint}</p>}
    </div>
  );
}

/**
 * Quota bar split by file category. Track = whole quota; each segment's
 * width is its share of the quota. Segments are separated by 2px gaps,
 * and every category is also listed as text (count + size), so colour is
 * never the only way to read it.
 */
function UsageBreakdown({ data }: { data: StorageSummary }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const byCategory = new Map(data.categories.map((c) => [c.category, c]));
  const ordered = CATEGORY_ORDER.map((category) => {
    const entry = byCategory.get(category);
    return { category, count: entry?.count ?? 0, bytes: entry?.bytes ?? 0 };
  });
  const hoveredEntry = ordered.find((c) => c.category === hovered);

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6" aria-labelledby="usage-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="usage-heading" className="text-[15px] font-semibold">
          Storage usage
        </h2>
        <p className="text-[13px] text-fg-muted tabular-nums">
          <span className="font-semibold text-fg">{formatBytes(data.usedBytes)}</span> of {formatBytes(data.quotaBytes)} ·{' '}
          {percentLabel(data.usedBytes, data.quotaBytes)}% used
        </p>
      </div>

      <p className="mt-3 h-5 text-[13px] text-fg-muted" aria-hidden="true">
        {hoveredEntry
          ? `${CATEGORY_META[hoveredEntry.category].label}: ${formatBytes(hoveredEntry.bytes)} in ${hoveredEntry.count} file${hoveredEntry.count === 1 ? '' : 's'}`
          : `${formatBytes(data.availableBytes)} available`}
      </p>
      <div
        className="mt-1.5 flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-surface-3"
        role="img"
        aria-label={`${formatBytes(data.usedBytes)} of ${formatBytes(data.quotaBytes)} used. Breakdown listed below.`}
        onMouseLeave={() => setHovered(null)}
      >
        {ordered
          .filter((c) => c.bytes > 0)
          .map((c) => (
            <div
              key={c.category}
              onMouseEnter={() => setHovered(c.category)}
              className="h-full transition-opacity first:rounded-l-full"
              style={{
                width: `${Math.max(percent(c.bytes, data.quotaBytes), 0.8)}%`,
                background: CATEGORY_META[c.category].color,
                opacity: hovered && hovered !== c.category ? 0.45 : 1,
              }}
            />
          ))}
      </div>

      <table className="mt-5 w-full text-[13px]">
        <caption className="sr-only">Storage by file type</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Type</th>
            <th scope="col">Files</th>
            <th scope="col">Size</th>
          </tr>
        </thead>
        <tbody className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          {ordered.map((c) => (
            <tr
              key={c.category}
              onMouseEnter={() => setHovered(c.category)}
              onMouseLeave={() => setHovered(null)}
              className="flex items-center gap-3 border-b border-line py-2.5"
            >
              <th scope="row" className="flex min-w-0 flex-1 items-center gap-2.5 text-left font-normal">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: CATEGORY_META[c.category].color }} aria-hidden="true" />
                <span className="text-fg">{CATEGORY_META[c.category].label}</span>
              </th>
              <td className="text-fg-subtle tabular-nums">
                {c.count} file{c.count === 1 ? '' : 's'}
              </td>
              <td className="w-20 text-right font-medium text-fg tabular-nums">{formatBytes(c.bytes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function FileListCard({
  title,
  files,
  empty,
  meta,
  onOpen,
}: {
  title: string;
  files: FileItem[];
  empty: string;
  meta: (f: FileItem) => string;
  onOpen: (f: FileItem) => void;
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-card" aria-label={title}>
      <h2 className="mb-2 text-[15px] font-semibold">{title}</h2>
      {files.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-fg-subtle">{empty}</p>
      ) : (
        <ul className="-mx-2">
          {files.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => onOpen(f)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-2"
              >
                <FileTypeIcon category={f.category} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{f.name}</span>
                  <span className="block truncate text-xs text-fg-subtle">in {f.folderName ?? 'My Cloud'}</span>
                </span>
                <span className="text-xs whitespace-nowrap text-fg-muted tabular-nums">{meta(f)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function OverviewPage() {
  const { user } = useAuth();
  const { data, isPending, isError, error, refetch } = useQuery(storageQuery);
  const [dialog, setDialog] = useState<DialogState>(null);

  useEffect(() => {
    document.title = 'Overview · My Own Cloud';
  }, []);

  if (isPending) {
    return (
      <div className="mx-auto max-w-6xl space-y-4" aria-busy="true">
        <div className="skeleton h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="skeleton h-28 rounded-2xl" />
          ))}
        </div>
        <div className="skeleton h-64 rounded-2xl" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <EmptyState icon={<AlertTriangle size={24} />} title="Couldn’t load your storage overview" description={errorMessage(error)}>
        <Button onClick={() => refetch()}>Try again</Button>
      </EmptyState>
    );
  }

  const usedPct = percent(data.usedBytes, data.quotaBytes);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting()}, {user?.displayName.split(' ')[0]}
          </h1>
          <p className="mt-1 text-sm text-fg-muted">Here’s what’s in your cloud.</p>
        </div>
        <Link
          to="/drive"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-hover"
        >
          Open My Cloud <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>

      {usedPct >= 90 && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm" role="status">
          <AlertTriangle size={18} className="mt-px shrink-0 text-warning" aria-hidden="true" />
          <p>
            <strong className="font-semibold">Your storage is almost full.</strong> Delete files you no longer need to free
            up space — uploads are blocked once the quota is reached.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile icon={<HardDrive size={16} />} label="Used" value={formatBytes(data.usedBytes)} hint={`${percentLabel(data.usedBytes, data.quotaBytes)}% of your quota`} />
        <StatTile icon={<PieChart size={16} />} label="Available" value={formatBytes(data.availableBytes)} hint={`Quota: ${formatBytes(data.quotaBytes)}`} />
        <StatTile icon={<Files size={16} />} label="Files" value={data.fileCount.toLocaleString()} hint={`Max ${formatBytes(data.maxFileSizeBytes)} per file`} />
        <StatTile icon={<FolderClosed size={16} />} label="Folders" value={data.folderCount.toLocaleString()} />
      </div>

      {data.fileCount === 0 ? (
        <div className="rounded-2xl border border-line bg-surface shadow-card">
          <EmptyState
            icon={<Inbox size={24} />}
            title="Nothing stored yet"
            description="Upload your first files to see how your storage is used."
          >
            <Link
              to="/drive"
              className="inline-flex h-9 items-center rounded-lg bg-accent px-3.5 text-sm font-medium text-accent-fg hover:bg-accent-hover"
            >
              Go to My Cloud
            </Link>
          </EmptyState>
        </div>
      ) : (
        <>
          <UsageBreakdown data={data} />
          <div className="grid gap-4 lg:grid-cols-2">
            <FileListCard
              title="Recently uploaded"
              files={data.recentFiles}
              empty="No uploads yet."
              meta={(f) => formatRelative(f.createdAt)}
              onOpen={(file) => setDialog({ type: 'details', file })}
            />
            <FileListCard
              title="Largest files"
              files={data.largestFiles}
              empty="No files yet."
              meta={(f) => formatBytes(f.sizeBytes)}
              onOpen={(file) => setDialog({ type: 'details', file })}
            />
          </div>
        </>
      )}

      <DriveDialogs state={dialog} onChange={setDialog} currentFolderId={null} />
    </div>
  );
}
