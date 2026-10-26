import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { route } from "@/lib/api";
import { erCtx } from "@/lib/portal-ctx";
import { env } from "@/lib/env";
import { grantFromQrScan } from "@/lib/access-flow";
import { SCAN_CONTEXT_TTL_MS } from "@/lib/qr";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";

/**
 * DEMO MODE ONLY — "محاكاة مسح QR" for presenting on a single computer without a camera.
 * Uses the QR code that a patient is displaying RIGHT NOW (issued in the last 5 minutes, unexpired,
 * not yet used). If no patient card is open, nothing is revealed. Same checks, single-use and audit.
 */
export const POST = route(async () => {
  if (!env.demoMode) throw new ApiError(404, "NOT_FOUND");
  const { ctx, actor } = await erCtx("QR_SIMULATED_SCAN");
  const qr = await prisma.qrSession.findFirst({
    where: { usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!qr) throw new ApiError(404, "NO_ACTIVE_CARD", "لا توجد بطاقة مريض مفتوحة الآن — افتح بطاقة المريض أولاً / No patient card is open right now");
  const used = await prisma.qrSession.updateMany({ where: { id: qr.id, usedAt: null }, data: { usedAt: new Date() } });
  if (used.count !== 1) throw new ApiError(409, "ALREADY_USED", "تم استخدام الرمز / Code already used");
  const scan = await prisma.qrScan.create({
    data: { qrSessionId: qr.id, patientId: qr.patientId, professionalId: ctx.pro.id, hospitalId: ctx.hospital.id, expiresAt: new Date(Date.now() + SCAN_CONTEXT_TTL_MS) },
  });
  await audit({ actor, action: "QR_RESOLVE", patientId: qr.patientId, resourceType: "QrScan", resourceId: scan.id, details: { simulated: true, ref: crypto.randomUUID().slice(0, 8) } });
  const grant = await grantFromQrScan(ctx, actor, scan.id);
  return { grantId: grant.id, redirect: `/er/record/${grant.id}` };
});
