const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/** 1536 → "1.5 KB". Uses binary (1024) steps, like most file managers. */
export function formatBytes(bytes: number, fractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  let exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  let value = bytes / 1024 ** exponent;
  let digits = exponent === 0 || value >= 100 ? 0 : fractionDigits;
  // 1023.99 MB would print as "1024 MB": roll over to the next unit instead.
  if (Number(value.toFixed(digits)) >= 1024 && exponent < UNITS.length - 1) {
    exponent += 1;
    value /= 1024;
    digits = fractionDigits;
  }
  return `${value.toFixed(digits).replace(/\.0+$/, '')} ${UNITS[exponent]}`;
}

/** "Mar 4, 2025" (or "Mar 4, 2025, 14:05" with time). */
export function formatDate(iso: string, withTime = false): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

/** "just now", "5 min ago", "3 h ago", "yesterday", or a date. */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const diffSec = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (diffSec < 45) return 'just now';
  const min = Math.round(diffSec / 60);
  if (min < 60) return `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDate(iso);
}

/** Uppercase extension for badges: "report.pdf" → "PDF". Empty when none. */
export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toUpperCase().slice(0, 5);
}

/** Readable type label from MIME type + name. */
export function describeType(mimeType: string, name: string): string {
  const ext = fileExtension(name);
  const known: Record<string, string> = {
    'application/pdf': 'PDF document',
    'application/zip': 'ZIP archive',
    'application/json': 'JSON file',
    'text/plain': 'Text file',
    'text/markdown': 'Markdown',
    'text/csv': 'CSV spreadsheet',
    'application/octet-stream': ext ? `${ext} file` : 'Binary file',
  };
  if (known[mimeType]) return known[mimeType]!;
  const [top, sub] = mimeType.split('/');
  if (top === 'image') return `${(sub ?? '').toUpperCase().replace('SVG+XML', 'SVG')} image`;
  if (top === 'video') return `${ext || 'Video'} video`;
  if (top === 'audio') return `${ext || 'Audio'} audio`;
  if (mimeType.includes('wordprocessingml') || mimeType === 'application/msword') return 'Word document';
  if (mimeType.includes('spreadsheetml') || mimeType === 'application/vnd.ms-excel') return 'Excel spreadsheet';
  if (mimeType.includes('presentationml') || mimeType === 'application/vnd.ms-powerpoint') return 'PowerPoint';
  return ext ? `${ext} file` : mimeType;
}

/** "<1" for tiny non-zero shares, otherwise a rounded whole percentage. */
export function percentLabel(part: number, whole: number): string {
  const p = percent(part, whole);
  return p > 0 && p < 1 ? '<1' : String(Math.round(p));
}

/** Percentage (0–100) with sensible clamping. */
export function percent(part: number, whole: number): number {
  if (whole <= 0) return part > 0 ? 100 : 0;
  return Math.min(100, Math.max(0, (part / whole) * 100));
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0]![0], parts[parts.length - 1]![0]] : [parts[0]?.[0], parts[0]?.[1]];
  return letters.filter(Boolean).join('').toUpperCase() || '?';
}

/** Validation mirroring the server rules, for instant feedback. */
export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Please enter a name.';
  if (trimmed.length > 255) return 'Name must be at most 255 characters.';
  if (trimmed === '.' || trimmed === '..') return 'Name cannot be "." or "..".';
  if (/[\u0000-\u001f\u007f<>:"/\\|?*]/.test(trimmed)) return 'Name cannot contain < > : " / \\ | ? *';
  if (/[.]$/.test(trimmed)) return 'Name cannot end with a dot.';
  return null;
}
