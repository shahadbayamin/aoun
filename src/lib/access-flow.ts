import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { audit, type AuditActor } from "./audit";
import { notify } from "./notify";
import { ApiError, badRequest, notFound } from "./errors";
import { EMERGENCY_PURPOSES, PURPOSES } from "./labels";
import type { Scope } from "./access";

/**
 * Access authorization workflow (Hospital B ⇄ patient ⇄ Aoun).
 *
 *  QR scan (QrScan context, 15 min)  ──►  ORDINARY: AccessRequest → patient approves → AccessGrant (CONSENT, 12 h)
 *                                    └─►  EMERGENCY: verified + attested break-glass → AccessGrant (EMERGENCY, 4 h)
 *                                         restricted to minimum-necessary scopes, flagged for security review.
 */
export const REQUEST_TTL_MS = 15 * 60_000;
export const CONSENT_GRANT_TTL_MS = 12 * 3600_000;
export const EMERGENCY_GRANT_TTL_MS = 4 * 3600_000;
export const ALL_SCOPES: Scope[] = ["IMAGING", "EMERGENCY_SUMMARY", "MEDICAL_PROFILE"];
/** Break-glass access is limited to what is needed for emergency care. */
export const EMERGENCY_SCOPES: Scope[] = ["IMAGING", "EMERGENCY_SUMMARY"];

type ProCtx = { pro: { id: string; fullNameAr: string; fullNameEn: string }; hospital: { id: string; nameAr: string; nameEn: string } };

async function loadScan(scanId: string, ctx: ProCtx, actor: AuditActor, action: string) {
  const scan = await prisma.qrScan.findUnique({ where: { id: scanId } });
  const deny = async (reason: string) => {
    await audit({ actor, action, outcome: "DENIED", patientId: scan?.patientId, resourceType: "QrScan", resourceId: scanId, details: { reason } });
    throw new ApiError(403, "SCAN_CONTEXT_INVALID", "QR scan session is invalid or expired. Please scan the patient's QR code again.", { reason });
  };
  if (!scan) return deny("NOT_FOUND");
  if (scan.professionalId !== ctx.pro.id || scan.hospitalId !== ctx.hospital.id) return deny("SCAN_BELONGS_TO_ANOTHER_PROFESSIONAL");
  if (scan.expiresAt.getTime() < Date.now()) return deny("SCAN_EXPIRED");
  return scan;
}

export async function createOrdinaryRequest(
  ctx: ProCtx,
  actor: AuditActor,
  input: { scanId: string; purpose: string; scopes: string[]; note?: string },
) {
  if (!(input.purpose in PURPOSES)) throw badRequest("Unknown purpose of access");
  const scopes = [...new Set(input.scopes)].filter((s): s is Scope => (ALL_SCOPES as string[]).includes(s));
  if (!scopes.length) throw badRequest("Select at least one record category");
  const scan = await loadScan(input.scanId, ctx, actor, "ACCESS_REQUEST_CREATE");

  const reqRow = await prisma.accessRequest.create({
    data: {
      patientId: scan.patientId,
      professionalId: ctx.pro.id,
      hospitalId: ctx.hospital.id,
      scanId: scan.id,
      purpose: input.purpose,
      note: input.note?.slice(0, 500) || null,
      scopes,
      expiresAt: new Date(Date.now() + REQUEST_TTL_MS),
    },
  });
  await audit({ actor, action: "ACCESS_REQUEST_CREATE", patientId: scan.patientId, resourceType: "AccessRequest", resourceId: reqRow.id, details: { purpose: input.purpose, scopes } });
  const patient = await prisma.patient.findUnique({ where: { id: scan.patientId } });
  await notify(patient?.userId, {
    type: "ACCESS_REQUEST",
    titleAr: "طلب وصول جديد إلى سجلك الطبي",
    titleEn: "New request to access your medical record",
    bodyAr: `${ctx.pro.fullNameAr} — ${ctx.hospital.nameAr}`,
    bodyEn: `${ctx.pro.fullNameEn} — ${ctx.hospital.nameEn}`,
    link: "/patient/access",
  });
  return reqRow;
}

