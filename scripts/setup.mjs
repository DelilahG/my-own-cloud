// Creates the local .env file with freshly generated secrets.
// Safe to re-run: an existing .env is never overwritten.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
const examplePath = path.join(root, '.env.example');

if (existsSync(envPath)) {
  console.log('[setup] .env already exists — leaving it unchanged.');
  process.exit(0);
}

const dbPassword = randomBytes(18).toString('base64url');
const content = readFileSync(examplePath, 'utf8').replaceAll('change-me-local-db-password', dbPassword);

writeFileSync(envPath, content, { encoding: 'utf8', flag: 'wx' });
console.log('[setup] Created .env with a randomly generated local database password.');
