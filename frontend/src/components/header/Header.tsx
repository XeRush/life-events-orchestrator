import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Menu, Radio } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useT } from "../../i18n";
import { authApi } from "../../services/auth";
import { useAuth } from "../../stores/auth";
import { useUI } from "../../stores/ui";
import { cn, title } from "../../utils/format";

export function Header({ live, lastEvent }: { live: boolean; lastEvent?: string }) {
  const t = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const lang = useUI((s) => s.lang);
  const setLang = useUI((s) => s.setLang);
  const setSidebarOpen = useUI((s) => s.setSidebarOpen);

  const signOut = async () => {
    const { tokens, clear } = useAuth.getState();
    try {
      await authApi.logout(tokens?.refresh_token);
    } catch {
      /* token may already be expired; still sign out locally */
    }
    clear();
    qc.clear();
    navigate("/login");
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line bg-paper/85 px-4 backdrop-blur sm:px-8">
      <div className="flex items-center gap-3">
        <button onClick={() => setSidebarOpen(true)} aria-label={t("nav.menu")} className="rounded-full p-2 hover:bg-paper-2 lg:hidden cursor-pointer">
          <Menu className="h-5 w-5" />
        </button>
        <span
          title={live ? `Live: ${lastEvent ? title(lastEvent) : "connected"}` : "Reconnecting - polling every few seconds"}
          className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs", live ? "border-civic/30 bg-civic-soft text-civic" : "border-line-2 text-muted")}
        >
          <Radio className={cn("h-3.5 w-3.5", live && "animate-pulse")} aria-hidden />
          {live ? "Live" : "Polling"}
        </span>
        <span className="hidden text-xs text-faint sm:inline">{t("common.prototype")}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setLang(lang === "en" ? "ar" : "en")}
          className="rounded-full border border-line-2 px-3 py-1.5 text-xs font-medium hover:bg-paper-2 cursor-pointer"
          aria-label="Switch language"
        >
          {lang === "en" ? "العربية" : "English"}
        </button>
        <div className="hidden text-end sm:block">
          <p className="text-[13px] font-medium leading-tight">{user?.full_name}</p>
          <p className="text-[11px] text-faint">{user?.role?.toLowerCase()}</p>
        </div>
        <button onClick={signOut} aria-label={t("nav.signOut")} title={t("nav.signOut")} className="rounded-full p-2 text-muted hover:bg-paper-2 cursor-pointer">
          <LogOut className="h-[18px] w-[18px]" />
        </button>
      </div>
    </header>
  );
}
