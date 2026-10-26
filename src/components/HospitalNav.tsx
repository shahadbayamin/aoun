"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { CloudUpload, ScanLine } from "lucide-react";
import { useT } from "./lang";

/** Every hospital both uploads imaging and receives/views it: one switch between the two tasks. */
export function HospitalNav() {
  const { t } = useT();
  const path = usePathname();
  const tabs = [
    { href: "/radiology", I: CloudUpload, label: t("رفع الأشعة", "Upload imaging"), on: path.startsWith("/radiology") },
    { href: "/er", I: ScanLine, label: t("فتح ملف المريض عن طريق مسح البطاقة", "Open the patient file by scanning the card"), on: path.startsWith("/er") },
  ];
  return (
    <nav className="border-b border-slate-200/70 bg-white">
      <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6" data-testid="hospital-nav">
        {tabs.map(({ href, I, label, on }) => (
          <Link key={href} href={href} className={clsx("inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold transition", on ? "border-teal text-teal" : "border-transparent text-navy-400 hover:text-navy")}>
            <I className="h-4 w-4" />{label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
