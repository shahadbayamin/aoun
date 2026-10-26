"use client";
import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { api, Spinner } from "@/components/client";
import { useT } from "@/components/lang";

/** "Add to Apple Wallet" / "Add to Google Wallet": the card with a permanent QR lives in the phone's wallet. */
export function WalletButtons() {
  const { t } = useT();
  const [cfg, setCfg] = useState<{ apple: boolean; google: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/patient/wallet").then((r) => r.json()).then(setCfg).catch(() => setCfg({ apple: false, google: false }));
  }, []);
  const notReady = (which: string) =>
    setMsg(t(`${which} غير مفعّل بعد على هذا الخادم. يحتاج مسؤول عون يضيف بيانات ${which} (الخطوات في «طريقة التشغيل»).`, `${which} isn't set up on this server yet. The Aoun admin needs to add the ${which} credentials (steps in the setup guide).`));

  const google = async () => {
    setMsg(null);
    if (!cfg?.google) return notReady("Google Wallet");
    setBusy(true);
    const r = await api<{ url: string }>("/api/patient/wallet/google", { body: {} });
    setBusy(false);
    if (r.ok) window.location.href = r.data.url; else setMsg(r.message);
  };
  const apple = () => {
    setMsg(null);
    if (!cfg?.apple) return notReady("Apple Wallet");
    window.location.href = "/api/patient/wallet/apple";
  };

  return (
    <div className="mt-5 border-t border-slate-100 pt-4" data-testid="wallet">
      <div className="mb-1 flex items-center justify-center gap-1.5 font-bold"><Wallet className="h-4 w-4 text-teal" />{t("احفظ البطاقة في جوالك", "Save the card to your phone")}</div>
      <p className="mb-3 text-xs text-navy-400">{t("تنحفظ البطاقة مع الباركود في المحفظة، وما تحتاج تدخل الموقع. الطبيب يمسح الباركود ويسجّل دخوله ليفتح ملفك.", "The card and its barcode are saved in your wallet, no need to open the site. The doctor scans it and signs in to open your file.")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={apple} className="inline-flex items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-black/85" data-testid="wallet-apple">
          <Wallet className="h-4 w-4" />{t("إضافة إلى Apple Wallet", "Add to Apple Wallet")}
        </button>
        <button type="button" onClick={google} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-navy bg-white px-4 py-2.5 text-sm font-semibold text-navy hover:bg-slate-50" data-testid="wallet-google">
          {busy ? <Spinner /> : <Wallet className="h-4 w-4" />}{t("إضافة إلى Google Wallet", "Add to Google Wallet")}
        </button>
      </div>
      {msg && <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-start text-xs text-amber-800" role="status" data-testid="wallet-msg">{msg}</div>}
    </div>
  );
}
