"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Spinner } from "@/components/client";
import { useT } from "@/components/lang";

/** A signed-in Hospital B doctor scanned the QR with their device: open the full record directly. */
export function DoctorOpen({ token, payload }: { token: string; payload?: string }) {
  const { t } = useT();
  const router = useRouter();
  const done = useRef(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    (async () => {
      const r = await api<{ redirect: string }>("/api/er/scan", { body: { payload: payload ?? token } });
      if (r.ok) router.replace(r.data.redirect);
      else setErr(r.message);
    })();
  }, [token, payload, router]);
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16 text-center">
      {err ? <div className="rounded-xl bg-emergency-50 px-4 py-3 text-sm text-emergency-700">{err}</div> : (
        <div><Spinner className="mx-auto h-8 w-8 text-teal" /><div className="mt-3 text-sm text-navy-500">{t("جارٍ فتح سجل المريض…", "Opening the patient record…")}</div></div>
      )}
    </div>
  );
}
