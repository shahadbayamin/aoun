import Link from "next/link";
import { Building2, CalendarDays, Clock, Eye, FileScan, HeartPulse } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import { fmtDate, label, MODALITY } from "@/lib/labels";

type T = (ar: string, en: string) => string;
type Ev = { kind: string; title: string; date: Date; href?: string };

/** "الأحدث" — the most recent activity on the patient's file. */
export function LatestPanel({ latest, t, lang }: { latest: Ev[]; t: T; lang: Lang }) {
  return (
    <section className="card card-pad" data-testid="latest">
      <h2 className="section-title flex items-center gap-2"><Clock className="h-5 w-5 text-teal" />{t("الأحدث", "Latest")}</h2>
      {latest.length === 0 ? <p className="mt-2 text-sm text-navy-400">{t("لا يوجد نشاط بعد.", "No activity yet.")}</p> : (
        <ul className="mt-3 space-y-3">
          {latest.map((e, i) => {
            const I = e.kind === "study" ? FileScan : e.kind === "access" ? Eye : HeartPulse;
            const body = (
              <span className="flex items-start gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal"><I className="h-4 w-4" /></span>
                <span className="min-w-0"><span className="block text-sm font-semibold" dir="auto">{e.title}</span><span className="block text-xs text-navy-400">{fmtDate(e.date, lang, true)}</span></span>
              </span>
            );
            return <li key={i}>{e.href ? <Link href={e.href} className="block rounded-xl hover:bg-slate-50">{body}</Link> : body}</li>;
          })}
        </ul>
      )}
    </section>
  );
}

type Study = { id: string; modality: string; bodyRegion: string; examDate: Date; sourceHospital: { nameAr: string; nameEn: string }; files: { id: string }[] };

/** "سجل الأشعة" — every imaging study, each opening the multi-image viewer. */
export function ImagingHistory({ studies, href, t, lang }: { studies: Study[]; href: (id: string) => string; t: T; lang: Lang }) {
  return (
    <section className="card card-pad">
      <h2 className="section-title">{t("سجل الأشعة", "Imaging history")}</h2>
      {studies.length === 0 ? (
        <p className="mt-3 text-sm text-navy-400">{t("لا توجد أشعة بعد. ستظهر هنا تلقائياً بعد رفعها في المستشفى.", "No imaging yet. Scans appear here automatically once uploaded at a hospital.")}</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100" data-testid="patient-studies">
          {studies.map((st) => (
            <li key={st.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-50 text-teal"><FileScan className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{label(MODALITY, st.modality, lang)}{st.bodyRegion !== "-" ? ` — ${st.bodyRegion}` : ""}</div>
                <div className="flex flex-wrap gap-x-4 text-xs text-navy-400">
                  <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{lang === "ar" ? st.sourceHospital.nameAr : st.sourceHospital.nameEn}</span>
                  <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{fmtDate(st.examDate, lang)}</span>
                </div>
              </div>
              {st.files[0] && <Link href={href(st.id)} className="btn-secondary !px-3 !py-1.5 text-xs"><Eye className="h-3.5 w-3.5" />{t("عرض", "View")}{st.files.length > 1 && <span className="text-navy-400"> ({st.files.length})</span>}</Link>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
