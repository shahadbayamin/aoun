import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, parseJson } from "@/lib/api";
import { patientCtx } from "@/lib/portal-ctx";
import { audit } from "@/lib/audit";

/** The patient sets their emergency contact (name, mobile, relationship). */
const Body = z.object({
  name: z.string().trim().min(2, "اكتب اسم جهة الاتصال").max(120),
  phone: z.string().regex(/^05\d{8}$/, "رقم الجوال بصيغة 05XXXXXXXX"),
  relation: z.string().trim().max(60).optional(),
});

export const PUT = route(async (req) => {
  const b = await parseJson(req, Body);
  const { patient, actor } = await patientCtx();
  const data = { emergencyContactName: b.name, emergencyContactPhone: b.phone, emergencyContactRel: b.relation || null };
  await prisma.medicalProfile.upsert({ where: { patientId: patient.id }, create: { patientId: patient.id, ...data }, update: data });
  await audit({ actor, action: "PATIENT_CONTACT_UPDATED", patientId: patient.id });
  return { ok: true };
});
