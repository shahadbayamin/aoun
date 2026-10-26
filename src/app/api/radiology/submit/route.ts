import { prisma } from "@/lib/db";
import { route } from "@/lib/api";
import { radiologyCtx } from "@/lib/portal-ctx";
import { approveStudy, attachFile, createDraftStudy, findOrRegisterHospitalPatient, nationalIdForTareePatient } from "@/lib/hospital-system/ris";
import { requireApi } from "@/lib/auth";
import { authorizeGrant } from "@/lib/access";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import { ApiError, badRequest } from "@/lib/errors";
import { MAX_VIDEO_BYTES } from "@/lib/files";

const MAX_FILES = 30;
const MAX_TOTAL_BYTES = 400 * 1024 * 1024;

export const runtime = "nodejs";

const MODALITIES = ["XRAY", "MRI", "CT", "ULTRASOUND", "OTHER"] as const;

/**
 * "حفظ وتأكيد" — ONE request does everything on the hospital side:
 * saves the file(s) in the hospital PACS (encrypted) — one study may hold several images — records the report, approves the study and
 * queues the automatic synchronization to Taree. The page then follows the real sync status.
 */
export const POST = route(async (req) => {
  const { s, ctx, actor } = await radiologyCtx("RIS_SAVE_CONFIRM");
  if (Number(req.headers.get("content-length") || 0) > MAX_TOTAL_BYTES + 1_000_000) throw badRequest("حجم الملفات كبير جداً / Files too large");
  const form = await req.formData();
  let nationalId = String(form.get("nationalId") ?? "").replace(/\D/g, "");
  const grantId = String(form.get("grantId") ?? "");
  if (grantId) {
    // Added from a scanned card: the patient comes from the doctor's active grant — no ID typing.
    const er = await requireApi("ER");
    const { grant } = await authorizeGrant(er, grantId, "IMAGING", "RIS_ADD_FROM_CARD");
    const id = await nationalIdForTareePatient(grant.patientId);
    if (!id) throw badRequest("تعذّر تحديد هوية المريض تلقائياً، أدخل رقم الهوية / Could not determine the patient ID automatically, enter it");
    nationalId = id;
  }
  const modality = String(form.get("modality") ?? "");
  const report = String(form.get("report") ?? "").trim();
  const files = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (!/^[12]\d{9}$/.test(nationalId)) throw badRequest("رقم الهوية / الإقامة يجب أن يكون 10 أرقام");
  if (!(MODALITIES as readonly string[]).includes(modality)) throw badRequest("اختر نوع الأشعة");
  if (files.length === 0) throw badRequest("ارفع ملف الأشعة");
  if (files.length > MAX_FILES) throw badRequest(`الحد الأقصى ${MAX_FILES} ملفاً في المرة الواحدة`);
  if (report.length < 10) throw badRequest("اكتب تقريراً مختصراً (10 أحرف على الأقل)");
  if (report.length > 5000) throw badRequest("التقرير طويل جداً");

  const hp = await findOrRegisterHospitalPatient(ctx.hospital.id, nationalId);
  if (!hp) throw new ApiError(404, "PATIENT_NOT_FOUND", "رقم الهوية غير مسجل / ID not registered");

  const study = await createDraftStudy(ctx.hospital.id, ctx.hospital.code, {
    hospitalPatientId: hp.id,
    modality: modality as (typeof MODALITIES)[number],
    bodyRegion: "-",
    examDate: new Date(),
    radiologistName: s.user.professional?.fullNameEn ?? s.user.displayName,
    radiologistUserId: s.userId,
    reportText: report,
  });
  try {
    for (const file of files) {
      const buf = Buffer.from(await file.arrayBuffer());
      if (buf.length > MAX_VIDEO_BYTES) throw badRequest(`الملف كبير جداً: ${file.name}`);
      const saved = await attachFile(ctx.hospital.id, study.id, "IMAGE", file.name, buf);
      if (saved.format === "PDF") throw badRequest("ارفع ملف أشعة (DICOM / صورة / فيديو)");
    }
  } catch (e) {
    await prisma.sourceStudy.delete({ where: { id: study.id } }).catch(() => {});
    throw e;
  }
  const r = await approveStudy(ctx.hospital.id, study.id, actor, { simulateFailures: 0 });
  await audit({ actor, action: "RIS_FILE_UPLOADED", resourceType: "SourceStudy", resourceId: study.id, details: { modality, files: files.length, simulate: env.demoMode } });
  return { studyId: study.id, jobId: r.job?.id, patientName: { ar: hp.fullNameAr, en: hp.fullNameEn } };
});
