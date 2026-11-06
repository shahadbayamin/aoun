import Link from "next/link";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n";
import { fmtDate, label, MODALITY } from "@/lib/labels";
import { Badge, Card, KV, PageHeader } from "@/components/ui";
import { FileViewer, type ViewerFile } from "@/components/FileViewer";
import { guard, Denied } from "../../../../guard";
import { ArrowRight, ArrowLeft } from "lucide-react";

export const metadata = { title: "Medical imaging viewer" };

export default async function Viewer({ params }: { params: Promise<{ grantId: string; studyId: string }> }) {
  const { grantId, studyId } = await params;
  const { t, lang } = await getT();
  const g = await guard(grantId, "IMAGING", "IMAGING_STUDY_VIEW", { studyId });
  if (!g.ok) return <Denied reason={g.reason} />;
  const st = await prisma.imagingStudy.findFirst({ where: { id: studyId, patientId: g.grant.patientId, status: "AVAILABLE" }, include: { files: { orderBy: { createdAt: "asc" } }, report: true, sourceHospital: true } });
  if (!st) return <Denied reason="STUDY_OUTSIDE_AUTHORIZED_RECORD" />;
  const Back = lang === "ar" ? ArrowRight : ArrowLeft;
  return (
    <>
      <Link href={`/er/record/${grantId}`} className="mb-3 inline-flex items-center gap-1 text-sm text-medblue"><Back className="h-4 w-4" />{t("العودة للسجل", "Back to record")}</Link>
      <PageHeader title={`${label(MODALITY, st.modality, lang)}${st.bodyRegion !== "-" ? ` — ${st.bodyRegion}` : ""}`} subtitle={`${lang === "ar" ? st.sourceHospital.nameAr : st.sourceHospital.nameEn} · ${fmtDate(st.examDate, lang)}`} badge={<Badge tone="green">{t("مزامنة تلقائية", "Auto-synced")}</Badge>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2" title={t("عارض الأشعة الطبية", "Medical imaging viewer")}>
          <FileViewer files={st.files as ViewerFile[]} urlFor={`/api/files/{id}?grant=${grantId}`} />
        </Card>
        <div className="space-y-5">
          <Card title={t("بيانات الدراسة", "Study metadata")}>
            <dl data-testid="study-meta">
              <KV k={t("نوع الدراسة", "Study type")} v={label(MODALITY, st.modality, lang)} />
              {st.bodyRegion !== "-" && <KV k={t("منطقة الجسم", "Body region")} v={st.bodyRegion} />}
              <KV k={t("التاريخ", "Date")} v={fmtDate(st.examDate, lang)} />
              <KV k={t("المستشفى المصدر", "Originating hospital")} v={lang === "ar" ? st.sourceHospital.nameAr : st.sourceHospital.nameEn} />
              <KV k={t("رقم الطلب", "Accession")} v={<span className="font-mono text-xs">{st.accessionNumber}</span>} />
              <KV k={t("مرجع عون", "Aoun reference")} v={<span className="font-mono text-xs">{st.referenceNumber}</span>} />
              <KV k={t("اكتملت المزامنة", "Sync completed")} v={fmtDate(st.syncedAt, lang, true)} />
              <KV k={t("الملفات", "Files")} v={`${st.files.length} · ${[...new Set(st.files.map((f) => f.format))].join(", ")}`} />
            </dl>
          </Card>
          <Card title={t("تقرير الأشعة", "Radiology report")}>
            <p dir="auto" className="whitespace-pre-wrap text-start text-sm leading-relaxed" data-testid="report">{st.report?.text || t("التقرير مرفق كملف PDF", "Report attached as PDF")}</p>
            {st.report && <div className="mt-3 text-xs text-navy-400">{st.report.author} · {fmtDate(st.report.finalizedAt, lang, true)}{st.report.amendedAt && <span data-testid="report-amended"> · {t("عُدّل", "Edited")} {fmtDate(st.report.amendedAt, lang, true)}</span>}</div>}
          </Card>
          <p className="text-xs text-navy-400">{t("يدعم عون القرار السريري ولا يحل محل حكم الطبيب.", "Aoun supports clinical decision-making and does not replace the physician's judgement.")}</p>
        </div>
      </div>
    </>
  );
}
