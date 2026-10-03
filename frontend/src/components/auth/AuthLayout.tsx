import { motion, useReducedMotion, type Variants } from "framer-motion";
import { AlertCircle, CheckCircle2, Info, Landmark, Route, UserRoundCheck, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Stagger, StaggerItem } from "../../animations/motion";
import { ease } from "../../animations/variants";
import { useT, type MessageKey } from "../../i18n";
import { cn } from "../../lib/format";
import { PublicNav } from "../layout/Shells";
import { MockBadge } from "../ui/StatusBadge";
import { AuthChain } from "./AuthChain";

const POINTS: { icon: LucideIcon; text: MessageKey }[] = [
  { icon: Route, text: "auth.brand.point1" },
  { icon: UserRoundCheck, text: "auth.brand.point2" },
  { icon: Landmark, text: "auth.brand.point3" },
];

/* Layout classes shared with the skeleton capture page (src/bones/capture/public.tsx), so captured geometry matches. */
export const AUTH_COLS = "lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]";
export const AUTH_GRID = `${AUTH_COLS} lg:min-h-screen`;
export const AUTH_MAIN = "flex min-w-0 flex-col justify-center px-4 pb-12 pt-24 sm:px-6 sm:pt-28 lg:px-12 lg:pb-16";
export const AUTH_CARD = "card relative mx-auto w-full overflow-hidden p-6 sm:p-9";
export const AUTH_WIDTH = "max-w-[34rem]";

const item: Variants = { hidden: { opacity: 0, y: 10 }, shown: { opacity: 1, y: 0, transition: { duration: 0.5, ease } } };

/** Brand panel (lg and up): the promise, the six-step chain in miniature, and the standing "simulated" notice. */
function BrandPanel({ aside }: { aside?: ReactNode }) {
  const t = useT();
  return (
    <aside className="relative isolate hidden overflow-hidden border-e border-line bg-stage lg:block">
      <div aria-hidden className="grid-lines pointer-events-none absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,#000_35%,transparent)]" />
      {/* start padding follows the nav's max-w-6xl container, so the copy lines up under the logo */}
      <div className="sticky top-0 flex min-h-screen flex-col pb-10 pe-10 ps-[max(1.5rem,calc((100vw-72rem)/2+1.5rem))] pt-28">
        <Stagger gap={0.07} delay={0.1} className="max-w-md">
          <StaggerItem><p className="eyebrow">{t("landing.hero.eyebrow")}</p></StaggerItem>
          {aside ? <StaggerItem>{aside}</StaggerItem> : (
            <>
              <StaggerItem><p className="mt-3 font-display text-[2.15rem] leading-[1.08] text-ink xl:text-[2.45rem]">{t("auth.brand.title")}</p></StaggerItem>
              <StaggerItem>
                <ul className="mt-5 space-y-3 text-[14px] leading-relaxed text-ink-2">
                  {POINTS.map((p) => (
                    <li key={p.text} className="flex gap-3">
                      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-civic-soft text-civic"><p.icon className="h-3.5 w-3.5" aria-hidden /></span>
                      {t(p.text)}
                    </li>
                  ))}
                </ul>
              </StaggerItem>
            </>
          )}
          <StaggerItem><AuthChain className="mt-7" /></StaggerItem>
        </Stagger>
        <div className="mt-auto pt-8">
          <MockBadge />
          <p className="mt-2 text-[12px] leading-snug text-muted">{t("auth.brand.prototype")}</p>
        </div>
      </div>
    </aside>
  );
}

/**
 * Auth frame, light-first split layout: a brand panel on the start side (lg and up) and the form card on the end side,
 * vertically centred. The card rises in and its contents follow in a short stagger. On phones the card is full width
 * and the "simulated" notice moves under it.
 */
export function AuthLayout({ eyebrow, title, subtitle, children, aside, below, wide }: {
  eyebrow?: string; title: ReactNode; subtitle?: ReactNode; children: ReactNode; aside?: ReactNode; below?: ReactNode; wide?: boolean;
}) {
  const t = useT();
  const reduce = useReducedMotion();
  const width = wide ? "max-w-2xl" : AUTH_WIDTH;
  return (
    <div className="min-h-screen bg-paper">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-paper">{t("app.skip")}</a>
      <PublicNav />
      <div className={AUTH_GRID}>
        <BrandPanel aside={aside} />
        <main id="main" className={AUTH_MAIN}>
          <motion.section
            aria-labelledby="auth-title"
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease }}
            className={cn(AUTH_CARD, width)}
          >
            <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-civic via-civic/60 to-azure/70 rtl:bg-linear-to-l" />
            <motion.div initial={reduce ? false : "hidden"} animate="shown" variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.06, delayChildren: 0.12 } } }}>
              {eyebrow && <motion.p variants={item} className="eyebrow mb-2.5">{eyebrow}</motion.p>}
              <motion.h1 variants={item} id="auth-title" className="text-[1.95rem] leading-[1.1] text-ink sm:text-[2.3rem]">{title}</motion.h1>
              {subtitle && <motion.p variants={item} className="mt-2 text-[15px] leading-relaxed text-muted">{subtitle}</motion.p>}
              <motion.div variants={item} className="mt-6">{children}</motion.div>
            </motion.div>
          </motion.section>
          {below && (
            <motion.div initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease, delay: 0.25 }} className={cn("mx-auto mt-5 w-full", width)}>
              {below}
            </motion.div>
          )}
          <p className={cn("mx-auto mt-5 flex w-full flex-wrap items-center gap-2 text-[12.5px] text-muted lg:hidden", width)}>
            <MockBadge />{t("auth.brand.prototype")}
          </p>
        </main>
      </div>
    </div>
  );
}

/** Skeleton-capture twin of AuthLayout's form column: same grid, paddings and card, without nav or brand panel. */
export function AuthCaptureFrame({ children, below }: { children?: ReactNode; below?: ReactNode }) {
  return (
    <div className={AUTH_COLS}>
      <div className="hidden lg:block" aria-hidden />
      <div className={AUTH_MAIN}>
        {children && <section className={cn(AUTH_CARD, AUTH_WIDTH)}>{children}</section>}
        {below && <div className={cn("mx-auto mt-5 w-full", AUTH_WIDTH)}>{below}</div>}
      </div>
    </div>
  );
}

/** Inline message block used by every auth form. */
export function Notice({ tone, children, className }: { tone: "error" | "success" | "info"; children: ReactNode; className?: string }) {
  const Icon = tone === "error" ? AlertCircle : tone === "success" ? CheckCircle2 : Info;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-2xl border px-4 py-3 text-[14px] leading-relaxed",
        tone === "error" && "border-rose/30 bg-rose-soft text-rose",
        tone === "success" && "border-civic/30 bg-civic-soft text-civic",
        tone === "info" && "border-azure/25 bg-azure-soft/70 text-azure",
        className,
      )}
    >
      <Icon className="mt-0.5 h-4.5 w-4.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
