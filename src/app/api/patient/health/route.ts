import { z } from "zod";
import { prisma } from "@/lib/db";
import { route, parseJson } from "@/lib/api";
import { patientCtx } from "@/lib/portal-ctx";
import { audit } from "@/lib/audit";

/**
 * The patient updates their chronic diseases and allergies (chosen from the fixed lists, plus "other").
 * Replaces the patient's own (self-reported) entries; hospital-verified entries are kept.
 */
const Item = z.string().trim().min(2).max(120);
const Body = z.object({ conditions: z.array(Item).max(30), allergies: z.array(Item).max(30) });

export const PUT = route(async (req) => {
  const b = await parseJson(req, Body);
  const { patient, actor } = await patientCtx();
  const conditions = [...new Set(b.conditions)];
  const allergies = [...new Set(b.allergies)];
  await prisma.$transaction([
    prisma.chronicCondition.deleteMany({ where: { patientId: patient.id, source: "SELF_REPORTED" } }),
    prisma.allergy.deleteMany({ where: { patientId: patient.id, source: "SELF_REPORTED" } }),
    prisma.chronicCondition.createMany({ data: conditions.map((name) => ({ patientId: patient.id, name, source: "SELF_REPORTED" as const })) }),
    prisma.allergy.createMany({ data: allergies.map((substance) => ({ patientId: patient.id, substance, severity: "MODERATE" as const, source: "SELF_REPORTED" as const })) }),
  ]);
  await audit({ actor, action: "PATIENT_HEALTH_UPDATED", patientId: patient.id, details: { conditions: conditions.length, allergies: allergies.length } });
  return { ok: true };
});
