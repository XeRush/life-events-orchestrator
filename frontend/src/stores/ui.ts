import { create } from "zustand";
import type { Lang } from "../types/api";

export interface Toast { id: number; tone: "info" | "success" | "error"; text: string }

export type ThemePref = "light" | "dark" | "system";

const LANG_KEY = "lifeloop.lang";
const THEME_KEY = "lifeloop.theme";
const SPEAK_KEY = "lifeloop.speak";
const LANGS: Lang[] = ["en", "ar", "hi", "ur", "ml", "tl"];

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY) as Lang | null;
    if (saved && LANGS.includes(saved)) return saved;
  } catch {
    /* ignore */
  }
  const nav = (navigator.language || "en").slice(0, 2) as Lang;
  return LANGS.includes(nav) ? nav : "en";
}

function initialTheme(): ThemePref {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
  } catch {
    /* ignore */
  }
  return "light";
}

interface UIState {
  lang: Lang;
  theme: ThemePref;
  setTheme: (theme: ThemePref) => void;
  speakReplies: boolean;
  toasts: Toast[];
  setLang: (lang: Lang) => void;
  setSpeak: (on: boolean) => void;
  toast: (tone: Toast["tone"], text: string) => void;
  dismiss: (id: number) => void;
}

let next = 1;

/** Local UI state only: language, theme, speech preference, toasts. */
export const useUI = create<UIState>((set) => ({
  lang: initialLang(),
  theme: initialTheme(),
  setTheme: (theme) => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
    set({ theme });
  },
  speakReplies: (() => {
    try {
      return localStorage.getItem(SPEAK_KEY) !== "off";
    } catch {
      return true;
    }
  })(),
  toasts: [],
  setLang: (lang) => {
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      /* ignore */
    }
    set({ lang });
  },
  setSpeak: (on) => {
    try {
      localStorage.setItem(SPEAK_KEY, on ? "on" : "off");
    } catch {
      /* ignore */
    }
    set({ speakReplies: on });
  },
  toast: (tone, text) => {
    const id = next++;
    set((s) => ({ toasts: [...s.toasts, { id, tone, text }] }));
    window.setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 5000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
