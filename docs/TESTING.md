# Testing

## Running the tests

```powershell
npm run db:start      # in another window, if the database isn't running yet
npm test              # server (unit + integration) and client unit tests
npm run typecheck     # TypeScript, server + client
npm run build         # production builds

# End-to-end, in a real browser (start the app first with `npm run dev:all`):
npm run test:e2e
```

Watch mode while developing: `npm run test:watch -w server`.

## Safety: an isolated test database

Server tests run against **`TEST_DATABASE_URL`** (by default `myowncloud_test`), never the app database:

- `NODE_ENV=test` makes the config load `TEST_DATABASE_URL` and a separate `server\test-storage\` directory.
- Before any test runs, `test/global-setup.ts` **refuses to continue unless the database name ends in `_test`**. Tests `TRUNCATE` every table between cases, so they must never touch real data.
- Migrations are applied to the test database automatically.
- Test files run one at a time (they share the database). Each test starts from an empty database and empty storage.

The E2E test uses the **development** database through the running app. It only creates a throwaway account (`e2e-<timestamp>@example.com`), deletes that account's files through the UI, and removes the account at the end. It never touches other accounts.

## What is covered

### Server — 113 tests (`server/test`)

| File | Covers |
|---|---|
| `unit/names.test.ts` | Name validation, upload filename sanitising (path traversal like `../../etc/passwd`), UTF-8 filename decoding, unique-name generation |
| `unit/file-types.test.ts` | MIME detection from content (a PNG named `.txt` → `image/png`; HTML named `.png` → not an image), category mapping |
| `unit/sorting.test.ts` | LIKE-wildcard escaping, ORDER BY whitelist, rejection of injected sort values |
| `unit/local-disk-storage.test.ts` | Commit/read/delete, idempotent delete, refusal of non-UUID keys (traversal) |
| `integration/auth.test.ts` | Registration (validation, case-insensitive duplicate email), bcrypt hashes stored, only token hashes stored, cookie flags, login, identical errors for unknown email vs wrong password, logout invalidates the session server-side, expired and forged sessions, CSRF header and Origin checks, CORS allow-list, login rate limiting, security headers, JSON error format |
| `integration/folders.test.ts` | Nested creation, breadcrumbs, duplicate names (409), invalid names, malformed/unknown ids, rename, move, **cycle prevention**, depth limit, recursive delete including stored bytes and freed quota |
| `integration/files.test.ts` | Upload/download byte-for-byte, attachment headers, non-ASCII names, path stripping, auto-renaming duplicates, content-based type detection, preview only for images, empty files, missing/multiple files, max size (nothing left on disk), **quota enforcement incl. 5 concurrent uploads**, quota freed on delete, rename/move/conflicts, delete removes bytes, 410 for missing bytes, search (case-insensitive, cross-folder, literal `%`), sorting, storage summary |
| `integration/authorization.test.ts` | A second user tries to download, preview, list, rename, move, delete, upload into, create inside, and move into the first user's items — **all denied (404), data intact**. Search, folder list and storage summary contain only the user's own data. Anonymous requests → 401 |
| `integration/database.test.ts` | Migrations recorded with checksum; constraints enforced by PostgreSQL itself: case-insensitive unique email, no self-parent, **no cross-user parent folder, no file in another user's folder**, cascades on user delete, non-negative sizes |

### Client — 14 tests (`client/src/lib/format.test.ts`)
Byte formatting (including unit roll-over), relative dates, extensions, type labels, percentages, initials, name validation.

### End-to-end — 18 steps (`scripts/e2e-smoke.mjs`)
Runs headless **Microsoft Edge or Google Chrome already installed on the machine** via `playwright-core` (no browser download). Steps:

landing page → protected route redirects → registration with validation → create folder → multi-file upload with progress panel and image thumbnail → open folder, upload inside, breadcrumb back → search → details dialog + download (bytes compared) → rename via menu → move via dialog → duplicate-name error shown → list view + column sort → overview numbers → dark theme → mobile drawer and no horizontal overflow → delete folder with confirmation → delete file, sign out, access revoked → wrong password message.

The run fails if the browser logs any console error, apart from the two HTTP errors the test triggers on purpose (409 and 401).

Options:
- `E2E_BASE_URL` — default `http://localhost:5173`. Use `http://localhost:4000` to test the production build served by Express.
- `E2E_SCREENSHOTS=<folder>` — saves a screenshot after key steps.
- `E2E_BROWSER=<path to browser exe>` — if Edge/Chrome are in unusual locations.

## Not covered by automated tests
- Drag-and-drop of files from the operating system, and dragging items onto folders. The code paths are shared with the tested picker upload and move dialog, but the HTML5 drag events themselves aren't automated.
- Behaviour under very large files (hundreds of MB) and slow networks.
- Cross-browser testing beyond Chromium-based browsers (Firefox, Safari).
