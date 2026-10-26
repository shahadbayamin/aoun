"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X } from "lucide-react";
import { api, Spinner } from "@/components/client";
import { useT } from "@/components/lang";

/** The patient edits their emergency contact (name, mobile number, relationship). */
export function ContactEditor({ name, phone, relation }: { name: string; phone: string; relation: string }) {
  const { t } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name, phone, relation });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setErr(null);
    const r = await api("/api/patient/contact", { method: "PUT", body: { name: f.name, phone: f.phone, relation: f.relation || undefined } });
    setBusy(false);
    if (!r.ok) return setErr(r.message);
    setOpen(false);
    router.refresh();
  };
  return (
    <>
      <button type="button" className="btn-secondary !py-1.5 text-xs" onClick={() => setOpen(true)} data-testid="edit-contact">
        <Pencil className="h-3.5 w-3.5" />{t("تعديل جهة الاتصال", "Edit emergency contact")}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/50 sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-t-3xl bg-white shadow-xl sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-bold">{t("جهة الاتصال للطوارئ", "Emergency contact")}</h2>
              <button className="rounded-lg p-1.5 text-navy-400 hover:bg-slate-100" onClick={() => setOpen(false)} aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            <form className="space-y-4 px-5 py-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
              <div><label className="label" htmlFor="cn">{t("الاسم", "Name")}</label><input id="cn" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
              <div><label className="label" htmlFor="cp">{t("رقم الجوال", "Mobile number")}</label><input id="cp" className="input ltr-nums" inputMode="tel" maxLength={10} placeholder="05XXXXXXXX" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, "") })} required /></div>
              <div><label className="label" htmlFor="cr">{t("صلة القرابة", "Relationship")}</label><input id="cr" className="input" placeholder={t("مثال: الأب، الزوج، الأخت", "e.g. father, husband, sister")} value={f.relation} onChange={(e) => setF({ ...f, relation: e.target.value })} /></div>
              {err && <div className="rounded-xl bg-emergency-50 px-3 py-2 text-sm text-emergency-700">{err}</div>}
              <div className="flex gap-3"><button className="btn-primary flex-1" disabled={busy} data-testid="save-contact">{busy && <Spinner />}{t("حفظ", "Save")}</button><button type="button" className="btn-secondary" onClick={() => setOpen(false)}>{t("إلغاء", "Cancel")}</button></div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
