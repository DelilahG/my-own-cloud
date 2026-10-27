import clsx from 'clsx';
import { ArrowDown, ArrowUp, Download, Eye, FolderInput, FolderOpen, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useState, type DragEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../../lib/api';
import { FileTypeIcon, FolderIcon } from '../../lib/file-visuals';
import { describeType, fileExtension, formatBytes, formatDate, formatRelative } from '../../lib/format';
import type { DriveItem, FileItem, FolderItem, SortField, SortOrder } from '../../lib/types';
import { MenuPopover, useMenu, type MenuEntry } from '../ui/Menu';
import type { DialogState } from './DriveDialogs';

export const ITEM_MIME = 'application/x-moc-item';

export interface ItemHandlers {
  onAction: (state: DialogState) => void;
  /** Called when one item is dropped onto a folder (drag-to-move). */
  onDropItem: (item: DriveItem, destinationId: string | null, destinationName: string) => void;
  /** Search results show where each item lives. */
  showLocation?: boolean;
}

export const folderHref = (id: string | null) => (id ? `/drive/folder/${id}` : '/drive');

function menuEntries(item: DriveItem, handlers: ItemHandlers, open: () => void): MenuEntry[] {
  const common: MenuEntry[] = [
    { label: 'Rename', icon: <Pencil size={15} />, onSelect: () => handlers.onAction({ type: 'rename', item }) },
    { label: 'Move to…', icon: <FolderInput size={15} />, onSelect: () => handlers.onAction({ type: 'move', item }) },
    'separator',
    { label: 'Delete', icon: <Trash2 size={15} />, danger: true, onSelect: () => handlers.onAction({ type: 'delete', item }) },
  ];
  if (item.kind === 'folder') {
    return [{ label: 'Open', icon: <FolderOpen size={15} />, onSelect: open }, ...common];
  }
  return [
    { label: item.item.previewable ? 'Preview & details' : 'Details', icon: <Eye size={15} />, onSelect: open },
    { label: 'Download', icon: <Download size={15} />, href: api.downloadUrl(item.item.id), download: true, onSelect: () => {} },
    'separator',
    ...common,
  ];
}

/** Shared behaviour: actions menu (button + right-click), drag source, drop target for folders. */
function useItemBehaviour(item: DriveItem, handlers: ItemHandlers) {
  const navigate = useNavigate();
  const menu = useMenu();
  const [dropping, setDropping] = useState(false);

  const open = () =>
    item.kind === 'folder' ? navigate(folderHref(item.item.id)) : handlers.onAction({ type: 'details', file: item.item });

  const dragSource = {
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(ITEM_MIME, JSON.stringify(item));
      e.dataTransfer.effectAllowed = 'move';
    },
  };

  const dropTarget =
    item.kind === 'folder'
      ? {
          onDragOver: (e: DragEvent) => {
            if (!e.dataTransfer.types.includes(ITEM_MIME)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setDropping(true);
          },
          onDragLeave: () => setDropping(false),
          onDrop: (e: DragEvent) => {
            setDropping(false);
            const raw = e.dataTransfer.getData(ITEM_MIME);
            if (!raw) return;
            e.preventDefault();
            e.stopPropagation();
            const dragged = JSON.parse(raw) as DriveItem;
            if (dragged.item.id !== item.item.id) handlers.onDropItem(dragged, item.item.id, item.item.name);
          },
        }
      : {};

  const menuElement = menu.anchor && (
    <MenuPopover
      anchor={menu.anchor}
      entries={menuEntries(item, handlers, open)}
      onClose={menu.close}
      label={`Actions for ${item.item.name}`}
      trigger={menu.trigger}
    />
  );

  const menuButton = (className?: string) => (
    <button
      type="button"
      aria-label={`More actions for ${item.item.name}`}
      aria-haspopup="menu"
      aria-expanded={menu.open}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        menu.openFromButton(e.currentTarget);
      }}
      className={clsx(
        'flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-surface-3 hover:text-fg',
        className,
      )}
    >
      <MoreHorizontal size={18} />
    </button>
  );

  return { open, menu, dropping, dragSource, dropTarget, menuElement, menuButton };
}

