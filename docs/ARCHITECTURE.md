# Architecture

## Overview

```
 Browser (React SPA)
   │  same-origin requests to /api  (dev: Vite proxies /api → :4000; prod: Express serves the SPA)
   ▼
 Express API ─────────────── helmet · CORS · JSON body limit · cookie parser · rate limit
   │                          CSRF check · session loader (cookie → user)
   ├─ routes → controllers → services → repositories ──► PostgreSQL (metadata, users, sessions)
   │                              │
   │                              └────────────────────► StorageDriver ──► private disk directory
   ▼                                                        (LocalDiskStorage; S3 later)
 Error handler → { "error": { code, message } }  (no stack traces to clients)
```

The browser only ever talks to **one origin**. In development, Vite (port 5173) forwards `/api` to Express (port 4000). In production, Express serves the built React app itself. As a result the session cookie needs no cross-site configuration, and CORS only matters for the explicitly allowed `CLIENT_ORIGIN`.

## Backend layers

Each feature module (`server/src/modules/*`) follows the same shape:

| Layer | Responsibility | Example |
|---|---|---|
| **routes** | URL + HTTP method → controller | `file.routes.ts` |
| **controller** | Parse & validate input with Zod, call service, shape HTTP response | `file.controller.ts` |
| **service** | Business rules, transactions, ownership checks, quota | `file.service.ts` |
| **repository** | Parameterised SQL, row → DTO mapping | `file.repository.ts` |

Cross-cutting pieces live in `middleware/` (auth, CSRF, errors), `lib/` (validation, names, file types, sorting), `config/` (environment parsed and validated by Zod at startup — the app refuses to start with invalid configuration) and `storage/`.

`createApp()` (in `app.ts`) builds the app without listening. Tests create apps with config overrides (a tiny upload limit, a strict rate limit) and run them in-process with Supertest.

## Authentication

