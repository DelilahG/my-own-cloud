// Waits (up to ~60s) until the database in DATABASE_URL accepts connections.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env'), quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[wait-for-db] DATABASE_URL is not set. Run `npm run setup` first.');
  process.exit(1);
}

const deadline = Date.now() + 60_000;
for (;;) {
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
    console.log('[wait-for-db] Database is ready.');
    process.exit(0);
  } catch {
    await client.end().catch(() => {});
    if (Date.now() > deadline) {
      console.error('[wait-for-db] Timed out waiting for the database.');
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}
