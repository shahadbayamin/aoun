import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePage } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { ageFrom, fmtDate, label, MODALITY } from "@/lib/labels";
import { Badge } from "@/components/ui";
import { LogoMark } from "@/components/Logo";
import { QrBlock } from "./qr";
import { WalletButtons } from "./wallet-buttons";
import { HealthEditor } from "./health-editor";
import { ContactEditor } from "./contact-editor";
import { MedsEditor } from "./meds-editor";
import { MedList } from "@/components/MedList";
import { Assistant } from "@/components/Assistant";
import { ImagingHistory, LatestPanel } from "@/components/PatientPanels";
import { latestActivity } from "@/lib/assistant";
import { FileScan, IdCard, Sparkles } from "lucide-react";

export default async function Card({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { t, lang } = await getT();
  const sp = await searchParams;
  const tab = sp.tab === "imaging" || sp.tab === "latest" ? sp.tab : "card";
  const s = await requirePage("PATIENT");
  if (!s.user.patient) redirect("/login");
  const p = await prisma.patient.findUniqueOrThrow({
    where: { id: s.user.patient.id },
    include: { profile: true, allergies: true, conditions: true, medications: { where: { active: true }, orderBy: { createdAt: "asc" } }, studies: { where: { status: "AVAILABLE" }, orderBy: { syncedAt: "desc" }, include: { sourceHospital: true, files: true } } },
  });
  const latest = await latestActivity(p.id, lang);
  const name = lang === "ar" ? p.fullNameAr : p.fullNameEn;
  const unknown = <span className="text-navy-400">{t("غير معروف", "Unknown")}</span>;
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-3 last:border-0">
      <dt className="shrink-0 text-sm text-navy-400">{k}</dt>
      <dd className="min-w-0 text-end text-sm font-semibold">{v}</dd>
    </div>
  );
  const tabs = [
    { k: "card", I: IdCard, label: t("البطاقة", "Card") },
    { k: "imaging", I: FileScan, label: `${t("الأشعة", "Imaging")} (${p.studies.length})` },
    { k: "latest", I: Sparkles, label: t("الأحدث والمساعد الذكي", "Latest & AI assistant") },
  ];
  return (
    <>
    <nav className="mb-6 flex gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1" data-testid="patient-tabs">
      {tabs.map((x) => (
        <Link key={x.k} href={x.k === "card" ? "/patient" : `/patient?tab=${x.k}`} aria-current={tab === x.k ? "page" : undefined}
          className={`inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold transition ${tab === x.k ? "bg-white text-teal shadow-sm" : "text-navy-500 hover:text-navy"}`}>
          <x.I className="h-4 w-4" />{x.label}
        </Link>
      ))}
    </nav>
    {tab === "card" && (
    <div className="grid gap-6 lg:grid-cols-5">
      <section className="card self-start overflow-hidden lg:col-span-3">
        <div className="bg-gradient-to-br from-teal to-medblue p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <LogoMark size={36} inverted />
              <div className="leading-tight"><div className="text-lg font-bold">عون</div><div className="text-[10px] tracking-[0.25em] opacity-80">AOUN · MEDICAL CARD</div></div>
            </div>
            <span className="badge bg-white/20 text-white">{t("بطاقة طوارئ", "Emergency card")}</span>
          </div>
          <div className="mt-6 text-2xl font-bold" data-testid="patient-name">{name}</div>
          <div className="ltr-nums mt-1 text-sm opacity-85">{p.maskedId}</div>
        </div>
        <dl className="px-6 py-2">
          <Row k={t("العمر", "Age")} v={`${ageFrom(p.dateOfBirth)} ${t("سنة", "years")}`} />
          <Row k={t("الجنس", "Sex")} v={p.sex === "FEMALE" ? t("أنثى", "Female") : t("ذكر", "Male")} />
          <Row k={t("فصيلة الدم", "Blood type")} v={p.profile?.bloodType ? <span className="text-lg text-emergency" dir="ltr">{p.profile.bloodType}</span> : unknown} />
          <Row k={t("الأمراض المزمنة", "Chronic diseases")} v={p.conditions.length ? <div className="flex flex-wrap justify-end gap-1">{p.conditions.map((c) => <Badge key={c.id} tone="blue" className="!whitespace-normal text-start">{c.name}</Badge>)}</div> : unknown} />
          <Row k={t("الحساسية", "Allergies")} v={p.allergies.length ? <div className="flex flex-wrap justify-end gap-1">{p.allergies.map((a) => <Badge key={a.id} tone={a.severity === "LIFE_THREATENING" || a.severity === "SEVERE" ? "red" : "gray"} className="!whitespace-normal text-start">{a.substance}</Badge>)}</div> : unknown} />
          <Row k={t("الأدوية", "Medications")} v={p.medications.length ? (
            <MedList meds={p.medications} t={t} />
          ) : p.profile?.takesMedications === false ? <span data-testid="meds">{t("لا يأخذ أدوية", "Takes no medications")}</span> : unknown} />
          <Row k={t("جهة الاتصال للطوارئ", "Emergency contact")} v={p.profile?.emergencyContactName ? (
            <span data-testid="contact">{p.profile.emergencyContactName}{p.profile.emergencyContactRel ? <span className="font-normal text-navy-400"> · {p.profile.emergencyContactRel}</span> : null}<br /><a className="ltr-nums text-medblue" href={`tel:${p.profile.emergencyContactPhone}`}>{p.profile.emergencyContactPhone}</a></span>
          ) : unknown} />
        </dl>
        <div className="flex flex-wrap gap-2 px-6 pb-5">
          <HealthEditor conditions={p.conditions.filter((c) => c.source === "SELF_REPORTED").map((c) => c.name)} allergies={p.allergies.filter((a) => a.source === "SELF_REPORTED").map((a) => a.substance)} />
          <MedsEditor takes={p.profile?.takesMedications ?? null} meds={p.medications.map((m) => ({ id: m.id, name: m.name ?? "", category: m.category ?? "", hasPhoto: !!m.photoKey, frequency: m.frequency ?? "" }))} />
          <ContactEditor name={p.profile?.emergencyContactName ?? ""} phone={p.profile?.emergencyContactPhone ?? ""} relation={p.profile?.emergencyContactRel ?? ""} />
        </div>
      </section>

      <section className="card card-pad self-start text-center lg:col-span-2">
        <h2 className="section-title">{t("رمز الطوارئ", "Emergency QR code")}</h2>
        <p className="mt-1 text-sm text-navy-400">{t("اعرضه على الطبيب في أي مستشفى مشارك", "Show it to the doctor at any participating hospital")}</p>
        <QrBlock />
        <WalletButtons />
      </section>
    </div>
    )}
    {tab === "imaging" && <ImagingHistory studies={p.studies} href={(id) => `/patient/study/${id}`} t={t} lang={lang} />}
    {tab === "latest" && (
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <LatestPanel latest={latest} t={t} lang={lang} />
        <Assistant />
      </div>
    )}
    </>
  );
}