- **Registration / login** return the user and set the `moc_session` cookie: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production, 7-day expiry by default.
- The cookie holds a random 256-bit token. The database stores only **SHA-256(token)** in `sessions.token_hash`. A database leak therefore exposes no usable sessions, and a fixed-length hash lookup avoids timing differences between tokens.
- Each request's `loadSession` middleware hashes the cookie, looks up a non-expired session joined with its user, and attaches `req.user`. `requireAuth` protects routes.
- **Logout deletes the session row**, so the old cookie is useless even if someone copied it (tested).
- Login always performs a bcrypt comparison, against a dummy hash when the email is unknown, and returns the same message ("Incorrect email or password.") in both cases. Response timing and content therefore don't reveal which emails are registered. Registration necessarily reveals duplicate emails (409); that is standard and documented.
- Passwords: 8–72 bytes (bcrypt's real limit — longer inputs are rejected rather than silently truncated), at least one letter and one number, not equal to the email. bcrypt cost 12 (4 in tests for speed).
- Sessions are rotated on every login (new token), preventing session fixation. Expired sessions are purged on login and hourly.

## Authorization (ownership)

Ownership is enforced at **three levels**:

1. **Every query is scoped by `user_id`.** Repositories expose `findOwned(userId, id)`; there is no "find by id" that ignores the owner. Updates and deletes include `AND user_id = $2`.
2. **Not found = not yours.** Accessing another user's resource returns **404**, exactly like a non-existent id, so ids can't be probed.
3. **The database itself refuses cross-user links.** Composite foreign keys `(folder_id, user_id) → folders(id, user_id)` and `(parent_id, user_id) → folders(id, user_id)` make it impossible to place a file or folder inside another user's folder — even if application code had a bug (covered by `database.test.ts`).

`authorization.test.ts` has a second user try every operation (download, preview, list, rename, move, delete, upload into, create subfolder in, move own items into, search) against the first user's data. Every attempt fails and the data stays intact.

## CSRF & CORS

State-changing requests (`POST/PATCH/DELETE`) must pass three independent checks:

1. The session cookie is `SameSite=Lax`, so browsers don't send it on cross-site POSTs.
2. If an `Origin` header is present it must be the server's own origin or one listed in `CLIENT_ORIGIN`.
3. The custom header `X-Requested-With: MyOwnCloud` is required. HTML forms can't set custom headers, and a cross-origin `fetch` with one triggers a CORS preflight that only allowed origins pass.

Downloads are `GET` links (`<a href download>`), which are safe because GET handlers never change state.

## File storage

### Upload pipeline

```
1. requireAuth, CSRF                     → who is uploading
2. precheck (Content-Length)             → reject obviously too-large / over-quota early, before receiving bytes
3. multer → <storage>/tmp/upload-<uuid>  → bytes streamed to a random temp name (never the user's filename);
                                           multer enforces MAX_FILE_SIZE while streaming and deletes partial files
4. derive display name                   → strip directories, forbidden characters, fix UTF-8, max 255 chars
5. detect MIME from bytes (file-type)    → browser-supplied type ignored; text formats via extension allow-list
6. SHA-256 checksum                      → stored; used as ETag
7. BEGIN
     SELECT … FROM users WHERE id=$1 FOR UPDATE   ← per-user lock
     verify target folder is owned
     SUM(size) + new size <= quota ?             ← authoritative quota check
     choose free name ("x (1).txt")
     INSERT file row (storage_key = new UUID)
     rename tmp → <storage>/objects/<k[0..1]>/<key>   (atomic, same filesystem)
   COMMIT                                ← if anything fails: ROLLBACK and remove the bytes
```

The **per-user row lock** serialises uploads, moves and deletes for one user. Without it, two concurrent uploads could each see "enough space" and together exceed the quota; the integration test fires 5 parallel uploads at a quota that fits only 3 and verifies that exactly 3 succeed. The same lock prevents two concurrent folder moves from combining into a cycle.

### Downloads & previews

- `GET /api/files/:id/download` streams the bytes after the ownership check, with `Content-Disposition: attachment` (RFC 5987-encoded filename), `X-Content-Type-Options: nosniff`, a sandboxing `Content-Security-Policy`, `Cache-Control: private` and an `ETag`.
- `GET /api/files/:id/preview` serves **only raster image types detected from content** (PNG, JPEG, GIF, WebP, AVIF, BMP) inline, for thumbnails and the preview dialog. SVG and HTML are never served inline, so uploaded content cannot run scripts in the app's origin (stored XSS).
- Before streaming, the stored object is opened. If the bytes are missing, the client gets a clean **410 Gone** instead of a broken download.

### Paths & traversal

Storage keys are server-generated UUIDs. `LocalDiskStorage` refuses any key that isn't a UUID and checks that the resolved path stays inside the objects directory. The user's filename is only ever metadata. The storage directory is never served statically, and API responses never include storage keys or filesystem paths.

### Deletion strategy

**Database first, then bytes.** The record (or the whole folder subtree, via `ON DELETE CASCADE`) is deleted and committed, and then the bytes are removed. If deleting bytes fails, the worst case is an orphaned blob — wasted disk space, invisible to users — never a record pointing at missing data. `npm run storage:gc` lists orphaned objects older than one hour (so in-flight uploads are never touched) and deletes them with `-- --delete`.

### Swapping in object storage

Routes and services only use the `StorageDriver` interface (`commitUpload`, `openReadStream`, `delete`, `tempDir`, `init`). An S3 implementation would upload the temp file in `commitUpload`, stream `GetObject` in `openReadStream`, and call `DeleteObject` in `delete`. Nothing else changes.

## Validation & errors

- All bodies, route params and query strings are parsed by Zod schemas (ids must be UUIDs, sort fields come from a fixed enum, names follow the rules in `lib/names.ts`).
- Sorting uses a **whitelist** that maps `name|size|updated|created` to fixed SQL fragments; user input never reaches SQL text. Search text goes through parameters, with `LIKE` wildcards escaped.
- JSON bodies are limited to 100 KB, multipart uploads to 1 file and a few small fields.
- Unexpected errors are logged on the server and returned as a generic `500 INTERNAL_ERROR`. Known errors map to clear codes (`VALIDATION_ERROR`, `QUOTA_EXCEEDED`, `CONFLICT`, ...).

## Frontend

- **Routing:** `/` landing, `/login`, `/register` (signed-out only); `/drive`, `/drive/folder/:id`, `/drive?q=` (search), `/overview` (signed-in only, inside `AppShell`).
- **Server state:** TanStack Query caches folder contents, search results, the folder list and the storage summary. Mutations invalidate exactly those keys.
- **Auth state:** `AuthProvider` asks `/api/auth/me`. The HttpOnly cookie is invisible to JavaScript, and **no token is ever stored in localStorage**. A 401 from any request signs the UI out.
- **Uploads:** `UploadsProvider` is an app-wide queue that sends 2 files at a time via `XMLHttpRequest` (for progress events), with cancel, retry, an instant client-side size check and a "leave page?" warning while uploads are running.
- **Design system:** semantic colour tokens (`bg-surface`, `text-fg-muted`, `border-line`, `accent`, ...) are defined as CSS variables, so light/dark themes swap variables only. File-category colours come from a validated categorical palette (checked for colour-blind separation and contrast in both themes). localStorage holds only UI preferences (theme, grid/list, sort).
- **Accessibility:** native `<dialog>` modals (focus trap, Escape, focus restore), menus with arrow-key navigation and ARIA roles, labelled icon buttons, `aria-live` status for uploads and toasts, visible focus rings, skip link, `prefers-reduced-motion` support.
