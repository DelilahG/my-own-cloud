import { keepPreviousData, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  AlertTriangle,
  ArrowDownUp,
  Check,
  ChevronRight,
  CloudUpload,
  FolderPlus,
  LayoutGrid,
  List,
  SearchX,
  Upload,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { DriveDialogs, type DialogState } from '../components/drive/DriveDialogs';
import { folderHref, ITEM_MIME, ItemGrid, ItemList, type ItemHandlers } from '../components/drive/DriveItems';
import { MenuPopover, useMenu } from '../components/ui/Menu';
import { Button, EmptyState } from '../components/ui/primitives';
import { useToast } from '../components/ui/Toast';
import { useDriveMutations } from '../hooks/useDriveMutations';
import { usePreferences } from '../hooks/usePreferences';
import { storageQuery, useUploads } from '../hooks/useUploads';
import { ApiError, api, errorMessage } from '../lib/api';
import type { Breadcrumb, DriveItem, FileItem, FolderItem, SortField } from '../lib/types';

const SORT_LABELS: Record<SortField, string> = {
  name: 'Name',
  size: 'Size',
  updated: 'Last modified',
  created: 'Date uploaded',
};

/** Breadcrumb that also accepts dragged items (drop to move there). */
function Crumb({
  to,
  label,
  current,
  destinationId,
  onDropItem,
}: {
  to: string;
  label: string;
  current: boolean;
  destinationId: string | null;
  onDropItem: ItemHandlers['onDropItem'];
}) {
  const [over, setOver] = useState(false);
  const className = clsx(
    'truncate rounded-md px-1.5 py-0.5 transition-colors',
    current ? 'font-semibold text-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
    over && 'bg-accent-soft text-accent ring-2 ring-accent/30',
  );
  const dnd = {
    onDragOver: (e: DragEvent) => {
      if (current || !e.dataTransfer.types.includes(ITEM_MIME)) return;
      e.preventDefault();
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: DragEvent) => {
      setOver(false);
      const raw = e.dataTransfer.getData(ITEM_MIME);
      if (!raw || current) return;
      e.preventDefault();
      e.stopPropagation();
      onDropItem(JSON.parse(raw) as DriveItem, destinationId, label);
    },
  };
  return current ? (
    <span aria-current="page" className={className}>
      {label}
    </span>
  ) : (
    <Link to={to} className={className} {...dnd}>
      {label}
    </Link>
  );
}

function Breadcrumbs({ crumbs, onDropItem }: { crumbs: Breadcrumb[]; onDropItem: ItemHandlers['onDropItem'] }) {
  // On long paths, collapse the middle: My Cloud › … › parent › current
  const shown = crumbs.length > 3 ? crumbs.slice(-2) : crumbs;
  const collapsed = crumbs.length > 3;
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex min-w-0 flex-wrap items-center gap-0.5 text-[15px]">
        <li className="flex min-w-0 items-center">
          <Crumb to="/drive" label="My Cloud" current={crumbs.length === 0} destinationId={null} onDropItem={onDropItem} />
        </li>
        {collapsed && (
          <li className="flex items-center text-fg-subtle">
            <ChevronRight size={16} aria-hidden="true" />
            <Link
              to={folderHref(crumbs[crumbs.length - 3]!.id)}
              className="rounded-md px-1.5 py-0.5 hover:bg-surface-2"
              aria-label="Go to parent folders"
              title={crumbs
                .slice(0, -2)
                .map((c) => c.name)
                .join(' / ')}
            >
              …
            </Link>
          </li>
        )}
        {shown.map((c, i) => (
          <li key={c.id} className="flex min-w-0 items-center">
            <ChevronRight size={16} className="shrink-0 text-fg-subtle" aria-hidden="true" />
            <Crumb
              to={folderHref(c.id)}
              label={c.name}
              current={i === shown.length - 1}
              destinationId={c.id}
              onDropItem={onDropItem}
            />
          </li>
        ))}
      </ol>
    </nav>
  );
}

