import { cookies } from "next/headers";

export type Lang = "ar" | "en";
export type T = (ar: string, en: string) => string;

export async function getLang(): Promise<Lang> {
  try {
    const v = (await cookies()).get("lang")?.value;
    return v === "en" ? "en" : "ar";
  } catch {
    return "ar";
  }
}

export const makeT =
  (lang: Lang): T =>
  (ar, en) =>
    lang === "ar" ? ar : en;

export async function getT() {
  const lang = await getLang();
  return { lang, t: makeT(lang) };
}
