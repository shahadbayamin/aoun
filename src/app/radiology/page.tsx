import { prisma } from "@/lib/db";
import { requirePage } from "@/lib/auth";
import { getProContext } from "@/lib/access";
import { getT } from "@/lib/i18n";
import { fmtDate, label, MODALITY } from "@/lib/labels";
import { TableWrap } from "@/components/ui";
import { UploadForm } from "./upload";
import { SyncBadge } from "./sync-badge";
import { ReportEditor } from "./report-editor";

export default async function Radiology() {
  const { t, lang } = await getT();
  const s = await requirePage("RADIOLOGY");
  const { hospital } = await getProContext(s);
  const recent = await prisma.sourceStudy.findMany({
    where: { hospitalId: hospital!.id, status: "APPROVED" },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { hospitalPatient: true, files: true, syncJobs: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("رفع الأشعة الطبية", "Upload medical imaging")}</h1>
        <p className="mt-1 text-navy-400">{t("بعد «حفظ وتأكيد» تُحفظ الأشعة وتُربط تلقائياً بسجل المريض في منصة عون.", "After “Save & Confirm” the scan is saved and linked to the patient's Aoun record automatically.")}</p>
      </div>
      <UploadForm />
      <section className="card mt-8">
        <div className="border-b border-slate-100 px-5 py-4 sm:px-6"><h2 className="section-title">{t("آخر الأشعة المرفوعة", "Recent uploads")}</h2></div>
        <div className="card-pad">
          <TableWrap>
            <table className="table">
              <thead><tr><th>{t("المريض", "Patient")}</th><th>{t("النوع", "Type")}</th><th>{t("الملفات", "Files")}</th><th>{t("الوقت", "Time")}</th><th>{t("حالة المزامنة", "Sync status")}</th><th>{t("التقرير", "Report")}</th></tr></thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td>{lang === "ar" ? r.hospitalPatient.fullNameAr : r.hospitalPatient.fullNameEn}</td>
                    <td>{label(MODALITY, r.modality, lang)}</td>
                    <td className="max-w-[220px] truncate text-xs"><span dir="ltr">{r.files[0]?.fileName}</span>{r.files.length > 1 && <span className="ms-1 font-semibold text-teal"> +{r.files.length - 1}</span>}</td>
                    <td className="whitespace-nowrap text-xs">{fmtDate(r.createdAt, lang, true)}</td>
                    <td><SyncBadge status={r.syncJobs[0]?.status ?? "PENDING"} /></td>
                    <td>{r.radiologistUserId === s.userId ? <ReportEditor studyId={r.id} reportText={r.reportText} patientName={lang === "ar" ? r.hospitalPatient.fullNameAr : r.hospitalPatient.fullNameEn} /> : <span className="text-xs text-navy-400">—</span>}</td>
                  </tr>
                ))}
                {recent.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-navy-400">—</td></tr>}
              </tbody>
            </table>
          </TableWrap>
        </div>
      </section>
    </>
  );
}
