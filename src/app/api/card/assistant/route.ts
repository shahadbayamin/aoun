import { z } from "zod";
import { route, parseJson } from "@/lib/api";
import { getLang } from "@/lib/i18n";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { unauthorized } from "@/lib/errors";
import { cardSession } from "@/lib/card-access";
import { ask, summarize } from "@/lib/assistant";

/** Assistant on the card opened from the QR link (valid code only). */
const Body = z.object({ token: z.string().min(20).max(64), mode: z.enum(["summary", "ask"]), q: z.string().trim().max(300).optional() });

export const POST = route(async (req) => {
  const b = await parseJson(req, Body);
  const qr = await cardSession(b.token);
  if (!qr) throw unauthorized("انتهت صلاحية الرمز / The code has expired");
  rateLimit(`card-assistant:${qr.id}`, 30, 60_000);
  const lang = await getLang();
  const href = (id: string) => `/c/${b.token}/study/${id}`;
  const r = b.mode === "summary" || !b.q ? await summarize(qr.patientId, lang, href, "clinician") : await ask(qr.patientId, b.q, lang, href, "clinician");
  await audit({ actor: { label: "qr-link-viewer", role: "PUBLIC" }, action: "QR_CARD_ASSISTANT", patientId: qr.patientId, resourceType: "QrSession", resourceId: qr.id, details: { mode: b.mode, ai: r.ai } });
  return r;
});
