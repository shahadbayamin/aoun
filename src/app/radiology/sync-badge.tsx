"use client";
import { CheckCircle2, Clock, Loader2, RotateCcw, ShieldAlert, XCircle, FilePen } from "lucide-react";
import { useT } from "@/components/lang";

const MAP: Record<string, { ar: string; en: string; cls: string; I: typeof Clock; spin?: boolean }> = {
  DRAFT: { ar: "مسودة", en: "Draft", cls: "bg-slate-100 text-slate-600", I: FilePen },
  PENDING: { ar: "قيد الانتظار", en: "Pending", cls: "bg-slate-100 text-slate-700", I: Clock },
  SENDING: { ar: "جارٍ الإرسال", en: "Sending", cls: "bg-medblue-50 text-medblue-700", I: Loader2, spin: true },
  SYNCED: { ar: "تمت المزامنة", en: "Synced", cls: "bg-emerald-50 text-emerald-700", I: CheckCircle2 },
  RETRY: { ar: "إعادة المحاولة", en: "Retry", cls: "bg-amber-50 text-amber-800", I: RotateCcw },
  FAILED: { ar: "فشلت", en: "Failed", cls: "bg-emergency-50 text-emergency-700", I: XCircle },
  QUARANTINED: { ar: "معزولة للمطابقة", en: "Quarantined", cls: "bg-amber-50 text-amber-800", I: ShieldAlert },
};

export function SyncBadge({ status }: { status: string }) {
  const { t } = useT();
  const m = MAP[status] ?? MAP.PENDING;
  return (
    <span className={`badge ${m.cls}`}>
      <m.I className={`h-3.5 w-3.5 ${m.spin ? "animate-spin" : ""}`} />
      {t(m.ar, m.en)}
    </span>
  );
}
