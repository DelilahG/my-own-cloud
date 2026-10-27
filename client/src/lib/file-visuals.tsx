import { Archive, File, FileAudio, FileImage, FileText, FileVideo, Folder, type LucideIcon } from 'lucide-react';
import type { FileCategory } from './types';

/** Fixed display order — category colours are assigned in this order and never re-cycled. */
export const CATEGORY_ORDER: FileCategory[] = ['documents', 'images', 'videos', 'audio', 'archives', 'other'];

export const CATEGORY_META: Record<FileCategory, { label: string; icon: LucideIcon; color: string }> = {
  documents: { label: 'Documents', icon: FileText, color: 'var(--cat-documents)' },
  images: { label: 'Images', icon: FileImage, color: 'var(--cat-images)' },
  videos: { label: 'Videos', icon: FileVideo, color: 'var(--cat-videos)' },
  audio: { label: 'Audio', icon: FileAudio, color: 'var(--cat-audio)' },
  archives: { label: 'Archives', icon: Archive, color: 'var(--cat-archives)' },
  other: { label: 'Other', icon: File, color: 'var(--cat-other)' },
};

const SIZES = { sm: 'size-8 rounded-lg', md: 'size-10 rounded-xl', lg: 'size-14 rounded-2xl' };
const ICON_SIZES = { sm: 16, md: 20, lg: 28 };

/** Coloured tile with an icon for a file category. */
export function FileTypeIcon({ category, size = 'md' }: { category: FileCategory; size?: keyof typeof SIZES }) {
  const meta = CATEGORY_META[category];
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${SIZES[size]}`}
      style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 13%, transparent)` }}
      aria-hidden="true"
    >
      <Icon size={ICON_SIZES[size]} strokeWidth={1.75} />
    </span>
  );
}

export function FolderIcon({ size = 'md' }: { size?: keyof typeof SIZES }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center bg-accent-soft text-accent ${SIZES[size]}`}
      aria-hidden="true"
    >
      <Folder size={ICON_SIZES[size]} strokeWidth={1.75} fill="currentColor" fillOpacity={0.18} />
    </span>
  );
}
