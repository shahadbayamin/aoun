import Link from "next/link";
import { clsx } from "clsx";
import type { T } from "@/lib/i18n";

export function PageHeader({ title, subtitle, actions, badge }: { title: string; subtitle?: string; actions?: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold sm:text-[28px]">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="mt-1.5 max-w-3xl text-sm text-navy-400 sm:text-base">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className, title, action, id }: { children: React.ReactNode; className?: string; title?: React.ReactNode; action?: React.ReactNode; id?: string }) {
  return (
    <section id={id} className={clsx("card", className)}>
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
          <h2 className="section-title">{title}</h2>
          {action}
        </div>
      )}
      <div className="card-pad">{children}</div>
    </section>
  );
}

const TONES = {
  teal: "bg-teal-50 text-teal-700 ring-1 ring-teal-100",
  blue: "bg-medblue-50 text-medblue-700 ring-1 ring-medblue-100",
  red: "bg-emergency-50 text-emergency-700 ring-1 ring-emergency-100",
  amber: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  green: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  gray: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  navy: "bg-navy text-white",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "gray", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={clsx("badge", TONES[tone], className)}>{children}</span>;
}

export function Stat({ label, value, hint, tone = "teal", icon }: { label: string; value: React.ReactNode; hint?: string; tone?: "teal" | "blue" | "red" | "navy"; icon?: React.ReactNode }) {
  const ring = { teal: "bg-teal-50 text-teal", blue: "bg-medblue-50 text-medblue", red: "bg-emergency-50 text-emergency", navy: "bg-slate-100 text-navy" }[tone];
  return (
    <div className="card card-pad flex items-start gap-4">
      {icon && <div className={clsx("grid h-11 w-11 shrink-0 place-items-center rounded-xl", ring)}>{icon}</div>}
      <div className="min-w-0">
        <div className="text-sm text-navy-400">{label}</div>
        <div className="mt-0.5 text-2xl font-bold">{value}</div>
        {hint && <div className="mt-0.5 text-xs text-navy-400">{hint}</div>}
      </div>
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-10 text-center">
      <div className="font-semibold text-navy-700">{title}</div>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-navy-400">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Alert({ tone = "blue", title, children }: { tone?: "blue" | "red" | "amber" | "green" | "teal"; title?: string; children?: React.ReactNode }) {
  const c = {
    blue: "border-medblue-100 bg-medblue-50 text-medblue-700",
    red: "border-emergency-100 bg-emergency-50 text-emergency-700",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    teal: "border-teal-100 bg-teal-50 text-teal-800",
  }[tone];
  return (
    <div className={clsx("rounded-xl border px-4 py-3 text-sm", c)} role={tone === "red" ? "alert" : "status"}>
      {title && <div className="font-semibold">{title}</div>}
      {children && <div className={clsx(title && "mt-0.5")}>{children}</div>}
    </div>
  );
}


export function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2.5 last:border-0">
      <dt className="text-sm text-navy-400">{k}</dt>
      <dd className="text-end text-sm font-medium">{v}</dd>
    </div>
  );
}

export function LinkCard({ href, title, desc, icon }: { href: string; title: string; desc?: string; icon?: React.ReactNode }) {
  return (
    <Link href={href} className="card card-pad group flex items-start gap-4 transition hover:-translate-y-0.5 hover:border-teal-200">
      {icon && <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal">{icon}</div>}
      <div>
        <div className="font-semibold group-hover:text-teal">{title}</div>
        {desc && <div className="mt-0.5 text-sm text-navy-400">{desc}</div>}
      </div>
    </Link>
  );
}

export function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="-mx-5 overflow-x-auto sm:-mx-6">{children}</div>;
}
