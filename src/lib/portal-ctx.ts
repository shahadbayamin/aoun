import { actorOf, requireApi } from "./auth";
import { requireVerifiedPro } from "./access";
import { prisma } from "./db";
import { unauthorized } from "./errors";

/** Hospital staff uploading imaging: verified licence + ACTIVE affiliation at the session's hospital. */
export async function radiologyCtx(action: string) {
  const s = await requireApi("RADIOLOGY");
  const ctx = await requireVerifiedPro(s, action);
  return { s, ctx, actor: actorOf(s) };
}

/** Hospital staff scanning / viewing patient records. */
export async function erCtx(action: string) {
  const s = await requireApi("ER");
  const ctx = await requireVerifiedPro(s, action);
  return { s, ctx, actor: actorOf(s) };
}

export async function patientCtx() {
  const s = await requireApi("PATIENT");
  const patient = await prisma.patient.findUnique({ where: { userId: s.userId } });
  if (!patient) throw unauthorized("No patient record linked to this account");
  return { s, patient, actor: actorOf(s) };
}

export async function adminCtx() {
  const s = await requireApi("ADMIN");
  return { s, actor: actorOf(s) };
}
