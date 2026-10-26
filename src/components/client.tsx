"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Languages, LogOut, Loader2 } from "lucide-react";
import { useT } from "./lang";

export type ApiResult<T = Record<string, unknown>> = { ok: true; data: T } | { ok: false; status: number; error: string; message: string; data?: Record<string, unknown> };

export async function api<T = Record<string, unknown>>(url: string, init?: { method?: string; body?: unknown; form?: FormData }): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: init?.method ?? (init?.body || init?.form ? "POST" : "GET"),
      headers: init?.form ? undefined : { "content-type": "application/json" },
      body: init?.form ?? (init?.body !== undefined ? JSON.stringify(init.body) : undefined),
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const issues = (json.issues as { message: string }[] | undefined)?.map((i) => i.message).join(" · ");
      return { ok: false, status: res.status, error: json.error ?? "ERROR", message: issues || json.message || `HTTP ${res.status}`, data: json };
    }
    return { ok: true, data: json as T };
  } catch (e) {
    return { ok: false, status: 0, error: "NETWORK", message: (e as Error).message };
  }
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return <Loader2 className={`${className} animate-spin`} aria-hidden="true" />;
}

export function LangSwitch({ className = "" }: { className?: string }) {
  const { lang } = useT();
  const router = useRouter();
  return (
    <button
      type="button"
      className={`btn-ghost !px-3 ${className}`}
      onClick={async () => {
        await api("/api/lang", { body: { lang: lang === "ar" ? "en" : "ar" } });
        router.refresh();
      }}
      aria-label="Switch language / تغيير اللغة"
    >
      <Languages className="h-4 w-4" />
      {lang === "ar" ? "English" : "العربية"}
    </button>
  );
}

export function LogoutButton({ portal, className = "" }: { portal: "PATIENT" | "RADIOLOGY" | "ER" | "ADMIN"; className?: string }) {
  const { t } = useT();
  const router = useRouter();
  return (
    <button
      type="button"
      className={className || "btn-ghost !px-3"}
      onClick={async () => {
        const r = await api<{ redirect: string }>("/api/auth/logout", { body: { portal } });
        router.push(r.ok ? r.data.redirect : "/");
        router.refresh();
      }}
    >
      <LogOut className="h-4 w-4" />
      {t("تسجيل الخروج", "Sign out")}
    </button>
  );
}

/** Button that POSTs to an endpoint then refreshes the page (optionally confirm first). */
export function ActionButton({
  url,
  body,
  method,
  children,
  className = "btn-secondary",
  confirmText,
  onDone,
}: {
  url: string;
  body?: unknown;
  method?: string;
  children: React.ReactNode;
  className?: string;
  confirmText?: string;
  onDone?: (data: Record<string, unknown>) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        className={className}
        disabled={busy}
        onClick={async () => {
          if (confirmText && !window.confirm(confirmText)) return;
          setBusy(true);
          setErr(null);
          const r = await api(url, { method: method ?? "POST", body: body ?? {} });
          setBusy(false);
          if (!r.ok) return setErr(r.message);
          onDone?.(r.data);
          router.refresh();
        }}
      >
        {busy && <Spinner />}
        {children}
      </button>
      {err && <span className="text-xs text-emergency">{err}</span>}
    </span>
  );
}

export function AutoRefresh({ ms = 4000 }: { ms?: number }) {
  const router = useRouter();
  useIntervalEffect(() => router.refresh(), ms);
  return null;
}

import { useEffect, useRef } from "react";
export function useIntervalEffect(fn: () => void, ms: number) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const id = setInterval(() => ref.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}