/** Patient approves or rejects an ordinary access request. */
export async function decideRequest(patientId: string, requestId: string, approve: boolean, actor: AuditActor) {
  const r = await prisma.accessRequest.findUnique({ where: { id: requestId }, include: { professional: { include: { user: true } } } });
  if (!r || r.patientId !== patientId) throw notFound("Request not found");
  if (r.status !== "PENDING") throw new ApiError(409, "ALREADY_DECIDED", "This request has already been answered");
  if (r.expiresAt.getTime() < Date.now()) {
    await prisma.accessRequest.update({ where: { id: r.id }, data: { status: "EXPIRED" } });
    throw new ApiError(410, "REQUEST_EXPIRED", "This request has expired");
  }
  const result = await prisma.$transaction(async (tx) => {
    const upd = await tx.accessRequest.updateMany({
      where: { id: r.id, status: "PENDING" },
      data: { status: approve ? "APPROVED" : "REJECTED", respondedAt: new Date() },
    });
    if (upd.count !== 1) throw new ApiError(409, "ALREADY_DECIDED", "This request has already been answered");
    await tx.patientConsent.create({
      data: {
        patientId,
        accessRequestId: r.id,
        professionalId: r.professionalId,
        hospitalId: r.hospitalId,
        decision: approve ? "GRANTED" : "DENIED",
        scopes: r.scopes,
      },
    });
    if (!approve) return null;
    return tx.accessGrant.create({
      data: {
        patientId,
        professionalId: r.professionalId,
        hospitalId: r.hospitalId,
        type: "CONSENT",
        scopes: r.scopes,
        accessRequestId: r.id,
        expiresAt: new Date(Date.now() + CONSENT_GRANT_TTL_MS),
      },
    });
  });
  await audit({
    actor,
    action: approve ? "CONSENT_GRANTED" : "CONSENT_DENIED",
    patientId,
    resourceType: "AccessRequest",
    resourceId: r.id,
    details: { scopes: r.scopes, grantId: result?.id } as Prisma.JsonObject,
  });
  await notify(r.professional.userId, {
    type: approve ? "ACCESS_APPROVED" : "ACCESS_REJECTED",
    titleAr: approve ? "وافق المريض على طلب الوصول" : "رفض المريض طلب الوصول",
    titleEn: approve ? "Patient approved your access request" : "Patient declined your access request",
    bodyAr: "",
    bodyEn: "",
    link: approve && result ? `/er/record/${result.id}` : "/er",
  });
  return result;
}

/** Break-glass emergency access: verified professional, purpose code, written justification, attestation. */
export async function emergencyAccess(
  ctx: ProCtx,
  actor: AuditActor,
  input: { scanId: string; purposeCode: string; justification: string; attested: boolean },
) {
  if (!(input.purposeCode in EMERGENCY_PURPOSES)) throw badRequest("A valid emergency purpose is required");
  const justification = input.justification.trim();
  if (justification.length < 20) throw badRequest("A written clinical justification of at least 20 characters is required");
  if (!input.attested) throw badRequest("You must attest that this is a genuine emergency");
  const scan = await loadScan(input.scanId, ctx, actor, "EMERGENCY_ACCESS");

  // Abuse guard: max 5 break-glass events per professional per hour.
  const recent = await prisma.emergencyAccessEvent.count({
    where: { professionalId: ctx.pro.id, createdAt: { gt: new Date(Date.now() - 3600_000) } },
  });
  if (recent >= 5) {
    await audit({ actor, action: "EMERGENCY_ACCESS", outcome: "DENIED", patientId: scan.patientId, details: { reason: "RATE_LIMIT" } });
    throw new ApiError(429, "EMERGENCY_RATE_LIMIT", "Too many emergency access events. Contact the security office.");
  }

  const { grant, ev } = await prisma.$transaction(async (tx) => {
    const ev = await tx.emergencyAccessEvent.create({
      data: {
        patientId: scan.patientId,
        professionalId: ctx.pro.id,
        hospitalId: ctx.hospital.id,
        scanId: scan.id,
        purposeCode: input.purposeCode,
        justification: justification.slice(0, 2000),
        attested: true,
      },
    });
    const grant = await tx.accessGrant.create({
      data: {
        patientId: scan.patientId,
        professionalId: ctx.pro.id,
        hospitalId: ctx.hospital.id,
        type: "EMERGENCY",
        scopes: EMERGENCY_SCOPES,
        emergencyEventId: ev.id,
        expiresAt: new Date(Date.now() + EMERGENCY_GRANT_TTL_MS),
      },
    });
    return { grant, ev };
  });
  await audit({
    actor,
    action: "EMERGENCY_ACCESS_GRANTED",
    patientId: scan.patientId,
    resourceType: "EmergencyAccessEvent",
    resourceId: ev.id,
    details: { purposeCode: input.purposeCode, grantId: grant.id, scopes: EMERGENCY_SCOPES, flaggedForReview: true },
  });
  const patient = await prisma.patient.findUnique({ where: { id: scan.patientId } });
  await notify(patient?.userId, {
    type: "EMERGENCY_ACCESS",
    titleAr: "تم الوصول الطارئ إلى سجلك",
    titleEn: "Emergency access to your record",
    bodyAr: `${ctx.pro.fullNameAr} — ${ctx.hospital.nameAr}. تتم مراجعة كل وصول طارئ من فريق الأمن.`,
    bodyEn: `${ctx.pro.fullNameEn} — ${ctx.hospital.nameEn}. Every emergency access is reviewed by the security team.`,
    link: "/patient/access/history",
  });
  return grant;
}

