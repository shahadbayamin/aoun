import { z } from "zod";
import { route, parseJson } from "@/lib/api";
import { radiologyCtx } from "@/lib/portal-ctx";
import { createDraftStudy } from "@/lib/hospital-system/ris";
import { audit } from "@/lib/audit";

const Body = z.object({
  hospitalPatientId: z.string().min(1),
  modality: z.enum(["XRAY", "MRI", "CT", "ULTRASOUND", "OTHER"]),
  bodyRegion: z.string().trim().min(2).max(120),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  radiologistName: z.string().trim().min(2).max(120),
  reportText: z.string().max(50_000).optional(),
});

export const POST = route(async (req) => {
  const b = await parseJson(req, Body);
  const { s, ctx, actor } = await radiologyCtx("RIS_STUDY_CREATE");
  const study = await createDraftStudy(ctx.hospital.id, ctx.hospital.code, {
    ...b,
    examDate: new Date(b.examDate + "T08:00:00Z"),
    radiologistUserId: s.userId,
    reportText: b.reportText ?? "",
  });
  await audit({ actor, action: "RIS_STUDY_DRAFT_SAVED", resourceType: "SourceStudy", resourceId: study.id, details: { accessionNumber: study.accessionNumber } });
  return { study };
});
