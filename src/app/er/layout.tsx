import { requirePage } from "@/lib/auth";
import { getProContext } from "@/lib/access";
import { getT } from "@/lib/i18n";
import { TopBar } from "@/components/TopBar";
import { HospitalNav } from "@/components/HospitalNav";
import { Alert } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function L({ children }: { children: React.ReactNode }) {
  const s = await requirePage("ER");
  const ctx = await getProContext(s);
  const { t, lang } = await getT();
  const hosp = ctx.hospital ? (lang === "ar" ? ctx.hospital.nameAr : ctx.hospital.nameEn) : "";
  return (
    <div className="min-h-screen">
      <TopBar label={hosp} portal="ER" tone="teal" user={s.user.professional ? (lang === "ar" ? s.user.professional.fullNameAr : s.user.professional.fullNameEn) : s.user.displayName} />
      <HospitalNav />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {!ctx.verified && (
          <div className="mb-5"><Alert tone="teal" title={t("حسابك غير موثّق — لا يمكنك الوصول إلى سجلات المرضى", "Your account is not verified — you cannot access patient records")}>{ctx.reasons.join(", ")}</Alert></div>
        )}
        {children}
      </main>
    </div>
  );
}
