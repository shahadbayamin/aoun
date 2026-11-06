import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePage } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { fmtDate, label, MODALITY } from "@/lib/labels";
import { Card } from "@/components/ui";
import { FileViewer, type ViewerFile } from "@/components/FileViewer";

/** The patient's own view of one imaging study: all images (strip on top, large image below) + report. */
export default async function PatientStudy({ params }: { params: Promise<{ studyId: string }> }) {
  const { studyId } = await params;
  const { t, lang } = await getT();
  const s = await requirePage("PATIENT");
  if (!s.user.patient) redirect("/login");
  const st = await prisma.imagingStudy.findFirst({ where: { id: studyId, patientId: s.user.patient.id, status: "AVAILABLE" }, include: { files: { orderBy: { createdAt: "asc" } }, report: true, sourceHospital: true } });
  if (!st) notFound();
  const Back = lang === "ar" ? ArrowRight : ArrowLeft;
  return (
    <>
      <Link href="/patient" className="mb-3 inline-flex items-center gap-1 text-sm text-medblue"><Back className="h-4 w-4" />{t("العودة لبطاقتي", "Back to my card")}</Link>
      <h1 className="text-2xl font-bold">{label(MODALITY, st.modality, lang)}{st.bodyRegion !== "-" ? ` — ${st.bodyRegion}` : ""}</h1>
      <p className="mb-5 mt-1 text-sm text-navy-400">{lang === "ar" ? st.sourceHospital.nameAr : st.sourceHospital.nameEn} · {fmtDate(st.examDate, lang)} · {st.files.length} {t("صورة", st.files.length === 1 ? "image" : "images")}</p>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2" title={t("الأشعة", "Imaging")}>
          <FileViewer files={st.files as ViewerFile[]} urlFor="/api/files/{id}" />
        </Card>
        <Card title={t("تقرير الأشعة", "Radiology report")}>
          <p dir="auto" className="whitespace-pre-wrap text-start text-sm leading-relaxed">{st.report?.text || "—"}</p>
          {st.report && <div className="mt-3 text-xs text-navy-400">{st.report.author} · {fmtDate(st.report.finalizedAt, lang, true)}{st.report.amendedAt && <span data-testid="report-amended"> · {t("عُدّل", "Edited")} {fmtDate(st.report.amendedAt, lang, true)}</span>}</div>}
        </Card>
      </div>
    </>
  );
}
