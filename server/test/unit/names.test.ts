import { describe, expect, it } from 'vitest';
import { decodeMultipartFilename, sanitizeUploadName, uniqueName, validateItemName } from '../../src/lib/names.js';

describe('validateItemName', () => {
  it('accepts ordinary names', () => {
    expect(validateItemName('Holiday photos 2024')).toBeNull();
    expect(validateItemName('report.final.pdf')).toBeNull();
    expect(validateItemName('Ünïcödé ✓')).toBeNull();
  });

  it.each([
    ['', 'empty'],
    ['.', 'dot'],
    ['..', 'dot-dot'],
    ['a/b', 'slash'],
    ['a\\b', 'backslash'],
    ['bad:name', 'colon'],
    ['what?', 'question mark'],
    ['tab\there', 'control character'],
    ['trailing.', 'trailing dot'],
    ['x'.repeat(256), 'too long'],
  ])('rejects %j (%s)', (name) => {
    expect(validateItemName(name)).not.toBeNull();
  });
});

describe('sanitizeUploadName', () => {
  it('strips directory components (path traversal attempts)', () => {
    expect(sanitizeUploadName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeUploadName('..\\..\\Windows\\win.ini')).toBe('win.ini');
    expect(sanitizeUploadName('/absolute/path/file.txt')).toBe('file.txt');
  });

  it('replaces forbidden characters and falls back to "Untitled"', () => {
    expect(sanitizeUploadName('a<b>c.txt')).toBe('a_b_c.txt');
    expect(sanitizeUploadName('..')).toBe('Untitled');
    expect(sanitizeUploadName('   ')).toBe('Untitled');
  });

  it('truncates long names but keeps the extension', () => {
    const result = sanitizeUploadName(`${'a'.repeat(400)}.pdf`);
    expect(result.length).toBe(255);
    expect(result.endsWith('.pdf')).toBe(true);
  });
});

describe('decodeMultipartFilename', () => {
  it('re-decodes UTF-8 bytes that were read as latin1', () => {
    const original = 'résumé – 日本.txt';
    const garbled = Buffer.from(original, 'utf8').toString('latin1');
    expect(decodeMultipartFilename(garbled)).toBe(original);
  });

  it('leaves plain ASCII and already-decoded names alone', () => {
    expect(decodeMultipartFilename('plain.txt')).toBe('plain.txt');
    expect(decodeMultipartFilename('日本.txt')).toBe('日本.txt');
  });
});

describe('uniqueName', () => {
  it('returns the name unchanged when it is free', () => {
    expect(uniqueName('a.txt', ['b.txt'])).toBe('a.txt');
  });

  it('appends a counter before the extension, case-insensitively', () => {
    expect(uniqueName('Report.pdf', ['report.PDF'])).toBe('Report (1).pdf');
    expect(uniqueName('Report.pdf', ['Report.pdf', 'Report (1).pdf'])).toBe('Report (2).pdf');
  });

  it('handles names without an extension and dotfiles', () => {
    expect(uniqueName('README', ['README'])).toBe('README (1)');
    expect(uniqueName('.env', ['.env'])).toBe('.env (1)');
  });
});
