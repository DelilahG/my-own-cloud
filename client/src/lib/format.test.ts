import { describe, expect, it } from 'vitest';
import { describeType, fileExtension, formatBytes, formatRelative, initials, percent, validateName } from './format';

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1024, '1 KB'],
    [1536, '1.5 KB'],
    [10 * 1024 * 1024, '10 MB'],
    [1024 ** 3 * 2.25, '2.3 GB'],
    [150 * 1024 * 1024, '150 MB'],
    [1024 ** 3 - 126, '1 GB'],
  ])('%d → %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

describe('formatRelative', () => {
  const now = new Date('2025-06-10T12:00:00Z');
  it('describes recent times', () => {
    expect(formatRelative('2025-06-10T11:59:50Z', now)).toBe('just now');
    expect(formatRelative('2025-06-10T11:30:00Z', now)).toBe('30 min ago');
    expect(formatRelative('2025-06-10T07:00:00Z', now)).toBe('5 h ago');
    expect(formatRelative('2025-06-09T10:00:00Z', now)).toBe('yesterday');
    expect(formatRelative('2025-06-06T12:00:00Z', now)).toBe('4 days ago');
  });
});

describe('helpers', () => {
  it('extracts extensions', () => {
    expect(fileExtension('report.final.pdf')).toBe('PDF');
    expect(fileExtension('.env')).toBe('');
    expect(fileExtension('README')).toBe('');
  });

  it('describes types', () => {
    expect(describeType('application/pdf', 'a.pdf')).toBe('PDF document');
    expect(describeType('image/png', 'a.png')).toBe('PNG image');
    expect(describeType('application/octet-stream', 'tool.exe')).toBe('EXE file');
  });

  it('computes clamped percentages', () => {
    expect(percent(50, 200)).toBe(25);
    expect(percent(300, 200)).toBe(100);
    expect(percent(0, 0)).toBe(0);
  });

  it('builds initials', () => {
    expect(initials('Ada Lovelace')).toBe('AL');
    expect(initials('ada')).toBe('AD');
    expect(initials('  ')).toBe('?');
  });

  it('validates names like the server', () => {
    expect(validateName('Holiday')).toBeNull();
    expect(validateName('  ')).not.toBeNull();
    expect(validateName('a/b')).not.toBeNull();
    expect(validateName('..')).not.toBeNull();
  });
});
