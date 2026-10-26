import fs from "node:fs/promises";
import path from "node:path";
import { env } from "./env";
import { decryptBuffer, encryptBuffer } from "./crypto";

/**
 * Object storage adapter.
 *
 * Development adapter: local filesystem, every object encrypted with AES-256-GCM
 * (encryption at rest). Objects are never served from a public path — only through
 * authorized API routes that stream the decrypted bytes.
 *
 * Production: implement the same interface over S3-compatible storage with SSE-KMS
 * and keep files private (no public buckets / public URLs).
 */
export interface StorageAdapter {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
}

const SAFE_KEY = /^[a-zA-Z0-9/_\-.]+$/;

function resolve(key: string) {
  if (!SAFE_KEY.test(key) || key.includes("..")) throw new Error("Invalid storage key");
  return path.resolve(env.storageDir, key + ".enc");
}

const fileStorage: StorageAdapter = {
  async put(key, data) {
    const p = resolve(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, encryptBuffer(data, env.storageKey), { mode: 0o600 });
  },
  async get(key) {
    return decryptBuffer(await fs.readFile(resolve(key)), env.storageKey);
  },
  async exists(key) {
    try {
      await fs.access(resolve(key));
      return true;
    } catch {
      return false;
    }
  },
  async remove(key) {
    await fs.rm(resolve(key), { force: true });
  },
};

/** Cloud hosting (no writable disk): the same encrypted objects, kept in the database table "StoredObject". */
const checkKey = (key: string) => {
  if (!SAFE_KEY.test(key) || key.includes("..")) throw new Error("Invalid storage key");
  return key;
};
const dbStorage: StorageAdapter = {
  async put(key, data) {
    const { prisma } = await import("./db");
    const blob = encryptBuffer(data, env.storageKey);
    await prisma.$executeRaw`INSERT INTO "StoredObject"("key","data") VALUES (${checkKey(key)}, ${blob}) ON CONFLICT ("key") DO UPDATE SET "data" = EXCLUDED."data"`;
  },
  async get(key) {
    const { prisma } = await import("./db");
    const rows = await prisma.$queryRaw<{ data: Uint8Array }[]>`SELECT "data" FROM "StoredObject" WHERE "key" = ${checkKey(key)}`;
    if (!rows.length) throw Object.assign(new Error("Object not found"), { code: "ENOENT" });
    return decryptBuffer(Buffer.from(rows[0].data), env.storageKey);
  },
  async exists(key) {
    const { prisma } = await import("./db");
    const rows = await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "StoredObject" WHERE "key" = ${checkKey(key)}`;
    return rows[0].n > 0;
  },
  async remove(key) {
    const { prisma } = await import("./db");
    await prisma.$executeRaw`DELETE FROM "StoredObject" WHERE "key" = ${checkKey(key)}`;
  },
};

const useDb = () => process.env.STORAGE_DRIVER === "db" || (!!process.env.VERCEL && process.env.STORAGE_DRIVER !== "fs");

export const storage: StorageAdapter = {
  put: (k, d) => (useDb() ? dbStorage : fileStorage).put(k, d),
  get: (k) => (useDb() ? dbStorage : fileStorage).get(k),
  exists: (k) => (useDb() ? dbStorage : fileStorage).exists(k),
  remove: (k) => (useDb() ? dbStorage : fileStorage).remove(k),
};
