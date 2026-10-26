import { TopBar } from "@/components/TopBar";
import { getT } from "@/lib/i18n";

export default async function L({ children }: { children: React.ReactNode }) {
  const { t } = await getT();
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar />
      <main className="flex flex-1 flex-col">{children}</main>
      <footer className="border-t border-slate-200 bg-white px-4 py-6 text-center text-xs text-navy-400">
        {t("© عون — منصة موحدة لمشاركة الأشعة الطبية بين المستشفيات", "© Aoun — unified medical imaging sharing between hospitals")}
      </footer>
    </div>
  );
}
