import { prisma } from "./db";
import type { Lang } from "./i18n";
import { fmtDate, label, MODALITY, SEVERITY } from "./labels";

/**
 * Patient-file assistant: "what's new", an AI summary of the latest data, and search inside the
 * patient's own files. When ANTHROPIC_API_KEY is configured the answers are written by Claude from the
 * patient's data only; otherwise a built-in summary/search over the same data is used.
 */

export type FileItem = {
  kind: "study" | "condition" | "allergy" | "medication" | "profile" | "access";
  title: string;
  body?: string;
  date?: Date | null;
  href?: string;
  search: string; // normalized text used by the built-in search
};

/** Arabic-aware normalization: drop diacritics/tatweel, unify alef / ya / ta marbuta, lower-case. */
export function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");
}

const SYNONYMS: Record<string, string[]> = {
  MRI: ["رنين", "مغناطيسي", "mri", "magnetic"],
  CT: ["مقطعيه", "مقطعي", "ct", "scan", "كت"],
  XRAY: ["سينيه", "اكس", "x-ray", "xray", "عاديه"],
  ULTRASOUND: ["موجات", "صوتيه", "سونار", "التراساوند", "ultrasound", "echo"],
};

export type StudyHref = (studyId: string) => string;
const patientHref: StudyHref = (id) => `/patient/study/${id}`;

export async function loadPatientFile(patientId: string, lang: Lang, studyHref: StudyHref = patientHref) {
  const p = await prisma.patient.findUniqueOrThrow({
    where: { id: patientId },
    include: {
      profile: true,
      allergies: true,
      conditions: true,
      medications: { where: { active: true } },
      studies: { where: { status: "AVAILABLE" }, orderBy: { examDate: "desc" }, include: { sourceHospital: true, report: true, files: true } },
      grants: { orderBy: { createdAt: "desc" }, take: 20, include: { professional: true } },
    },
  });
  const ar = lang === "ar";
  const hospitals = new Map((await prisma.hospital.findMany({ select: { id: true, nameAr: true, nameEn: true } })).map((h) => [h.id, h]));
  const items: FileItem[] = [];
  for (const s of p.studies) {
    const type = label(MODALITY, s.modality, lang);
    const hosp = ar ? s.sourceHospital.nameAr : s.sourceHospital.nameEn;
    items.push({
      kind: "study",
      title: `${type}${s.bodyRegion !== "-" ? ` — ${s.bodyRegion}` : ""} · ${hosp}`,
      body: s.report?.text ?? "",
      date: s.examDate,
      href: studyHref(s.id),
      search: norm([type, MODALITY[s.modality]?.join(" "), (SYNONYMS[s.modality] ?? []).join(" "), "اشعه imaging scan", s.bodyRegion, s.sourceHospital.nameAr, s.sourceHospital.nameEn, s.report?.text ?? "", s.files.map((f) => f.fileName).join(" "), fmtDate(s.examDate, "en")].join(" ")),
    });
  }
  for (const c of p.conditions) items.push({ kind: "condition", title: c.name, date: c.createdAt, search: norm(`${c.name} مرض امراض مزمن مزمنه chronic disease condition`) });
  for (const a of p.allergies) items.push({ kind: "allergy", title: `${a.substance} · ${label(SEVERITY, a.severity, lang)}`, date: a.createdAt, search: norm(`${a.substance} حساسيه allergy allergic ${a.reaction ?? ""}`) });
  for (const m of p.medications) {
    const t = m.name ? `${m.name}${m.category ? ` · ${m.category}` : ""}` : m.category ? `${m.category} (${ar ? "الاسم غير معروف" : "name unknown"})` : ar ? "دواء (صورة)" : "Medicine (photo)";
    const tf = m.frequency ? `${t} — ${m.frequency}` : t;
    items.push({ kind: "medication", title: tf, date: m.createdAt, search: norm(`${m.name ?? ""} ${m.category ?? ""} ${m.frequency ?? ""} دواء ادويه علاج medication medicine drug ${m.dose ?? ""}`) });
  }
  if (p.profile) {
    const pr = p.profile;
    if (pr.bloodType) items.push({ kind: "profile", title: `${ar ? "فصيلة الدم" : "Blood type"}: ${pr.bloodType}`, search: norm(`فصيله الدم دم blood type ${pr.bloodType}`) });
    if (pr.emergencyContactName) items.push({ kind: "profile", title: `${ar ? "جهة الاتصال للطوارئ" : "Emergency contact"}: ${pr.emergencyContactName}${pr.emergencyContactRel ? ` (${pr.emergencyContactRel})` : ""} ${pr.emergencyContactPhone ?? ""}`, search: norm(`جهه الاتصال طوارئ اتصال رقم جوال contact emergency phone ${pr.emergencyContactName} ${pr.emergencyContactRel ?? ""} ${pr.emergencyContactPhone ?? ""}`) });
  }
  for (const g of p.grants) {
    const who = ar ? g.professional.fullNameAr : g.professional.fullNameEn;
    const h = hospitals.get(g.hospitalId);
    const hosp = h ? (ar ? h.nameAr : h.nameEn) : "";
    items.push({ kind: "access", title: `${ar ? "اطّلع على السجل" : "Opened the record"}: ${who} — ${hosp}`, date: g.createdAt, search: norm(`${who} ${hosp} ${g.professional.fullNameEn} طبيب دكتور اطلع فتح سجل وصول doctor access opened`) });
  }
  return { p, items };
}

