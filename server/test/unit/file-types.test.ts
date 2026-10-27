import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { categorize, detectMimeType } from '../../src/lib/file-types.js';
import { PNG_1x1 } from '../helpers.js';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'moc-types-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function detect(content: Buffer | string, name: string) {
  const file = path.join(dir, `f-${Math.random().toString(36).slice(2)}`);
  await writeFile(file, content);
  return detectMimeType(file, name);
}

describe('detectMimeType', () => {
  it('detects binary formats from their content, ignoring a misleading extension', async () => {
    expect(await detect(PNG_1x1, 'not-really.txt')).toBe('image/png');
  });

  it('does not trust an image extension on non-image content', async () => {
    expect(await detect('<script>alert(1)</script>', 'evil.png')).toBe('application/octet-stream');
  });

  it('uses the extension only for text-like formats', async () => {
    expect(await detect('hello', 'notes.txt')).toBe('text/plain');
    expect(await detect('{"a":1}', 'data.json')).toBe('application/json');
    expect(await detect('just bytes', 'program.exe')).toBe('application/octet-stream');
  });
});

describe('categorize', () => {
  it.each([
    ['image/png', 'images'],
    ['video/mp4', 'videos'],
    ['audio/mpeg', 'audio'],
    ['application/pdf', 'documents'],
    ['text/plain', 'documents'],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'documents'],
    ['application/zip', 'archives'],
    ['application/octet-stream', 'other'],
  ])('%s → %s', (mime, category) => {
    expect(categorize(mime)).toBe(category);
  });
});
