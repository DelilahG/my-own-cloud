-- 001_initial_schema.sql
-- Core schema for My Own Cloud: users, sessions, folders, files.
-- Requires PostgreSQL 13+ (gen_random_uuid() is built in).

-- Keeps updated_at current on every UPDATE.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------
-- users
-- ---------------------------------------------------------------
CREATE TABLE users (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text        NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  display_name   text        NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  password_hash  text        NOT NULL,
  quota_bytes    bigint      NOT NULL CHECK (quota_bytes >= 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Emails are unique case-insensitively ("Ann@x.com" == "ann@x.com").
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------
-- sessions — server-side login sessions.
-- Only a SHA-256 hash of the cookie token is stored, so a database
-- leak does not reveal usable session tokens.
-- ---------------------------------------------------------------
CREATE TABLE sessions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash    bytea       NOT NULL UNIQUE,
  user_agent    text,
  ip_address    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

-- ---------------------------------------------------------------
-- folders — a per-user tree (parent_id NULL = top level, "My Cloud").
-- ---------------------------------------------------------------
CREATE TABLE folders (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  parent_id   uuid,
  name        text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 255),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT folders_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id),
  -- Target for the composite foreign keys below.
  CONSTRAINT folders_id_user_key UNIQUE (id, user_id),
  -- A folder's parent must belong to the SAME user. Deleting a folder
  -- deletes its whole subtree.
  CONSTRAINT folders_parent_fk FOREIGN KEY (parent_id, user_id)
    REFERENCES folders (id, user_id) ON DELETE CASCADE
);

-- No two sibling folders with the same (case-insensitive) name.
-- COALESCE makes top-level folders (parent_id NULL) unique too.
CREATE UNIQUE INDEX folders_sibling_name_key ON folders (
  user_id,
  COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(name)
);
CREATE INDEX folders_parent_id_idx ON folders (parent_id);

CREATE TRIGGER folders_set_updated_at
  BEFORE UPDATE ON folders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------
-- files — metadata only; the bytes live in private storage under
-- storage_key (a server-generated UUID, never the user's filename).
-- ---------------------------------------------------------------
CREATE TABLE files (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  folder_id        uuid,
  name             text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 255),
  storage_key      text        NOT NULL UNIQUE,
  size_bytes       bigint      NOT NULL CHECK (size_bytes >= 0),
  mime_type        text        NOT NULL,
  checksum_sha256  text        NOT NULL CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  -- A file can only live in a folder owned by the same user.
  CONSTRAINT files_folder_fk FOREIGN KEY (folder_id, user_id)
    REFERENCES folders (id, user_id) ON DELETE CASCADE
);

-- No two files with the same (case-insensitive) name in one folder.
CREATE UNIQUE INDEX files_sibling_name_key ON files (
  user_id,
  COALESCE(folder_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(name)
);
CREATE INDEX files_folder_id_idx ON files (folder_id);
CREATE INDEX files_user_created_idx ON files (user_id, created_at DESC);

CREATE TRIGGER files_set_updated_at
  BEFORE UPDATE ON files
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
