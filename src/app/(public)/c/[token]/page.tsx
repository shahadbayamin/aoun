import { prisma } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { getSession } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { ageFrom } from "@/lib/labels";
import { audit } from "@/lib/audit";
import { Badge } from "@/components/ui";
import { LogoMark } from "@/components/Logo";
import { DoctorOpen } from "./doctor-open";
import { MedList } from "@/components/MedList";
import { latestActivity } from "@/lib/assistant";
import { Assistant } from "@/components/Assistant";
import { ImagingHistory, LatestPanel } from "@/components/PatientPanels";
import { Clock, ShieldX, Stethoscope } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Emergency card" };

/**
 * Opened by any phone camera scanning the patient's QR.
 * - Shows the patient's emergency card, latest activity, the AI assistant and the imaging history while the code is valid.
 * - If the viewer is signed in as a Hospital B doctor, the full record (with imaging) opens automatically.
 */
export default async function PublicCard({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { t, lang } = await getT();
  const valid = /^[A-Za-z0-9_-]{20,64}$/.test(token);
  const qr = valid ? await prisma.qrSession.findUnique({ where: { tokenHash: sha256(token) } }) : null;
  const ok = !!qr && !qr.revokedAt && qr.expiresAt.getTime() > Date.now();

  if (!ok) {
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

  const er = await getSession("ER");
  if (er && !qr.usedAt) return <DoctorOpen token={token} />;

  const p = await prisma.patient.findUniqueOrThrow({
    where: { id: qr.patientId },
    include: { profile: true, conditions: true, allergies: true, medications: { where: { active: true }, orderBy: { createdAt: "asc" } }, studies: { where: { status: "AVAILABLE" }, orderBy: { syncedAt: "desc" }, include: { sourceHospital: true, files: true } } },
  });
  const href = (id: string) => `/c/${token}/study/${id}`;
  const latest = await latestActivity(p.id, lang, 5, href);
  await audit({ actor: { label: "qr-link-viewer", role: "PUBLIC" }, action: "QR_CARD_VIEW", patientId: p.id, resourceType: "QrSession", resourceId: qr.id });
  const unknown = <span className="text-navy-400">{t("غير معروف", "Unknown")}</span>;
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-3 last:border-0">
      <dt className="shrink-0 text-sm text-navy-400">{k}</dt>
      <dd className="min-w-0 text-end text-sm font-semibold">{v}</dd>
    </div>
  );
  const left = Math.max(0, Math.round((qr.expiresAt.getTime() - Date.now()) / 60000));
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <div className="grid gap-6 lg:grid-cols-5">
        <section className="card self-start overflow-hidden lg:col-span-3" data-testid="public-card">
          <div className="bg-gradient-to-br from-teal to-medblue p-6 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <LogoMark size={36} inverted />
                <div className="leading-tight"><div className="text-lg font-bold">عون</div><div className="text-[10px] tracking-[0.25em] opacity-80">AOUN · MEDICAL CARD</div></div>
              </div>
              <span className="badge bg-white/20 text-white">{t("بطاقة طوارئ", "Emergency card")}</span>
            </div>
            <div className="mt-6 text-2xl font-bold">{lang === "ar" ? p.fullNameAr : p.fullNameEn}</div>
            <div className="ltr-nums mt-1 text-sm opacity-85">{p.maskedId}</div>
          </div>
          <dl className="px-6 py-2">
            <Row k={t("العمر", "Age")} v={`${ageFrom(p.dateOfBirth)} ${t("سنة", "years")}`} />
            <Row k={t("الجنس", "Sex")} v={p.sex === "FEMALE" ? t("أنثى", "Female") : t("ذكر", "Male")} />
            <Row k={t("فصيلة الدم", "Blood type")} v={p.profile?.bloodType ? <span className="text-lg text-emergency" dir="ltr">{p.profile.bloodType}</span> : unknown} />
            <Row k={t("الأمراض المزمنة", "Chronic diseases")} v={p.conditions.length ? <div className="flex flex-wrap justify-end gap-1">{p.conditions.map((c) => <Badge key={c.id} tone="blue" className="!whitespace-normal text-start">{c.name}</Badge>)}</div> : unknown} />
            <Row k={t("الحساسية", "Allergies")} v={p.allergies.length ? <div className="flex flex-wrap justify-end gap-1">{p.allergies.map((a) => <Badge key={a.id} tone="red" className="!whitespace-normal text-start">{a.substance}</Badge>)}</div> : unknown} />
            <Row k={t("الأدوية", "Medications")} v={p.medications.length ? (
              <MedList meds={p.medications} t={t} photoQuery={`?qr=${token}`} />
            ) : p.profile?.takesMedications === false ? t("لا يأخذ أدوية", "Takes no medications") : unknown} />
            {p.profile?.emergencyContactName && <Row k={t("جهة اتصال للطوارئ", "Emergency contact")} v={<span>{p.profile.emergencyContactName}<br /><a className="ltr-nums text-medblue" href={`tel:${p.profile.emergencyContactPhone}`}>{p.profile.emergencyContactPhone}</a></span>} />}
          </dl>
        </section>
        <div className="space-y-6 lg:col-span-2">
        <LatestPanel latest={latest} t={t} lang={lang} />
        <Assistant endpoint="/api/card/assistant" extra={{ token }} self={false} />
        <div className="card card-pad text-sm">
          <div className="flex items-center gap-2 font-semibold"><Stethoscope className="h-4 w-4 text-teal" />{t("هل أنت الطبيب المعالج؟", "Are you the treating doctor?")}</div>
          <p className="mt-1 text-navy-400">{t("سجّل الدخول بحساب المستشفى لفتح السجل الكامل في نظام المستشفى، ثم امسح الرمز مرة أخرى.", "Sign in with your hospital account to open the full record in the hospital system, then scan the code again.")}</p>
          <Link href="/hospital/login" className="btn-danger mt-3 w-full">{t("دخول الطبيب", "Doctor sign in")}</Link>
          <div className="mt-3 flex items-center justify-center gap-1 text-xs text-navy-400"><Clock className="h-3.5 w-3.5" />{t(`الرمز صالح لمدة ${left} دقيقة تقريباً`, `Code valid for about ${left} min`)}</div>
        </div>
        </div>
        <div className="lg:col-span-5"><ImagingHistory studies={p.studies} href={href} t={t} lang={lang} /></div>
      </div>
    </div>
  );
}
