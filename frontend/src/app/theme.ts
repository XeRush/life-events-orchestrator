import { useEffect, useSyncExternalStore } from "react";
import { useUI, type ThemePref } from "../stores/ui";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeSystem(callback: () => void) {
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

/** The theme actually shown: the saved preference, with "system" resolved against the OS setting. */
export function useResolvedTheme(): "light" | "dark" {
  const pref = useUI((s) => s.theme);
  const systemDark = useSyncExternalStore(subscribeSystem, () => window.matchMedia(DARK_QUERY).matches, () => false);
  return pref === "dark" || (pref === "system" && systemDark) ? "dark" : "light";
}

/** Keeps <html class="dark" data-theme> and the browser theme colour in sync. Colours cross-fade on a switch. */
export function useThemeEffect() {
  const resolved = useResolvedTheme();
  useEffect(() => {
    const root = document.documentElement;
    const changed = root.dataset.theme !== resolved;
    // A theme switch behind the shutter (animations/shutter.ts) needs no cross-fade; it is painted out of sight.
    if (changed && !root.dataset.shutter && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root.classList.add("theme-fade");
      window.setTimeout(() => root.classList.remove("theme-fade"), 400);
    }
    root.classList.toggle("dark", resolved === "dark");
    root.dataset.theme = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#0d161d" : "#f7f5f0");
  }, [resolved]);
}

export const THEME_ORDER: ThemePref[] = ["light", "dark", "system"];
