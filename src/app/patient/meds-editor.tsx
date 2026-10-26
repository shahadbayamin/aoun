"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Camera, ImagePlus, Keyboard, Pill, Plus, Trash2, X } from "lucide-react";
import { Spinner } from "@/components/client";
import { useT } from "@/components/lang";
import { MED_CATEGORIES, MED_TIMES, MED_TIMING, composeFrequency, parseFrequency } from "@/lib/health-options";

type Existing = { id: string; name: string; category: string; hasPhoto: boolean; frequency?: string };
type Row = { mode: "text" | "photo"; name: string; category: string; file: File | null; keepId: string | null; times: string; timing: string[] };

/**
 * "هل تأخذ أدوية؟" — yes/no, then each medicine in one of two ways:
 *   ✎ write the name (or choose the category when the name is unknown), or
 *   📷 attach a photo of the medicine (take one with the camera or choose from the gallery).
 */
export function MedsEditor({ takes, meds }: { takes: boolean | null; meds: Existing[] }) {
  const { t } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [yes, setYes] = useState<boolean | null>(takes);
  const empty = (): Row => ({ mode: "text", name: "", category: "", file: null, keepId: null, times: "", timing: [] });
  const [rows, setRows] = useState<Row[]>(
    meds.length ? meds.map((m) => ({ mode: m.hasPhoto ? "photo" : "text", name: m.name, category: m.category, file: null, keepId: m.hasPhoto ? m.id : null, ...parseFrequency(m.frequency) })) : [empty()],
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = async () => {
    setErr(null);
    if (yes === null) return setErr(t("اختر نعم أو لا", "Choose yes or no"));
    const fd = new FormData();
    const items = yes
      ? rows.map((r, i) => {
          if (r.file) fd.append(`photo_${i}`, r.file);
          return { name: r.name.trim(), category: r.category, frequency: composeFrequency(r.times, r.timing) || undefined, photo: r.file ? "new" : r.keepId ? `keep:${r.keepId}` : undefined };
        })
      : [];
    fd.append("data", JSON.stringify({ takes: yes, items }));
    setBusy(true);
    const res = await fetch("/api/patient/medications", { method: "PUT", body: fd });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return setErr(String(j.message ?? `HTTP ${res.status}`));
    }
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <button type="button" className="btn-secondary !py-1.5 text-xs" onClick={() => setOpen(true)} data-testid="edit-meds">
        <Pill className="h-3.5 w-3.5" />{t("تعديل الأدوية", "Edit medications")}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/50 sm:items-center" role="dialog" aria-modal="true">
          <div className="flex max-h-[92vh] w-full max-w-xl flex-col rounded-t-3xl bg-white shadow-xl sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-bold">{t("الأدوية", "Medications")}</h2>
              <button className="rounded-lg p-1.5 text-navy-400 hover:bg-slate-100" onClick={() => setOpen(false)} aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-5 overflow-y-auto px-5 py-5">
              <div>
                <div className="mb-2 font-bold">{t("هل تأخذ أدوية بشكل منتظم؟", "Do you take any medications regularly?")}</div>
                <div className="grid grid-cols-2 gap-2">
                  {[true, false].map((v) => (
                    <button key={String(v)} type="button" onClick={() => setYes(v)} aria-pressed={yes === v} data-testid={v ? "meds-yes" : "meds-no"}
                      className={clsx("rounded-xl border-2 px-3 py-3 font-semibold transition", yes === v ? "border-teal bg-teal-50 text-teal-800" : "border-slate-200 hover:bg-slate-50")}>
                      {v ? t("نعم", "Yes") : t("لا", "No")}
                    </button>
                  ))}
                </div>
              </div>
              {yes && (
                <div className="space-y-3">
                  <p className="text-sm text-navy-400">{t("أضف كل دواء بطريقة من طريقتين: اكتب الاسم (أو اختر الفئة إذا ما تعرف الاسم)، أو صوّر علبة الدواء.", "Add each medicine one of two ways: type the name (or pick the category if you don't know it), or take a photo of the box.")}</p>
                  {rows.map((r, i) => (
                    <div key={i} className="rounded-2xl border border-slate-200 p-3" data-testid="med-row">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-navy-400">{t("دواء", "Medicine")} {i + 1}</span>
                        <div className="flex items-center gap-1">
                          <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold">
                            <button type="button" onClick={() => set(i, { mode: "text" })} className={clsx("inline-flex items-center gap-1 rounded-md px-2.5 py-1.5", r.mode === "text" ? "bg-white text-teal shadow-sm" : "text-navy-500")} data-testid="med-mode-text"><Keyboard className="h-3.5 w-3.5" />{t("كتابة", "Type")}</button>
                            <button type="button" onClick={() => set(i, { mode: "photo" })} className={clsx("inline-flex items-center gap-1 rounded-md px-2.5 py-1.5", r.mode === "photo" ? "bg-white text-teal shadow-sm" : "text-navy-500")} data-testid="med-mode-photo"><Camera className="h-3.5 w-3.5" />{t("صورة", "Photo")}</button>
                          </div>
                          {rows.length > 1 && <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="rounded-lg p-1.5 text-navy-400 hover:bg-emergency-50 hover:text-emergency" aria-label={t("حذف", "Remove")}><Trash2 className="h-4 w-4" /></button>}
                        </div>
                      </div>
                      {r.mode === "text" ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <input className="input" dir="auto" value={r.name} onChange={(e) => set(i, { name: e.target.value })} placeholder={t("اسم الدواء (إن كنت تعرفه)", "Medicine name (if you know it)")} data-testid="med-name" />
                          <select className="input" value={r.category} onChange={(e) => set(i, { category: e.target.value })} data-testid="med-category">
                            <option value="">{t("فئة الدواء…", "Category…")}</option>
                            {MED_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      ) : (
                        <PhotoPicker row={r} onFile={(file) => set(i, { file, keepId: file ? null : r.keepId })} onClear={() => set(i, { file: null, keepId: null })} />
                      )}
                      <div className="mt-3 space-y-2 border-t border-slate-100 pt-3" data-testid="med-dosing">
                        <div>
                          <div className="mb-1.5 text-xs font-semibold text-navy-500">{t("كم مرة في اليوم؟", "How many times a day?")} <span className="font-normal text-navy-300">({t("اختياري", "optional")})</span></div>
                          <div className="flex flex-wrap gap-1.5">
                            {MED_TIMES.map((x) => (
                              <button key={x} type="button" aria-pressed={r.times === x} onClick={() => set(i, { times: r.times === x ? "" : x })}
                                className={clsx("rounded-full border px-3 py-1 text-xs font-semibold transition", r.times === x ? "border-teal bg-teal-50 text-teal-800" : "border-slate-200 text-navy-500 hover:bg-slate-50")} data-testid="med-times">{x}</button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="mb-1.5 text-xs font-semibold text-navy-500">{t("متى؟", "When?")} <span className="font-normal text-navy-300">({t("اختياري", "optional")})</span></div>
                          <div className="flex flex-wrap gap-1.5">
                            {MED_TIMING.map((x) => {
                              const on = r.timing.includes(x);
                              return (
                                <button key={x} type="button" aria-pressed={on} onClick={() => set(i, { timing: on ? r.timing.filter((y) => y !== x) : [...r.timing, x] })}
                                  className={clsx("rounded-full border px-3 py-1 text-xs font-semibold transition", on ? "border-teal bg-teal-50 text-teal-800" : "border-slate-200 text-navy-500 hover:bg-slate-50")} data-testid="med-timing">{x}</button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <button type="button" className="btn-secondary w-full" onClick={() => setRows([...rows, empty()])} data-testid="med-add"><Plus className="h-4 w-4" />{t("إضافة دواء آخر", "Add another medicine")}</button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 border-t border-slate-100 px-5 py-4">
              <button className="btn-primary flex-1" onClick={save} disabled={busy} data-testid="save-meds">{busy && <Spinner />}{t("حفظ", "Save")}</button>
              <button className="btn-secondary" onClick={() => setOpen(false)}>{t("إلغاء", "Cancel")}</button>
              {err && <span className="text-sm text-emergency">{err}</span>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Take a photo with the camera, or choose one from the gallery / files. */
function PhotoPicker({ row, onFile, onClear }: { row: Row; onFile: (f: File | null) => void; onClear: () => void }) {
  const { t } = useT();
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (row.file) {
      const u = URL.createObjectURL(row.file);
      setPreview(u);
      return () => URL.revokeObjectURL(u);
    }
    setPreview(row.keepId ? `/api/medications/${row.keepId}/photo` : null);
  }, [row.file, row.keepId]);
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; };
  return (
    <div className="flex items-center gap-3">
      {preview ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" className="h-20 w-20 rounded-xl border border-slate-200 object-cover" data-testid="med-photo-preview" />
          <button type="button" onClick={onClear} className="absolute -end-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-white text-navy shadow hover:text-emergency" aria-label={t("إزالة", "Remove")}><X className="h-3.5 w-3.5" /></button>
        </div>
      ) : (
        <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl border-2 border-dashed border-slate-200 text-navy-300"><Camera className="h-7 w-7" /></div>
      )}
      <div className="grid flex-1 gap-2">
        <label className="btn-secondary cursor-pointer justify-center !py-2 text-sm">
          <Camera className="h-4 w-4" />{t("التقاط صورة", "Take a photo")}
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={pick} data-testid="med-photo-camera" />
        </label>
        <label className="btn-secondary cursor-pointer justify-center !py-2 text-sm">
          <ImagePlus className="h-4 w-4" />{t("اختيار من الصور", "Choose from photos")}
          <input type="file" accept="image/*" className="sr-only" onChange={pick} data-testid="med-photo-file" />
        </label>
      </div>
    </div>
  );
}
