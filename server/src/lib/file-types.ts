import { fileTypeFromFile } from 'file-type';
import mime from 'mime-types';

export type FileCategory = 'images' | 'videos' | 'audio' | 'documents' | 'archives' | 'other';

// Types we accept from the file extension when the content has no magic
// bytes to sniff (plain-text formats). Everything else must be detected
// from the content itself or it is stored as application/octet-stream.
const TEXT_LIKE_BY_EXTENSION = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
  'text/css',
  'text/javascript',
  'application/javascript',
  'application/json',
  'application/xml',
  'text/xml',
  'image/svg+xml',
  'application/x-yaml',
  'text/yaml',
  'application/sql',
  'text/x-python',
  'application/x-sh',
]);

/**
 * Determines a file's MIME type WITHOUT trusting the type the browser sent.
 * 1. Sniff magic bytes from the stored content (reliable for binary formats).
 * 2. For text formats (no magic bytes), fall back to the extension, but only
 *    for a fixed allow-list of text-like types.
 * 3. Otherwise: application/octet-stream.
 *
 * Files are always downloaded as attachments with `nosniff`, so even a
 * mislabelled type cannot make the browser execute content in our origin.
 */
export async function detectMimeType(filePath: string, displayName: string): Promise<string> {
  const detected = await fileTypeFromFile(filePath).catch(() => undefined);
  if (detected) return detected.mime;

  const byExtension = mime.lookup(displayName);
  if (byExtension && TEXT_LIKE_BY_EXTENSION.has(byExtension)) return byExtension;
  return 'application/octet-stream';
}

/** Raster images that are safe to display inline (preview / thumbnails). */
export const PREVIEWABLE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp']);

const DOCUMENT_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/rtf',
  'application/json',
  'application/xml',
  'application/epub+zip',
]);
const ARCHIVE_TYPES = new Set([
  'application/zip',
  'application/x-7z-compressed',
  'application/x-rar-compressed',
  'application/vnd.rar',
  'application/gzip',
  'application/x-tar',
  'application/x-bzip2',
  'application/x-xz',
  'application/zstd',
]);

/** Groups a MIME type into a broad category for the storage dashboard. */
export function categorize(mimeType: string): FileCategory {
  const type = mimeType.toLowerCase();
  if (type.startsWith('image/')) return 'images';
  if (type.startsWith('video/')) return 'videos';
  if (type.startsWith('audio/')) return 'audio';
  if (
    type.startsWith('text/') ||
    DOCUMENT_TYPES.has(type) ||
    type.startsWith('application/vnd.openxmlformats-officedocument') ||
    type.startsWith('application/vnd.oasis.opendocument')
  ) {
    return 'documents';
  }
  if (ARCHIVE_TYPES.has(type)) return 'archives';
  return 'other';
}
