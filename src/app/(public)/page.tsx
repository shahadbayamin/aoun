import Link from "next/link";
import { Building2, FileScan, QrCode, Stethoscope, UserRound } from "lucide-react";
import { getT } from "@/lib/i18n";
import { LogoMark } from "@/components/Logo";

export default async function Home() {
  const { t } = await getT();
  const steps = [
    [FileScan, t("أي مستشفى", "Any hospital"), t("يرفع الأشعة (صورة أو أكثر) ويضغط «حفظ وتأكيد»", "Uploads the imaging (one image or more) and clicks “Save & Confirm”")],
    [UserRound, t("منصة عون", "Aoun platform"), t("تُحفظ الأشعة وتُربط تلقائياً بهوية المريض", "The scan is saved and linked to the patient automatically")],
    [QrCode, t("المريض", "Patient"), t("يعرض بطاقته الطبية ورمز QR من جواله", "Shows their medical card and QR code on their phone")],
    [Stethoscope, t("أي مستشفى آخر", "Any other hospital"), t("يمسح الطبيب الرمز ويرى نفس الأشعة فوراً", "The doctor scans it and sees the same imaging instantly")],
  ] as const;
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute -top-48 start-1/2 h-[560px] w-[560px] -translate-x-1/2 rounded-full bg-teal-50 blur-3xl" />
      <section className="relative mx-auto max-w-3xl px-4 pb-10 pt-16 text-center sm:pt-24">
        <div className="mx-auto w-fit"><LogoMark size={84} /></div>
        <h1 className="mt-6 text-5xl font-bold sm:text-6xl">عون</h1>
        <p className="mt-2 text-xs font-semibold tracking-[0.35em] text-teal">AOUN</p>
        <p className="mt-6 text-2xl font-bold text-teal sm:text-3xl">{t("أشعتك الطبية معك أينما كنت", "Your medical imaging, wherever you are")}</p>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-navy-500">
          {t(
            "منصة موحدة تتيح للمستشفيات مشاركة الأشعة الطبية بشكل آمن، لتكون متاحة عند الحاجة دون تكرار الإجراءات غير الضرورية.",
            "A unified platform that lets hospitals share medical imaging securely, so it is available when needed without repeating unnecessary procedures.",
          )}
        </p>
        <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/login" className="btn-primary btn-lg"><UserRound className="h-5 w-5" />{t("دخول المريض", "Patient login")}</Link>
          <Link href="/hospital/login" className="btn-secondary btn-lg"><Building2 className="h-5 w-5" />{t("دخول المستشفى", "Hospital login")}</Link>
        </div>
      </section>
      <section className="relative mx-auto max-w-5xl px-4 pb-16">
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(([Icon, a, b], i) => (
            <li key={a} className="card card-pad">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-50 text-teal"><Icon className="h-5 w-5" /></span>
                <span className="text-xs font-bold text-navy-400">{i + 1}</span>
              </div>
              <div className="mt-3 font-semibold">{a}</div>
              <p className="mt-1 text-sm text-navy-400">{b}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
