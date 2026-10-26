"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Building2, LogIn } from "lucide-react";
import { useT } from "@/components/lang";
import { api, Spinner } from "@/components/client";

type H = { nameAr: string; nameEn: string };

export function HospitalLogin({ a, b, next }: { a: H; b: H; next?: string }) {
  const { t, lang } = useT();
  const router = useRouter();
  const [h, setH] = useState<"A" | "B">("A");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const tabs = [
    { k: "A" as const, I: Building2, name: lang === "ar" ? a.nameAr : a.nameEn, dept: t("رفع الأشعة وعرضها", "Upload & view imaging") },
    { k: "B" as const, I: Building2, name: lang === "ar" ? b.nameAr : b.nameEn, dept: t("رفع الأشعة وعرضها", "Upload & view imaging") },
  ];
  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setErr(null);
        const r = await api<{ redirect: string }>("/api/auth/hospital/login", { body: { email, password } });
        setBusy(false);
        if (!r.ok) return setErr(r.message);
        router.push(next ?? r.data.redirect);
        router.refresh();
      }}
    >
      <div className="grid grid-cols-2 gap-2" role="tablist">
        {tabs.map(({ k, I, name, dept }) => (
          <button key={k} type="button" role="tab" aria-selected={h === k}
            className={clsx("flex flex-col items-center gap-1 rounded-2xl border-2 px-3 py-4 text-center text-sm font-semibold transition", h === k ? "border-teal bg-teal-50 text-teal-800" : "border-slate-200 text-navy-500 hover:bg-slate-50")}
            onClick={() => { setH(k); setErr(null); }}>
            <I className="h-6 w-6" />{name}<span className="text-xs font-normal opacity-80">{dept}</span>
          </button>
        ))}
      </div>
      <div>
        <label className="label" htmlFor="em">{t("البريد الإلكتروني", "Email")}</label>
        <input id="em" type="email" className="input" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
      </div>
      <div>
        <label className="label" htmlFor="pw">{t("كلمة المرور", "Password")}</label>
        <input id="pw" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
      </div>
      {err && <div className="rounded-xl bg-emergency-50 px-3 py-2 text-sm text-emergency-700" role="alert">{err}</div>}
      <button className="btn-primary btn-lg w-full" disabled={busy}>
        {busy ? <Spinner /> : <LogIn className="h-5 w-5" />}{t("دخول", "Sign in")}
      </button>
    </form>
  );
}
