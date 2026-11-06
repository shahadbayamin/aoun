import { z } from "zod";
import { route, parseJson } from "@/lib/api";
import { radiologyCtx } from "@/lib/portal-ctx";
import { amendSourceReport } from "@/lib/hospital-system/ris";
import { amendLinkedReport } from "@/lib/integration/receive";
import { audit } from "@/lib/audit";

const Body = z.object({ reportText: z.string().trim().min(10).max(5000) });

/**
 * «تعديل التقرير» — the radiologist corrects the report of a study they already uploaded.
 * Updates the hospital record and, when the study is already linked, the report the patient and doctors see.
 */
export const PUT = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const { reportText } = await parseJson(req, Body);
  const { s, ctx, actor } = await radiologyCtx("RIS_REPORT_AMEND");
  const study = await amendSourceReport(ctx.hospital.id, id, s.userId, reportText);
  const linked = await amendLinkedReport(ctx.hospital.id, study.studyInstanceUid, study.reportText, study.radiologistName);
  await audit({
    actor,
    action: "RIS_REPORT_AMENDED",
    patientId: linked?.study.patientId ?? null,
    resourceType: "SourceStudy",
    resourceId: study.id,
    details: { accessionNumber: study.accessionNumber, linkedStudyId: linked?.study.id ?? null, length: study.reportText.length },
  });
  return { reportText: study.reportText, amendedAt: linked?.report.amendedAt ?? null };
});
