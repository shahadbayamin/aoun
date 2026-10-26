import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ShieldX } from "lucide-react";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n";
import { fmtDate, label, MODALITY } from "@/lib/labels";
import { audit } from "@/lib/audit";
import { cardSession } from "@/lib/card-access";
import { Card } from "@/components/ui";
import { FileViewer, type ViewerFile } from "@/components/FileViewer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Medical imaging" };

/** One imaging study opened from the patient's QR link: all images (strip on top, large below) + report. */
export default async function CardStudy({ params }: { params: Promise<{ token: string; studyId: string }> }) {
  const { token, studyId } = await params;
  const { t, lang } = await getT();
  const qr = await cardSession(token);
  if (!qr) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="card card-pad w-full max-w-md text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emergency-50 text-emergency"><ShieldX className="h-7 w-7" /></div>
          <h1 className="mt-4 text-xl font-bold">{t("انتهت صلاحية الرمز", "This code has expired")}</h1>
          <p className="mt-2 text-sm text-navy-400">{t("اطلب من المريض فتح بطاقته لإظهار رمز جديد.", "Ask the patient to open their card to show a new code.")}</p>
        </div>
      </div>
    );
  }
  const st = await prisma.imagingStudy.findFirst({ where: { id: studyId, patientId: qr.patientId, status: "AVAILABLE" }, include: { files: { orderBy: { createdAt: "asc" } }, report: true, sourceHospital: true } });
  if (!st) notFound();
  await audit({ actor: { label: "qr-link-viewer", role: "PUBLIC" }, action: "QR_CARD_STUDY_VIEW", patientId: qr.patientId, resourceType: "ImagingStudy", resourceId: st.id });
  const Back = lang === "ar" ? ArrowRight : ArrowLeft;
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <Link href={`/c/${token}`} className="mb-3 inline-flex items-center gap-1 text-sm text-medblue"><Back className="h-4 w-4" />{t("العودة للبطاقة", "Back to the card")}</Link>
      <h1 className="text-2xl font-bold">{label(MODALITY, st.modality, lang)}{st.bodyRegion !== "-" ? ` — ${st.bodyRegion}` : ""}</h1>
      <p className="mb-5 mt-1 text-sm text-navy-400">{lang === "ar" ? st.sourceHospital.nameAr : st.sourceHospital.nameEn} · {fmtDate(st.examDate, lang)} · {st.files.length} {t("صورة", st.files.length === 1 ? "image" : "images")}</p>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2" title={t("الأشعة", "Imaging")}>
          <FileViewer files={st.files as ViewerFile[]} urlFor={`/api/files/{id}?qr=${token}`} />
        </Card>
        <Card title={t("تقرير الأشعة", "Radiology report")}>
          <p dir="auto" className="whitespace-pre-wrap text-start text-sm leading-relaxed">{st.report?.text || "—"}</p>
          {st.report && <div className="mt-3 text-xs text-navy-400">{st.report.author} · {fmtDate(st.report.finalizedAt, lang, true)}</div>}
        </Card>
      </div>
    </div>
  );
}
