import { prisma } from "./db";
import { sha256 } from "./crypto";

/**
 * The QR link a phone camera opens (/c/<token>). While the code is valid (5 minutes, not revoked) the
 * person holding it — shown by the patient — may view the patient's card, latest activity and imaging.
 */
export async function cardSession(token: string | null | undefined) {
  if (!token || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const qr = await prisma.qrSession.findUnique({ where: { tokenHash: sha256(token) } });
  if (!qr || qr.revokedAt || qr.expiresAt.getTime() <= Date.now()) return null;
  return qr;
}
