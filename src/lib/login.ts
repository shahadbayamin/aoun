import type { User } from "@prisma/client";
import { prisma } from "./db";
import { createSession, ROLE_PORTAL, PORTAL_HOME, HOSPITAL_PORTALS } from "./auth";

/**
 * Create the portal session(s) for a user. Hospital staff get BOTH hospital portals (upload imaging +
 * scan/view records), bound to their active hospital affiliation.
 */
export async function startUserSession(user: User) {
  const portal = ROLE_PORTAL[user.role];
  if (user.role === "RADIOLOGIST" || user.role === "DOCTOR") {
    const pro = await prisma.healthcareProfessional.findUnique({
      where: { userId: user.id },
      include: { affiliations: { orderBy: { createdAt: "asc" } } },
    });
    const affs = pro?.affiliations ?? [];
    const hospitalId = (affs.find((a) => a.status === "ACTIVE") ?? affs[0])?.hospitalId ?? null;
    for (const p of HOSPITAL_PORTALS) await createSession(user.id, p, hospitalId);
    return { portal, redirect: PORTAL_HOME[portal] };
  }
  await createSession(user.id, portal, null);
  return { portal, redirect: PORTAL_HOME[portal] };
}
