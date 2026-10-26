-- Cloud hosting (Vercel): app secrets generated once and kept in the database, and encrypted file storage in the database.
CREATE TABLE IF NOT EXISTS "AppSecret" ("name" TEXT PRIMARY KEY, "value" TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS "StoredObject" ("key" TEXT PRIMARY KEY, "data" BYTEA NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now());
