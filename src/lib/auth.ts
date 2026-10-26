import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import type { Portal, Role } from "@prisma/client";
import { prisma } from "./db";
import { env } from "./env";
import { randomToken, sha256 } from "./crypto";
import { requestMeta } from "./request-meta";
import { unauthorized } from "./errors";

/**
 * Sessions are opaque random tokens stored (hashed) in the database and carried in an
 * HttpOnly, SameSite=Strict cookie. Each portal has its own cookie so a presenter can keep
 * the patient, radiology, ER and admin portals open side by side in one browser.
 */
export const PORTAL_ROLE: Record<Portal, Role> = {
  PATIENT: "PATIENT",
  RADIOLOGY: "RADIOLOGIST",
  ER: "DOCTOR",
  ADMIN: "ADMIN",
};
export const ROLE_PORTAL: Record<Role, Portal> = {
  PATIENT: "PATIENT",
  RADIOLOGIST: "RADIOLOGY",
  DOCTOR: "ER",
  ADMIN: "ADMIN",
};

/** Every hospital professional (doctor or radiologist) can both upload imaging and scan/view patient records. */
export const HOSPITAL_PORTALS: Portal[] = ["RADIOLOGY", "ER"];
export function portalAllows(portal: Portal, role: Role) {
  if (portal === "RADIOLOGY" || portal === "ER") return role === "RADIOLOGIST" || role === "DOCTOR";
  return role === PORTAL_ROLE[portal];
}

const ABSOLUTE_TTL_MS: Record<Portal, number> = {
  PATIENT: 8 * 3600_000,
  RADIOLOGY: 12 * 3600_000,
  ER: 12 * 3600_000,
  ADMIN: 4 * 3600_000,
};
const IDLE_TIMEOUT_MS = 60 * 60_000;

export const cookieName = (p: Portal) => `taree_${p.toLowerCase()}`;

export const PORTAL_HOME: Record<Portal, string> = {
  PATIENT: "/patient",
  RADIOLOGY: "/radiology",
  ER: "/er",
  ADMIN: "/admin",
};

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export async function createSession(userId: string, portal: Portal, hospitalId: string | null = null) {
  const token = randomToken(32);
  const meta = await requestMeta();
  await prisma.session.create({
    data: {
      tokenHash: sha256(token),
      userId,
      portal,
      hospitalId,
      expiresAt: new Date(Date.now() + ABSOLUTE_TTL_MS[portal]),
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
  });
  const jar = await cookies();
  jar.set(cookieName(portal), token, {
    httpOnly: true,
    sameSite: "strict",
    secure: env.secureCookies,
    path: "/",
    maxAge: ABSOLUTE_TTL_MS[portal] / 1000,
  });
  return token;
}

const sessionInclude = {
  user: { include: { patient: true, professional: true } },
} as const;

async function loadSession(portal: Portal) {
  const jar = await cookies();
  const token = jar.get(cookieName(portal))?.value;
  if (!token) return null;
  const s = await prisma.session.findUnique({ where: { tokenHash: sha256(token) }, include: sessionInclude });
  if (!s || s.portal !== portal || s.revokedAt) return null;
  const now = Date.now();
  if (s.expiresAt.getTime() < now || now - s.lastSeenAt.getTime() > IDLE_TIMEOUT_MS) return null;
  if (!s.user.isActive || !portalAllows(portal, s.user.role)) return null;
  if (now - s.lastSeenAt.getTime() > 60_000) {
    await prisma.session.update({ where: { id: s.id }, data: { lastSeenAt: new Date() } });
  }
  return s;
}

export type SessionWithUser = NonNullable<Awaited<ReturnType<typeof loadSession>>>;

/** Request-scoped session lookup (deduplicated across layout + page). */
export const getSession = cache(loadSession);

export function loginPath(portal: Portal) {
  return portal === "PATIENT" ? "/login" : "/hospital/login";
}

/** For server components: redirect to the right login page if not signed in. */
export async function requirePage(portal: Portal) {
  const s = await getSession(portal);
  if (!s) redirect(loginPath(portal));
  return s;
}

/** For route handlers: throw 401 if not signed in. */
export async function requireApi(portal: Portal) {
  const s = await getSession(portal);
  if (!s) throw unauthorized();
  return s;
}

export async function destroySession(portal: Portal) {
  const jar = await cookies();
  const token = jar.get(cookieName(portal))?.value;
  if (token) {
    await prisma.session.updateMany({ where: { tokenHash: sha256(token) }, data: { revokedAt: new Date() } });
  }
  jar.delete(cookieName(portal));
  // Hospital staff are signed in to upload + scan together: signing out of one signs out of both.
  if (HOSPITAL_PORTALS.includes(portal)) {
    for (const other of HOSPITAL_PORTALS) {
      if (other === portal) continue;
      const tk = jar.get(cookieName(other))?.value;
      if (tk) await prisma.session.updateMany({ where: { tokenHash: sha256(tk) }, data: { revokedAt: new Date() } });
      jar.delete(cookieName(other));
    }
  }
}

export function actorOf(s: SessionWithUser) {
  return { userId: s.userId, role: s.user.role, label: s.user.displayName, hospitalId: s.hospitalId };
}
