# Setup on Windows

All commands are for **PowerShell**, run from the project folder (`C:\Users\<you>\Projects\MyOwnCloud`).

## Prerequisites

- **Node.js 20 or newer** — check with `node -v`. Install from https://nodejs.org (LTS) if needed.
- That's all. PostgreSQL is optional (see below), and Docker is not needed.

## Option A — Project-local PostgreSQL (recommended, no admin rights)

The project includes the `embedded-postgres` package, which contains the **official PostgreSQL 17 server binaries**. `npm run db:start` creates a database cluster in the project's `.pgdata\` folder and runs it on port **5433** (5433 avoids clashing with a normal PostgreSQL install on 5432).

```powershell
npm install          # 1. dependencies (first time only, a few minutes)
npm run setup        # 2. creates .env with a random database password (first time only)
npm run dev:all      # 3. starts database + API + web app
```

Then open **http://localhost:5173**.

`dev:all` runs three processes in one window, with coloured prefixes `db`, `server` and `client`. Press **Ctrl+C** once to stop them all.

Prefer separate windows? Run:
```powershell
# Window 1
npm run db:start
# Window 2
npm run dev
```

Optional demo data (with the database running):
```powershell
npm run db:seed      # demo@myowncloud.local / demo-password-1
```

## Option B — Your own PostgreSQL installation

1. Install PostgreSQL (13+). One way, from an **administrator** PowerShell:
   ```powershell
   winget install PostgreSQL.PostgreSQL.17
   ```
   Note the password you choose for the `postgres` user.
2. Create the two databases (adjust the path to your version):
   ```powershell
   & "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -c "CREATE DATABASE myowncloud;"
   & "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -c "CREATE DATABASE myowncloud_test;"
   ```
3. Run `npm run setup`, then edit `.env`:
   ```
   DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/myowncloud
   TEST_DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/myowncloud_test
   ```
   If the password contains special characters such as `@`, `:`, `/` or `#`, URL-encode them (`@` → `%40`).
4. Start the app with `npm run dev`. Don't use `dev:all`, which also starts the project-local database.

Migrations run automatically when the API starts. You can also run them by hand with `npm run db:migrate`.

## Production-style run (single port)

```powershell
npm run build
$env:NODE_ENV = "production"; npm start
```
Open **http://localhost:4000**: Express serves the built web app and the API together. In production mode cookies are `Secure`. Browsers accept that on `http://localhost`, but on any other host you must serve the app over **HTTPS**, typically behind a reverse proxy (then set `TRUST_PROXY=1`).

## Environment variables

All configuration lives in `.env` in the project root (created by `npm run setup` from `.env.example`). **Never commit `.env`** — it is already listed in `.gitignore`.

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | `development`, `production` or `test` |
| `PORT` | `4000` | API port |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Comma-separated browser origins allowed by CORS/CSRF checks |
| `DATABASE_URL` | — (required) | PostgreSQL connection string for the app |
| `TEST_DATABASE_URL` | — | Database for automated tests; **its name must end in `_test`** |
| `LOCAL_PG_PORT` | `5433` | Port for `npm run db:start` |
| `LOCAL_PG_PASSWORD` | random | Password for the project-local PostgreSQL superuser |
| `STORAGE_DIR` | `./storage` | Private directory for file bytes, relative to `server\` |
| `MAX_FILE_SIZE_MB` | `100` | Largest single upload |
| `DEFAULT_QUOTA_MB` | `1024` | Quota for new accounts |
| `SESSION_TTL_DAYS` | `7` | Session lifetime |
| `COOKIE_SECURE` | `true` in production | Force the cookie `Secure` flag on/off |
| `TRUST_PROXY` | unset | Set (e.g. `1`) when behind a reverse proxy |
| `BCRYPT_ROUNDS` | `12` (`4` in tests) | bcrypt cost factor |
| `AUTH_RATE_LIMIT_MAX` | `20` | Login/register attempts per 15 min per IP |

**Changing a user's quota** (example: 5 GB = 5120 MB), with the database running:
```powershell
npm run user:quota -- you@example.com 5120
```

## Where things are stored

| What | Where |
|---|---|
| Database files (Option A) | `.pgdata\` |
| Uploaded file bytes | `server\storage\objects\` (temporary uploads in `server\storage\tmp\`) |
| Test uploads | `server\test-storage\` (wiped by the tests) |

To start completely fresh: stop everything, then delete `.pgdata\` and `server\storage\`. **This deletes all accounts and files.**

## Troubleshooting

**`Cannot connect to PostgreSQL: connect ECONNREFUSED 127.0.0.1:5433`**
The database isn't running. Start it with `npm run db:start` (or use `npm run dev:all`).

**`LOCAL_PG_PASSWORD is missing` / `DATABASE_URL is not set`**
Run `npm run setup` to create `.env`.

**`password authentication failed for user "postgres"`**
The password in `DATABASE_URL` doesn't match the database. With Option A the cluster in `.pgdata\` was created with the password that was in `.env` at the time. Either restore that password, or delete `.pgdata\` (this loses its data) and run `npm run db:start` again.

**`Port 5173 is already in use` / `EADDRINUSE :::4000`**
Another copy is still running. Close the other terminal, or find the process:
```powershell
Get-NetTCPConnection -LocalPort 4000 | Select-Object OwningProcess
Stop-Process -Id <OwningProcess>
```

**PostgreSQL won't start after a crash ("lock file postmaster.pid already exists")**
Make sure no `postgres.exe` is running (`Get-Process postgres`), then delete `.pgdata\postmaster.pid` and start again.

**Scripts are blocked: "running scripts is disabled on this system"**
Allow local scripts for your user once:
```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

**Uploads fail with "Not enough storage space"**
The account's quota is full. Delete files, or raise the quota (see above).

**Tests refuse to run: "the test database name must end with _test"**
This is a deliberate safety check: tests empty every table. Point `TEST_DATABASE_URL` at a dedicated database such as `myowncloud_test`.
