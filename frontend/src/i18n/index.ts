import { useCallback, useEffect } from "react";
import { useAuth } from "../stores/auth";
import { useUI } from "../stores/ui";
import type { Lang } from "../types/api";
import ar from "./ar";
import en, { type MessageKey } from "./en";
import hi from "./hi";
import ml from "./ml";
import tl from "./tl";
import ur from "./ur";

const dictionaries: Record<Lang, Partial<Record<MessageKey, string>>> = { en, ar, hi, ur, ml, tl };

export const LANGUAGES: { code: Lang; native: string; english: string; rtl: boolean }[] = [
  { code: "en", native: "English", english: "English", rtl: false },
  { code: "ar", native: "العربية", english: "Arabic", rtl: true },
  { code: "hi", native: "हिन्दी", english: "Hindi", rtl: false },
  { code: "ur", native: "اردو", english: "Urdu", rtl: true },
  { code: "ml", native: "മലയാളം", english: "Malayalam", rtl: false },
  { code: "tl", native: "Tagalog", english: "Tagalog", rtl: false },
];
export const isRTL = (lang: Lang) => lang === "ar" || lang === "ur";

export type TFunction = (key: MessageKey, params?: Record<string, string | number>) => string;

export function translate(lang: Lang, key: MessageKey, params?: Record<string, string | number>): string {
  const template = dictionaries[lang][key] ?? en[key] ?? key;
  return params ? template.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`)) : template;
}

/** Translation hook: t("resident.home.title", { name }) - missing keys fall back to English.
 * Shared labels written for residents ("Needs you") have staff variants ("staff.<key>") used for officers and admins. */
export function useT(): TFunction {
  const lang = useUI((s) => s.lang);
  const staff = useAuth((s) => s.user?.role === "OFFICER" || s.user?.role === "ADMIN");
  return useCallback((key, params) => {
    const staffKey = `staff.${key}` as MessageKey;
    return translate(lang, staff && staffKey in en ? staffKey : key, params);
  }, [lang, staff]);
}

export function useLang(): Lang {
  return useUI((s) => s.lang);
}

/** Keeps <html lang dir> in sync; Arabic and Urdu render right-to-left. */
export function useDocumentLanguage() {
  const lang = useUI((s) => s.lang);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = isRTL(lang) ? "rtl" : "ltr";
  }, [lang]);
}

export type { MessageKey };
