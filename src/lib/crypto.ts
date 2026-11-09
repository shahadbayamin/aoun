import crypto from "node:crypto";
import { env } from "./env";
import { onlyDigits } from "./digits";

export const sha256 = (data: string | Buffer) => crypto.createHash("sha256").update(data).digest("hex");

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");

export function hmacHex(secret: string | Buffer, data: string) {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** Normalize a national ID / Iqama: digits only. */
export const normalizeId = (id: string) => onlyDigits(id);

/** Keyed hash for identifiers. Aoun never stores raw national IDs. */
export function hashIdentifier(idType: string, value: string, scope = "GLOBAL") {
  return hmacHex(env.identityPepper, `${idType}:${scope}:${normalizeId(value) || value.trim().toUpperCase()}`);
}

export function maskId(id: string) {
  const d = normalizeId(id);
  if (d.length < 5) return "•".repeat(d.length);
  return d[0] + "•".repeat(d.length - 5) + d.slice(-4);
}

/** Saudi national IDs start with 1, Iqama numbers with 2; both are 10 digits. */
export function idTypeFor(id: string): "NATIONAL_ID" | "IQAMA" {
  return normalizeId(id).startsWith("2") ? "IQAMA" : "NATIONAL_ID";
}

// AES-256-GCM: [12-byte IV][16-byte tag][ciphertext]
export function encryptBuffer(plain: Buffer, key: Buffer) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]);
}

export function decryptBuffer(blob: Buffer, key: Buffer) {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const d = crypto.createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(blob.subarray(28)), d.final()]);
}

export const encryptSecret = (s: string) => encryptBuffer(Buffer.from(s, "utf8"), env.secretsKey).toString("base64");
export const decryptSecret = (s: string) => decryptBuffer(Buffer.from(s, "base64"), env.secretsKey).toString("utf8");
