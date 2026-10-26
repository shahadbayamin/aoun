import { prisma } from "@/lib/db";
import { route } from "@/lib/api";
import { actorOf, getSession } from "@/lib/auth";
import { authorizeGrant } from "@/lib/access";
import { storage } from "@/lib/storage";
import { sendFile } from "@/lib/send-file";
import { audit } from "@/lib/audit";
import { cardSession } from "@/lib/card-access";
import { ApiError, notFound, unauthorized } from "@/lib/errors";

export const runtime = "nodejs";

/**
 * Taree unified-record file access. There are NO public file URLs: every byte is decrypted and
 * streamed only after server-side authorization, and every access is audited.
 *   ?grant=<id>  → Hospital B professional with an active grant covering IMAGING for this patient
 *   ?qr=<token>  → the patient's QR link while the code is valid (shown by the patient)
 *   (no grant)   → the patient who owns the study
 */
export const GET = route<{ params: Promise<{ fileId: string }> }>(async (req, { params }) => {
  const { fileId } = await params;
  const url = new URL(req.url);
  const grantId = url.searchParams.get("grant");
  const download = url.searchParams.get("download") === "1";
  const file = await prisma.imagingFile.findUnique({ where: { id: fileId }, include: { study: true } });

  if (grantId) {
    const s = await getSession("ER");
    if (!s) throw unauthorized();
    const { grant } = await authorizeGrant(s, grantId, "IMAGING", "IMAGING_FILE_VIEW", { fileId });
    if (!file || file.study.patientId !== grant.patientId || file.study.status !== "AVAILABLE") {
      await audit({ actor: actorOf(s), action: "IMAGING_FILE_VIEW", outcome: "DENIED", patientId: grant.patientId, resourceType: "ImagingFile", resourceId: fileId, details: { reason: "FILE_OUTSIDE_GRANT" } });
      throw new ApiError(403, "ACCESS_DENIED", "File is not part of the authorized record");
    }
    return sendFile(req, await storage.get(file.storageKey), file.mimeType, file.fileName, download);
  }

  const qrToken = url.searchParams.get("qr");
  if (qrToken) {
    // Opened from the patient's QR link while the code is valid
    const qr = await cardSession(qrToken);
    if (!qr) throw unauthorized();
    if (!file || file.study.patientId !== qr.patientId || file.study.status !== "AVAILABLE") {
      await audit({ actor: { label: "qr-link-viewer", role: "PUBLIC" }, action: "QR_CARD_FILE_VIEW", outcome: "DENIED", patientId: qr.patientId, resourceType: "ImagingFile", resourceId: fileId });
      throw notFound();
    }
    await audit({ actor: { label: "qr-link-viewer", role: "PUBLIC" }, action: "QR_CARD_FILE_VIEW", patientId: qr.patientId, resourceType: "ImagingFile", resourceId: fileId, details: { qrSessionId: qr.id } });
    return sendFile(req, await storage.get(file.storageKey), file.mimeType, file.fileName, download);
  }

  const s = await getSession("PATIENT");
  if (!s) throw unauthorized();
  const patient = s.user.patient;
  if (!file || !patient || file.study.patientId !== patient.id) {
    await audit({ actor: actorOf(s), action: "IMAGING_FILE_VIEW", outcome: "DENIED", resourceType: "ImagingFile", resourceId: fileId });
    throw notFound();
  }
  await audit({ actor: actorOf(s), action: "PATIENT_FILE_VIEW", patientId: patient.id, resourceType: "ImagingFile", resourceId: fileId });
  return sendFile(req, await storage.get(file.storageKey), file.mimeType, file.fileName, download);
});
