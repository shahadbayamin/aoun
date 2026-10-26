"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCcw } from "lucide-react";
import { api, Spinner, useIntervalEffect } from "@/components/client";
import { useT } from "@/components/lang";

type Qr = { payload: string; shortCode: string; expiresAt: string; svg: string };

/** Large QR with an opaque, single-use, 5-minute token. Auto-renews when it expires or is scanned. */
export function QrBlock() {
  const { t } = useT();
  const router = useRouter();
  const [qr, setQr] = useState<Qr | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const issue = useCallback(async () => {
    setErr(null);
    const r = await api<Qr>("/api/patient/qr", { body: {} });
    if (r.ok) setQr(r.data); else setErr(r.message);
  }, []);
  useEffect(() => { issue(); }, [issue]);
  useIntervalEffect(() => setNow(Date.now()), 1000);
  const left = qr ? Math.max(0, Math.floor((new Date(qr.expiresAt).getTime() - now) / 1000)) : 0;
  useEffect(() => { if (qr && left === 0) issue(); }, [qr, left, issue]);
  // Refresh the imaging history while the card is open (new scans from Hospital A appear by themselves)
  useIntervalEffect(() => router.refresh(), 5000);
  return (
    <div>
      <div className="mx-auto mt-4 aspect-square w-full max-w-[300px] rounded-2xl border border-slate-200 bg-white p-3">
        {qr ? <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" role="img" aria-label="Emergency QR code" dangerouslySetInnerHTML={{ __html: qr.svg }} data-payload={qr.payload} data-testid="qr" /> : (
          <div className="grid h-full place-items-center">{err ? <span className="text-sm text-emergency">{err}</span> : <Spinner className="h-6 w-6 text-navy-400" />}</div>
        )}
      </div>
      {qr && (
        <div className="mt-3">
          <div className="text-xs text-navy-400">{t("أو أعطِ الطبيب هذا الرمز", "Or give the doctor this code")}</div>
          <div className="ltr-nums mt-1 font-mono text-2xl font-bold tracking-[0.3em] text-navy" data-testid="short-code" dir="ltr">{qr.shortCode}</div>
        </div>
      )}
      <div className="mt-3 text-sm">
        {qr && <>{t("صالح لمدة", "Valid for")} <b className="ltr-nums">{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</b> · {t("لا يحتوي على رقم الهوية أو أي بيانات طبية", "contains no ID or medical data")}</>}
      </div>
      <button className="btn-ghost mt-2 text-xs" onClick={issue}><RefreshCcw className="h-3.5 w-3.5" />{t("رمز جديد", "New code")}</button>
    </div>
  );
}
