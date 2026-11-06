"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FilePen, X } from "lucide-react";
import { api, Spinner } from "@/components/client";
import { useT } from "@/components/lang";

/** «تعديل التقرير» — opens the uploaded report in a dialog so its author can correct it. */
export function ReportEditor({ studyId, reportText, patientName }: { studyId: string; reportText: string; patientName: string }) {
  const { t } = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(reportText);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy]);

  const start = () => { setText(reportText); setErr(null); setOpen(true); };

  const save = async () => {
    setErr(null);
    if (text.trim().length < 10) return setErr(t("اكتب تقريراً مختصراً (10 أحرف على الأقل)", "Write a short report (at least 10 characters)"));
    setBusy(true);
    const r = await api(`/api/radiology/studies/${studyId}/report`, { method: "PUT", body: { reportText: text } });
    setBusy(false);
    if (!r.ok) return setErr(r.message);
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <button type="button" className="btn-ghost !px-2 !py-1 text-xs !text-medblue" onClick={start} data-testid={`edit-report-${studyId}`}>
        <FilePen className="h-3.5 w-3.5" />{t("تعديل التقرير", "Edit report")}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-navy/40 p-4" role="dialog" aria-modal="true" aria-labelledby={`rep-title-${studyId}`} onClick={() => !busy && setOpen(false)}>
          <div className="card w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <h2 id={`rep-title-${studyId}`} className="section-title">{t("تعديل تقرير الأشعة", "Edit radiology report")}</h2>
                <p className="mt-0.5 truncate text-sm text-navy-400">{patientName}</p>
              </div>
              <button type="button" className="btn-ghost !px-2" onClick={() => setOpen(false)} disabled={busy} aria-label={t("إغلاق", "Close")}><X className="h-5 w-5" /></button>
            </div>
            <div className="card-pad space-y-4">
              <textarea
                className="input min-h-[320px] text-sm leading-relaxed"
                dir="auto"
                value={text}
                maxLength={5000}
                disabled={busy}
                autoFocus
                onChange={(e) => setText(e.target.value)}
                data-testid="edit-report-text"
              />
              <p className="text-xs text-navy-400">{t("يظهر التقرير المعدّل للمريض وللأطباء مباشرة بعد الحفظ، مع وقت التعديل.", "The corrected report is shown to the patient and doctors right after saving, with the time it was edited.")}</p>
              {err && <div className="rounded-xl bg-emergency-50 px-3 py-2 text-sm text-emergency-700" role="alert">{err}</div>}
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className="btn-secondary" onClick={() => setOpen(false)} disabled={busy}>{t("إلغاء", "Cancel")}</button>
                <button type="button" className="btn-primary" onClick={save} disabled={busy || text.trim() === reportText.trim()} data-testid="edit-report-save">
                  {busy ? <Spinner className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}{t("حفظ التعديل", "Save changes")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
