import Link from "next/link";
import { ShieldX } from "lucide-react";
import { requirePage, type SessionWithUser } from "@/lib/auth";
import { authorizeGrant, type Scope } from "@/lib/access";
import { ApiError } from "@/lib/errors";
import { getT } from "@/lib/i18n";

/** Server-side authorization for record pages; every allow/deny is audited by authorizeGrant. */
export async function guard(grantId: string, scope: Scope, action: string, extra?: Record<string, string>) {
  const s: SessionWithUser = await requirePage("ER");
  try {
    const r = await authorizeGrant(s, grantId, scope, action, extra);
    return { ok: true as const, s, ...r };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false as const, s, reason: String((e.extra?.reason ?? (e.extra?.reasons as string[] | undefined)?.join(", ")) ?? e.code) };
    throw e;
  }
}

export async function Denied({ reason }: { reason: string }) {
  const { t } = await getT();
  return (
    <div className="mx-auto max-w-lg py-10 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emergency-50 text-emergency"><ShieldX className="h-7 w-7" /></div>
      <h1 className="mt-4 text-xl font-bold">{t("تم رفض الوصول", "Access denied")}</h1>
      <p className="mt-2 text-sm text-navy-400">{t("لا توجد صلاحية نشطة تخوّلك الاطلاع على هذا السجل. تم تسجيل المحاولة في سجل التدقيق.", "There is no active authorization for you to view this record. The attempt has been recorded in the audit log.")}</p>
      <code className="mt-3 inline-block rounded bg-slate-100 px-2 py-1 text-xs">{reason}</code>
      <div className="mt-6"><Link href="/er" className="btn-primary">{t("مسح رمز المريض", "Scan the patient's QR")}</Link></div>
    </div>
  );
}
