import Link from "next/link";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n";
import { ageFrom, fmtDate, label, MODALITY, SEVERITY } from "@/lib/labels";
import { Badge } from "@/components/ui";
import { guard, Denied } from "../../guard";
import { latestActivity } from "@/lib/assistant";
import { Assistant } from "@/components/Assistant";
import { LatestPanel } from "@/components/PatientPanels";
import { UploadForm } from "@/app/radiology/upload";
import { MedList } from "@/components/MedList";
import { IdCard, CloudUpload, Pill, AlertTriangle, Building2, CalendarDays, Droplet, FileScan, HeartPulse, Phone, ScanLine, ChevronLeft, ChevronRight } from "lucide-react";

export const metadata = { title: "Patient medical record" };

export default async function Record({ params, searchParams }: { params: Promise<{ grantId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { grantId } = await params;
  const sp = await searchParams;
  const tab = sp.tab === "upload" || sp.tab === "imaging" ? sp.tab : "card";
  const { t, lang } = await getT();
  const g = await guard(grantId, "IMAGING", "RECORD_VIEW");
  if (!g.ok) return <Denied reason={g.reason} />;
  const p = await prisma.patient.findUniqueOrThrow({
    where: { id: g.grant.patientId },
    include: { profile: true, allergies: true, conditions: true, medications: { where: { active: true }, orderBy: { createdAt: "asc" } } },
  });
  const studies = await prisma.imagingStudy.findMany({ where: { patientId: p.id, status: "AVAILABLE" }, orderBy: { syncedAt: "desc" }, include: { sourceHospital: true, files: true, report: true } });
  const latest = await latestActivity(p.id, lang, 5, (id) => `/er/record/${grantId}/study/${id}`);
  const Chev = lang === "ar" ? ChevronLeft : ChevronRight;
  const tabs = [
    { k: "card", I: IdCard, label: t("البطاقة", "Card") },
    { k: "upload", I: CloudUpload, label: t("إضافة أشعة", "Add imaging") },
    { k: "imaging", I: FileScan, label: `${t("الأشعة", "Imaging")} (${studies.length})` },
  ];
  const unknown = <span className="text-sm text-navy-400">{t("غير معروف — غير مسجّل", "Unknown — not recorded")}</span>;
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href="/er" className="btn-secondary !py-2 text-sm"><ScanLine className="h-4 w-4" />{t("مسح مريض آخر", "Scan another patient")}</Link>
        <span className="text-xs text-navy-400">{t("صلاحية مؤقتة حتى", "Temporary access until")} {fmtDate(g.grant.expiresAt, lang, true)} · {t("كل اطلاع مسجّل", "every view is logged")}</span>
      </div>
      <nav className="mb-6 flex gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1" data-testid="record-tabs">
        {tabs.map((x) => (
          <Link key={x.k} href={`/er/record/${grantId}${x.k === "card" ? "" : `?tab=${x.k}`}`} aria-current={tab === x.k ? "page" : undefined}
            className={`inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold transition ${tab === x.k ? "bg-white text-teal shadow-sm" : "text-navy-500 hover:text-navy"}`}>
            <x.I className="h-4 w-4" />{x.label}
          </Link>
        ))}
      </nav>
      {tab === "card" && (
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card self-start overflow-hidden">
          <div className="bg-navy p-5 text-white">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-300">{t("معلومات المريض", "Patient information")}</div>
            <div className="mt-1 text-xl font-bold" data-testid="er-patient">{lang === "ar" ? p.fullNameAr : p.fullNameEn}</div>
            <div className="mt-1 text-sm text-slate-300">{t("العمر", "Age")} {ageFrom(p.dateOfBirth)} · {p.sex === "FEMALE" ? t("أنثى", "Female") : t("ذكر", "Male")} · <span className="ltr-nums">{p.maskedId}</span></div>
          </div>
          <div className="space-y-5 p-5">
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Droplet className="h-4 w-4 text-emergency" />{t("فصيلة الدم", "Blood type")}</h3>
              {p.profile?.bloodType ? <div className="flex items-center gap-2"><span className="text-2xl font-bold" dir="ltr">{p.profile.bloodType}</span>{p.profile.bloodTypeSource !== "PROVIDER_VERIFIED" && <Badge tone="amber">{t("غير موثّقة", "Unverified")}</Badge>}</div> : unknown}
            </div>
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-emergency" />{t("الحساسية", "Allergies")}</h3>
              {p.allergies.length ? <ul className="space-y-1.5">{p.allergies.map((a) => <li key={a.id} className="flex flex-wrap items-center gap-2 text-sm"><b>{a.substance}</b><Badge tone={a.severity === "LIFE_THREATENING" || a.severity === "SEVERE" ? "red" : "gray"}>{label(SEVERITY, a.severity, lang)}</Badge></li>)}</ul> : unknown}
            </div>
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><HeartPulse className="h-4 w-4 text-teal" />{t("الأمراض المزمنة", "Chronic diseases")}</h3>
              {p.conditions.length ? <ul className="space-y-1 text-sm">{p.conditions.map((c) => <li key={c.id}>{c.name}</li>)}</ul> : unknown}
            </div>
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Pill className="h-4 w-4 text-teal" />{t("الأدوية", "Medications")}</h3>
              {p.medications.length ? (
                <MedList meds={p.medications} t={t} photoQuery={`?grant=${grantId}`} className="text-sm [&_li]:justify-start" />
              ) : p.profile?.takesMedications === false ? <span className="text-sm">{t("لا يأخذ أدوية", "Takes no medications")}</span> : unknown}
            </div>
            {p.profile?.emergencyContactName && (
              <div className="text-sm"><h3 className="mb-1 flex items-center gap-2 font-semibold"><Phone className="h-4 w-4 text-teal" />{t("جهة اتصال للطوارئ", "Emergency contact")}</h3>{p.profile.emergencyContactName} · <span className="ltr-nums">{p.profile.emergencyContactPhone}</span></div>
            )}
          </div>
        </section>
        <div className="space-y-6">
        <LatestPanel latest={latest} t={t} lang={lang} />
        <Assistant endpoint="/api/er/assistant" extra={{ grantId }} self={false} />
        </div>
      </div>
      )}
      {tab === "upload" && <UploadForm grantId={grantId} patientName={lang === "ar" ? p.fullNameAr : p.fullNameEn} />}
      {tab === "imaging" && (
        <section>
          <h2 className="mb-3 text-lg font-bold">{t("الأشعة السابقة", "Previous imaging")} <span className="text-sm font-normal text-navy-400">({studies.length})</span></h2>
          {studies.length === 0 ? <div className="card card-pad text-sm text-navy-400">{t("لا توجد أشعة مسجّلة لهذا المريض.", "No imaging recorded for this patient.")}</div> : (
            <ul className="space-y-3" data-testid="er-studies">
              {studies.map((s, i) => (
                <li key={s.id}>
                  <Link href={`/er/record/${grantId}/study/${s.id}`} className="card group flex gap-4 p-4 transition hover:border-teal-200">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal"><FileScan className="h-6 w-6" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-bold group-hover:text-teal">{label(MODALITY, s.modality, lang)}{s.bodyRegion !== "-" ? ` — ${s.bodyRegion}` : ""}</span>
                        {i === 0 && Date.now() - s.syncedAt.getTime() < 3600_000 && <Badge tone="blue">{t("جديد", "New")}</Badge>}
                        {[...new Set(s.files.map((f) => f.format))].map((f) => <Badge key={f} tone="gray">{f}</Badge>)}
                        {s.files.length > 1 && <Badge tone="blue">{s.files.length} {t("صور", "images")}</Badge>}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-navy-400">
                        <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{lang === "ar" ? s.sourceHospital.nameAr : s.sourceHospital.nameEn}</span>
                        <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{fmtDate(s.examDate, lang)}</span>
                      </div>
                      {s.report?.text && <p className="mt-2 line-clamp-2 text-sm text-navy-500" dir="auto">{s.report.text}</p>}
                    </div>
                    <Chev className="h-5 w-5 shrink-0 self-center text-navy-300" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
