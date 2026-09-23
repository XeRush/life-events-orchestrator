import { create } from "zustand";

export type Lang = "en" | "ar";

interface UIState {
  lang: Lang;
  speakReplies: boolean;
  sidebarOpen: boolean;
  toasts: { id: number; tone: "info" | "success" | "error"; text: string }[];
  setLang: (lang: Lang) => void;
  setSpeakReplies: (on: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  toast: (tone: "info" | "success" | "error", text: string) => void;
  dismiss: (id: number) => void;
}

function read(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

let toastId = 0;

/** Local UI state only (language, drawers, toasts). */
export const useUI = create<UIState>((set, get) => ({
  lang: read("lifeloop.lang", "en") as Lang,
  speakReplies: read("lifeloop.speak", "0") === "1",
  sidebarOpen: false,
  toasts: [],
  setLang: (lang) => {
    write("lifeloop.lang", lang);
    set({ lang });
  },
  setSpeakReplies: (on) => {
    write("lifeloop.speak", on ? "1" : "0");
    set({ speakReplies: on });
  },
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  toast: (tone, text) => {
    const id = ++toastId;
    set({ toasts: [...get().toasts, { id, tone, text }] });
    setTimeout(() => get().dismiss(id), 5200);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));
