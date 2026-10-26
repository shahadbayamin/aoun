import crypto from "node:crypto";
import pg from "pg";
import { pickDatabaseUrl } from "./db-url";

/**
 * Cloud hosting without manual secret setup: when the encryption keys are not given as environment
 * variables, they are generated once, kept in the database ("AppSecret") and loaded at start-up.
 * Environment variables, when set, always win.
 */
const NAMES = ["STORAGE_ENCRYPTION_KEY", "SECRETS_ENCRYPTION_KEY", "IDENTITY_PEPPER"] as const;

export function applyCloudDefaults() {
  const url = pickDatabaseUrl();
  if (url) process.env.DATABASE_URL = url;
  if (process.env.VERCEL) {
    process.env.DEMO_MODE ??= "true";
    process.env.OTP_FIXED_CODE ??= "123456";
    process.env.DEMO_SYNC_STAGE_DELAY_MS ??= "300";
  }
}

export async function loadAppSecrets() {
  applyCloudDefaults();
  const missing = NAMES.filter((n) => !process.env[n]);
  if (!missing.length || !process.env.DATABASE_URL) return;
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    await c.query(`CREATE TABLE IF NOT EXISTS "AppSecret" ("name" TEXT PRIMARY KEY, "value" TEXT NOT NULL, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now())`);
    for (const n of missing) {
      await c.query(`INSERT INTO "AppSecret"("name","value") VALUES ($1,$2) ON CONFLICT ("name") DO NOTHING`, [n, crypto.randomBytes(32).toString("base64")]);
      const r = await c.query(`SELECT "value" FROM "AppSecret" WHERE "name" = $1`, [n]);
      process.env[n] = r.rows[0].value;
    }
  } finally {
    await c.end();
  }
}
