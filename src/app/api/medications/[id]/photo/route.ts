import { prisma } from "@/lib/db";
import { route } from "@/lib/api";
import { actorOf, getSession } from "@/lib/auth";
import { authorizeGrant } from "@/lib/access";
import { cardSession } from "@/lib/card-access";
import { storage } from "@/lib/storage";
import { sendFile } from "@/lib/send-file";
import { audit } from "@/lib/audit";
import { notFound, unauthorized } from "@/lib/errors";

export const runtime = "nodejs";

/**
 * Photo of a medicine, streamed only to: the patient (own), a doctor with an active grant (?grant=),
 * or the patient's QR link while valid (?qr=). Never a public URL.
 */
export const GET = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const url = new URL(req.url);
  const med = await prisma.medication.findUnique({ where: { id } });
  const send = async () => sendFile(req, await storage.get(med!.photoKey!), med!.photoMime || "image/jpeg", "medicine-photo");

  const grantId = url.searchParams.get("grant");
  if (grantId) {
    const s = await getSession("ER");
    if (!s) throw unauthorized();
    const { grant } = await authorizeGrant(s, grantId, "IMAGING", "MEDICATION_PHOTO_VIEW", { medicationId: id });
    if (!med?.photoKey || med.patientId !== grant.patientId) throw notFound();
    return send();
  }
  const qrToken = url.searchParams.get("qr");
  if (qrToken) {
    const qr = await cardSession(qrToken);
    if (!qr) throw unauthorized();
    if (!med?.photoKey || med.patientId !== qr.patientId) throw notFound();
    await audit({ actor: { label: "qr-link-viewer", role: "PUBLIC" }, action: "QR_CARD_MEDICATION_PHOTO", patientId: qr.patientId, resourceType: "Medication", resourceId: id });
    return send();
  }
  const s = await getSession("PATIENT");
  if (!s) throw unauthorized();
  if (!med?.photoKey || !s.user.patient || med.patientId !== s.user.patient.id) {
    await audit({ actor: actorOf(s), action: "MEDICATION_PHOTO_VIEW", outcome: "DENIED", resourceType: "Medication", resourceId: id });
    throw notFound();
  }
  return send();
});
