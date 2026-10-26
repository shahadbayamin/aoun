import { z } from "zod";
import { route, parseJson } from "@/lib/api";
import { radiologyCtx } from "@/lib/portal-ctx";
import { findOrRegisterHospitalPatient } from "@/lib/hospital-system/ris";

/** Confirms the patient's name from the hospital's own patient index while the ID is typed. */
export const POST = route(async (req) => {
  const { nationalId } = await parseJson(req, z.object({ nationalId: z.string().regex(/^[12]\d{9}$/) }));
  const { ctx } = await radiologyCtx("RIS_PATIENT_LOOKUP");
  const p = await findOrRegisterHospitalPatient(ctx.hospital.id, nationalId);
  return p ? { found: true, fullNameAr: p.fullNameAr, fullNameEn: p.fullNameEn } : { found: false };
});
