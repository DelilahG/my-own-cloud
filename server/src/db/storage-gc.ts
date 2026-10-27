// Removes "orphaned" stored objects: bytes on disk that no file record
// references any more (e.g. if deleting the bytes failed after the record
// was deleted). Objects younger than one hour are skipped so an upload that
// is just being committed can never be affected.
//
// Usage: npm run storage:gc            (dry run: only lists what it would delete)
//        npm run storage:gc -- --delete
import { readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/env.js';
import { pool } from './pool.js';

const MIN_AGE_MS = 60 * 60 * 1000;
const reallyDelete = process.argv.includes('--delete');

async function main() {
  const objectsDir = path.join(config.storageDir, 'objects');
  const shards = await readdir(objectsDir).catch(() => [] as string[]);
  const onDisk: { key: string; file: string }[] = [];
  for (const shard of shards) {
    for (const key of await readdir(path.join(objectsDir, shard))) {
      onDisk.push({ key, file: path.join(objectsDir, shard, key) });
    }
  }

  const { rows } = await pool.query<{ storage_key: string }>('SELECT storage_key FROM files');
  const referenced = new Set(rows.map((r) => r.storage_key));

  let orphans = 0;
  let bytes = 0;
  for (const { key, file } of onDisk) {
    if (referenced.has(key)) continue;
    const info = await stat(file);
    if (Date.now() - info.mtimeMs < MIN_AGE_MS) continue;
    orphans += 1;
    bytes += info.size;
    if (reallyDelete) await unlink(file);
  }

  console.log(
    `[storage:gc] ${onDisk.length} stored object(s), ${orphans} orphaned (${bytes} bytes)` +
      (orphans ? (reallyDelete ? ' — deleted.' : ' — dry run; re-run with -- --delete to remove them.') : '.'),
  );
}

try {
  await main();
} catch (err) {
  console.error('[storage:gc] Error:', (err as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
