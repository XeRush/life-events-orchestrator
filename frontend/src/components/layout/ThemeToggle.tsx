import { AnimatePresence, motion } from "framer-motion";
import { Monitor, Moon, Sun } from "lucide-react";
import { playShutter } from "../../animations/shutter";
import { THEME_ORDER, useResolvedTheme } from "../../app/theme";
import { useT } from "../../i18n";
import { cn } from "../../lib/format";
import { useUI } from "../../stores/ui";

const ICON = { light: Sun, dark: Moon, system: Monitor } as const;

/** One button that cycles light → dark → system. A camera-iris shutter closes over the page, the theme changes
 * out of sight, and the shutter opens on the new look. The icon turns over on each switch. */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useT();
  const theme = useUI((s) => s.theme);
  const setTheme = useUI((s) => s.setTheme);
  const resolved = useResolvedTheme();
  const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
  const switchTheme = () => {
    const nextResolved = next === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : next;
    // Only a visible change earns the shutter (dark -> "match device" on a dark device changes nothing on screen).
    if (nextResolved === resolved) setTheme(next);
    else void playShutter(() => setTheme(next));
  };
  const Icon = ICON[theme];
  const label = t("theme.label", { mode: t(`theme.${theme}`) });
  return (
    <button
      type="button"
      onClick={switchTheme}
      aria-label={`${label}. ${t("theme.switchTo", { mode: t(`theme.${next}`) })}`}
      title={label}
      className={cn("relative grid h-9 w-9 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full text-ink-2 transition-colors hover:bg-paper-2", className)}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ y: 14, rotate: -90, opacity: 0 }}
          animate={{ y: 0, rotate: 0, opacity: 1 }}
          exit={{ y: -14, rotate: 90, opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="grid place-items-center"
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
