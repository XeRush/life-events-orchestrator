import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, BadgeCheck, CalendarCheck, CalendarClock, type LucideIcon } from "lucide-react";
import { CountUp, VIEWPORT } from "../../animations/motion";
import { useLang, useT } from "../../i18n";
import { cn } from "../../lib/format";
import { TONE, type Tone } from "../../lib/status";
import type { CaseView, Deadline } from "../../types/api";
import { Badge, Ring } from "../ui/primitives";
import { fmtDay } from "./text";

const DEADLINE: Record<Deadline["status"], { tone: Tone; icon: LucideIcon }> = {
  ON_TRACK: { tone: "civic", icon: CalendarCheck },
  AT_RISK: { tone: "amber", icon: CalendarClock },
  OVERDUE: { tone: "rose", icon: AlertTriangle },
  COMPLETE: { tone: "civic", icon: BadgeCheck },
};

/** A bar that fills from the start edge (transform only), the first time it scrolls into view. */
export function FillBar({ percent, tone = "civic", label, className }: { percent: number; tone?: Tone; label: string; className?: string }) {
  const reduce = useReducedMotion();
  const value = Math.min(100, Math.max(0, percent));
  return (
    <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-paper-2", className)}>
      {reduce ? (
        <div className={cn("h-full w-full origin-left rounded-full rtl:origin-right", TONE[tone].dot)} style={{ transform: `scaleX(${value / 100})` }} />
      ) : (
        <motion.div className={cn("h-full w-full origin-left rounded-full rtl:origin-right", TONE[tone].dot)}
          initial={{ scaleX: 0 }} whileInView={{ scaleX: value / 100 }} viewport={VIEWPORT}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 }} />
      )}
    </div>
  );
}

/** Overall progress and the legal deadline in one panel: the two numbers a parent asks about first. */
export function ProgressPanel({ view, idPrefix = "progress" }: { view: CaseView; idPrefix?: string }) {
  const t = useT();
  const lang = useLang();
  const d = view.deadline;
  const meta = DEADLINE[d.status];
  const Icon = meta.icon;
  const days = d.days_remaining;
  const used = days == null ? 0 : Math.min(100, Math.max(0, Math.round(((d.legal_days - days) / d.legal_days) * 100)));
  return (
    <section aria-labelledby={`${idPrefix}-title`} className="card overflow-hidden">
      <div className="flex items-center gap-4 p-4 sm:p-5">
        <Ring percent={view.progress.percent} size={84} label={t("resident.progress.ring")}>
          <CountUp value={view.progress.percent} format={(n) => `${Math.round(n)}%`} className="text-[22px]" />
        </Ring>
        <div className="min-w-0">
          <h2 id={`${idPrefix}-title`} className="text-lg leading-snug">{t("resident.progress.title")}</h2>
          <p className="mt-0.5 text-sm text-muted num">{t("resident.progress.count", { done: view.progress.done, total: view.progress.total })}</p>
        </div>
      </div>
      <div className="border-t border-line bg-paper-2/40 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] font-medium text-ink-2">{t("deadline.title")}</p>
          <Badge tone={meta.tone} icon={<Icon className="h-3.5 w-3.5" aria-hidden />}>{t(`deadline.${d.status}`)}</Badge>
        </div>
        <p className="mt-1.5 font-display text-[26px] leading-tight num">
          {d.status === "COMPLETE" ? t("resident.deadline.met")
            : days == null ? t("resident.deadline.unknown")
            : days >= 0 ? t("deadline.daysLeft", { n: days }) : t("deadline.overdue", { n: Math.abs(days) })}
        </p>
        {d.deadline_date && (
          <p className="mt-0.5 text-sm text-muted">{t("resident.deadline.date", { date: fmtDay(d.deadline_date, lang), days: d.legal_days })}</p>
        )}
        {d.status !== "COMPLETE" && days != null && (
          <div className="mt-3">
            <FillBar percent={used} tone={meta.tone} label={t("resident.deadline.elapsed", { percent: used })} />
            <p className="mt-1.5 text-xs text-muted num">{t("resident.deadline.elapsed", { percent: used })}</p>
          </div>
        )}
        <p className="mt-2.5 text-[11px] leading-relaxed text-faint">{t("resident.deadline.source", { source: d.source })}</p>
      </div>
    </section>
  );
}
