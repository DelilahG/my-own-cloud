import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { text } from 'node:stream/consumers';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LocalDiskStorage } from '../../src/storage/local-disk-storage.js';

let root: string;
let storage: LocalDiskStorage;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'moc-storage-'));
  storage = new LocalDiskStorage(root);
  await storage.init();
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('LocalDiskStorage', () => {
  it('commits, reads and deletes an object', async () => {
    const tmp = path.join(storage.tempDir, 'upload-1');
    await writeFile(tmp, 'stored bytes');
    const key = randomUUID();

    await storage.commitUpload(tmp, key);
    expect(existsSync(tmp)).toBe(false);
    expect(await text(await storage.openReadStream(key))).toBe('stored bytes');

    await storage.delete(key);
    await expect(storage.openReadStream(key)).rejects.toThrow(/ENOENT/);
  });

  it('deleting a missing object is not an error', async () => {
    await expect(storage.delete(randomUUID())).resolves.toBeUndefined();
  });

  it.each(['../../etc/passwd', '..\\..\\secret', 'abc', '', `${randomUUID()}/../x`])(
    'refuses non-UUID key %j (path traversal protection)',
    async (key) => {
      await expect(storage.openReadStream(key)).rejects.toThrow('Invalid storage key');
      await expect(storage.delete(key)).rejects.toThrow('Invalid storage key');
    },
  );
});
