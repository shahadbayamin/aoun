import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, parseJson } from "@/lib/api";
import { safeEqual, sha256 } from "@/lib/crypto";
import { hashPassword } from "@/lib/auth";
import { startUserSession } from "@/lib/login";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import { onlyDigits } from "@/lib/digits";

/** Patient sign-in step 2: verify the code. First-time patients get their account created automatically. */
const Body = z.object({ challengeId: z.string().min(1), code: z.string().transform(onlyDigits).pipe(z.string().regex(/^\d{6}$/, "الرمز 6 أرقام")) });

export const POST = route(async (req) => {
  const { challengeId, code } = await parseJson(req, Body);
  const ch = await prisma.otpChallenge.findUnique({ where: { id: challengeId } });
  if (!ch || ch.consumedAt || ch.expiresAt < new Date() || ch.attempts >= 5) {
    throw new ApiError(400, "OTP_EXPIRED", "انتهت صلاحية الرمز، اطلب رمزاً جديداً / Code expired, request a new one");
  }
  if (!safeEqual(sha256(`${ch.identifierHash}:${code}`), ch.codeHash)) {
    await prisma.otpChallenge.update({ where: { id: ch.id }, data: { attempts: { increment: 1 } } });
    throw new ApiError(400, "OTP_WRONG", "رمز التحقق غير صحيح / Incorrect code");
  }
  const used = await prisma.otpChallenge.updateMany({ where: { id: ch.id, consumedAt: null }, data: { consumedAt: new Date() } });
  if (used.count !== 1) throw new ApiError(400, "OTP_EXPIRED", "الرمز مستخدم / Code already used");

  let user = await prisma.user.findUnique({ where: { username: ch.identifierHash } });
  if (!user) {
    const record = await prisma.devIdentityRecord.findUniqueOrThrow({ where: { identifierHash: ch.identifierHash } });
    user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { role: "PATIENT", username: ch.identifierHash, passwordHash: await hashPassword(crypto.randomBytes(24).toString("hex")), displayName: record.fullNameAr, phone: ch.phone },
      });
      const mapping = await tx.identityMapping.findUnique({ where: { idType_identifierHash_scope: { idType: record.idType, identifierHash: ch.identifierHash, scope: "GLOBAL" } } });
      if (mapping) {
        await tx.patient.update({ where: { id: mapping.patientId }, data: { userId: u.id } });
      } else {
        await tx.patient.create({
          data: {
            userId: u.id,
            fullNameAr: record.fullNameAr,
            fullNameEn: record.fullNameEn,
            dateOfBirth: record.dateOfBirth,
            sex: record.sex,
            maskedId: record.maskedId,
            identityVerified: true,
            identityVerifiedAt: new Date(),
            identitySource: "DEV_IDENTITY_PROVIDER",
            profile: { create: {} },
            identityMappings: { create: { idType: record.idType, identifierHash: ch.identifierHash, verified: true, verificationMethod: "DEV_IDENTITY_PROVIDER+OTP" } },
          },
        });
      }
      return u;
    });
    await audit({ actor: { userId: user.id, role: "PATIENT", label: user.displayName }, action: "PATIENT_REGISTERED" });
  }
  if (!user.isActive || user.role !== "PATIENT") throw new ApiError(403, "FORBIDDEN", "Account disabled");
  await audit({ actor: { userId: user.id, role: "PATIENT", label: user.displayName }, action: "PATIENT_LOGIN", details: { method: "OTP" } });
  return startUserSession(user);
});
