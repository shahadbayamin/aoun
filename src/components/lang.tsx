"use client";
import { createContext, useContext } from "react";
import type { Lang } from "@/lib/i18n";

const Ctx = createContext<Lang>("ar");
export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <Ctx.Provider value={lang}>{children}</Ctx.Provider>;
}
export function useLang() {
  return useContext(Ctx);
}
/** Inline bilingual strings: t("عربي", "English"). */
export function useT() {
  const lang = useContext(Ctx);
  return { lang, t: (ar: string, en: string) => (lang === "ar" ? ar : en) };
}
