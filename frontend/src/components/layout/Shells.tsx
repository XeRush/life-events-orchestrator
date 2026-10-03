import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import {
  Activity, BarChart3, Ban, CalendarClock, FileText, FlaskConical, GitBranch, Home, LogOut, Menu, Mic, Phone, PhoneCall, PhoneOff,
  ScrollText, Settings, ShieldAlert, ShieldCheck, SlidersHorizontal, UserRoundCheck, Users, X, type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { pageVariants } from "../../animations/variants";
import { authApi } from "../../api";
import { useMyCases, useOfficerStats, useRinging } from "../../hooks/queries";
import { useLiveStream } from "../../hooks/useLiveStream";
import { useT, type MessageKey } from "../../i18n";
import { cn } from "../../lib/format";
import { useAuth } from "../../stores/auth";
import { useUI } from "../../stores/ui";
import { Button, Logo, Toasts } from "../ui/primitives";
import { MockBadge } from "../ui/StatusBadge";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { NotificationsBell } from "./NotificationsBell";
import { ThemeToggle } from "./ThemeToggle";

function useSignOut() {
  const navigate = useNavigate();
  return async () => {
    const { tokens, clear } = useAuth.getState();
    try {
      await authApi.logout(tokens?.refresh_token);
    } catch {
      /* the session is cleared locally either way */
    }
    clear();
    navigate("/login");
  };
}

function ToastHost() {
  const toasts = useUI((s) => s.toasts);
  const dismiss = useUI((s) => s.dismiss);
  return <Toasts toasts={toasts} dismiss={dismiss} />;
}

function Animated({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div key={location.pathname} variants={pageVariants} initial="initial" animate="animate" exit="exit">{children}</motion.div>
    </AnimatePresence>
  );
}

/** `dark` is accepted for older call sites and ignored: the dot follows the theme. */
export function LiveDot({ connected }: { connected: boolean; dark?: boolean }) {
  const t = useT();
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors", connected ? "bg-civic-soft text-civic" : "bg-paper-2 text-muted")}
      role="status" aria-live="polite">
      <span className={cn("h-1.5 w-1.5 rounded-full", connected ? "animate-pulse bg-civic" : "bg-faint")} aria-hidden />
      <span className="sr-only sm:not-sr-only">{connected ? t("common.live") : t("common.offline")}</span>
    </span>
  );
}

