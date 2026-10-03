import { Globe } from "lucide-react";
import { authApi } from "../../api";
import { LANGUAGES, useT } from "../../i18n";
import { cn } from "../../lib/format";
import { useAuth } from "../../stores/auth";
import { useUI } from "../../stores/ui";
import type { Lang } from "../../types/api";

/** Visible, explicit language choice (six languages; Arabic and Urdu switch the layout to right-to-left). */
/** `dark` is accepted for older call sites and ignored: the switcher follows the theme. */
export function LanguageSwitcher({ className, compact = false }: { dark?: boolean; className?: string; compact?: boolean }) {
  const t = useT();
  const lang = useUI((s) => s.lang);
  const setLang = useUI((s) => s.setLang);
  const signedIn = useAuth((s) => !!s.tokens);
  const change = (value: Lang) => {
    setLang(value);
    if (signedIn) authApi.updateMe({ preferred_language: value }).then((u) => useAuth.getState().setUser(u)).catch(() => undefined);
  };
  return (
    <label className={cn("relative inline-flex items-center", className)}>
      <span className="sr-only">{t("nav.language")}</span>
      <Globe className="pointer-events-none absolute start-2.5 h-4 w-4 text-muted" aria-hidden />
      {compact && <span aria-hidden className="pointer-events-none absolute start-8 font-mono text-[12px] font-medium uppercase text-ink sm:hidden">{lang}</span>}
      <select
        value={lang}
        onChange={(e) => change(e.target.value as Lang)}
        className={cn("h-9 cursor-pointer appearance-none rounded-full border ps-8 pe-3 text-sm outline-none focus-visible:ring-2",
          compact && "w-[4.25rem] text-transparent sm:w-auto sm:text-ink",
          "border-line-2 bg-surface text-ink transition-colors hover:border-ink/30 focus-visible:ring-ink/15")}
      >
        {LANGUAGES.map((l) => <option key={l.code} value={l.code} className="bg-surface text-ink">{l.native}</option>)}
      </select>
    </label>
  );
}
