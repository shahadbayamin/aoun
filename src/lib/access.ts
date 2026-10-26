import type { AccessGrant, Prisma } from "@prisma/client";
import { prisma } from "./db";
import { audit } from "./audit";
import { actorOf, type SessionWithUser } from "./auth";
import { ApiError } from "./errors";

/** Professional context bound to the session's hospital affiliation. */
export async function getProContext(s: SessionWithUser) {
  const pro = s.user.professional;
  if (!pro) return { pro: null, aff: null, hospital: null, verified: false, reasons: ["NO_PROFESSIONAL_PROFILE"] };
  const aff = s.hospitalId
    ? await prisma.professionalAffiliation.findUnique({
        where: { professionalId_hospitalId: { professionalId: pro.id, hospitalId: s.hospitalId } },
        include: { hospital: true },
      })
    : null;
  const reasons: string[] = [];
  if (!pro.licenseVerified) reasons.push("LICENSE_NOT_VERIFIED");
  if (!aff) reasons.push("NO_HOSPITAL_AFFILIATION");
  else {
    if (aff.status !== "ACTIVE") reasons.push(`AFFILIATION_${aff.status}`);
    if (!aff.hospital.isActive) reasons.push("HOSPITAL_INACTIVE");
  }
  return { pro, aff, hospital: aff?.hospital ?? null, verified: reasons.length === 0, reasons };
}
export type ProContext = Awaited<ReturnType<typeof getProContext>>;

export async function requireVerifiedPro(s: SessionWithUser, action: string, department?: string) {
  const ctx = await getProContext(s);
  const reasons = [...ctx.reasons];
  if (department && ctx.aff && ctx.aff.department !== department) reasons.push(`DEPARTMENT_NOT_${department}`);
  if (reasons.length) {
    await audit({ actor: actorOf(s), action, outcome: "DENIED", details: { reasons } });
    throw new ApiError(403, "PROFESSIONAL_NOT_AUTHORIZED", "Professional verification or hospital affiliation is not active", { reasons });
  }
  return ctx as ProContext & { pro: NonNullable<ProContext["pro"]>; aff: NonNullable<ProContext["aff"]>; hospital: NonNullable<ProContext["hospital"]> };
}

export type Scope = "IMAGING" | "EMERGENCY_SUMMARY" | "MEDICAL_PROFILE";

export const grantIsActive = (g: Pick<AccessGrant, "revokedAt" | "expiresAt">) => !g.revokedAt && g.expiresAt.getTime() > Date.now();

/**
 * Every record read by a professional goes through here:
 * verified professional + active affiliation + grant owned by THIS professional at THIS hospital
 * + unexpired/unrevoked + scope covers the request. Success and denial are both audited.
 */
export async function authorizeGrant(s: SessionWithUser, grantId: string, scope: Scope, action: string, extra?: Prisma.JsonObject) {
  const ctx = await requireVerifiedPro(s, action);
  const grant = await prisma.accessGrant.findUnique({ where: { id: grantId } });
  const deny = async (reason: string) => {
    await audit({
      actor: actorOf(s),
      action,
      outcome: "DENIED",
      patientId: grant?.patientId ?? null,
      resourceType: "AccessGrant",
      resourceId: grantId,
      details: { reason, scope, ...extra },
    });
    throw new ApiError(403, "ACCESS_DENIED", "You do not have an active authorization for this record", { reason });
  };
  if (!grant) return deny("GRANT_NOT_FOUND");
  if (grant.professionalId !== ctx.pro.id) return deny("GRANT_BELONGS_TO_ANOTHER_PROFESSIONAL");
  if (grant.hospitalId !== ctx.hospital.id) return deny("GRANT_ISSUED_FOR_ANOTHER_HOSPITAL");
  if (grant.revokedAt) return deny("GRANT_REVOKED");
  if (grant.expiresAt.getTime() <= Date.now()) return deny("GRANT_EXPIRED");
  if (!grant.scopes.includes(scope)) return deny("SCOPE_NOT_GRANTED");
  await audit({
    actor: actorOf(s),
    action,
    patientId: grant.patientId,
    resourceType: "AccessGrant",
    resourceId: grant.id,
    details: { scope, grantType: grant.type, ...extra },
  });
  return { grant: grant!, ctx };
}

/** Emergency summary — minimum necessary data. Missing data is reported as UNKNOWN, never as "none". */
export async function buildEmergencySummary(patientId: string) {
  const p = await prisma.patient.findUniqueOrThrow({
    where: { id: patientId },
    include: {
      profile: true,
      allergies: { orderBy: { severity: "desc" } },
      conditions: true,
      medications: { where: { active: true } },
    },
  });
  const hospitals = await prisma.hospital.findMany({ select: { id: true, nameAr: true, nameEn: true } });
  const hName = (id: string | null) => hospitals.find((h) => h.id === id) ?? null;
  const updatedCandidates = [
    p.updatedAt,
    p.profile?.updatedAt,
    ...p.allergies.map((a) => a.updatedAt),
    ...p.conditions.map((c) => c.updatedAt),
    ...p.medications.map((m) => m.updatedAt),
  ].filter(Boolean) as Date[];
  return {
    patient: { id: p.id, fullNameAr: p.fullNameAr, fullNameEn: p.fullNameEn, dateOfBirth: p.dateOfBirth, sex: p.sex, maskedId: p.maskedId, identityVerified: p.identityVerified },
    allergies: {
      status: p.allergies.length ? "RECORDED" : p.profile?.noKnownAllergies ? "NO_KNOWN_ALLERGIES" : "UNKNOWN",
      items: p.allergies.map((a) => ({ ...a, hospital: hName(a.hospitalId) })),
    },
    conditions: { status: p.conditions.length ? "RECORDED" : "UNKNOWN", items: p.conditions.map((c) => ({ ...c, hospital: hName(c.hospitalId) })) },
    medications: {
      status: p.medications.length ? "RECORDED" : "UNKNOWN",
      highRisk: p.medications.filter((m) => m.highRisk).map((m) => ({ ...m, hospital: hName(m.hospitalId) })),
      other: p.medications.filter((m) => !m.highRisk).map((m) => ({ ...m, hospital: hName(m.hospitalId) })),
    },
    bloodType: p.profile?.bloodType
      ? { value: p.profile.bloodType, source: p.profile.bloodTypeSource, verifiedBy: p.profile.bloodTypeVerifiedBy }
      : null,
    emergencyContact: p.profile?.emergencyContactName
      ? { name: p.profile.emergencyContactName, phone: p.profile.emergencyContactPhone, relation: p.profile.emergencyContactRel }
      : null,
    alerts: p.profile?.medicalAlerts ?? [],
    lastUpdated: new Date(Math.max(...updatedCandidates.map((d) => d.getTime()))),
  };
}
export type EmergencySummary = Awaited<ReturnType<typeof buildEmergencySummary>>;
