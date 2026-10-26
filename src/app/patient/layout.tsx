import { requirePage } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { TopBar } from "@/components/TopBar";

export const dynamic = "force-dynamic";

export default async function L({ children }: { children: React.ReactNode }) {
  const s = await requirePage("PATIENT");
  const { t } = await getT();
  return (
    <div className="min-h-screen">
      <TopBar label={t("بطاقتي الطبية", "My medical card")} portal="PATIENT" user={s.user.displayName} />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
