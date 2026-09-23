import { AnimatePresence, motion } from "framer-motion";
import {
  Building2, CalendarClock, LayoutDashboard, Mic, PhoneCall, Settings, SlidersHorizontal, Sparkles, X, type LucideIcon,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useT, type MessageKey } from "../../i18n";
import { useAuth } from "../../stores/auth";
import { useUI } from "../../stores/ui";
import { cn } from "../../utils/format";
import { Logo } from "../ui/primitives";

interface Item { to: string; label: MessageKey; icon: LucideIcon; staff?: boolean }

const ITEMS: Item[] = [
  { to: "/app", label: "nav.dashboard", icon: LayoutDashboard },
  { to: "/app/life-events", label: "nav.lifeEvents", icon: Sparkles },
  { to: "/app/timeline", label: "nav.timeline", icon: CalendarClock },
  { to: "/app/voice", label: "nav.voice", icon: Mic },
  { to: "/app/callbacks", label: "nav.callbacks", icon: PhoneCall },
  { to: "/app/entities", label: "nav.entities", icon: Building2, staff: true },
  { to: "/app/demo", label: "nav.demo", icon: SlidersHorizontal, staff: true },
  { to: "/app/settings", label: "nav.settings", icon: Settings },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const t = useT();
  const role = useAuth((s) => s.user?.role);
  const staff = role === "ADMIN" || role === "OPERATOR";
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {ITEMS.filter((i) => !i.staff || staff).map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to} to={to} end={to === "/app"} onClick={onNavigate}
          className={({ isActive }) =>
            cn("group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14.5px] transition-colors",
              isActive ? "bg-ink text-paper" : "text-ink-2 hover:bg-paper-2")
          }
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden />
          {t(label)}
        </NavLink>
      ))}
    </nav>
  );
}

export function Sidebar() {
  const open = useUI((s) => s.sidebarOpen);
  const setOpen = useUI((s) => s.setSidebarOpen);
  const t = useT();
  const navigate = useNavigate();
  return (
    <>
      <aside className="sticky top-0 hidden h-screen flex-col justify-between border-e border-line bg-paper px-4 py-6 lg:flex">
        <div className="space-y-8">
          <button onClick={() => navigate("/")} className="px-2 cursor-pointer" aria-label="LIFELOOP home"><Logo /></button>
          <NavList />
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4 text-[12.5px] leading-relaxed text-muted">
          <p className="mb-1 font-display text-[15px] text-ink">{t("case.aiRole")}</p>
          {t("common.prototype")}
        </div>
      </aside>
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} aria-hidden />
            <motion.div initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: "spring", damping: 30, stiffness: 320 }}
              className="absolute inset-y-0 start-0 w-[270px] bg-paper p-5 shadow-[var(--shadow-pop)]">
              <div className="mb-8 flex items-center justify-between">
                <Logo />
                <button onClick={() => setOpen(false)} aria-label={t("common.close")} className="rounded-full p-1.5 hover:bg-paper-2 cursor-pointer"><X className="h-5 w-5" /></button>
              </div>
              <NavList onNavigate={() => setOpen(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