const subtitleForFolder = (folder: FolderItem, showLocation?: boolean) => {
  if (showLocation) return `in ${folder.parentName ?? 'My Cloud'}`;
  const n = folder.itemCount ?? 0;
  return n === 0 ? 'Empty' : `${n} item${n === 1 ? '' : 's'}`;
};

export function FolderCard({ folder, handlers }: { folder: FolderItem; handlers: ItemHandlers }) {
  const item: DriveItem = { kind: 'folder', item: folder };
  const b = useItemBehaviour(item, handlers);
  return (
    <div
      {...b.dragSource}
      {...b.dropTarget}
      onContextMenu={b.menu.openAtPointer}
      className={clsx(
        'group relative flex items-center gap-3 rounded-xl border bg-surface p-3 shadow-card transition-all',
        b.dropping ? 'border-accent ring-4 ring-accent/15' : 'border-line hover:border-line-strong hover:shadow-md',
      )}
    >
      <FolderIcon />
      <div className="min-w-0 flex-1">
        <Link
          to={folderHref(folder.id)}
          className="block truncate text-[13px] font-medium text-fg after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-accent"
          title={folder.name}
        >
          {folder.name}
        </Link>
        <p className="truncate text-xs text-fg-subtle">{subtitleForFolder(folder, handlers.showLocation)}</p>
      </div>
      <div className="relative z-10">{b.menuButton()}</div>
      {b.menuElement}
    </div>
  );
}

function Thumbnail({ file }: { file: FileItem }) {
  const [failed, setFailed] = useState(false);
  if (file.previewable && !failed) {
    return (
      <img
        src={api.previewUrl(file.id)}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
      />
    );
  }
  const ext = fileExtension(file.name);
  return (
    <div className="flex flex-col items-center gap-2">
      <FileTypeIcon category={file.category} size="lg" />
      {ext && <span className="text-[11px] font-semibold tracking-wider text-fg-subtle">{ext}</span>}
    </div>
  );
}

export function FileCard({ file, handlers }: { file: FileItem; handlers: ItemHandlers }) {
  const item: DriveItem = { kind: 'file', item: file };
  const b = useItemBehaviour(item, handlers);
  return (
    <div
      {...b.dragSource}
      onContextMenu={b.menu.openAtPointer}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card transition-all hover:border-line-strong hover:shadow-md"
    >
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden border-b border-line bg-surface-2">
        <Thumbnail file={file} />
      </div>
      <div className="flex items-start gap-2 p-3 pr-1.5">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={b.open}
            title={file.name}
            className="block w-full truncate text-left text-[13px] font-medium text-fg after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-accent"
          >
            {file.name}
          </button>
          <p className="mt-0.5 truncate text-xs text-fg-subtle">
            {handlers.showLocation
              ? `in ${file.folderName ?? 'My Cloud'}`
              : `${formatBytes(file.sizeBytes)} · ${formatRelative(file.updatedAt)}`}
          </p>
        </div>
        <div className="relative z-10 -mt-1">{b.menuButton()}</div>
      </div>
      {b.menuElement}
    </div>
  );
}

function SortHeader({
  label,
  field,
  sort,
  order,
  onSort,
  className,
}: {
  label: string;
  field: SortField;
  sort: SortField;
  order: SortOrder;
  onSort: (field: SortField) => void;
  className?: string;
}) {
  const active = sort === field;
  return (
    <th
      scope="col"
      aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : undefined}
      className={clsx('px-3 py-2.5 text-left text-xs font-medium text-fg-subtle', className)}
    >
      <button type="button" onClick={() => onSort(field)} className="inline-flex items-center gap-1 hover:text-fg">
        {label}
        {active && (order === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}
      </button>
    </th>
  );
}

