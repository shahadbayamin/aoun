import Link from "next/link";
import { getT } from "@/lib/i18n";

export default async function NotFound() {
  const { t } = await getT();
  return (
    <div className="grid min-h-[60vh] place-items-center px-4 text-center">
      <div>
        <div className="text-5xl font-bold text-teal">404</div>
        <p className="mt-2 text-navy-500">{t("الصفحة غير موجودة أو لا تملك صلاحية الوصول إليها.", "Page not found, or you are not authorized to view it.")}</p>
        <Link href="/" className="btn-primary mt-5">{t("الرئيسية", "Home")}</Link>
      </div>
    </div>
  );
}
