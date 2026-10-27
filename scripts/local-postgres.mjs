// Runs a real PostgreSQL server *inside this project folder* (in .pgdata/)
// using the official PostgreSQL binaries shipped by the `embedded-postgres`
// npm package. No administrator rights or system-wide install required.
//
// Usage:  npm run db:start      (leave the window open; Ctrl+C to stop)
//
// If you already have PostgreSQL installed, you don't need this script:
// just point DATABASE_URL / TEST_DATABASE_URL in .env at your own server.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import EmbeddedPostgres from 'embedded-postgres';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env'), quiet: true });

const port = Number(process.env.LOCAL_PG_PORT || 5433);
const password = process.env.LOCAL_PG_PASSWORD;
if (!password) {
  console.error('[db] LOCAL_PG_PASSWORD is missing. Run `npm run setup` first to create .env.');
  process.exit(1);
}

const databaseDir = path.join(root, '.pgdata');
const databases = ['myowncloud', 'myowncloud_test'];

const pg = new EmbeddedPostgres({
  databaseDir,
  user: 'postgres',
  password,
  port,
  persistent: true,
  onLog: () => {},
  onError: (message) => {
    const text = String(message).trim();
    if (text) console.error('[postgres]', text);
  },
});

async function main() {
  if (!existsSync(path.join(databaseDir, 'PG_VERSION'))) {
    console.log('[db] Initialising a new PostgreSQL cluster in .pgdata/ ...');
    await pg.initialise();
  }

  await pg.start();
  console.log(`[db] PostgreSQL is running on localhost:${port}`);

  const client = pg.getPgClient();
  await client.connect();
  try {
    for (const name of databases) {
      const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
      if (rowCount === 0) {
        // Database names cannot be parameterised; these are fixed constants above.
        await client.query(`CREATE DATABASE "${name}"`);
        console.log(`[db] Created database "${name}"`);
      }
    }
  } finally {
    await client.end();
  }

  console.log('[db] Ready. Leave this running; press Ctrl+C to stop the database.');
  if (process.argv.includes('--once')) {
    await pg.stop();
    console.log('[db] Stopped (--once).');
  }
}

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log('\n[db] Stopping PostgreSQL ...');
  try {
    await pg.stop();
  } catch (err) {
    console.error('[db] Error while stopping:', err?.message ?? err);
  }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGHUP', shutdown);

main().catch(async (err) => {
  console.error('[db] Failed to start PostgreSQL:', err?.message ?? err);
  try {
    await pg.stop();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
