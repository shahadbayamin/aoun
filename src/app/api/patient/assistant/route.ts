import { z } from "zod";
import { route, parseJson } from "@/lib/api";
import { patientCtx } from "@/lib/portal-ctx";
import { getLang } from "@/lib/i18n";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { ask, summarize } from "@/lib/assistant";

/** Patient-file assistant: summary of the latest data, or a question / search inside the patient's own files. */
const Body = z.object({ mode: z.enum(["summary", "ask"]), q: z.string().trim().max(300).optional() });

export const POST = route(async (req) => {
  const b = await parseJson(req, Body);
  const { patient, actor } = await patientCtx();
  rateLimit(`assistant:${patient.id}`, 30, 60_000);
  const lang = await getLang();
  const r = b.mode === "summary" || !b.q ? await summarize(patient.id, lang) : await ask(patient.id, b.q, lang);
  await audit({ actor, action: "PATIENT_ASSISTANT", patientId: patient.id, details: { mode: b.mode, ai: r.ai } });
  return r;
});
