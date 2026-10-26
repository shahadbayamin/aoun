"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Check, Pencil, X } from "lucide-react";
import { api, Spinner } from "@/components/client";
import { useT } from "@/components/lang";
import { ALLERGY_OPTIONS, CHRONIC_OPTIONS } from "@/lib/health-options";

function Group({ title, options, selected, setSelected, other, setOther }: {
  title: string; options: readonly string[]; selected: Set<string>; setSelected: (s: Set<string>) => void; other: string; setOther: (v: string) => void;
}) {
  const { t } = useT();
  const [otherOn, setOtherOn] = useState(other.trim().length > 0);
  const toggle = (o: string) => { const n = new Set(selected); n.has(o) ? n.delete(o) : n.add(o); setSelected(n); };
  return (
    <fieldset>
      <legend className="mb-3 text-base font-bold">{title}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => {
          const on = selected.has(o);
          return (
            <button key={o} type="button" onClick={() => toggle(o)} aria-pressed={on}
              className={clsx("flex items-center gap-3 rounded-xl border px-3 py-2.5 text-start text-sm transition", on ? "border-teal bg-teal-50 font-semibold text-teal-800" : "border-slate-200 hover:bg-slate-50")}>
              <span className={clsx("grid h-5 w-5 shrink-0 place-items-center rounded-md border", on ? "border-teal bg-teal text-white" : "border-slate-300")}>{on && <Check className="h-3.5 w-3.5" />}</span>
              {o}
            </button>
          );
        })}
        <button type="button" onClick={() => setOtherOn(!otherOn)} aria-pressed={otherOn}
          className={clsx("flex items-center gap-3 rounded-xl border px-3 py-2.5 text-start text-sm transition", otherOn ? "border-teal bg-teal-50 font-semibold text-teal-800" : "border-slate-200 hover:bg-slate-50")}>
          <span className={clsx("grid h-5 w-5 shrink-0 place-items-center rounded-md border", otherOn ? "border-teal bg-teal text-white" : "border-slate-300")}>{otherOn && <Check className="h-3.5 w-3.5" />}</span>
          {t("غير ذلك...", "Other...")}
        </button>
      </div>
      {otherOn && (
        <input className="input mt-2" value={other} onChange={(e) => setOther(e.target.value)} placeholder={t("اكتب، وافصل بين أكثر من عنصر بفاصلة", "Type; separate several items with commas")} />
      )}
    </fieldset>
  );
}

/** Patient picks chronic diseases and allergies from the fixed lists (+ other). */
export function HealthEditor({ conditions, allergies }: { conditions: string[]; allergies: string[] }) {
  const { t } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const split = (all: string[], opts: readonly string[]) => [new Set(all.filter((x) => opts.includes(x))), all.filter((x) => !opts.includes(x)).join("، ")] as const;
  const [c0, co0] = split(conditions, CHRONIC_OPTIONS);
  const [a0, ao0] = split(allergies, ALLERGY_OPTIONS);
  const [cSel, setCSel] = useState<Set<string>>(c0);
  const [aSel, setASel] = useState<Set<string>>(a0);
  const [cOther, setCOther] = useState(co0);
  const [aOther, setAOther] = useState(ao0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const parts = (s: string) => s.split(/[,،\n]/).map((x) => x.trim()).filter((x) => x.length >= 2);

  const save = async () => {
    setBusy(true); setErr(null);
    const r = await api("/api/patient/health", { method: "PUT", body: { conditions: [...cSel, ...parts(cOther)], allergies: [...aSel, ...parts(aOther)] } });
    setBusy(false);
    if (!r.ok) return setErr(r.message);
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <button type="button" className="btn-secondary !py-1.5 text-xs" onClick={() => setOpen(true)} data-testid="edit-health">
        <Pencil className="h-3.5 w-3.5" />{t("تعديل الأمراض والحساسية", "Edit diseases & allergies")}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/50 sm:items-center" role="dialog" aria-modal="true">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-3xl bg-white shadow-xl sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-bold">{t("الأمراض المزمنة والحساسية", "Chronic diseases & allergies")}</h2>
              <button className="rounded-lg p-1.5 text-navy-400 hover:bg-slate-100" onClick={() => setOpen(false)} aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-7 overflow-y-auto px-5 py-5">
              <Group title={t("الأمراض المزمنة", "Chronic diseases")} options={CHRONIC_OPTIONS} selected={cSel} setSelected={setCSel} other={cOther} setOther={setCOther} />
              <Group title={t("الحساسية", "Allergies")} options={ALLERGY_OPTIONS} selected={aSel} setSelected={setASel} other={aOther} setOther={setAOther} />
            </div>
            <div className="flex items-center gap-3 border-t border-slate-100 px-5 py-4">
              <button className="btn-primary flex-1" onClick={save} disabled={busy} data-testid="save-health">{busy && <Spinner />}{t("حفظ", "Save")}</button>
              <button className="btn-secondary" onClick={() => setOpen(false)}>{t("إلغاء", "Cancel")}</button>
              {err && <span className="text-sm text-emergency">{err}</span>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
