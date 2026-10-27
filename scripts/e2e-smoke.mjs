// End-to-end smoke test of the real UI in a real browser (headless Microsoft
// Edge or Chrome already installed on this machine — nothing is downloaded).
//
// Prerequisites: database, API and Vite dev server running (`npm run dev:all`).
// Usage:  npm run test:e2e            (or set E2E_SCREENSHOTS=<dir> to save screenshots)
//
// It signs up a throwaway account, exercises every main flow through the UI,
// and finally deletes that account again.
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env'), quiet: true });

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';
const SHOTS = process.env.E2E_SCREENSHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const executablePath = process.env.E2E_BROWSER || BROWSERS.find((p) => existsSync(p));
if (!executablePath) {
  console.error('[e2e] No Edge/Chrome found. Set E2E_BROWSER to a Chromium-based browser executable.');
  process.exit(1);
}

const email = `e2e-${Date.now()}@example.com`;
const password = 'e2e password 123';
const consoleErrors = [];
let step = 0;

const log = (msg) => console.log(`[e2e] ${String(++step).padStart(2, '0')} ✓ ${msg}`);
const shot = async (page, name) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });

const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1360, height: 860 }, acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(10_000);
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
page.on('console', (m) => {
  // Browsers log failed HTTP responses as console errors. The test deliberately
  // triggers a 409 (duplicate folder) and a 401 (wrong password); allow only those.
  if (m.type() === 'error' && !/status of (401|409)/.test(m.text())) consoleErrors.push(m.text());
});

const toast = (text) => page.getByRole('status').filter({ hasText: text }).first();
const menuFor = (name) => page.getByRole('button', { name: `More actions for ${name}` }).first();

