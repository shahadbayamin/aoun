"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Send, LogIn } from "lucide-react";
import { useT } from "@/components/lang";
import { api, Spinner } from "@/components/client";
import { onlyDigits } from "@/lib/digits";


export function LoginForm() {
  const { t } = useT();
  const router = useRouter();
  const [nid, setNid] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [ch, setCh] = useState<{ challengeId: string; maskedPhone: string; devCode?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [wait, setWait] = useState(0); // seconds until "resend" is allowed
  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const send = async () => {
    setBusy(true); setErr(null);
    const r = await api<{ challengeId: string; maskedPhone: string; devCode?: string }>("/api/auth/patient/start", { body: { nationalId: nid, phone } });
    setBusy(false);
    if (!r.ok) return setErr(r.message);
    setCh(r.data);
    setCode("");
    setWait(30);
  };
  const verify = async () => {
    setBusy(true); setErr(null);
    const r = await api<{ redirect: string }>("/api/auth/patient/verify", { body: { challengeId: ch!.challengeId, code } });
    setBusy(false);
    if (!r.ok) return setErr(r.message);
    router.push(r.data.redirect);
    router.refresh();
  };

  return (
    <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); if (ch) verify(); else send(); }}>
      <div>
        <label className="label" htmlFor="nid">{t("رقم الهوية / الإقامة", "National ID / Iqama")}</label>
        <input id="nid" className="input ltr-nums" inputMode="numeric" maxLength={10} value={nid} onChange={(e) => { setNid(onlyDigits(e.target.value)); setCh(null); }} placeholder="1XXXXXXXXX" required />
      </div>
      <div>
        <label className="label" htmlFor="ph">{t("رقم الجوال", "Mobile number")}</label>
        <input id="ph" className="input ltr-nums" inputMode="tel" maxLength={10} value={phone} onChange={(e) => { setPhone(onlyDigits(e.target.value)); setCh(null); }} placeholder="05XXXXXXXX" required />
      </div>
      <div>
        <label className="label" htmlFor="code">{t("رمز التحقق", "Verification code")}</label>
        <div className="flex gap-2">
          <input id="code" className="input ltr-nums text-center tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(onlyDigits(e.target.value))} placeholder="••••••" disabled={!ch} />
          <button type="button" className="btn-secondary shrink-0" onClick={send} disabled={busy || wait > 0 || nid.length !== 10 || phone.length !== 10}>
            {busy && !ch ? <Spinner /> : <Send className="h-4 w-4" />}{ch ? (wait > 0 ? `${t("إعادة الإرسال", "Resend")} (${wait})` : t("إعادة الإرسال", "Resend")) : t("إرسال الرمز", "Send code")}
          </button>
        </div>
        {ch && <p className="hint">{t("أُرسل الرمز برسالة نصية إلى", "Code sent by SMS to")} <span className="ltr-nums">{ch.maskedPhone}</span> · {t("صالح 5 دقائق", "valid for 5 minutes")}</p>}
      </div>
      {err && <div className="rounded-xl bg-emergency-50 px-3 py-2 text-sm text-emergency-700" role="alert">{err}</div>}
      <button className="btn-primary btn-lg w-full" disabled={busy || !ch || code.length !== 6}>
        {busy && ch ? <Spinner /> : <LogIn className="h-5 w-5" />}{t("دخول", "Sign in")}
      </button>
    </form>
  );
}
