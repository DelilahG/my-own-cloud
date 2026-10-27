import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ChevronRight, Download, FolderInput, Home, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useDriveMutations } from '../../hooks/useDriveMutations';
import { api, errorMessage } from '../../lib/api';
import { FileTypeIcon, FolderIcon } from '../../lib/file-visuals';
import { describeType, formatBytes, formatDate, validateName } from '../../lib/format';
import type { DriveItem, FileItem, FolderItem } from '../../lib/types';
import { Dialog } from '../ui/Dialog';
import { Button, Field, Input, Spinner } from '../ui/primitives';

export type DialogState =
  | { type: 'create-folder' }
  | { type: 'rename'; item: DriveItem }
  | { type: 'move'; item: DriveItem }
  | { type: 'delete'; item: DriveItem }
  | { type: 'details'; file: FileItem }
  | null;

/** Text input dialog shared by "New folder" and "Rename". */
function NameDialog({
  title,
  label,
  initial,
  submitLabel,
  onClose,
  onSubmit,
  isFile,
}: {
  title: string;
  label: string;
  initial: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<unknown>;
  isFile?: boolean;
}) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectStem = (el: HTMLInputElement | null) => {
    if (!el || el.dataset.ready) return;
    el.dataset.ready = '1';
    el.focus();
    // For files, pre-select the name without the extension.
    const dot = isFile ? initial.lastIndexOf('.') : -1;
    el.setSelectionRange(0, dot > 0 ? dot : initial.length);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = validateName(name);
    if (problem) return setError(problem);
    if (name.trim() === initial) return onClose();
    setBusy(true);
    try {
      await onSubmit(name.trim());
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={title} size="sm">
      <form id="name-form" onSubmit={submit} noValidate>
        <Field id="item-name" label={label} error={error}>
          <Input
            id="item-name"
            ref={selectStem}
            value={name}
            maxLength={255}
            invalid={!!error}
            aria-describedby={error ? 'item-name-error' : undefined}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-5 pb-4">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function DeleteDialog({ item, onClose }: { item: DriveItem; onClose: () => void }) {
  const { remove } = useDriveMutations();
  const [error, setError] = useState<string | null>(null);
  const isFolder = item.kind === 'folder';
  const count = isFolder ? (item.item as FolderItem).itemCount : undefined;

  const confirm = async () => {
    try {
      await remove.mutateAsync(item);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={isFolder ? 'Delete folder?' : 'Delete file?'}
      description={
        <>
          <strong className="font-medium break-all text-fg">“{item.item.name}”</strong>{' '}
          {isFolder
            ? count
              ? `and everything inside it (${count} item${count === 1 ? '' : 's'} at the top level, plus any subfolders) will be permanently deleted.`
              : 'will be permanently deleted.'
            : 'will be permanently deleted.'}{' '}
          This cannot be undone.
        </>
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" icon={<Trash2 size={16} />} loading={remove.isPending} onClick={confirm}>
            Delete
          </Button>
        </>
      }
    >
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}

interface TreeNode {
  folder: FolderItem;
  children: TreeNode[];
}

/** Folder picker for "Move to…", built from the user's full folder list. */
function MoveDialog({ item, onClose }: { item: DriveItem; onClose: () => void }) {
  const { move } = useDriveMutations();
  const { data, isPending, isError } = useQuery({ queryKey: ['folders'], queryFn: api.allFolders });
  const currentParent = item.kind === 'folder' ? item.item.parentId : item.item.folderId;
  const [target, setTarget] = useState<string | null>(currentParent);
  const [error, setError] = useState<string | null>(null);

  const { roots, blocked } = useMemo(() => {
    const folders = data?.folders ?? [];
    const nodes = new Map(folders.map((f) => [f.id, { folder: f, children: [] as TreeNode[] }]));
    const roots: TreeNode[] = [];
    for (const node of nodes.values()) {
      const parent = node.folder.parentId ? nodes.get(node.folder.parentId) : undefined;
      (parent ? parent.children : roots).push(node);
    }
    // A folder can't move into itself or its descendants: hide that branch.
    const blocked = new Set<string>();
    if (item.kind === 'folder') {
      const walk = (n?: TreeNode) => {
        if (!n) return;
        blocked.add(n.folder.id);
        n.children.forEach(walk);
      };
      walk(nodes.get(item.item.id));
    }
    return { roots, blocked };
  }, [data, item]);

  const renderNodes = (nodes: TreeNode[], depth: number) =>
    nodes
      .filter((n) => !blocked.has(n.folder.id))
      .map((n) => (
        <li key={n.folder.id}>
          <TargetButton
            selected={target === n.folder.id}
            depth={depth}
            onClick={() => setTarget(n.folder.id)}
            label={n.folder.name}
            icon={<FolderIcon size="sm" />}
          />
          {n.children.length > 0 && <ul>{renderNodes(n.children, depth + 1)}</ul>}
        </li>
      ));

  const submit = async () => {
    try {
      const destinationName = data?.folders.find((f) => f.id === target)?.name;
      await move.mutateAsync({ item, destinationId: target, destinationName });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Move “${item.item.name}”`}
      description="Choose a destination folder."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            icon={<FolderInput size={16} />}
            loading={move.isPending}
            disabled={target === currentParent}
            onClick={submit}
          >
            Move here
          </Button>
        </>
      }
    >
      <div className="max-h-80 overflow-y-auto rounded-xl border border-line p-1.5">
        {isPending ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : isError ? (
          <p className="p-4 text-sm text-danger">Could not load folders.</p>
        ) : (
          <ul aria-label="Destination folders">
            <li>
              <TargetButton
                selected={target === null}
                depth={0}
                onClick={() => setTarget(null)}
                label="My Cloud"
                icon={
                  <span className="flex size-8 items-center justify-center rounded-lg bg-surface-2 text-fg-muted">
                    <Home size={16} />
                  </span>
                }
              />
              <ul>{renderNodes(roots, 1)}</ul>
            </li>
          </ul>
        )}
      </div>
      {error && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}

function TargetButton({
  selected,
  depth,
  onClick,
  label,
  icon,
}: {
  selected: boolean;
  depth: number;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      style={{ paddingLeft: `${0.5 + depth * 1.1}rem` }}
      className={clsx(
        'flex w-full items-center gap-2.5 rounded-lg py-1.5 pr-2 text-left text-[13px] transition-colors',
        selected ? 'bg-accent-soft font-medium text-accent' : 'text-fg hover:bg-surface-2',
      )}
    >
      {depth > 0 && <ChevronRight size={14} className="-ml-1 text-fg-subtle" aria-hidden="true" />}
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

/** File preview (images) + metadata + actions. */
function DetailsDialog({
  file,
  onClose,
  onAction,
}: {
  file: FileItem;
  onClose: () => void;
  onAction: (state: DialogState) => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => setImgFailed(false), [file.id]);
  const asItem: DriveItem = { kind: 'file', item: file };

  const rows: [string, string][] = [
    ['Type', describeType(file.mimeType, file.name)],
    ['Size', `${formatBytes(file.sizeBytes)} (${file.sizeBytes.toLocaleString()} bytes)`],
    ['Uploaded', formatDate(file.createdAt, true)],
    ['Modified', formatDate(file.updatedAt, true)],
  ];
  if (file.folderName !== undefined) rows.push(['Location', file.folderName ?? 'My Cloud']);

  return (
    <Dialog open onClose={onClose} title={file.name} size="lg">
      <div className="grid gap-5 sm:grid-cols-[1fr_15rem]">
        <div className="flex min-h-56 items-center justify-center overflow-hidden rounded-xl border border-line bg-surface-2">
          {file.previewable && !imgFailed ? (
            <img
              src={api.previewUrl(file.id)}
              alt={`Preview of ${file.name}`}
              onError={() => setImgFailed(true)}
              className="max-h-[50vh] w-auto max-w-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <FileTypeIcon category={file.category} size="lg" />
              <p className="text-xs text-fg-subtle">No preview available for this file type</p>
            </div>
          )}
        </div>
        <div className="flex flex-col">
          <dl className="space-y-3 text-[13px]">
            {rows.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-fg-subtle">{k}</dt>
                <dd className="mt-0.5 break-words text-fg">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-5 flex flex-col gap-2 pb-4 sm:mt-auto">
            <a
              href={api.downloadUrl(file.id)}
              download
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-accent px-3.5 text-sm font-medium text-accent-fg shadow-sm transition-colors hover:bg-accent-hover"
            >
              <Download size={16} aria-hidden="true" /> Download
            </a>
            <div className="grid grid-cols-3 gap-2">
              <Button size="sm" icon={<Pencil size={14} />} onClick={() => onAction({ type: 'rename', item: asItem })}>
                Rename
              </Button>
              <Button size="sm" icon={<FolderInput size={14} />} onClick={() => onAction({ type: 'move', item: asItem })}>
                Move
              </Button>
              <Button
                size="sm"
                className="text-danger"
                icon={<Trash2 size={14} />}
                onClick={() => onAction({ type: 'delete', item: asItem })}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/** Renders whichever dialog is currently requested by the file browser. */
export function DriveDialogs({
  state,
  onChange,
  currentFolderId,
}: {
  state: DialogState;
  onChange: (state: DialogState) => void;
  currentFolderId: string | null;
}) {
  const { createFolder, rename } = useDriveMutations();
  const close = () => onChange(null);
  if (!state) return null;

  switch (state.type) {
    case 'create-folder':
      return (
        <NameDialog
          title="New folder"
          label="Folder name"
          initial="Untitled folder"
          submitLabel="Create"
          onClose={close}
          onSubmit={(name) => createFolder.mutateAsync({ name, parentId: currentFolderId })}
        />
      );
    case 'rename':
      return (
        <NameDialog
          title={state.item.kind === 'folder' ? 'Rename folder' : 'Rename file'}
          label="New name"
          initial={state.item.item.name}
          submitLabel="Rename"
          isFile={state.item.kind === 'file'}
          onClose={close}
          onSubmit={(name) => rename.mutateAsync({ item: state.item, name })}
        />
      );
    case 'move':
      return <MoveDialog item={state.item} onClose={close} />;
    case 'delete':
      return <DeleteDialog item={state.item} onClose={close} />;
    case 'details':
      return <DetailsDialog file={state.file} onClose={close} onAction={onChange} />;
  }
}
