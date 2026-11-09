import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, parseJson } from "@/lib/api";
import { verifyPassword } from "@/lib/auth";
import { startUserSession } from "@/lib/login";
import { rateLimit } from "@/lib/rate-limit";
import { requestMeta } from "@/lib/request-meta";
import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/errors";
import { latinDigits } from "@/lib/digits";

/** Healthcare professional sign-in (Hospital A radiology / Hospital B emergency). */
const Body = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

export const POST = route(async (req) => {
  const { email, password } = await parseJson(req, Body);
  const meta = await requestMeta();
  rateLimit(`login:ip:${meta.ip}`, 30, 60_000);
  rateLimit(`login:email:${email.toLowerCase()}`, 8, 60_000);
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  // Phones with an Arabic keyboard type the digits as ٠-٩: accept the password written either way.
  const passwordOk = async (hash: string) => (await verifyPassword(password, hash)) || (latinDigits(password) !== password && (await verifyPassword(latinDigits(password), hash)));
  const ok = !!user && (user.role === "RADIOLOGIST" || user.role === "DOCTOR") && user.isActive && (await passwordOk(user.passwordHash));
  if (!ok) {
    await audit({ actor: { label: "anonymous", userId: user?.id }, action: "PROFESSIONAL_LOGIN", outcome: "DENIED", details: { email } });
    throw new ApiError(401, "INVALID_CREDENTIALS", "البريد أو كلمة المرور غير صحيحة / Incorrect email or password");
  }
  const r = await startUserSession(user!);
  await audit({ actor: { userId: user!.id, role: user!.role, label: user!.displayName }, action: "PROFESSIONAL_LOGIN" });
  return r;
});