try {
  // 1. Landing page
  await page.goto(BASE + '/');
  await page.getByRole('heading', { name: 'A calm, private home for your files.' }).waitFor();
  await shot(page, '01-landing');
  log('Landing page renders');

  // 2. Protected route redirects to login
  await page.goto(BASE + '/drive');
  await page.waitForURL(/\/login\?next=/);
  log('Protected route redirects signed-out users to login');

  // 3. Registration with validation
  await page.goto(BASE + '/register');
  await page.getByLabel('Name').fill('E2E Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByText('Use at least 8 characters.').waitFor();
  await shot(page, '02-register-validation');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(/\/drive$/);
  await page.getByText('Your cloud is empty').waitFor();
  await shot(page, '03-empty-drive');
  log('Registration validates input, signs in and shows the empty state');

  // 4. Create a folder
  await page.getByRole('button', { name: 'New folder' }).first().click();
  const nameInput = page.getByLabel('Folder name');
  await nameInput.fill('Projects');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await toast('Folder "Projects" created.').waitFor();
  await page.getByRole('link', { name: 'Projects' }).waitFor();
  log('Creates a folder');

  // 5. Upload files with the file picker (multiple)
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAHElEQVR42mNk+M9AEmBkGFUwqmBUwaiC4agAAKoqAhHnWqvLAAAAAElFTkSuQmCC',
    'base64',
  );
  await page.locator('input[type=file]').setInputFiles([
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Hello from the e2e test!') },
    { name: 'pixel.png', mimeType: 'image/png', buffer: png },
  ]);
  await page.getByRole('heading', { name: '2 uploads complete' }).waitFor();
  await page.getByRole('button', { name: 'notes.txt', exact: true }).waitFor();
  const thumb = page.locator('img[src*="/preview"]').first();
  await thumb.waitFor();
  await page.waitForFunction((el) => el.complete && el.naturalWidth > 0, await thumb.elementHandle());
  await shot(page, '04-after-upload');
  log('Uploads multiple files with progress panel; image thumbnail loads via authenticated preview');

  // 6. Navigate into the folder, upload there, breadcrumbs back
  await page.getByRole('link', { name: 'Projects' }).click();
  await page.waitForURL(/\/drive\/folder\//);
  await page.getByRole('heading', { name: 'Projects', level: 1 }).waitFor();
  await page.locator('input[type=file]').setInputFiles([
    { name: 'plan.md', mimeType: 'text/markdown', buffer: Buffer.from('# Plan\n\n- ship it\n') },
  ]);
  await page.getByRole('button', { name: 'plan.md', exact: true }).waitFor();
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'My Cloud' }).click();
  await page.waitForURL(/\/drive$/);
  await page.getByText('1 item').waitFor();
  log('Opens a folder, uploads into it and navigates back via breadcrumbs');

  // 7. Search across folders
  await page.getByRole('searchbox', { name: 'Search files and folders' }).fill('PLAN');
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: 'Results for “PLAN”' }).waitFor();
  await page.getByRole('button', { name: 'plan.md', exact: true }).waitFor();
  await page.getByText('in Projects').waitFor();
  await shot(page, '05-search');
  await page.getByRole('button', { name: 'Clear' }).click();
  log('Searches across all folders case-insensitively, showing item location');

  // 8. Details dialog + authenticated download with identical bytes
  await page.getByRole('button', { name: 'notes.txt', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'notes.txt' });
  await dialog.getByText('Text file').waitFor();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('link', { name: 'Download' }).click(),
  ]);
  const downloaded = readFileSync(await download.path(), 'utf8');
  if (download.suggestedFilename() !== 'notes.txt' || downloaded !== 'Hello from the e2e test!') {
    throw new Error(`Download mismatch: ${download.suggestedFilename()} / ${downloaded}`);
  }
  await shot(page, '06-details');
  await dialog.getByRole('button', { name: 'Close' }).click();
  log('Shows file details and downloads the exact original bytes');

  // 9. Rename via actions menu (keyboard-accessible menu)
  await menuFor('notes.txt').click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  const renameInput = page.getByLabel('New name');
  await renameInput.fill('meeting-notes.txt');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await page.getByRole('button', { name: 'meeting-notes.txt', exact: true }).waitFor();
  log('Renames a file through the actions menu');

  // 10. Move file into the folder via the Move dialog
  await menuFor('meeting-notes.txt').click();
  await page.getByRole('menuitem', { name: 'Move to…' }).click();
  const moveDialog = page.getByRole('dialog', { name: /Move/ });
  await moveDialog.getByRole('button', { name: 'Projects' }).click();
  await moveDialog.getByRole('button', { name: 'Move here' }).click();
  await toast('Moved "meeting-notes.txt" to “Projects”.').waitFor();
  await page.getByRole('button', { name: 'meeting-notes.txt', exact: true }).waitFor({ state: 'detached' });
  log('Moves a file into another folder');

  // 11. Duplicate folder name is rejected with a friendly message
  await page.getByRole('button', { name: 'New folder' }).first().click();
  await page.getByLabel('Folder name').fill('projects');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByText('A folder with this name already exists here.').waitFor();
  await page.keyboard.press('Escape');
  log('Shows server validation errors inline (duplicate folder name)');

  // 12. List view + sorting
  await page.getByRole('button', { name: 'List view' }).click();
  await page.getByRole('columnheader', { name: 'Size' }).getByRole('button').click();
  await page.getByRole('table').waitFor();
  await shot(page, '07-list-view');
  await page.getByRole('button', { name: 'Grid view' }).click();
  log('Switches to list view and sorts by column');

  // 13. Overview dashboard reflects real data
  await page.getByRole('link', { name: 'Overview' }).click();
  await page.getByRole('heading', { name: /Good (morning|afternoon|evening), E2E/ }).waitFor();
  await page.getByRole('heading', { name: 'Storage usage' }).waitFor();
  const filesTile = await page.locator('div.rounded-2xl', { hasText: 'per file' }).innerText();
  if (!/Files\s+3\s/.test(filesTile)) throw new Error(`Expected 3 files on overview, got: ${filesTile}`);
  await shot(page, '08-overview');
  log('Overview shows real usage, file count and category breakdown');

  // 14. Dark theme
  await page.getByRole('button', { name: /Account menu/ }).click();
  await page.getByRole('menuitemradio', { name: 'Dark' }).click();
  if (!(await page.evaluate(() => document.documentElement.classList.contains('dark')))) throw new Error('Dark theme not applied');
  await shot(page, '09-overview-dark');
  await page.getByRole('link', { name: 'My Cloud' }).first().click();
  await page.getByRole('link', { name: 'Projects' }).waitFor();
  await shot(page, '10-drive-dark');
  log('Switches to dark theme');

  // 15. Mobile layout
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('dialog', { name: 'Navigation' }).waitFor();
  await shot(page, '11-mobile-nav');
  await page.keyboard.press('Escape');
  await shot(page, '12-mobile-drive');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) throw new Error('Horizontal overflow on mobile');
  await page.setViewportSize({ width: 1360, height: 860 });
  log('Mobile layout: navigation drawer works, no horizontal overflow');

  // 16. Delete a folder (with contents) via confirmation dialog
  await menuFor('Projects').click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete folder?' });
  await confirm.getByText('This cannot be undone.').waitFor();
  await shot(page, '13-delete-confirm');
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await toast('"Projects" was deleted.').waitFor();
  await page.getByRole('link', { name: 'Projects' }).waitFor({ state: 'detached' });
  log('Deletes a folder with its contents after confirmation');

  // 17. Delete remaining file, then sign out
  await menuFor('pixel.png').click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('dialog', { name: 'Delete file?' }).getByRole('button', { name: 'Delete' }).click();
  await page.getByText('Your cloud is empty').waitFor();
  await page.getByRole('button', { name: /Account menu/ }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await page.waitForURL(/\/login/);
  await page.goto(BASE + '/drive');
  await page.waitForURL(/\/login\?next=/);
  log('Deletes a file, signs out, and the session no longer grants access');

  // 18. Wrong password shows a safe, generic error
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('wrong password 1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Incorrect email or password.').waitFor();
  await shot(page, '14-login-error');
  log('Wrong password shows a generic error');

  if (consoleErrors.length) throw new Error(`Browser console errors:\n  ${consoleErrors.join('\n  ')}`);
  console.log(`[e2e] PASSED — ${step} steps, no browser console errors.`);
} catch (err) {
  await shot(page, 'FAILURE');
  console.error(`[e2e] FAILED at step ${step + 1}: ${err.message}`);
  if (consoleErrors.length) console.error(`[e2e] Console errors:\n  ${consoleErrors.join('\n  ')}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  // Remove the throwaway account. On success its files were already deleted
  // through the UI; after a failure, also remove any stored bytes it left.
  if (process.env.DATABASE_URL) {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const { rows } = await client.query(
      'DELETE FROM files WHERE user_id = (SELECT id FROM users WHERE email = $1) RETURNING storage_key',
      [email],
    );
    await client.query('DELETE FROM users WHERE email = $1', [email]);
    await client.end();
    const objectsDir = path.resolve(root, 'server', process.env.STORAGE_DIR || './storage', 'objects');
    for (const { storage_key: key } of rows) rmSync(path.join(objectsDir, key.slice(0, 2), key), { force: true });
  }
}
