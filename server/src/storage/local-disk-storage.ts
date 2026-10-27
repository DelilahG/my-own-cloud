import { mkdir, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import type { StorageDriver } from './storage-driver.js';

const KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Stores file bytes in a private directory on the local disk:
 *
 *   <root>/objects/<first 2 chars of key>/<key>   committed files
 *   <root>/tmp/<random>                           uploads in progress
 *
 * The directory is never served statically; bytes are only reachable
 * through the authenticated download endpoint.
 */
export class LocalDiskStorage implements StorageDriver {
  readonly tempDir: string;
  private readonly objectsDir: string;

  constructor(private readonly root: string) {
    this.tempDir = path.join(root, 'tmp');
    this.objectsDir = path.join(root, 'objects');
  }

  async init(): Promise<void> {
    await mkdir(this.tempDir, { recursive: true });
    await mkdir(this.objectsDir, { recursive: true });
  }

  /** Resolves a key to its path, refusing anything that isn't a server-generated UUID. */
  private pathFor(key: string): string {
    if (!KEY_PATTERN.test(key)) throw new Error('Invalid storage key.');
    const resolved = path.resolve(this.objectsDir, key.slice(0, 2), key);
    // Defence in depth: the result must stay inside the objects directory.
    if (!resolved.startsWith(this.objectsDir + path.sep)) throw new Error('Invalid storage key.');
    return resolved;
  }

  async commitUpload(tempPath: string, key: string): Promise<void> {
    const destination = this.pathFor(key);
    await mkdir(path.dirname(destination), { recursive: true });
    // Same filesystem, so this is an atomic move rather than a copy.
    await rename(tempPath, destination);
  }

  async openReadStream(key: string): Promise<Readable> {
    const handle = await open(this.pathFor(key), 'r');
    return handle.createReadStream(); // closes the handle when done or destroyed
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.pathFor(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
}