function ListRow({ item, handlers }: { item: DriveItem; handlers: ItemHandlers }) {
  const b = useItemBehaviour(item, handlers);
  const isFolder = item.kind === 'folder';
  const name: ReactNode = isFolder ? (
    <Link to={folderHref(item.item.id)} className="truncate font-medium text-fg hover:underline" title={item.item.name}>
      {item.item.name}
    </Link>
  ) : (
    <button type="button" onClick={b.open} className="truncate text-left font-medium text-fg hover:underline" title={item.item.name}>
      {item.item.name}
    </button>
  );
  return (
    <tr
      {...b.dragSource}
      {...b.dropTarget}
      onContextMenu={b.menu.openAtPointer}
      className={clsx(
        'border-b border-line text-[13px] transition-colors last:border-0',
        b.dropping ? 'bg-accent-soft' : 'hover:bg-surface-2',
      )}
    >
      <td className="max-w-0 px-3 py-2">
        <div className="flex min-w-0 items-center gap-3">
          {isFolder ? <FolderIcon size="sm" /> : <FileTypeIcon category={(item.item as FileItem).category} size="sm" />}
          <div className="flex min-w-0 flex-col">
            {name}
            {handlers.showLocation && (
              <span className="truncate text-xs text-fg-subtle">
                in{' '}
                {(isFolder ? (item.item as FolderItem).parentName : (item.item as FileItem).folderName) ?? 'My Cloud'}
              </span>
            )}
          </div>
        </div>
      </td>
      <td className="hidden px-3 py-2 text-fg-muted md:table-cell">
        {isFolder ? 'Folder' : describeType((item.item as FileItem).mimeType, item.item.name)}
      </td>
      <td className="hidden px-3 py-2 whitespace-nowrap text-fg-muted sm:table-cell">
        {isFolder ? subtitleForFolder(item.item as FolderItem) : formatBytes((item.item as FileItem).sizeBytes)}
      </td>
      <td className="hidden px-3 py-2 whitespace-nowrap text-fg-muted lg:table-cell" title={formatDate(item.item.updatedAt, true)}>
        {formatDate(item.item.updatedAt)}
      </td>
      <td className="w-10 px-2 py-1 text-right">{b.menuButton('ml-auto')}</td>
      {b.menuElement}
    </tr>
  );
}

export function ItemList({
  folders,
  files,
  handlers,
  sort,
  order,
  onSort,
}: {
  folders: FolderItem[];
  files: FileItem[];
  handlers: ItemHandlers;
  sort: SortField;
  order: SortOrder;
  onSort: (field: SortField) => void;
}) {
  const header = { sort, order, onSort };
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <table className="w-full table-fixed border-collapse">
        <thead className="border-b border-line bg-surface-2/60">
          <tr>
            <SortHeader label="Name" field="name" {...header} />
            <th scope="col" className="hidden w-44 px-3 py-2.5 text-left text-xs font-medium text-fg-subtle md:table-cell">
              Type
            </th>
            <SortHeader label="Size" field="size" className="hidden w-28 sm:table-cell" {...header} />
            <SortHeader label="Modified" field="updated" className="hidden w-36 lg:table-cell" {...header} />
            <th scope="col" className="w-12">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {folders.map((f) => (
            <ListRow key={f.id} item={{ kind: 'folder', item: f }} handlers={handlers} />
          ))}
          {files.map((f) => (
            <ListRow key={f.id} item={{ kind: 'file', item: f }} handlers={handlers} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ItemGrid({ folders, files, handlers }: { folders: FolderItem[]; files: FileItem[]; handlers: ItemHandlers }) {
  return (
    <div className="space-y-7">
      {folders.length > 0 && (
        <section aria-labelledby="folders-heading">
          <h2 id="folders-heading" className="mb-3 text-xs font-medium tracking-wide text-fg-subtle uppercase">
            Folders
          </h2>
          <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {folders.map((f) => (
              <FolderCard key={f.id} folder={f} handlers={handlers} />
            ))}
          </div>
        </section>
      )}
      {files.length > 0 && (
        <section aria-labelledby="files-heading">
          <h2 id="files-heading" className="mb-3 text-xs font-medium tracking-wide text-fg-subtle uppercase">
            Files
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {files.map((f) => (
              <FileCard key={f.id} file={f} handlers={handlers} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
