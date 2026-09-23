import { useEffect } from "react";
import { useUI } from "../stores/ui";
import ar from "./ar";
import en, { type MessageKey } from "./en";

const dictionaries = { en, ar } as const;

/** Translation hook. Also keeps <html lang/dir> in sync (Arabic renders right-to-left). */
export function useT() {
  const lang = useUI((s) => s.lang);
  return (key: MessageKey) => dictionaries[lang][key] ?? en[key];
}

export function useDocumentLanguage() {
  const lang = useUI((s) => s.lang);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);
}

export type { MessageKey };
