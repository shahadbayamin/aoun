/**
 * Build for cloud hosting (Vercel, run as "npm run vercel-build"):
 *   1. database: apply migrations (tracked in _taree_migrations) — same files the Mac app uses
 *   2. secrets: generate the encryption keys once and keep them in the database (unless set as env vars)
 *   3. demo data: load it on the first deploy (or when prisma/seed-version changes)
 *   4. prisma generate + next build
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import pg from "pg";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const log = (...a) => console.log("[aoun-build]", ...a);
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", env: process.env });
  if (r.status !== 0) { console.error(`[aoun-build] ${cmd} ${args.join(" ")} failed`); process.exit(r.status || 1); }
};

if (!process.env.DATABASE_URL && process.env.POSTGRES_URL) process.env.DATABASE_URL = process.env.POSTGRES_URL;
if (!process.env.DATABASE_URL) {
  console.error("[aoun-build] DATABASE_URL is missing — add a Postgres database (Vercel → Storage → Neon) and redeploy.");
  process.exit(1);
}
process.env.DEMO_MODE ??= "true";
process.env.OTP_FIXED_CODE ??= "123456";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL });
await client.connect();

// 1) migrations
await client.query(`CREATE TABLE IF NOT EXISTS "_taree_migrations" (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
const applied = new Set((await client.query(`SELECT name FROM "_taree_migrations"`)).rows.map((r) => r.name));
const dir = path.join(ROOT, "prisma", "migrations");
for (const m of fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, "migration.sql"))).sort()) {
  if (applied.has(m)) continue;
  log("applying migration", m);
  await client.query("BEGIN");
  try {
    await client.query(fs.readFileSync(path.join(dir, m, "migration.sql"), "utf8"));
    await client.query(`INSERT INTO "_taree_migrations"(name) VALUES ($1)`, [m]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
}

// 2) secrets
for (const n of ["STORAGE_ENCRYPTION_KEY", "SECRETS_ENCRYPTION_KEY", "IDENTITY_PEPPER"]) {
  if (process.env[n]) continue;
  await client.query(`INSERT INTO "AppSecret"("name","value") VALUES ($1,$2) ON CONFLICT ("name") DO NOTHING`, [n, crypto.randomBytes(32).toString("base64")]);
  process.env[n] = (await client.query(`SELECT "value" FROM "AppSecret" WHERE "name" = $1`, [n])).rows[0].value;
}

// 3) demo data
const want = fs.existsSync(path.join(ROOT, "prisma", "seed-version")) ? fs.readFileSync(path.join(ROOT, "prisma", "seed-version"), "utf8").trim() : "1";
const hospitals = (await client.query(`SELECT count(*)::int AS n FROM "Hospital"`)).rows[0].n;
const have = (await client.query(`SELECT "value" FROM "AppSecret" WHERE "name" = 'SEED_VERSION'`)).rows[0]?.value;
await client.end();
if (!hospitals || have !== want) {
  log("loading demo data (version", want + ")");
  run(process.execPath, [path.join(ROOT, "node_modules/tsx/dist/cli.mjs"), "prisma/seed.ts"]);
  const c2 = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL });
  await c2.connect();
  await c2.query(`INSERT INTO "AppSecret"("name","value") VALUES ('SEED_VERSION',$1) ON CONFLICT ("name") DO UPDATE SET "value" = EXCLUDED."value"`, [want]);
  await c2.end();
} else log("demo data already loaded");

// 4) build
run(process.execPath, [path.join(ROOT, "node_modules/prisma/build/index.js"), "generate"]);
run(process.execPath, [path.join(ROOT, "node_modules/next/dist/bin/next"), "build"]);
