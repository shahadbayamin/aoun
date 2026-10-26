import { requirePage } from "@/lib/auth";
import { getProContext } from "@/lib/access";
import { getT } from "@/lib/i18n";
import { env } from "@/lib/env";
import { Scanner } from "./scanner";

export default async function ScanPage() {
  const { t } = await getT();
  const ctx = await getProContext(await requirePage("ER"));
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("مسح رمز المريض", "Scan the patient's QR")}</h1>
        <p className="mt-1 text-navy-400">{t("بعد المسح يُحدَّد المريض تلقائياً وتُعرض كل أشعته السابقة مباشرة.", "After scanning, the patient is identified automatically and all previous imaging is shown immediately.")}</p>
      </div>
      <Scanner disabled={!ctx.verified} demo={env.demoMode} />
    </>
  );
}
