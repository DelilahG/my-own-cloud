// Optional development data: a demo account with a few folders and files.
// Usage: npm run db:seed   (refuses to run when NODE_ENV=production)
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/env.js';
import { createAuthService } from '../modules/auth/auth.service.js';
import { userRepository } from '../modules/auth/user.repository.js';
import { createFileService } from '../modules/files/file.service.js';
import { createFolderService } from '../modules/folders/folder.service.js';
import { LocalDiskStorage } from '../storage/local-disk-storage.js';
import { runMigrations } from './migrate.js';
import { pool } from './pool.js';

const DEMO_EMAIL = 'demo@myowncloud.local';
const DEMO_PASSWORD = 'demo-password-1';

async function seed() {
  if (config.isProduction) throw new Error('Refusing to seed demo data in production.');
  await runMigrations(pool);

  if (await userRepository.findByEmail(pool, DEMO_EMAIL)) {
    console.log(`[seed] Demo user ${DEMO_EMAIL} already exists — nothing to do.`);
    return;
  }

  const storage = new LocalDiskStorage(config.storageDir);
  await storage.init();
  const auth = createAuthService(config);
  const folders = createFolderService(storage);
  const files = createFileService(config, storage);

  const { user } = await auth.register({ email: DEMO_EMAIL, password: DEMO_PASSWORD, displayName: 'Demo User' }, {});

  const documents = await folders.create(user.id, { name: 'Documents', parentId: null });
  const projects = await folders.create(user.id, { name: 'Projects', parentId: null });
  const cloud = await folders.create(user.id, { name: 'My Own Cloud', parentId: projects.id });
  await folders.create(user.id, { name: 'Photos', parentId: null });

  const add = async (name: string, content: string, folderId: string | null) => {
    const tempPath = path.join(storage.tempDir, `seed-${randomUUID()}`);
    await writeFile(tempPath, content);
    await files.upload(user.id, folderId, { path: tempPath, originalname: name });
  };

  await add('Welcome.md', '# Welcome to My Own Cloud\n\nThis is demo content created by `npm run db:seed`.\n', null);
  await add('Shopping list.txt', 'Milk\nBread\nCoffee\n', documents.id);
  await add('Budget 2025.csv', 'month,income,expenses\nJan,3000,2100\nFeb,3000,1900\n', documents.id);
  await add('notes.md', '## Ideas\n- Sharing links\n- Trash bin\n', cloud.id);
  await add('config.json', JSON.stringify({ theme: 'dark', version: 1 }, null, 2), cloud.id);

  console.log('[seed] Created demo account:');
  console.log(`[seed]   email:    ${DEMO_EMAIL}`);
  console.log(`[seed]   password: ${DEMO_PASSWORD}   (development only)`);
}

try {
  await seed();
} catch (err) {
  console.error('[seed] Error:', (err as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