/** Callbacks ring inside the resident's app when no phone line is configured (simulated telephony). */
function IncomingCall() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const { data } = useRinging(!location.pathname.startsWith("/app/voice"));
  const call = data?.[0];
  return (
    <AnimatePresence>
      {call && (
        <motion.div role="alertdialog" aria-label={t("call.incoming")} initial={{ y: -80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -80, opacity: 0 }}
          className="fixed inset-x-3 top-3 z-50 mx-auto flex max-w-xl items-center gap-4 rounded-2xl bg-ink px-5 py-4 text-paper shadow-[var(--shadow-pop)]">
          <span className="phone-ring grid h-11 w-11 shrink-0 place-items-center rounded-full bg-civic text-on-accent"><PhoneCall className="h-5 w-5" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">{t("call.incoming")}</p>
            <p className="truncate text-sm text-paper/70">{t("call.incomingBody", { ref: call.case_reference ?? "" })}</p>
          </div>
          <Button size="sm" variant="civic" icon={<Phone className="h-4 w-4" />} onClick={() => navigate(`/app/voice?call=${call.id}`)}>{t("call.answer")}</Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ResidentShell() {
  const t = useT();
  const signOut = useSignOut();
  const user = useAuth((s) => s.user);
  const { data } = useMyCases();
  const ref = data?.items[0]?.reference;
  useLiveStream(null);
  const links: { to: string; label: MessageKey; icon: LucideIcon; end?: boolean }[] = ref
    ? [
        { to: `/app/cases/${ref}`, label: "nav.home", icon: Home, end: true },
        { to: "/app/voice", label: "nav.voice", icon: Mic },
        { to: `/app/cases/${ref}/graph`, label: "nav.graph", icon: GitBranch },
        { to: `/app/cases/${ref}/timeline`, label: "nav.timeline", icon: ScrollText },
        { to: `/app/cases/${ref}/documents`, label: "nav.documents", icon: FileText },
      ]
    : [{ to: "/app/intake", label: "nav.intake", icon: Home }, { to: "/app/voice", label: "nav.voice", icon: Mic }];
  return (
    <div className="min-h-screen paper-grain">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-paper">{t("app.skip")}</a>
      <IncomingCall />
      <header className="sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-3 sm:gap-4 sm:px-6">
          <Link to="/app" aria-label="LifeLoop home"><Logo size={26} compactBelowSm /></Link>
          <nav aria-label="Primary" className="ms-4 hidden flex-1 items-center gap-0.5 lg:flex">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end}
                className={({ isActive }) => cn("relative rounded-full px-3 py-1.5 text-sm transition-colors", isActive ? "text-paper" : "text-ink-2 hover:bg-paper-2")}>
                {({ isActive }) => (
                  <>
                    {isActive && <motion.span layoutId="resident-nav-pill" className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", stiffness: 420, damping: 36 }} aria-hidden />}
                    <span className="relative whitespace-nowrap">{t(l.label)}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="ms-auto flex items-center gap-0.5 sm:gap-1.5">
            <LanguageSwitcher compact />
            <ThemeToggle />
            <NotificationsBell />
            <NavLink to="/app/settings" aria-label={t("nav.settings")} className="grid h-9 w-9 place-items-center rounded-full text-ink-2 hover:bg-paper-2"><Settings className="h-[18px] w-[18px]" /></NavLink>
            <button onClick={signOut} aria-label={t("nav.signOut")} title={user?.email} className="grid h-9 w-9 cursor-pointer place-items-center rounded-full text-ink-2 hover:bg-paper-2"><LogOut className="h-[18px] w-[18px] rtl-flip" /></button>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:pb-14">
        <Animated><Outlet /></Animated>
      </main>
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-md justify-around px-2 py-1.5 md:max-w-xl">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end}
              className={({ isActive }) => cn("relative flex min-w-14 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-center text-[10.5px] leading-tight transition-colors", isActive ? "text-ink" : "text-faint")}>
              {({ isActive }) => (
                <>
                  {isActive && <motion.span layoutId="resident-tab-dot" className="absolute -top-1.5 h-[3px] w-6 rounded-full bg-civic" transition={{ type: "spring", stiffness: 420, damping: 36 }} aria-hidden />}
                  <l.icon className="h-5 w-5" aria-hidden />{t(l.label)}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
      <footer className="mx-auto hidden max-w-6xl items-center justify-between gap-4 px-6 pb-8 text-xs text-faint lg:flex">
        <span>{t("app.prototype")}</span>
        <MockBadge />
      </footer>
      <ToastHost />
    </div>
  );
}

const OFFICER_NAV: { to: string; label: MessageKey; icon: LucideIcon; end?: boolean; stat?: "pending_approval" | "blocked" | "escalations" }[] = [
  { to: "/officer", label: "nav.cases", icon: Home, end: true },
  { to: "/officer/approvals", label: "nav.pending", icon: UserRoundCheck, stat: "pending_approval" },
  { to: "/officer/blocked", label: "nav.blocked", icon: Ban, stat: "blocked" },
  { to: "/officer/escalations", label: "nav.escalations", icon: ShieldAlert, stat: "escalations" },
  { to: "/officer/callbacks", label: "nav.callbacks", icon: PhoneOff },
  { to: "/officer/audit", label: "nav.audit", icon: ScrollText },
  { to: "/officer/analytics", label: "nav.analytics", icon: BarChart3 },
  { to: "/officer/settings", label: "nav.settings", icon: Settings },
];
const ADMIN_NAV: { to: string; label: MessageKey; icon: LucideIcon }[] = [
  { to: "/admin/users", label: "nav.users", icon: Users },
  { to: "/admin/system", label: "nav.system", icon: Activity },
];
const DEMO_NAV: { to: string; label: MessageKey; icon: LucideIcon }[] = [
  { to: "/demo", label: "nav.demo", icon: SlidersHorizontal },
  { to: "/agent-testing", label: "nav.agentTesting", icon: FlaskConical },
];

function SideLink({ to, label, icon: Icon, end, count }: { to: string; label: string; icon: LucideIcon; end?: boolean; count?: number }) {
  return (
    <NavLink to={to} end={end}
      className={({ isActive }) => cn("relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
        isActive ? "text-paper" : "text-ink-2 hover:bg-paper-2 hover:text-ink")}>
      {({ isActive }) => (
        <>
          {isActive && <motion.span layoutId="officer-nav-pill" className="absolute inset-0 rounded-xl bg-ink" transition={{ type: "spring", stiffness: 420, damping: 36 }} aria-hidden />}
          <Icon className="relative h-[18px] w-[18px] shrink-0" aria-hidden />
          <span className="relative flex-1">{label}</span>
          {!!count && <span className={cn("relative rounded-full px-2 text-[11px] font-semibold", isActive ? "bg-paper/20 text-paper" : "bg-civic-soft text-civic")}>{count}</span>}
        </>
      )}
    </NavLink>
  );
}

/** Officer / admin workspace: a dense, desktop-first control room (usable on tablet via the drawer). */
export function OfficerShell() {
  const t = useT();
  const signOut = useSignOut();
  const user = useAuth((s) => s.user);
  const [open, setOpen] = useState(false);
  const stats = useOfficerStats();
  const live = useLiveStream(null);
  const location = useLocation();
  const isDemo = location.pathname.startsWith("/demo") || location.pathname.startsWith("/agent-testing");
  const sidebar = (
    <div className="flex h-full flex-col gap-5 overflow-y-auto border-e border-line bg-surface px-4 py-5 text-ink scroll-thin">
      <div className="flex items-center justify-between px-2">
        <Link to="/officer" aria-label="Officer home"><Logo size={26} /></Link>
        <button className="cursor-pointer rounded-full p-1.5 text-ink-2 hover:bg-paper-2 lg:hidden" onClick={() => setOpen(false)} aria-label={t("common.close")}><X className="h-5 w-5" /></button>
      </div>
      <div className="rounded-2xl border border-line bg-paper px-3 py-3">
        <p className="text-sm font-medium">{user?.full_name}</p>
        <p className="text-xs text-muted">{user?.title ?? user?.role} · {user?.organization_name ?? "LifeLoop"}</p>
        <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-civic"><ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Human approval gate</p>
      </div>
      <nav aria-label="Officer" className="flex flex-col gap-0.5" onClick={() => setOpen(false)}>
        {OFFICER_NAV.map((l) => <SideLink key={l.to} to={l.to} label={t(l.label)} icon={l.icon} end={l.end} count={l.stat ? stats.data?.[l.stat] : undefined} />)}
        {user?.role === "ADMIN" && (
          <>
            <p className="mt-4 px-3 pb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">Administration</p>
            {ADMIN_NAV.map((l) => <SideLink key={l.to} to={l.to} label={t(l.label)} icon={l.icon} />)}
          </>
        )}
      </nav>
      <div className="mt-auto rounded-2xl border border-dashed border-amber/50 bg-amber-soft/60 p-2" onClick={() => setOpen(false)}>
        <p className="px-2 pb-1 pt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-amber">Demo tools - not part of the officer workflow</p>
        {DEMO_NAV.map((l) => <SideLink key={l.to} to={l.to} label={t(l.label)} icon={l.icon} />)}
      </div>
      <button onClick={signOut} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink">
        <LogOut className="h-[18px] w-[18px] rtl-flip" aria-hidden /> {t("nav.signOut")}
      </button>
    </div>
  );
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[264px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-paper">{t("app.skip")}</a>
      <aside className="sticky top-0 hidden h-screen lg:block">{sidebar}</aside>
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={() => setOpen(false)} aria-hidden />
            <motion.aside initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="absolute inset-y-0 start-0 w-[min(18rem,85vw)]">{sidebar}</motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="min-w-0">
        <header className={cn("sticky top-0 z-30 flex h-16 items-center gap-2 border-b px-3 backdrop-blur sm:gap-3 sm:px-6 lg:px-8", isDemo ? "border-amber/40 bg-amber-soft/90" : "border-line bg-paper/85")}>
          <button className="cursor-pointer rounded-full p-2 hover:bg-paper-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu className="h-5 w-5" /></button>
          {isDemo ? <span className="inline-flex min-w-0 items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-amber sm:text-xs"><FlaskConical className="h-4 w-4 shrink-0" aria-hidden /><span className="hidden truncate sm:inline">Demo tools - simulations drive the real pipeline</span><span className="sm:hidden">Demo tools</span></span>
            : <span className="hidden items-center gap-2 text-sm text-muted md:inline-flex"><CalendarClock className="h-4 w-4" aria-hidden /> Amer officer workspace</span>}
          <div className="ms-auto flex shrink-0 items-center gap-0.5 sm:gap-1.5">
            <LiveDot connected={live.connected} />
            <span className="hidden xl:inline-flex"><MockBadge /></span>
            <LanguageSwitcher compact />
            <ThemeToggle />
            <NotificationsBell />
          </div>
        </header>
        <main id="main" className="px-4 py-6 sm:px-6 lg:px-8">
          <Animated><Outlet /></Animated>
        </main>
      </div>
      <ToastHost />
    </div>
  );
}

/** Public top bar: transparent over the hero, frosted once the page scrolls. `dark` is accepted and ignored (theme-driven). */
export function PublicNav(_props: { dark?: boolean } = {}) {
  const t = useT();
  const user = useAuth((s) => s.user);
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 12));
  const cta = "whitespace-nowrap rounded-full bg-ink px-3.5 py-2 text-sm font-medium text-paper transition-transform hover:-translate-y-px active:scale-[0.97] sm:px-4";
  const link = "hidden rounded-full px-3 py-1.5 text-sm text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink sm:inline";
  return (
    <motion.header initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={cn("fixed inset-x-0 top-0 z-30 border-b text-ink transition-[background-color,border-color] duration-300",
        scrolled ? "border-line bg-paper/80 backdrop-blur-md" : "border-transparent bg-transparent")}>
      <div className={cn("mx-auto flex max-w-6xl items-center gap-3 px-4 transition-[height] duration-300 sm:px-6", scrolled ? "h-16" : "h-20")}>
        <Link to="/" aria-label="LifeLoop home" className="shrink-0"><Logo size={28} compactBelowSm /></Link>
        <nav aria-label="Public" className="ms-auto flex min-w-0 items-center gap-1 sm:gap-2">
          <Link to="/architecture" className={link}>{t("nav.architecture")}</Link>
          <LanguageSwitcher compact />
          <ThemeToggle />
          {user ? (
            <Link to={user.role === "RESIDENT" ? "/app" : "/officer"} className={cta}>{t("common.open")}</Link>
          ) : (
            <>
              <Link to="/login" className={link}>{t("nav.signIn")}</Link>
              <Link to="/register" className={cta}>{t("nav.getStarted")}</Link>
            </>
          )}
        </nav>
      </div>
    </motion.header>
  );
}

export function PublicShell() {
  return (
    <>
      <Outlet />
      <ToastHost />
    </>
  );
}
