"use client";
import { useState } from "react";
import Link from "next/link";
import { Search, Sparkles, SendHorizontal } from "lucide-react";
import { api, Spinner } from "@/components/client";
import { useT } from "@/components/lang";

type Match = { title: string; date: string | null; href?: string; kind?: string; body?: string };
type Res = { answer: string; ai: boolean; matches: Match[] };

/** AI assistant on the patient card: summarizes the latest data and searches inside the patient's files. */
export function Assistant({ endpoint = "/api/patient/assistant", extra = {}, self = true }: { endpoint?: string; extra?: Record<string, string>; self?: boolean }) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<"summary" | "ask" | null>(null);
  const [res, setRes] = useState<Res | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async (mode: "summary" | "ask", text?: string) => {
    setErr(null); setBusy(mode);
    const r = await api<Res>(endpoint, { body: { ...extra, mode, q: text } });
    setBusy(null);
    if (!r.ok) return setErr(r.message);
    setRes(r.data);
  };
  const chips = [t("آخر أشعة", "Latest imaging"), t("الحساسية", "Allergies"), t("الأدوية", "Medications"), self ? t("من فتح سجلي؟", "Who opened my record?") : t("من فتح السجل؟", "Who opened the record?")];
  return (
    <section className="card card-pad" data-testid="assistant">
      <h2 className="section-title flex items-center gap-2"><Sparkles className="h-5 w-5 text-teal" />{t("المساعد الذكي", "AI assistant")}</h2>
      <p className="mt-1 text-sm text-navy-400">{self ? t("يلخّص آخر بياناتك ويبحث داخل ملفاتك وتقارير الأشعة.", "Summarizes your latest data and searches your files and imaging reports.") : t("يلخّص آخر بيانات المريض ويبحث داخل ملفاته وتقارير الأشعة.", "Summarizes the patient's latest data and searches their files and imaging reports.")}</p>
      <button type="button" className="btn-primary mt-3 w-full" onClick={() => run("summary")} disabled={!!busy} data-testid="ai-summary">
        {busy === "summary" ? <Spinner /> : <Sparkles className="h-4 w-4" />}{self ? t("لخّص آخر بياناتي", "Summarize my latest data") : t("لخّص آخر بيانات المريض", "Summarize the patient's latest data")}
      </button>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (q.trim()) run("ask", q.trim()); }}>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
          <input className="input !ps-9" dir="auto" value={q} onChange={(e) => setQ(e.target.value)} placeholder={self ? t("اسأل أو ابحث في ملفاتك…", "Ask or search your files…") : t("اسأل أو ابحث في ملفات المريض…", "Ask or search the patient's files…")} data-testid="ai-q" />
        </div>
        <button className="btn-secondary !px-3" disabled={!!busy || !q.trim()} aria-label={t("بحث", "Search")} data-testid="ai-ask">{busy === "ask" ? <Spinner /> : <SendHorizontal className="h-4 w-4 rtl:rotate-180" />}</button>
      </form>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {chips.map((c) => <button key={c} type="button" className="rounded-full bg-slate-100 px-3 py-1 text-xs text-navy-500 hover:bg-teal-50 hover:text-teal" onClick={() => { setQ(c); run("ask", c); }} disabled={!!busy}>{c}</button>)}
      </div>
      {err && <div className="mt-3 rounded-xl bg-emergency-50 px-3 py-2 text-sm text-emergency-700">{err}</div>}
      {res && (
        <div className="mt-4 rounded-2xl bg-teal-50/60 p-4 text-start" data-testid="ai-answer">
          <p dir="auto" className="whitespace-pre-wrap text-sm leading-relaxed">{res.answer}</p>
          {res.matches.length > 0 && (
            <ul className="mt-3 space-y-2">
              {res.matches.map((m, i) => {
                const inner = (
                  <>
                    <div className="flex items-center justify-between gap-2 text-sm font-semibold"><span dir="auto">{m.title}</span>{m.date && <span className="shrink-0 text-xs font-normal text-navy-400">{m.date}</span>}</div>
                    {m.body && <div dir="auto" className="mt-0.5 line-clamp-2 text-xs text-navy-500">{m.body}</div>}
                  </>
                );
                return <li key={i}>{m.href ? <Link href={m.href} className="block rounded-xl bg-white px-3 py-2 hover:ring-1 hover:ring-teal">{inner}</Link> : <div className="rounded-xl bg-white px-3 py-2">{inner}</div>}</li>;
              })}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-navy-400">{self ? t("المعلومات من ملفك فقط، ولا تغني عن استشارة الطبيب.", "Information comes from your file only and does not replace your doctor's advice.") : t("المعلومات من ملف المريض فقط، ويبقى القرار للطبيب.", "Information comes from the patient's file only; clinical decisions remain the doctor's.")}</p>
        </div>
      )}
    </section>
  );
}
