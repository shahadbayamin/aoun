import { Camera } from "lucide-react";

type Med = { id: string; name: string | null; category: string | null; photoKey?: string | null; dose?: string | null; frequency?: string | null };
type T = (ar: string, en: string) => string;

/** Medications as the patient entered them: name, category (if the name is unknown) and/or a photo. */
export function MedList({ meds, t, photoQuery = "", className = "" }: { meds: Med[]; t: T; photoQuery?: string; className?: string }) {
  return (
    <ul className={`space-y-2 ${className}`} data-testid="meds">
      {meds.map((m) => (
        <li key={m.id} className="flex items-center justify-end gap-3 text-start">
          <span className="min-w-0">
            {m.name ? <b>{m.name}</b> : m.category ? <b>{m.category}</b> : <b>{t("دواء (صورة)", "Medicine (photo)")}</b>}
            {m.name && m.category && <span className="font-normal text-navy-400"> · {m.category}</span>}
            {!m.name && m.category && <span className="font-normal text-navy-400"> ({t("الاسم غير معروف", "name unknown")})</span>}
            {m.dose && <span className="font-normal text-navy-400"> · {m.dose}</span>}
            {m.frequency && <span className="mt-0.5 block text-xs font-normal text-teal-700" data-testid="med-frequency">🕒 {m.frequency}</span>}
          </span>
          {m.photoKey && (
            <a href={`/api/medications/${m.id}/photo${photoQuery}`} target="_blank" rel="noreferrer" className="relative shrink-0" title={t("صورة الدواء", "Medicine photo")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/medications/${m.id}/photo${photoQuery}`} alt={t("صورة الدواء", "Medicine photo")} className="h-12 w-12 rounded-lg border border-slate-200 object-cover" />
              <Camera className="absolute -bottom-1 -end-1 h-4 w-4 rounded-full bg-white p-0.5 text-teal shadow" />
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
