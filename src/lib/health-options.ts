/** Fixed option lists shown to the patient (Arabic, as specified). "غير ذلك" is entered as free text. */
export const CHRONIC_OPTIONS = [
  "داء السكري",
  "ارتفاع ضغط الدم",
  "ارتفاع الكوليسترول",
  "انخفاض في الغدة الدرقية",
  "أمراض القلب والشرايين",
  "أمراض السرطان",
  "أمراض الجهاز التنفسي والربو",
  "السمنة وزيادة الوزن",
  "الفشل الكلوي / مرض الكلى المزمن",
] as const;

export const ALLERGY_OPTIONS = [
  "البيض",
  "الحليب ومنتجات الألبان",
  "القشريات والمأكولات البحرية",
  "الغلوتين والقمح",
  "الفول السوداني والمكسرات الشجرية",
  "فول الصويا",
  "حساسية الأنف والتهاب الجيوب الأنفية (حمى القش)",
  "حساسية الغبار والعفن",
  "الربو التحسسي",
  "الأكزيما (التهاب الجلد التأتبي)",
  "الشرى (الطفح الجلدي التحسسي)",
] as const;

/** Medicine categories — for patients who take a medicine but do not know its name. */
export const MED_CATEGORIES = [
  "أدوية الضغط",
  "أدوية السكري",
  "الإنسولين",
  "مميعات الدم",
  "أدوية القلب",
  "أدوية الكوليسترول",
  "أدوية الغدة الدرقية",
  "بخاخات وأدوية الربو",
  "أدوية الصرع والأعصاب",
  "أدوية نفسية",
  "مسكنات الألم",
  "مضادات حيوية",
  "أدوية أخرى",
] as const;

/** Optional dosing info for a medicine (stored together in Medication.frequency). */
export const MED_TIMES = ["مرة واحدة", "مرتين", "3 مرات", "4 مرات"] as const;
export const MED_TIMING = ["صباحاً", "ظهراً", "مساءً", "قبل النوم"] as const;
export function composeFrequency(times: string, timing: string[]) {
  return [times ? `${times} في اليوم` : "", MED_TIMING.filter((x) => timing.includes(x)).join("، ")].filter(Boolean).join(" · ");
}
export function parseFrequency(f: string | null | undefined) {
  const s = f ?? "";
  return { times: MED_TIMES.find((x) => s.startsWith(x)) ?? "", timing: MED_TIMING.filter((x) => s.includes(x)) as string[] };
}
