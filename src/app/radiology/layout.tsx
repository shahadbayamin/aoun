import { requirePage } from "@/lib/auth";
import { getProContext } from "@/lib/access";
import { getT } from "@/lib/i18n";
import { TopBar } from "@/components/TopBar";
import { HospitalNav } from "@/components/HospitalNav";
import { Alert } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function L({ children }: { children: React.ReactNode }) {
  const s = await requirePage("RADIOLOGY");
  const ctx = await getProContext(s);
  const { t, lang } = await getT();
  const hosp = ctx.hospital ? (lang === "ar" ? ctx.hospital.nameAr : ctx.hospital.nameEn) : "";
  return (
    <div className="min-h-screen">
      <TopBar label={hosp} portal="RADIOLOGY" tone="teal" user={s.user.professional ? (lang === "ar" ? s.user.professional.fullNameAr : s.user.professional.fullNameEn) : s.user.displayName} />
      <HospitalNav />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {ctx.verified ? children : <Alert tone="teal" title={t("الحساب غير مخوّل", "Account not authorized")}>{ctx.reasons.join(", ")}</Alert>}
      </main>
    </div>
  );
}