/** The most recent activity on the patient's file (newest first). */
export async function latestActivity(patientId: string, lang: Lang, n = 5, studyHref: StudyHref = patientHref) {
  const { p, items } = await loadPatientFile(patientId, lang, studyHref);
  const ev: { kind: string; title: string; date: Date; href?: string }[] = [];
  for (const s of p.studies) ev.push({ kind: "study", title: `${lang === "ar" ? "أشعة جديدة" : "New imaging"}: ${label(MODALITY, s.modality, lang)} · ${lang === "ar" ? s.sourceHospital.nameAr : s.sourceHospital.nameEn}${s.files.length > 1 ? ` (${s.files.length} ${lang === "ar" ? "صور" : "images"})` : ""}`, date: s.syncedAt, href: studyHref(s.id) });
  for (const it of items) if (it.kind === "access" && it.date) ev.push({ kind: "access", title: it.title, date: it.date });
  if (p.profile?.updatedAt) ev.push({ kind: "profile", title: lang === "ar" ? "تحديث الملف الطبي" : "Medical profile updated", date: p.profile.updatedAt });
  ev.sort((a, b) => b.date.getTime() - a.date.getTime());
  // The same doctor opening the record several times on the same day is shown once, with a count.
  const out: (typeof ev[number] & { count?: number })[] = [];
  for (const e of ev) {
    const prev = out.find((o) => o.kind === "access" && e.kind === "access" && o.title === e.title && o.date.toDateString() === e.date.toDateString());
    if (prev) prev.count = (prev.count ?? 1) + 1;
    else out.push({ ...e });
  }
  return out.slice(0, n).map((e) => (e.count && e.count > 1 ? { ...e, title: `${e.title} (${e.count} ${lang === "ar" ? "مرات" : "times"})` } : e));
}

function contextText(file: Awaited<ReturnType<typeof loadPatientFile>>, lang: Lang) {
  const { p, items } = file;
  const lines: string[] = [];
  lines.push(`Patient: ${lang === "ar" ? p.fullNameAr : p.fullNameEn}; sex ${p.sex}; date of birth ${fmtDate(p.dateOfBirth, "en")}.`);
  lines.push(`Takes medications: ${p.profile?.takesMedications === true ? "yes" : p.profile?.takesMedications === false ? "no" : "not answered"}.`);
  for (const it of items) lines.push(`[${it.kind}] ${it.date ? fmtDate(it.date, "en") + " — " : ""}${it.title}${it.body ? ` — report: ${it.body}` : ""}`);
  return lines.join("\n");
}

async function askClaude(system: string, user: string): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30_000);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctl.signal,
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5", max_tokens: 700, system, messages: [{ role: "user", content: user }] }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { content?: { type: string; text?: string }[] };
    const text = j.content?.filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
    return text || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type Audience = "patient" | "clinician";
const SYSTEM = (lang: Lang, audience: Audience = "patient") =>
  `You are the assistant inside "Aoun", a medical-imaging card. Answer ONLY from the patient file provided. ` +
  `Never invent findings, diagnoses or advice; if something is not in the file, say it is not recorded. ` +
  (audience === "clinician"
    ? `The reader is the treating clinician: be concise and clinical, highlight allergies, medications, chronic diseases and the latest imaging reports. `
    : `Keep it short and clear for a patient. Do not give medical advice — suggest asking their doctor when relevant. `) +
  `Reply in ${lang === "ar" ? "Arabic" : "English"}, plain text, short bullet lines starting with "• ".`;

