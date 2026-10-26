import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, parseJson } from "@/lib/api";
import { hashIdentifier, idTypeFor, normalizeId, sha256 } from "@/lib/crypto";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { requestMeta } from "@/lib/request-meta";
import { ApiError } from "@/lib/errors";
import { sendSms, smsProvider } from "@/lib/sms";
import { onlyDigits } from "@/lib/digits";

/**
 * Patient sign-in step 1: National ID / Iqama + mobile → one-time code.
 * Development identity provider (simulated). In demo mode the code is returned so it can be shown on screen.
 */
const Body = z.object({
  nationalId: z.string().transform(onlyDigits).pipe(z.string().regex(/^[12]\d{9}$/, "رقم الهوية / الإقامة يجب أن يكون 10 أرقام")),
  phone: z.string().transform(onlyDigits).pipe(z.string().regex(/^05\d{8}$/, "رقم الجوال بصيغة 05XXXXXXXX")),
});

export const POST = route(async (req) => {
  const { nationalId, phone } = await parseJson(req, Body);
  const id = normalizeId(nationalId);
  const meta = await requestMeta();
  rateLimit(`otp:ip:${meta.ip}`, 20, 10 * 60_000);
  rateLimit(`otp:id:${id}`, 6, 10 * 60_000);
  const idHash = hashIdentifier(idTypeFor(id), id);
  const record = await prisma.devIdentityRecord.findUnique({ where: { identifierHash: idHash } });
  if (!record || record.phone !== phone) {
    throw new ApiError(400, "IDENTITY_MISMATCH", "رقم الهوية أو الجوال غير صحيح / ID or mobile number is incorrect");
  }
  // A real, random one-time code is sent by SMS when an SMS provider is configured (see src/lib/sms.ts).
  // Without a provider, the fixed demo code OTP_FIXED_CODE is accepted instead.
  const sms = smsProvider();
  const fixed = process.env.OTP_FIXED_CODE;
  const code = !sms && fixed && /^\d{6}$/.test(fixed) ? fixed : String(crypto.randomInt(100000, 999999));
  if (sms) {
    try {
      rateLimit(`otp:sms:${phone}`, 1, 30_000); // at most one SMS every 30 s per number
    } catch {
      throw new ApiError(429, "SMS_TOO_SOON", "انتظر 30 ثانية قبل طلب رمز جديد / Wait 30 seconds before requesting a new code");
    }
    const sent = await sendSms(phone, `رمز الدخول إلى عون: ${code}\nصالح 5 دقائق. لا تشاركه مع أحد.\nTaree code: ${code}`);
    if (!sent.ok) {
      console.error("[sms] sending failed:", sent.error);
      throw new ApiError(502, "SMS_FAILED", "تعذّر إرسال الرمز إلى الجوال، حاول مرة أخرى / Could not send the code, try again");
    }
  }
  const ch = await prisma.otpChallenge.create({
    data: { identifierHash: idHash, phone, codeHash: sha256(`${idHash}:${code}`), purpose: "LOGIN", expiresAt: new Date(Date.now() + 5 * 60_000) },
  });
  return { challengeId: ch.id, maskedPhone: phone.slice(0, 3) + "•••••" + phone.slice(-2), devCode: env.demoMode && !sms && !fixed ? code : undefined, sms: !!sms };
});
