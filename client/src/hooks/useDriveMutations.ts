import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../components/ui/Toast';
import { api, errorMessage } from '../lib/api';
import type { DriveItem } from '../lib/types';

/** All write operations of the file browser, with cache refresh + toasts. */
export function useDriveMutations() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['drive'] });
    queryClient.invalidateQueries({ queryKey: ['search'] });
    queryClient.invalidateQueries({ queryKey: ['folders'] });
    queryClient.invalidateQueries({ queryKey: ['storage'] });
  };

  const createFolder = useMutation({
    mutationFn: ({ name, parentId }: { name: string; parentId: string | null }) => api.createFolder(name, parentId),
    onSuccess: ({ folder }) => {
      refresh();
      toast.success(`Folder "${folder.name}" created.`);
    },
  });

  const rename = useMutation({
    mutationFn: async ({ item, name }: { item: DriveItem; name: string }) => {
      if (item.kind === 'folder') await api.updateFolder(item.item.id, { name });
      else await api.updateFile(item.item.id, { name });
    },
    onSuccess: () => {
      refresh();
      toast.success('Renamed.');
    },
  });

  const move = useMutation({
    mutationFn: async ({
      item,
      destinationId,
    }: {
      item: DriveItem;
      destinationId: string | null;
      /** Only used for the confirmation message. */
      destinationName?: string;
    }) => {
      if (item.kind === 'folder') await api.updateFolder(item.item.id, { parentId: destinationId });
      else await api.updateFile(item.item.id, { folderId: destinationId });
    },
    onSuccess: (_data, { item, destinationId, destinationName }) => {
      refresh();
      const where = destinationId ? `“${destinationName ?? 'folder'}”` : 'My Cloud';
      toast.success(`Moved "${item.item.name}" to ${where}.`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: async (item: DriveItem) => {
      if (item.kind === 'folder') await api.deleteFolder(item.item.id);
      else await api.deleteFile(item.item.id);
    },
    onSuccess: (_data, item) => {
      refresh();
      toast.success(`"${item.item.name}" was deleted.`);
    },
  });

  return { createFolder, rename, move, remove };
}
