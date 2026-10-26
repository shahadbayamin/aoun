import Link from "next/link";
import { getT } from "@/lib/i18n";
import { Logo } from "./Logo";
import { LangSwitch, LogoutButton } from "./client";

/** Minimal header used by every page: logo, optional portal label, language switch, sign-out. */
export async function TopBar({ label, user, portal, tone = "teal" }: { label?: string; user?: string; portal?: "PATIENT" | "RADIOLOGY" | "ER"; tone?: "teal" | "blue" | "red" }) {
  const { t } = await getT();
  const dot = { teal: "bg-teal", blue: "bg-medblue", red: "bg-emergency" }[tone];
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <Link href="/" aria-label="Aoun"><Logo size={34} /></Link>
            {label && (
              <span className="hidden items-center gap-2 border-s border-slate-200 ps-4 text-sm font-semibold text-navy-500 sm:inline-flex">
                <span className={`h-2 w-2 rounded-full ${dot}`} />{label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {user && <span className="hidden max-w-[200px] truncate px-2 text-sm text-navy-500 md:inline">{user}</span>}
            <LangSwitch />
            {portal && <LogoutButton portal={portal} />}
          </div>
        </div>
        {label && <div className="flex items-center gap-2 px-4 pb-2 text-xs font-semibold text-navy-500 sm:hidden"><span className={`h-2 w-2 rounded-full ${dot}`} />{label}</div>}
      </header>
    </>
  );
}
