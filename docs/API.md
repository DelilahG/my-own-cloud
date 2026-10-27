# REST API

Base path: `/api`. Requests and responses are JSON unless noted.

## Conventions

- **Authentication:** the `moc_session` HttpOnly cookie, set by register/login. Endpoints marked 🔒 return `401` without a valid session.
- **CSRF:** every `POST`, `PATCH` and `DELETE` must include the header `X-Requested-With: MyOwnCloud`, or it gets `403`.
- **Ids** are UUIDs. A malformed id → `400`. An id that doesn't exist **or belongs to another user** → `404`.
- **Errors** always have this shape:
  ```json
  { "error": { "code": "VALIDATION_ERROR", "message": "Password must be at least 8 characters.", "details": { "fields": [...] } } }
  ```
  Common codes: `VALIDATION_ERROR` (400), `BAD_REQUEST` (400), `UNAUTHORIZED` / `INVALID_CREDENTIALS` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `CONTENT_MISSING` (410), `PAYLOAD_TOO_LARGE` / `QUOTA_EXCEEDED` (413), `NOT_PREVIEWABLE` (415), `RATE_LIMITED` (429), `INTERNAL_ERROR` (500).
- **Rate limits:** 600 requests/min per IP across the API. Register and login are limited to 20 requests per 15 min per IP; for login, only failed attempts count.

### Object shapes

```ts
User      { id, email, displayName, quotaBytes, createdAt }
Folder    { id, name, parentId | null, createdAt, updatedAt, itemCount?, parentName? }
File      { id, name, folderId | null, sizeBytes, mimeType, category, previewable, createdAt, updatedAt, folderName? }
// category: "documents" | "images" | "videos" | "audio" | "archives" | "other"
```

---

## Health

### `GET /api/health`
`200 { "status": "ok", "database": "ok" }`

## Authentication

### `POST /api/auth/register`
Body: `{ "email": string, "displayName": string (1–80), "password": string }`
Password rules: 8–72 bytes, at least one letter and one number, not equal to the email.
- `201 { user }`, plus the session cookie
- `400` validation · `409` email already registered

### `POST /api/auth/login`
Body: `{ "email": string, "password": string }`
- `200 { user }`, plus a new session cookie
- `401 INVALID_CREDENTIALS` — the same response for an unknown email and a wrong password

### `POST /api/auth/logout` 🔒
Deletes the session server-side and clears the cookie. `204`.

### `GET /api/auth/me`
`200 { "user": User | null }` — `null` when signed out (no 401, so the app can check cheaply).

## Browsing & search

### `GET /api/drive` 🔒
Contents of one folder.
Query: `folderId` (UUID; omit for the top level), `sort` = `name|size|updated|created` (default `name`), `order` = `asc|desc` (default `asc`).
```json
{
  "folder": Folder | null,
  "breadcrumbs": [{ "id": "…", "name": "Work" }, { "id": "…", "name": "Projects" }],
  "folders": [Folder (with itemCount)],
  "files": [File]
}
```
Folders have no size, so `sort=size` orders folders by name.

### `GET /api/drive/search` 🔒
Query: `q` (1–100 chars, case-insensitive substring; `%` and `_` are matched literally), `sort`, `order`.
`200 { query, folders: [Folder + parentName], files: [File + folderName], truncated }` — at most 200 of each.

## Folders

### `GET /api/folders` 🔒
All of the user's folders (flat list; used by the "Move to" picker). `200 { folders: [Folder] }`

### `POST /api/folders` 🔒
Body: `{ "name": string, "parentId": UUID | null }`
- `201 { folder }`
- `400` invalid name or nesting deeper than 32 · `404` parent not found · `409` a sibling already has that name

### `PATCH /api/folders/:id` 🔒
Rename and/or move. Body: `{ "name"?: string, "parentId"?: UUID | null }` (at least one; `null` = move to top level).
- `200 { folder }`
- `400` moving into itself or a descendant, or too deep · `404` · `409`

### `DELETE /api/folders/:id` 🔒
Deletes the folder, all subfolders and all files inside (records and bytes).
`200 { "deletedFiles": number }`

## Files

### `POST /api/files?folderId=<uuid>` 🔒
`multipart/form-data` with exactly **one** file in the field `file`. Omit `folderId` for the top level.
- `201 { file }` — `file.name` may differ from the uploaded name if it was taken (`notes (1).txt`) or contained forbidden characters
- `400` no file / more than one file · `404` folder not found · `413 PAYLOAD_TOO_LARGE` (over `MAX_FILE_SIZE_MB`) · `413 QUOTA_EXCEEDED`

Example (PowerShell, using `curl.exe`):
```powershell
curl.exe -b cookies.txt -H "X-Requested-With: MyOwnCloud" -F "file=@C:\path\report.pdf" http://localhost:4000/api/files
```

### `GET /api/files/:id/download` 🔒
Streams the bytes as an attachment. Headers include `Content-Disposition: attachment; filename*=UTF-8''…`, `Content-Type`, `Content-Length`, `ETag`, `X-Content-Type-Options: nosniff` and a sandboxing CSP. Supports `If-None-Match` → `304`.
- `404` not found / not yours · `410 CONTENT_MISSING` if the record exists but the stored bytes are gone

### `GET /api/files/:id/preview` 🔒
Inline display for raster images only (`previewable: true`). `415 NOT_PREVIEWABLE` otherwise.

### `PATCH /api/files/:id` 🔒
Rename and/or move. Body: `{ "name"?: string, "folderId"?: UUID | null }`.
- `200 { file }` · `400` · `404` · `409` name already used in the destination

### `DELETE /api/files/:id` 🔒
Deletes the record, then the bytes. `204`.

## Storage

### `GET /api/storage` 🔒
```json
{
  "maxFileSizeBytes": 104857600,
  "usedBytes": 126, "quotaBytes": 1073741824, "availableBytes": 1073741698,
  "fileCount": 3, "folderCount": 1,
  "categories": [{ "category": "images", "count": 1, "bytes": 84 }, …],
  "recentFiles": [File + folderName],
  "largestFiles": [File + folderName]
}
```
