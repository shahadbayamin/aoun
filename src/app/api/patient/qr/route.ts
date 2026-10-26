import QRCode from "qrcode";
import { route } from "@/lib/api";
import { patientCtx } from "@/lib/portal-ctx";
import { issueQr } from "@/lib/qr";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

/** Issue a fresh short-lived, single-use QR token for the emergency card. */
export const POST = route(async () => {
  const { patient, actor } = await patientCtx();
  rateLimit(`qr:${patient.id}`, 30, 60_000);
  const qr = await issueQr(patient.id);
  const svg = await QRCode.toString(qr.payload, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#0F2A43", light: "#FFFFFF" } });
  await audit({ actor, action: "QR_ISSUED", patientId: patient.id, resourceType: "QrSession", resourceId: qr.id });
  return { payload: qr.payload, shortCode: qr.shortCode, expiresAt: qr.expiresAt, svg };
});
