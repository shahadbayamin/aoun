import type { Lang } from "./i18n";

type Pair = [string, string];
const pick = (lang: Lang, p: Pair | undefined, fallback: string) => (p ? (lang === "ar" ? p[0] : p[1]) : fallback);

export const MODALITY: Record<string, Pair> = {
  XRAY: ["أشعة سينية", "X-ray"],
  MRI: ["رنين مغناطيسي", "MRI"],
  CT: ["أشعة مقطعية", "CT scan"],
  ULTRASOUND: ["موجات فوق صوتية", "Ultrasound"],
  OTHER: ["أخرى", "Other"],
};

export const SYNC_STATUS: Record<string, Pair> = {
  PENDING: ["قيد الانتظار", "Pending"],
  SENDING: ["جارٍ الإرسال", "Sending"],
  SYNCED: ["تمت المزامنة", "Synced"],
  FAILED: ["فشلت", "Failed"],
  RETRY: ["إعادة المحاولة", "Retry"],
  QUARANTINED: ["معزولة للمطابقة", "Quarantined"],
};

export const SCOPES: Record<string, Pair> = {
  IMAGING: ["سجل الأشعة", "Imaging record"],
  EMERGENCY_SUMMARY: ["الملخص الطارئ", "Emergency summary"],
  MEDICAL_PROFILE: ["الملف الطبي", "Medical profile"],
};

export const PURPOSES: Record<string, Pair> = {
  EMERGENCY_TREATMENT: ["علاج طارئ", "Emergency treatment"],
  ONGOING_CARE: ["رعاية مستمرة", "Ongoing care"],
  CONSULTATION: ["استشارة طبية", "Consultation"],
  PRE_PROCEDURE: ["تقييم قبل إجراء", "Pre-procedure assessment"],
};

export const EMERGENCY_PURPOSES: Record<string, Pair> = {
  UNCONSCIOUS_PATIENT: ["مريض فاقد للوعي", "Unconscious / unresponsive patient"],
  LIFE_THREATENING: ["حالة مهددة للحياة", "Life-threatening condition"],
  TRAUMA: ["إصابة بالغة", "Major trauma"],
  UNABLE_TO_CONSENT: ["تعذّر الحصول على الموافقة", "Patient unable to consent"],
};

export const SEVERITY: Record<string, Pair> = {
  MILD: ["خفيفة", "Mild"],
  MODERATE: ["متوسطة", "Moderate"],
  SEVERE: ["شديدة", "Severe"],
  LIFE_THREATENING: ["مهددة للحياة", "Life-threatening"],
};

export const SOURCE: Record<string, Pair> = {
  SELF_REPORTED: ["مُدخل من المريض", "Self-reported"],
  PROVIDER_VERIFIED: ["موثّق من مقدم الرعاية", "Provider-verified"],
  HOSPITAL_RECORD: ["سجل مستشفى", "Hospital record"],
};

export const REQUEST_STATUS: Record<string, Pair> = {
  PENDING: ["بانتظار الموافقة", "Awaiting approval"],
  APPROVED: ["تمت الموافقة", "Approved"],
  REJECTED: ["مرفوض", "Rejected"],
  EXPIRED: ["منتهي", "Expired"],
  CANCELLED: ["ملغى", "Cancelled"],
};

export const ENCOUNTER: Record<string, Pair> = {
  RADIOLOGY: ["فحص أشعة", "Radiology exam"],
  EMERGENCY: ["زيارة طوارئ", "Emergency visit"],
  OUTPATIENT: ["عيادة خارجية", "Outpatient visit"],
  INPATIENT: ["تنويم", "Inpatient admission"],
};

export const label = (map: Record<string, Pair>, key: string | null | undefined, lang: Lang) =>
  key ? pick(lang, map[key], key) : "";

export function fmtDate(d: Date | string | null | undefined, lang: Lang, withTime = false) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", second: withTime ? "2-digit" : undefined } : {}),
    timeZone: "Asia/Riyadh",
  }).format(date);
}

export function ageFrom(dob: Date) {
  const n = new Date();
  let a = n.getFullYear() - dob.getFullYear();
  const m = n.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < dob.getDate())) a--;
  return a;
}
