import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { route } from "@/lib/api";
import { patientCtx } from "@/lib/portal-ctx";
import { audit } from "@/lib/audit";
import { storage } from "@/lib/storage";
import { badRequest } from "@/lib/errors";

/**
 * "هل تأخذ أدوية؟" — the patient answers yes / no and lists each medicine in one of two ways:
 *   1) by name, or by category when the name is unknown (e.g. "أدوية الضغط");
 *   2) by attaching a photo of the medicine box (camera or gallery).
 * Accepts JSON (no photos) or multipart: field "data" = JSON, files "photo_<i>" for item i.
 */
const Item = z.object({
  name: z.string().trim().max(120).optional(),
  category: z.string().trim().max(80).optional(),
  frequency: z.string().trim().max(120).optional(), // e.g. "مرتين في اليوم · صباحاً، مساءً" (optional)
  photo: z.string().max(80).optional(), // "new" → file photo_<i>; "keep:<medicationId>" → keep the existing photo
});
const Body = z.object({ takes: z.boolean(), items: z.array(Item).max(30) });
const MAX_PHOTO = 10 * 1024 * 1024;

function sniffImage(b: Buffer): string | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (b.length > 12 && b.subarray(4, 8).toString("latin1") === "ftyp" && /^(heic|heix|mif1|heis)$/.test(b.subarray(8, 12).toString("latin1"))) return "image/heic";
  return null;
}

export const PUT = route(async (req) => {
  const { patient, actor } = await patientCtx();
  const isForm = (req.headers.get("content-type") ?? "").includes("multipart/form-data");
  let raw: unknown;
  let form: FormData | null = null;
  if (isForm) {
    if (Number(req.headers.get("content-length") || 0) > 31 * MAX_PHOTO) throw badRequest("الصور كبيرة جداً / Photos too large");
    form = await req.formData();
    try { raw = JSON.parse(String(form.get("data") ?? "{}")); } catch { throw badRequest("Invalid data"); }
  } else {
    raw = await req.json().catch(() => ({}));
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) throw badRequest("Invalid medications data");
  const b = parsed.data;

  const existing = await prisma.medication.findMany({ where: { patientId: patient.id } });
  const items: { name: string | null; category: string | null; frequency: string | null; photoKey: string | null; photoMime: string | null }[] = [];
  const newKeys: string[] = [];
  if (b.takes) {
    for (const [i, it] of b.items.entries()) {
      let photoKey: string | null = null, photoMime: string | null = null;
      if (it.photo === "new" && form) {
        const f = form.get(`photo_${i}`);
        if (f instanceof File && f.size > 0) {
          if (f.size > MAX_PHOTO) throw badRequest("حجم الصورة كبير (الحد 10 ميجا) / Photo too large (max 10 MB)");
          const buf = Buffer.from(await f.arrayBuffer());
          const mime = sniffImage(buf);
          if (!mime) throw badRequest("ارفع صورة (JPG أو PNG) / Upload a photo (JPG or PNG)");
          photoKey = `patients/${patient.id}/medications/${crypto.randomUUID()}`;
          await storage.put(photoKey, buf);
          newKeys.push(photoKey);
          photoMime = mime;
        }
      } else if (it.photo?.startsWith("keep:")) {
        const old = existing.find((m) => m.id === it.photo!.slice(5) && m.photoKey);
        if (old) { photoKey = old.photoKey; photoMime = old.photoMime; }
      }
      const name = it.name || null, category = it.category || null;
      if (name || category || photoKey) items.push({ name, category, frequency: it.frequency || null, photoKey, photoMime });
    }
    if (items.length === 0) throw badRequest("أضف دواءً واحداً على الأقل (الاسم أو الفئة أو صورة) / Add at least one medicine (name, category or photo)");
  }

  await prisma.$transaction([
    prisma.medicalProfile.upsert({ where: { patientId: patient.id }, create: { patientId: patient.id, takesMedications: b.takes }, update: { takesMedications: b.takes } }),
    prisma.medication.deleteMany({ where: { patientId: patient.id } }),
    prisma.medication.createMany({ data: items.map((i) => ({ patientId: patient.id, ...i, source: "SELF_REPORTED" as const })) }),
  ]);
  // Remove photos that are no longer used
  const kept = new Set(items.map((i) => i.photoKey).filter(Boolean));
  for (const m of existing) if (m.photoKey && !kept.has(m.photoKey)) await storage.remove(m.photoKey).catch(() => {});

  await audit({ actor, action: "PATIENT_MEDICATIONS_UPDATED", patientId: patient.id, details: { takes: b.takes, count: items.length, photos: items.filter((i) => i.photoKey).length } });
  return { ok: true };
});
