import { z } from "zod";
import { route, parseJson } from "@/lib/api";
import { requireApi } from "@/lib/auth";
import { authorizeGrant } from "@/lib/access";
import { getLang } from "@/lib/i18n";
import { rateLimit } from "@/lib/rate-limit";
import { ask, summarize } from "@/lib/assistant";

/** Assistant on the doctor's record view — only within an active grant for this patient (audited by authorizeGrant). */
const Body = z.object({ grantId: z.string().min(1).max(64), mode: z.enum(["summary", "ask"]), q: z.string().trim().max(300).optional() });

export const POST = route(async (req) => {
  const b = await parseJson(req, Body);
  const s = await requireApi("ER");
  const { grant } = await authorizeGrant(s, b.grantId, "IMAGING", "ER_ASSISTANT", { mode: b.mode });
  rateLimit(`er-assistant:${s.userId}`, 40, 60_000);
  const lang = await getLang();
  const href = (id: string) => `/er/record/${grant.id}/study/${id}`;
  return b.mode === "summary" || !b.q ? summarize(grant.patientId, lang, href, "clinician") : ask(grant.patientId, b.q, lang, href, "clinician");
});
