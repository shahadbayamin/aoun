import { prisma } from "./db";
import { randomToken, sha256 } from "./crypto";
import { audit, type AuditActor } from "./audit";
import { ApiError } from "./errors";
import crypto from "node:crypto";
import { publicBaseUrl } from "./public-url";

// Short code for manual entry: 6 characters, no look-alike letters (0/O, 1/I/L).
const SHORT_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const normalizeShortCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
function newShortCode() {
  return Array.from({ length: 6 }, () => SHORT_ALPHABET[crypto.randomInt(SHORT_ALPHABET.length)]).join("");
}

/**
 * Emergency-card QR codes carry ONLY an opaque, random, single-use token that expires
 * after QR_TTL. No national ID, medical data or permanent credentials are in the payload.
 * The token maps to a server-side QrSession (stored hashed).
 */
export const QR_TTL_MS = 5 * 60_000;
export const SCAN_CONTEXT_TTL_MS = 15 * 60_000;
export const QR_PREFIX = "TAREE1.";

/**
 * The QR encodes a normal web link (so any phone camera opens the patient's emergency card):
 *   <public-url>/c/<opaque token>
 * The token is random, single-use for doctors, valid 5 minutes, and contains no ID or medical data.
 */
export async function issueQr(patientId: string) {
  const token = randomToken(24);
  const now = new Date();
  await prisma.qrSession.updateMany({ where: { patientId, usedAt: null, revokedAt: null, expiresAt: { gt: now } }, data: { revokedAt: now } });
  let shortCode = newShortCode();
  for (let i = 0; i < 5; i++) {
    const clash = await prisma.qrSession.findFirst({ where: { shortCodeHash: sha256(shortCode), usedAt: null, revokedAt: null, expiresAt: { gt: now } } });
    if (!clash) break;
    shortCode = newShortCode();
  }
  const qr = await prisma.qrSession.create({
    data: { patientId, tokenHash: sha256(token), shortCodeHash: sha256(shortCode), expiresAt: new Date(now.getTime() + QR_TTL_MS) },
  });
  return { payload: `${publicBaseUrl()}/c/${token}`, token, shortCode, expiresAt: qr.expiresAt, id: qr.id };
}

/** Accepts the QR link (…/c/<token>), the legacy TAREE1.<token> form, or the bare token. */
export function parseQrPayload(raw: string) {
  const s = raw.trim();
  const fromUrl = s.match(/\/c\/([A-Za-z0-9_-]{20,64})\/?(?:[?#].*)?$/);
  const token = fromUrl ? fromUrl[1] : s.startsWith(QR_PREFIX) ? s.slice(QR_PREFIX.length) : s;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  return token;
}

/** The permanent QR on the patient's Apple / Google Wallet card: …/w/<token>. */
export function parseWalletPayload(raw: string) {
  const m = raw.trim().match(/\/w\/([A-Za-z0-9_-]{20,64})\/?(?:[?#].*)?$/);
  return m ? m[1] : null;
}

export async function resolveQr(raw: string, ctx: { actor: AuditActor; professionalId: string; hospitalId: string }) {
  const wallet = parseWalletPayload(raw);
  if (wallet) {
    const p = await prisma.patient.findUnique({ where: { walletTokenHash: sha256(wallet) } });
    if (!p) {
      await audit({ actor: ctx.actor, action: "QR_RESOLVE", outcome: "DENIED", details: { reason: "UNKNOWN_WALLET_TOKEN" } });
      throw new ApiError(400, "INVALID_QR", "QR code is invalid, expired or already used", { reason: "UNKNOWN_WALLET_TOKEN" });
    }
    // Every scan of the wallet card is recorded as its own one-time session (same access flow as the on-screen QR).
    const now = new Date();
    const qs = await prisma.qrSession.create({ data: { patientId: p.id, tokenHash: sha256(`wallet:${randomToken(16)}`), expiresAt: now, usedAt: now } });
    const scan = await prisma.qrScan.create({
      data: { qrSessionId: qs.id, patientId: p.id, professionalId: ctx.professionalId, hospitalId: ctx.hospitalId, expiresAt: new Date(Date.now() + SCAN_CONTEXT_TTL_MS) },
    });
    await audit({ actor: ctx.actor, action: "QR_RESOLVE", patientId: p.id, resourceType: "QrScan", resourceId: scan.id, details: { source: "wallet" } });
    return scan;
  }
  const token = parseQrPayload(raw);
  const deny = async (reason: string, patientId?: string) => {
    await audit({ actor: ctx.actor, action: "QR_RESOLVE", outcome: "DENIED", patientId, details: { reason } });
    throw new ApiError(400, "INVALID_QR", "QR code is invalid, expired or already used", { reason });
  };
  const short = normalizeShortCode(raw);
  let qr = null;
  if (token) qr = await prisma.qrSession.findUnique({ where: { tokenHash: sha256(token) } });
  else if (short.length === 6) {
    qr = await prisma.qrSession.findFirst({ where: { shortCodeHash: sha256(short), usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } });
  } else return deny("MALFORMED");
  if (!qr) return deny("UNKNOWN_TOKEN");
  if (qr.revokedAt) return deny("REVOKED", qr.patientId);
  if (qr.expiresAt.getTime() < Date.now()) return deny("EXPIRED", qr.patientId);
  const used = await prisma.qrSession.updateMany({ where: { id: qr.id, usedAt: null }, data: { usedAt: new Date() } });
  if (used.count !== 1) return deny("ALREADY_USED", qr.patientId);
  const scan = await prisma.qrScan.create({
    data: {
      qrSessionId: qr.id,
      patientId: qr.patientId,
      professionalId: ctx.professionalId,
      hospitalId: ctx.hospitalId,
      expiresAt: new Date(Date.now() + SCAN_CONTEXT_TTL_MS),
    },
  });
  await audit({ actor: ctx.actor, action: "QR_RESOLVE", patientId: qr.patientId, resourceType: "QrScan", resourceId: scan.id });
  return scan;
}