function localSummary(file: Awaited<ReturnType<typeof loadPatientFile>>, lang: Lang) {
  const { p, items } = file;
  const ar = lang === "ar";
  const list = (k: FileItem["kind"]) => items.filter((i) => i.kind === k).map((i) => i.title);
  const none = ar ? "غير مسجّل" : "not recorded";
  const out: string[] = [];
  const latest = p.studies[0];
  out.push(`• ${ar ? "عدد الأشعة" : "Imaging studies"}: ${p.studies.length}`);
  if (latest) {
    out.push(`• ${ar ? "آخر أشعة" : "Latest imaging"}: ${label(MODALITY, latest.modality, lang)} — ${ar ? latest.sourceHospital.nameAr : latest.sourceHospital.nameEn} — ${fmtDate(latest.examDate, lang)}${latest.files.length > 1 ? ` (${latest.files.length} ${ar ? "صور" : "images"})` : ""}`);
    if (latest.report?.text) out.push(`• ${ar ? "تقريرها" : "Its report"}: «${latest.report.text.slice(0, 220)}${latest.report.text.length > 220 ? "…" : ""}»`);
  }
  out.push(`• ${ar ? "فصيلة الدم" : "Blood type"}: ${p.profile?.bloodType ?? none}`);
  out.push(`• ${ar ? "الأمراض المزمنة" : "Chronic diseases"}: ${list("condition").join("، ") || none}`);
  out.push(`• ${ar ? "الحساسية" : "Allergies"}: ${list("allergy").join("، ") || none}`);
  const meds = list("medication");
  out.push(`• ${ar ? "الأدوية" : "Medications"}: ${meds.length ? meds.join("، ") : p.profile?.takesMedications === false ? (ar ? "لا يأخذ أدوية" : "none") : none}`);
  const acc = items.find((i) => i.kind === "access");
  if (acc) out.push(`• ${ar ? "آخر اطّلاع على السجل" : "Last record access"}: ${acc.title.split(": ").slice(1).join(": ")} — ${fmtDate(acc.date, lang)}`);
  return out.join("\n");
}

const STOP = new Set(["في", "عن", "من", "هل", "ما", "ماذا", "كم", "على", "الى", "الي", "اعطني", "ابحث", "ابي", "ابغا", "ابغى", "عندي", "لي", "انا", "متى", "وش", "ايش", "شو", "اخر", "احدث", "جديد", "latest", "last", "recent", "newest", "the", "a", "an", "of", "in", "my", "is", "are", "what", "when", "show", "me", "find", "search", "do", "i", "have", "about"]);

export function localSearch(items: FileItem[], q: string) {
  const tokens = norm(q)
    .split(/[^\p{L}\p{N}+-]+/u)
    .map((w) => w.replace(/^(وال|بال|فال|كال|ال|و)(?=\p{L}{3,})/u, ""))
    .filter((w) => w.length >= 2 && !STOP.has(w));
  const wantLatest = /اخر|احدث|جديد|latest|last|recent|newest/.test(norm(q));
  const scored = items
    .map((it) => ({ it, score: tokens.reduce((n, t) => n + (it.search.includes(t) ? 1 : 0), 0) }))
    .filter((x) => x.score > 0 || (tokens.length === 0 && wantLatest))
    .sort((a, b) => b.score - a.score || (b.it.date?.getTime() ?? 0) - (a.it.date?.getTime() ?? 0));
  const hits = scored.map((x) => x.it);
  if (wantLatest && scored.length) {
    // "latest …": among the best matches, the most recent one comes first
    const best = scored[0].score;
    const newest = scored.filter((x) => x.score === best).sort((a, b) => (b.it.date?.getTime() ?? 0) - (a.it.date?.getTime() ?? 0))[0].it;
    return [newest, ...hits.filter((h) => h !== newest)].slice(0, 8);
  }
  return hits.slice(0, 8);
}

export async function summarize(patientId: string, lang: Lang, studyHref: StudyHref = patientHref, audience: Audience = "patient") {
  const file = await loadPatientFile(patientId, lang, studyHref);
  const ai = await askClaude(SYSTEM(lang, audience), `${lang === "ar" ? "لخّص آخر بيانات الملف الطبي في نقاط قصيرة (الأحدث أولاً)." : "Summarize the latest data in this medical file in short points (newest first)."}\n\nPATIENT FILE:\n${contextText(file, lang)}`);
  return { answer: ai ?? localSummary(file, lang), ai: !!ai, matches: [] as { title: string; date: string | null; href?: string }[] };
}

export async function ask(patientId: string, q: string, lang: Lang, studyHref: StudyHref = patientHref, audience: Audience = "patient") {
  const file = await loadPatientFile(patientId, lang, studyHref);
  const hits = localSearch(file.items, q);
  const matches = hits.map((h) => ({ title: h.title, date: h.date ? fmtDate(h.date, lang) : null, href: h.href, kind: h.kind, body: h.body?.slice(0, 200) }));
  const ai = await askClaude(SYSTEM(lang, audience), `QUESTION: ${q}\n\nPATIENT FILE:\n${contextText(file, lang)}`);
  if (ai) return { answer: ai, ai: true, matches };
  const ar = lang === "ar";
  const answer = hits.length
    ? `${ar ? `وجدت ${hits.length} ${hits.length === 1 ? "نتيجة" : "نتائج"} في الملف:` : `Found ${hits.length} result${hits.length === 1 ? "" : "s"} in the file:`}`
    : ar ? `لم أجد شيئاً عن «${q}» في الملفات.` : `Nothing about “${q}” was found in the files.`;
  return { answer, ai: false, matches };
}