export async function revokeGrant(patientId: string, grantId: string, actor: AuditActor) {
  const g = await prisma.accessGrant.findUnique({ where: { id: grantId } });
  if (!g || g.patientId !== patientId) throw notFound();
  if (g.revokedAt) return g;
  const upd = await prisma.accessGrant.update({ where: { id: g.id }, data: { revokedAt: new Date() } });
  await prisma.patientConsent.create({
    data: { patientId, accessRequestId: g.accessRequestId, professionalId: g.professionalId, hospitalId: g.hospitalId, decision: "REVOKED", scopes: g.scopes },
  });
  await audit({ actor, action: "GRANT_REVOKED", patientId, resourceType: "AccessGrant", resourceId: g.id });
  return upd;
}

/**
 * Presenting the emergency-card QR is the patient's act of sharing their record with the treating
 * doctor at that hospital. A verified, actively affiliated professional who resolves a valid QR
 * receives a time-limited, audited grant automatically — no extra approval screens.
 */
export const QR_GRANT_TTL_MS = 2 * 3600_000;
export async function grantFromQrScan(ctx: ProCtx, actor: AuditActor, scanId: string) {
  const scan = await loadScan(scanId, ctx, actor, "QR_ACCESS_GRANT");
  const grant = await prisma.$transaction(async (tx) => {
    await tx.patientConsent.create({
      data: { patientId: scan.patientId, professionalId: ctx.pro.id, hospitalId: ctx.hospital.id, decision: "GRANTED", scopes: ALL_SCOPES },
    });
    return tx.accessGrant.create({
      data: {
        patientId: scan.patientId,
        professionalId: ctx.pro.id,
        hospitalId: ctx.hospital.id,
        type: "CONSENT",
        scopes: ALL_SCOPES,
        expiresAt: new Date(Date.now() + QR_GRANT_TTL_MS),
      },
    });
  });
  await audit({ actor, action: "QR_ACCESS_GRANTED", patientId: scan.patientId, resourceType: "AccessGrant", resourceId: grant.id, details: { scanId, scopes: ALL_SCOPES } });
  const patient = await prisma.patient.findUnique({ where: { id: scan.patientId } });
  await notify(patient?.userId, {
    type: "QR_ACCESS",
    titleAr: "تم فتح سجلك عبر بطاقة الطوارئ",
    titleEn: "Your record was opened via your emergency card",
    bodyAr: `${ctx.pro.fullNameAr} — ${ctx.hospital.nameAr}`,
    bodyEn: `${ctx.pro.fullNameEn} — ${ctx.hospital.nameEn}`,
  });
  return grant;
}