function LoadingSkeleton({ view }: { view: 'grid' | 'list' }) {
  if (view === 'list') {
    return (
      <div className="space-y-2 rounded-xl border border-line bg-surface p-3" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 py-1">
            <div className="skeleton size-8" />
            <div className="skeleton h-3.5 flex-1" />
            <div className="skeleton h-3.5 w-20" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="skeleton aspect-[4/3] rounded-none" />
          <div className="space-y-2 p-3">
            <div className="skeleton h-3.5 w-3/4" />
            <div className="skeleton h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DrivePage() {
  const { folderId: routeFolderId } = useParams();
  const folderId = routeFolderId ?? null;
  const [params] = useSearchParams();
  const query = params.get('q')?.trim() ?? '';
  const searching = query.length > 0;
  const navigate = useNavigate();
  const toast = useToast();

  const [prefs, setPrefs] = usePreferences();
  const [dialog, setDialog] = useState<DialogState>(null);
  const { enqueue } = useUploads();
  const { move } = useDriveMutations();
  const fileInput = useRef<HTMLInputElement>(null);
  const sortMenu = useMenu();
  useQuery(storageQuery); // makes the upload size limit available for instant checks

  const contents = useQuery({
    queryKey: ['drive', folderId, prefs.sort, prefs.order],
    queryFn: () => api.folderContents(folderId, prefs.sort, prefs.order),
    enabled: !searching,
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[1] === folderId ? prev : undefined),
  });
  const results = useQuery({
    queryKey: ['search', query, prefs.sort, prefs.order],
    queryFn: () => api.search(query, prefs.sort, prefs.order),
    enabled: searching,
    placeholderData: keepPreviousData,
  });
  const active = searching ? results : contents;

  const folders: FolderItem[] = active.data?.folders ?? [];
  const files: FileItem[] = active.data?.files ?? [];
  const crumbs = contents.data?.breadcrumbs ?? [];
  const title = searching ? `Results for “${query}”` : (contents.data?.folder?.name ?? 'My Cloud');

  useEffect(() => {
    document.title = `${searching ? 'Search' : title} · My Own Cloud`;
  }, [title, searching]);

  const startUpload = useCallback(
    (list: File[]) => {
      if (list.length === 0) return;
      enqueue(list, searching ? null : folderId);
      if (searching) toast.info('Files are uploaded to My Cloud while searching.');
    },
    [enqueue, folderId, searching, toast],
  );

  // ---- Drag & drop upload from the desktop -------------------------------
  const [dragActive, setDragActive] = useState(false);
  const dragDepth = useRef(0);
  const isFileDrag = (e: DragEvent) => e.dataTransfer.types.includes('Files');

  const onDragEnter = (e: DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragActive(true);
  };
  const onDragLeave = (e: DragEvent) => {
    if (!isFileDrag(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragActive(false);
  };
  const onDragOver = (e: DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDrop = (e: DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    const items = [...e.dataTransfer.items];
    // Skip dropped directories: the browser exposes them as empty "files".
    const dirs = items.filter((i) => i.webkitGetAsEntry?.()?.isDirectory).length;
    const list = items
      .filter((i) => i.kind === 'file' && !i.webkitGetAsEntry?.()?.isDirectory)
      .map((i) => i.getAsFile())
      .filter((f): f is File => f !== null);
    if (dirs) toast.info('Folder uploads aren’t supported yet — drop the files themselves.');
    startUpload(list);
  };

  const handlers: ItemHandlers = {
    onAction: setDialog,
    onDropItem: (item, destinationId, destinationName) => move.mutate({ item, destinationId, destinationName }),
    showLocation: searching,
  };

  const onSort = (field: SortField) =>
    setPrefs(prefs.sort === field ? { order: prefs.order === 'asc' ? 'desc' : 'asc' } : { sort: field, order: 'asc' });

  const notFound = !searching && contents.error instanceof ApiError && contents.error.status === 404;
  const isEmpty = !active.isPending && !active.isError && folders.length === 0 && files.length === 0;

  return (
    <div
      className="relative mx-auto max-w-7xl"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          startUpload([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />

      {/* Header: location + primary actions */}
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {searching ? (
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
              <Button size="sm" variant="ghost" icon={<X size={15} />} onClick={() => navigate('/drive')}>
                Clear
              </Button>
            </div>
          ) : (
            <>
              {/* At the top level the heading already says "My Cloud". */}
              {crumbs.length > 0 && <Breadcrumbs crumbs={crumbs} onDropItem={handlers.onDropItem} />}
              <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight">{title}</h1>
            </>
          )}
        </div>
        {!notFound && (
          <div className="flex shrink-0 gap-2">
            {!searching && (
              <Button icon={<FolderPlus size={16} />} onClick={() => setDialog({ type: 'create-folder' })}>
                New folder
              </Button>
            )}
            <Button variant="primary" icon={<Upload size={16} />} onClick={() => fileInput.current?.click()}>
              Upload
            </Button>
          </div>
        )}
      </div>

      {/* Toolbar: summary, sort, view */}
      {!notFound && (
        <div className="mb-4 flex items-center gap-2 border-b border-line pb-3">
          <p className="mr-auto text-[13px] text-fg-muted" aria-live="polite">
            {active.isPending
              ? 'Loading…'
              : `${folders.length} folder${folders.length === 1 ? '' : 's'} · ${files.length} file${files.length === 1 ? '' : 's'}`}
            {searching && results.data?.truncated && ' (showing first results)'}
          </p>
          <Button
            size="sm"
            variant="ghost"
            icon={<ArrowDownUp size={15} />}
            aria-haspopup="menu"
            aria-expanded={sortMenu.open}
            onClick={(e) => sortMenu.openFromButton(e.currentTarget)}
          >
            <span className="hidden sm:inline">
              {SORT_LABELS[prefs.sort]} · {prefs.order === 'asc' ? 'Ascending' : 'Descending'}
            </span>
            <span className="sm:hidden">Sort</span>
          </Button>
          {sortMenu.anchor && (
            <MenuPopover
              anchor={sortMenu.anchor}
              onClose={sortMenu.close}
              label="Sort by"
              trigger={sortMenu.trigger}
              entries={[
                { heading: 'Sort by' },
                ...(Object.keys(SORT_LABELS) as SortField[]).map((field) => ({
                  label: SORT_LABELS[field],
                  checked: prefs.sort === field,
                  icon: prefs.sort === field ? <Check size={15} /> : null,
                  onSelect: () => setPrefs({ sort: field }),
                })),
                'separator',
                {
                  label: 'Ascending',
                  checked: prefs.order === 'asc',
                  icon: prefs.order === 'asc' ? <Check size={15} /> : null,
                  onSelect: () => setPrefs({ order: 'asc' }),
                },
                {
                  label: 'Descending',
                  checked: prefs.order === 'desc',
                  icon: prefs.order === 'desc' ? <Check size={15} /> : null,
                  onSelect: () => setPrefs({ order: 'desc' }),
                },
              ]}
            />
          )}
          <div className="flex rounded-lg border border-line bg-surface p-0.5" role="group" aria-label="View">
            {(
              [
                ['grid', LayoutGrid, 'Grid view'],
                ['list', List, 'List view'],
              ] as const
            ).map(([view, Icon, label]) => (
              <button
                key={view}
                type="button"
                aria-label={label}
                title={label}
                aria-pressed={prefs.view === view}
                onClick={() => setPrefs({ view })}
                className={clsx(
                  'flex size-7 items-center justify-center rounded-md transition-colors',
                  prefs.view === view ? 'bg-surface-3 text-fg' : 'text-fg-subtle hover:text-fg',
                )}
              >
                <Icon size={16} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      {notFound ? (
        <EmptyState
          icon={<AlertTriangle size={24} />}
          title="Folder not found"
          description="It may have been deleted or moved, or the link is incorrect."
        >
          <Button variant="primary" onClick={() => navigate('/drive')}>
            Back to My Cloud
          </Button>
        </EmptyState>
      ) : active.isPending ? (
        <LoadingSkeleton view={prefs.view} />
      ) : active.isError ? (
        <EmptyState icon={<AlertTriangle size={24} />} title="Couldn’t load this folder" description={errorMessage(active.error)}>
          <Button onClick={() => active.refetch()}>Try again</Button>
        </EmptyState>
      ) : isEmpty ? (
        searching ? (
          <EmptyState icon={<SearchX size={24} />} title="No matches" description={`Nothing in your cloud is named like “${query}”.`} />
        ) : (
          <EmptyState
            icon={<CloudUpload size={24} />}
            title={folderId ? 'This folder is empty' : 'Your cloud is empty'}
            description="Drag files here from your computer, or use the buttons below."
          >
            <Button variant="primary" icon={<Upload size={16} />} onClick={() => fileInput.current?.click()}>
              Upload files
            </Button>
            <Button icon={<FolderPlus size={16} />} onClick={() => setDialog({ type: 'create-folder' })}>
              New folder
            </Button>
          </EmptyState>
        )
      ) : (
        <div className={clsx('transition-opacity', active.isFetching && active.isPlaceholderData && 'opacity-60')}>
          {prefs.view === 'grid' ? (
            <ItemGrid folders={folders} files={files} handlers={handlers} />
          ) : (
            <ItemList folders={folders} files={files} handlers={handlers} sort={prefs.sort} order={prefs.order} onSort={onSort} />
          )}
        </div>
      )}

      {dragActive && (
        <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center bg-accent/10 p-6 backdrop-blur-[2px] animate-fade lg:left-64">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-accent bg-surface/95 px-10 py-8 text-center shadow-pop">
            <CloudUpload size={36} className="text-accent" aria-hidden="true" />
            <p className="text-base font-semibold">Drop to upload</p>
            <p className="text-sm text-fg-muted">to {searching ? 'My Cloud' : title}</p>
          </div>
        </div>
      )}

      <DriveDialogs state={dialog} onChange={setDialog} currentFolderId={folderId} />
    </div>
  );
}
