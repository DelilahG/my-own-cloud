import path from 'node:path';

export const MAX_NAME_LENGTH = 255;

// Control characters and characters that are invalid in filenames on
// Windows/macOS/Linux. Rejecting them keeps names portable when downloaded.
const FORBIDDEN_CHARS = /[\u0000-\u001f\u007f<>:"/\\|?*]/;
const FORBIDDEN_CHARS_GLOBAL = /[\u0000-\u001f\u007f<>:"/\\|?*]/g;

/**
 * Returns an error message if `name` is not an acceptable file/folder name,
 * or null if it is valid. Used for names typed by the user.
 */
export function validateItemName(name: string): string | null {
  if (name.length === 0) return 'Name cannot be empty.';
  if (name.length > MAX_NAME_LENGTH) return `Name must be at most ${MAX_NAME_LENGTH} characters.`;
  if (name === '.' || name === '..') return 'Name cannot be "." or "..".';
  if (FORBIDDEN_CHARS.test(name)) return 'Name cannot contain control characters or any of < > : " / \\ | ? *';
  if (/[. ]$/.test(name)) return 'Name cannot end with a dot or a space.';
  return null;
}

/**
 * Converts an uploaded filename (which the client fully controls) into a
 * safe display name: strips any directory components, replaces forbidden
 * characters and trims it to the maximum length while keeping the extension.
 */
export function sanitizeUploadName(raw: string): string {
  // Take only the last path segment, whichever separator was used.
  let name = raw.split(/[/\\]/).pop() ?? '';
  name = name.normalize('NFC').replace(FORBIDDEN_CHARS_GLOBAL, '_').trim();
  name = name.replace(/[. ]+$/, '');
  if (!name || name === '.' || name === '..') name = 'Untitled';

  if (name.length > MAX_NAME_LENGTH) {
    const ext = path.extname(name).slice(0, 20);
    name = name.slice(0, MAX_NAME_LENGTH - ext.length) + ext;
  }
  return name;
}

/**
 * Multer/busboy decodes multipart filenames as latin1, but browsers send
 * UTF-8 bytes. Re-decode so non-ASCII names (e.g. accented letters) survive intact.
 */
export function decodeMultipartFilename(name: string): string {
  // Only re-decode if every char fits in a byte (i.e. it really was latin1-decoded).
  if (!/^[\u0000-ÿ]*$/.test(name)) return name;
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('�') ? name : decoded;
}

/**
 * Picks a name that does not collide (case-insensitively) with `taken`, by
 * appending " (1)", " (2)", ... before the extension: "report (2).pdf".
 */
export function uniqueName(desired: string, taken: Iterable<string>): string {
  const lowerTaken = new Set([...taken].map((n) => n.toLowerCase()));
  if (!lowerTaken.has(desired.toLowerCase())) return desired;

  const ext = path.extname(desired);
  const base = ext && ext !== desired ? desired.slice(0, -ext.length) : desired;
  const finalExt = base === desired ? '' : ext;
  for (let i = 1; i < 10_000; i++) {
    const suffix = ` (${i})`;
    const trimmedBase = base.slice(0, MAX_NAME_LENGTH - finalExt.length - suffix.length);
    const candidate = `${trimmedBase}${suffix}${finalExt}`;
    if (!lowerTaken.has(candidate.toLowerCase())) return candidate;
  }
  throw new Error('Could not find a free name.');
}
