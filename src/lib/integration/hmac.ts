import type { Hospital } from "@prisma/client";
import { prisma } from "../db";
import { decryptSecret, hmacHex, safeEqual, sha256 } from "../crypto";
import { ApiError } from "../errors";

/**
 * Hospital → Taree request authentication (HMAC-SHA256 request signing).
 *
 *   signature = HMAC(secret, `${timestamp}\n${METHOD}\n${path}\n${sha256(body)}`)
 *
 * Headers: X-Taree-Hospital (hospital code), X-Taree-Timestamp (unix ms),
 *          X-Taree-Event-Id (idempotency key), X-Taree-Signature (hex).
 * Requests older than 5 minutes are rejected (replay window); event ids are recorded
 * in IntegrationReceipt so replays inside the window are idempotent.
 * Production: add mutual TLS between hospital gateways and Taree on top of this.
 */
export const H = {
  hospital: "x-taree-hospital",
  ts: "x-taree-timestamp",
  sig: "x-taree-signature",
  event: "x-taree-event-id",
} as const;

const MAX_SKEW_MS = 5 * 60_000;

export function signRequest(secret: string, method: string, path: string, ts: string, body: string) {
  return hmacHex(secret, `${ts}\n${method.toUpperCase()}\n${path}\n${sha256(body)}`);
}

export function signedHeaders(hospitalCode: string, secret: string, method: string, path: string, body: string, eventId: string) {
  const ts = String(Date.now());
  return {
    "content-type": "application/json",
    [H.hospital]: hospitalCode,
    [H.ts]: ts,
    [H.event]: eventId,
    [H.sig]: signRequest(secret, method, path, ts, body),
  };
}

export async function verifyHospitalRequest(req: Request, path: string, body: string): Promise<{ hospital: Hospital; eventId: string }> {
  const code = req.headers.get(H.hospital);
  const ts = req.headers.get(H.ts);
  const sig = req.headers.get(H.sig);
  const eventId = req.headers.get(H.event);
  if (!code || !ts || !sig || !eventId) throw new ApiError(401, "MISSING_SIGNATURE", "Signed hospital headers are required");
  const hospital = await prisma.hospital.findUnique({ where: { code } });
  if (!hospital) throw new ApiError(401, "UNKNOWN_HOSPITAL", "Unknown hospital");
  const skew = Math.abs(Date.now() - Number(ts));
  if (!Number.isFinite(skew) || skew > MAX_SKEW_MS) throw new ApiError(401, "STALE_REQUEST", "Request timestamp outside allowed window");
  const expected = signRequest(decryptSecret(hospital.apiSecretEnc), req.method, path, ts, body);
  if (!safeEqual(expected, sig)) throw new ApiError(401, "BAD_SIGNATURE", "Invalid request signature");
  if (!hospital.isActive) throw new ApiError(403, "HOSPITAL_INACTIVE", "Hospital is not an active participant");
  if (eventId.length > 200) throw new ApiError(400, "BAD_EVENT_ID", "Invalid event id");
  return { hospital, eventId };
}
