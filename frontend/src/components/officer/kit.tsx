import { motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle, Ban, Bot, Building2, Check, CheckCircle2, Copy, KeyRound, Landmark, Minus, Radio, Search, ShieldAlert, ShieldCheck, UserRound, X,
  type LucideIcon,
} from "lucide-react";
import {
  Children, useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type TdHTMLAttributes, type ThHTMLAttributes,
} from "react";
import { CountUp, Stagger, StaggerItem, TextReveal } from "../../animations/motion";
import { ease, rise } from "../../animations/variants";
import { ApiError } from "../../api/client";
import { useLang, useT, type MessageKey } from "../../i18n";
import en from "../../i18n/en";
import { cn, fmtDateTime, relative, titleCase } from "../../lib/format";
import { CASE_STATUS, NODE_STATE, SOURCE, TONE, type Tone } from "../../lib/status";
import { useAuth } from "../../stores/auth";
import type { CaseStatus, Deadline, NodeState, Source } from "../../types/api";
import { Badge } from "../ui/primitives";

/* ---------------------------------------------------------------------------------------------------------------
 * Small helpers shared by every officer / admin screen.
 * ------------------------------------------------------------------------------------------------------------- */

/** Translate a key built at runtime from a backend enum. Unknown enum values fall back to a readable title. */
export function useTx() {
  const t = useT();
  return useCallback(
    (key: string, fallback?: string, params?: Record<string, string | number>) =>
      key in en ? t(key as MessageKey, params) : (fallback ?? titleCase(key.split(".").pop() ?? key)),
    [t],
  );
}

/** Approve / release controls render only for staff. The API enforces it anyway (403 + audited denial). */
export function useIsStaff() {
  const role = useAuth((s) => s.user?.role);
  return role === "OFFICER" || role === "ADMIN";
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

export interface ErrorView { title: string; lines: string[]; forbidden: boolean }

/** Turns API errors into calm, specific copy: 403 explains the gate, 409 the conflict, 422 lists each field. */
export function useErrorText() {
  const t = useT();
  return useCallback((e: unknown): ErrorView => {
    if (e instanceof ApiError) {
      if (e.status === 403) return { title: t("officer.error.forbiddenTitle"), lines: [e.message, t("officer.error.forbiddenHint")], forbidden: true };
      if (e.status === 409) return { title: t("officer.error.conflictTitle"), lines: [e.message], forbidden: false };
      if (e.status === 422 && Array.isArray(e.details)) {
        const lines = (e.details as { loc?: string[]; msg?: string }[]).map((d) => `${(d.loc ?? []).filter((x) => x !== "body").join(".")}: ${d.msg ?? ""}`);
        return { title: e.message, lines, forbidden: false };
      }
      return { title: e.message, lines: [], forbidden: false };
    }
    return { title: (e as Error)?.message ?? t("common.error"), lines: [], forbidden: false };
  }, [t]);
}

export function InlineError({ error, className }: { error: unknown; className?: string }) {
  const describe = useErrorText();
  if (!error) return null;
  const d = describe(error);
  const Icon = d.forbidden ? ShieldAlert : AlertTriangle;
  return (
    <div role="alert" className={cn("flex items-start gap-2.5 rounded-xl border border-rose/30 bg-rose-soft px-3.5 py-2.5 text-sm text-rose", className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="font-medium">{d.title}</p>
        {d.lines.map((l, i) => <p key={i} className="mt-0.5 text-[13px] text-rose/90">{l}</p>)}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------------------------
 * Page furniture: a start-aligned header and a start-aligned empty state. Staff screens are dense control rooms,
 * so nothing here is centred and the header carries no bottom margin (pages stack with space-y-5/6).
 * ------------------------------------------------------------------------------------------------------------- */

export function PageHead({ eyebrow, title, subtitle, actions, eyebrowClassName, children }: {
  eyebrow?: ReactNode; title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrowClassName?: string; children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 max-w-3xl">
        {eyebrow && <p className={cn("eyebrow mb-1.5 flex flex-wrap items-center gap-1.5", eyebrowClassName)}>{eyebrow}</p>}
        <TextReveal key={title} as="h1" text={title} className="text-[1.75rem] leading-[1.15] sm:text-[2.1rem]" />
        {subtitle && <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">{subtitle}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyNote({ icon, title, hint, action, className }: { icon?: ReactNode; title: ReactNode; hint?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-2xl border border-dashed border-line-2 bg-surface/60 px-4 py-4 sm:px-5", className)}>
      {icon && <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-paper-2 text-muted [&>svg]:h-4.5 [&>svg]:w-4.5">{icon}</span>}
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="font-medium leading-snug text-ink">{title}</p>
        {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------------------------
 * Motion for lists and tables. Rows enter once (opacity + a 6px rise, capped stagger) and keep their identity by key,
 * so an SSE refresh never replays the whole table: only inserted rows animate in and removed rows fade out.
 * ------------------------------------------------------------------------------------------------------------- */

export function useRowMotion() {
  const reduce = useReducedMotion();
  return useCallback((i: number) => (reduce ? {} : {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.32, ease, delay: Math.min(i * 0.045, 0.36) } },
    exit: { opacity: 0, transition: { duration: 0.18 } },
    transition: { layout: { duration: 0.35, ease } },
  }), [reduce]);
}

/** Cards that leave a list (released, resolved) collapse out to the side while their neighbours slide up. */
export function useCardMotion() {
  const reduce = useReducedMotion();
  return useCallback((i: number) => (reduce ? {} : {
    layout: true as const,
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease, delay: Math.min(i * 0.06, 0.36) } },
    exit: { opacity: 0, x: 24, scale: 0.98, transition: { duration: 0.28, ease } },
    transition: { layout: { duration: 0.4, ease } },
  }), [reduce]);
}

/* ---------------------------------------------------------------------------------------------------------------
 * Tables: crisp, sticky headers, tabular numerals, captions for screen readers. On narrow screens a table scrolls
 * inside its own box (never the page), optionally with a sticky first column.
 * ------------------------------------------------------------------------------------------------------------- */

export function TableFrame({ caption, children, className, maxH = "max-h-[70vh]", dense, stickyFirst, minW }: {
  caption: string; children: ReactNode; className?: string; maxH?: string | false; dense?: boolean; stickyFirst?: boolean; minW?: string;
}) {
  return (
    <div className={cn("card overflow-hidden", className)}>
      <div className={cn("scroll-thin relative overflow-auto overscroll-x-contain", maxH)}>
        <table
          className={cn(
            "w-full border-separate border-spacing-0 text-sm",
            minW,
            dense && "[&_td]:px-2.5 [&_th]:px-2.5 [&_th]:whitespace-normal [&_th]:leading-snug",
            stickyFirst && "[&_tr>*:first-child]:sticky [&_tr>*:first-child]:start-0 [&_tr>*:first-child]:border-e [&_tr>*:first-child]:border-e-line [&_td:first-child]:z-[5] [&_td:first-child]:bg-surface [&_thead_th:first-child]:z-20",
          )}
        >
          <caption className="sr-only">{caption}</caption>
          {children}
        </table>
      </div>
    </div>
  );
}

export function Th({ children, className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      {...rest}
      className={cn(
        "sticky top-0 z-10 whitespace-nowrap border-b border-line bg-paper-2 px-3 py-2.5 text-start font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td {...rest} className={cn("border-b border-line px-3 py-2.5 align-middle", className)} />;
}

export function CopyButton({ value, label, className }: { value: string; label: string; className?: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard unavailable (insecure context) - the value stays selectable */
        }
      }}
      className={cn("relative inline-grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-md text-faint transition-colors hover:bg-paper-2 hover:text-ink", className)}
    >
      {done ? <Check className="h-3.5 w-3.5 text-civic" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      <span className="sr-only" role="status">{done ? t("officer.common.copied") : ""}</span>
    </button>
  );
}

export function RelTime({ iso, className }: { iso: string | null | undefined; className?: string }) {
  const lang = useLang();
  if (!iso) return <span className="text-faint">-</span>;
  return <time dateTime={iso} title={fmtDateTime(iso, lang)} className={cn("num whitespace-nowrap", className)}>{relative(iso, lang)}</time>;
}

export function AbsTime({ iso, className }: { iso: string | null | undefined; className?: string }) {
  const lang = useLang();
  if (!iso) return <span className="text-faint">-</span>;
  return <time dateTime={iso} title={relative(iso, lang)} className={cn("num whitespace-nowrap", className)}>{fmtDateTime(iso, lang)}</time>;
}

export function BoolMark({ value, yes, no }: { value: boolean | null | undefined; yes?: string; no?: string }) {
  const t = useT();
  if (value == null) return <span className="text-faint"><Minus className="inline h-3.5 w-3.5" aria-hidden /><span className="sr-only">-</span></span>;
  return value ? (
    <span className="inline-flex items-center gap-1 text-civic"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />{yes ?? t("common.yes")}</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-muted"><X className="h-3.5 w-3.5" aria-hidden />{no ?? t("common.no")}</span>
  );
}

/* ---------------------------------------------------------------------------------------------------------------
 * Panels, notices, KPI tiles
 * ------------------------------------------------------------------------------------------------------------- */

export function Panel({ title, eyebrow, hint, action, children, className, bodyClassName }: {
  title: ReactNode; eyebrow?: ReactNode; hint?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string;
}) {
  const id = useId();
  return (
    <motion.section variants={rise} initial="initial" animate="animate" aria-labelledby={id} className={cn("card p-4 sm:p-5", className)}>
      <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
          <h2 id={id} className="text-xl leading-tight">{title}</h2>
          {hint && <p className="mt-1 max-w-2xl text-sm text-muted">{hint}</p>}
        </div>
        {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
      </header>
      <div className={bodyClassName}>{children}</div>
    </motion.section>
  );
}

export function Notice({ tone = "slate", icon: Icon, title, children, className }: { tone?: Tone; icon?: LucideIcon; title?: ReactNode; children?: ReactNode; className?: string }) {
  const m = TONE[tone];
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border px-3.5 py-2.5 text-sm", m.bg, m.border, className)}>
      {Icon && <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", m.text)} aria-hidden />}
      <div className="min-w-0 text-ink-2">
        {title && <p className={cn("font-medium", m.text)}>{title}</p>}
        {children && <div className={title ? "mt-0.5" : undefined}>{children}</div>}
      </div>
    </div>
  );
}

/** KPI number: counts up when it first scrolls into view, then eases between values on refresh. */
function KpiValue({ value }: { value: ReactNode }) {
  if (typeof value === "number") return <CountUp value={value} duration={0.9} />;
  return <>{value}</>;
}

export function KpiTile({ label, value, icon: Icon, tone = "slate", active, onClick, hint }: {
  label: string; value: ReactNode; icon: LucideIcon; tone?: Tone; active?: boolean; onClick?: () => void; hint?: string;
}) {
  const m = TONE[tone];
  const body = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="eyebrow line-clamp-2 leading-snug">{label}</span>
        <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full", m.bg, m.text)}><Icon className="h-3.5 w-3.5" aria-hidden /></span>
      </span>
      <span className="mt-1.5 block text-[26px] font-semibold leading-none tracking-tight text-ink"><KpiValue value={value} /></span>
      {hint && <span className="mt-1.5 block truncate text-xs text-muted">{hint}</span>}
    </>
  );
  const cls = cn(
    "card relative block h-full w-full overflow-hidden px-3.5 py-3 text-start transition-[border-color,box-shadow,transform] duration-200 sm:px-4",
    active && "border-ink/60 ring-2 ring-ink/10",
  );
  if (!onClick) return <div className={cls}>{body}</div>;
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cn(cls, "cursor-pointer hover:-translate-y-0.5 hover:border-ink/40 active:translate-y-0 active:scale-[0.99]")}>
      {active && <motion.span layoutId="kpi-active-bar" aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-ink" transition={{ duration: 0.3, ease }} />}
      {body}
    </button>
  );
}

/** Grid of KPI tiles that enter one after another (a calm 50ms stagger). */
export function KpiGrid({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <section aria-label={label}>
      <Stagger className={cn("grid grid-cols-2 gap-3", className)} gap={0.05}>
        {Children.toArray(children).map((c, i) => <StaggerItem key={i} className="min-w-0">{c}</StaggerItem>)}
      </Stagger>
    </section>
  );
}

/* ---------------------------------------------------------------------------------------------------------------
 * Badges for officer vocabulary
 * ------------------------------------------------------------------------------------------------------------- */

const ACTOR: Record<string, { tone: Tone; icon: LucideIcon }> = {
  SYSTEM: { tone: "slate", icon: Building2 },
  AI_AGENT: { tone: "azure", icon: Bot },
  RESIDENT: { tone: "amber", icon: UserRound },
  OFFICER: { tone: "violet", icon: ShieldCheck },
  ADMIN: { tone: "violet", icon: KeyRound },
  GOVERNMENT_ENTITY: { tone: "civic", icon: Landmark },
  PROVIDER: { tone: "slate", icon: Radio },
};
export const ACTOR_TYPES = Object.keys(ACTOR);

export function ActorTypeBadge({ type }: { type: string }) {
  const tx = useTx();
  const m = ACTOR[type] ?? { tone: "slate" as Tone, icon: Building2 };
  const Icon = m.icon;
  return <Badge tone={m.tone} icon={<Icon className="h-3.5 w-3.5" aria-hidden />}>{tx(`officer.actorType.${type}`)}</Badge>;
}

export function ResultBadge({ result }: { result: string }) {
  const tx = useTx();
  const up = result.toUpperCase();
  if (up === "DENIED") return <Badge tone="rose" icon={<Ban className="h-3.5 w-3.5" aria-hidden />}>{tx("officer.result.DENIED")}</Badge>;
  if (up === "SUCCESS" || up === "OK") return <Badge tone="civic" icon={<CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}>{tx("officer.result.SUCCESS")}</Badge>;
  if (up === "FAILED" || up === "ERROR") return <Badge tone="rose" icon={<AlertTriangle className="h-3.5 w-3.5" aria-hidden />}>{tx(`officer.result.${up}`)}</Badge>;
  return <Badge tone="slate">{titleCase(result)}</Badge>;
}

/* The shared badges speak to the resident ("You", "Needs you"). Officer screens use the same tones and icons with
 * officer-facing wording; unknown enum values degrade to a readable title instead of crashing. */

const iconEl = (Icon: LucideIcon, spin?: boolean) => <Icon className={cn("h-3.5 w-3.5", spin && "animate-spin")} aria-hidden />;

export function SafeSourceBadge({ source }: { source: string }) {
  const tx = useTx();
  const t = useT();
  if (!(source in SOURCE)) return <Badge tone="slate">{titleCase(source)}</Badge>;
  const m = SOURCE[source as Source];
  return <Badge tone={m.tone} icon={iconEl(m.icon)}>{tx(`officer.source.${source}`, t(`source.${source as Source}`))}</Badge>;
}

export function SafeStateBadge({ state }: { state: string }) {
  const tx = useTx();
  const t = useT();
  if (!(state in NODE_STATE)) return <Badge tone="slate">{titleCase(state)}</Badge>;
  const m = NODE_STATE[state as NodeState];
  return <Badge tone={m.tone} icon={iconEl(m.icon, m.spin)}>{tx(`officer.state.${state}`, t(`state.${state as NodeState}`))}</Badge>;
}

export function OfficerCaseStatusBadge({ status }: { status: string }) {
  const tx = useTx();
  const t = useT();
  if (!(status in CASE_STATUS)) return <Badge tone="slate">{titleCase(status)}</Badge>;
  const m = CASE_STATUS[status as CaseStatus];
  return <Badge tone={m.tone} icon={iconEl(m.icon)}>{tx(`officer.caseStatus.${status}`, t(`case.status.${status as CaseStatus}`))}</Badge>;
}

/** Officer-facing label for a case status or node state (used in charts and selects). */
export function useStatusLabel() {
  const tx = useTx();
  return useCallback((kind: "case" | "state", value: string) =>
    kind === "case" ? tx(`officer.caseStatus.${value}`, tx(`case.status.${value}`)) : tx(`officer.state.${value}`, tx(`state.${value}`)), [tx]);
}

const DEADLINE_TONE: Record<Deadline["status"], Tone> = { ON_TRACK: "civic", AT_RISK: "amber", OVERDUE: "rose", COMPLETE: "slate" };

export function DeadlineText({ deadline, compact }: { deadline: Deadline; compact?: boolean }) {
  const t = useT();
  const tone = TONE[DEADLINE_TONE[deadline.status] ?? "slate"];
  const d = deadline.days_remaining;
  const text = deadline.status === "COMPLETE" ? t("deadline.COMPLETE")
    : d == null ? "-"
      : d < 0 ? (compact ? t("officer.deadline.overdueShort", { n: Math.abs(d) }) : t("deadline.overdue", { n: Math.abs(d) }))
        : compact ? t("officer.deadline.daysShort", { n: d }) : t("deadline.daysLeft", { n: d });
  return (
    <span className={cn("num inline-flex items-center gap-1.5 whitespace-nowrap", tone.text)} title={`${t("deadline.title")}: ${deadline.deadline_date ?? "-"} · ${t(`deadline.${deadline.status}`)}`}>
      <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} aria-hidden />
      {text}
      {!compact && <span className="sr-only">{t(`deadline.${deadline.status}`)}</span>}
    </span>
  );
}

/** A field the agent prepared. Emirates IDs only ever appear as tokens; we render them as such, never as a number. */
export function FieldValue({ name, value }: { name?: string; value: unknown }) {
  const t = useT();
  const isToken = !!name?.endsWith("_token") || (typeof value === "string" && /\btoken\b/i.test(value));
  if (isToken) {
    return (
      <span title={typeof value === "string" ? value : undefined} className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-violet/30 bg-violet-soft px-1.5 py-0.5 font-mono text-[11px] text-violet">
        <KeyRound className="h-3 w-3" aria-hidden />{t("officer.field.token")}
      </span>
    );
  }
  if (value == null || value === "") return <span className="text-faint">-</span>;
  if (typeof value === "boolean") return <>{value ? t("common.yes") : t("common.no")}</>;
  if (Array.isArray(value)) return <>{value.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ")}</>;
  if (typeof value === "object") return <code className="break-all font-mono text-xs">{JSON.stringify(value)}</code>;
  return <>{String(value)}</>;
}

export function PreparedFields({ fields, dense }: { fields: { name: string; label: string; value: unknown }[]; dense?: boolean }) {
  const t = useT();
  if (!fields.length) return <p className="text-sm text-muted">{t("officer.field.none")}</p>;
  return (
    <dl className={cn("grid gap-x-6 gap-y-0 text-sm", !dense && "sm:grid-cols-2")}>
      {fields.map((f) => (
        <div key={f.name} className="flex items-baseline justify-between gap-3 border-b border-dashed border-line py-1.5">
          <dt className="min-w-0 truncate text-muted" title={f.name}>{f.label}</dt>
          <dd className="min-w-0 text-end font-medium break-words"><FieldValue name={f.name} value={f.value} /></dd>
        </div>
      ))}
    </dl>
  );
}

export function JsonBlock({ value, label }: { value: unknown; label: string }) {
  return (
    <pre aria-label={label} className="scroll-thin max-h-72 overflow-auto rounded-xl border border-line bg-stage px-4 py-3 font-mono text-[11.5px] leading-relaxed text-ink-2" dir="ltr">
      {JSON.stringify(value ?? {}, null, 2)}
    </pre>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono text-[12px]", className)} dir="ltr">{children}</span>;
}

/* ---------------------------------------------------------------------------------------------------------------
 * Accessible tab strip with arrow-key navigation (RTL aware) and an animated ink underline. Scrolls sideways on
 * phones and keeps the active tab in view.
 * ------------------------------------------------------------------------------------------------------------- */

export function SectionTabs<T extends string>({ value, onChange, items, label, idBase }: {
  value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number; icon?: LucideIcon; alert?: boolean }[]; label: string; idBase: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const strip = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const index = items.findIndex((it) => it.value === value);
  useEffect(() => {
    const el = refs.current[index];
    const box = strip.current;
    if (!el || !box) return;
    const left = el.offsetLeft - box.offsetLeft;
    if (left < box.scrollLeft || left + el.offsetWidth > box.scrollLeft + box.clientWidth) {
      box.scrollTo({ left: Math.max(0, left - 24), behavior: reduce ? "auto" : "smooth" });
    }
  }, [index, reduce]);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const rtl = document.documentElement.dir === "rtl";
    let next = -1;
    if (e.key === (rtl ? "ArrowLeft" : "ArrowRight")) next = (i + 1) % items.length;
    else if (e.key === (rtl ? "ArrowRight" : "ArrowLeft")) next = (i - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    if (next >= 0) {
      e.preventDefault();
      refs.current[next]?.focus();
      onChange(items[next].value);
    }
  };
  return (
    <div ref={strip} role="tablist" aria-label={label} className="scroll-thin -mx-1 flex gap-0.5 overflow-x-auto overscroll-x-contain border-b border-line px-1">
      {items.map((it, i) => {
        const on = it.value === value;
        const Icon = it.icon;
        return (
          <button
            key={it.value}
            ref={(el) => { refs.current[i] = el; }}
            role="tab"
            type="button"
            id={`${idBase}-tab-${it.value}`}
            aria-selected={on}
            aria-controls={`${idBase}-panel-${it.value}`}
            tabIndex={on ? 0 : -1}
            onKeyDown={(e) => onKey(e, i)}
            onClick={() => onChange(it.value)}
            className={cn(
              "relative inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-t-lg px-3 py-2 text-[13.5px] transition-colors",
              on ? "font-medium text-ink" : "text-muted hover:bg-paper-2/70 hover:text-ink",
            )}
          >
            {Icon && <Icon className="h-4 w-4" aria-hidden />}
            {it.label}
            {it.count != null && (
              <span className={cn("num rounded-full px-1.5 text-[11px] transition-colors", it.alert ? "bg-rose-soft text-rose" : on ? "bg-ink text-paper" : "bg-paper-2 text-muted")}>{it.count}</span>
            )}
            {on && <motion.span layoutId={`${idBase}-ink`} aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-ink" transition={reduce ? { duration: 0 } : { duration: 0.32, ease }} />}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ idBase, value, children }: { idBase: string; value: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      key={value}
      role="tabpanel"
      id={`${idBase}-panel-${value}`}
      aria-labelledby={`${idBase}-tab-${value}`}
      tabIndex={0}
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease }}
      className="pt-4 outline-none"
    >
      {children}
    </motion.div>
  );
}

/** Small segmented control used for filters (queue tabs, status filters, chart/table toggles). The ink pill slides. */
export function Segmented<T extends string>({ value, onChange, items, label, size = "md" }: {
  value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; count?: number }[]; label: string; size?: "sm" | "md";
}) {
  const pill = useId();
  const reduce = useReducedMotion();
  return (
    <div role="group" aria-label={label} className="scroll-thin inline-flex max-w-full gap-0.5 overflow-x-auto overscroll-x-contain rounded-full border border-line bg-surface p-1">
      {items.map((it) => {
        const on = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(it.value)}
            className={cn(
              "relative inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full transition-colors",
              size === "sm" ? "min-h-9 px-3 text-xs sm:min-h-7 sm:px-2.5" : "min-h-9 px-3.5 text-[13px] sm:min-h-8",
              on ? "text-paper" : "text-ink-2 hover:bg-paper-2",
            )}
          >
            {on && <motion.span layoutId={pill} aria-hidden className="absolute inset-0 rounded-full bg-ink" transition={reduce ? { duration: 0 } : { duration: 0.3, ease }} />}
            <span className="relative inline-flex items-center gap-1.5">
              {it.label}
              {it.count != null && <span className={cn("num rounded-full px-1.5 text-[11px]", on ? "bg-paper/20" : "bg-paper-2 text-muted")}>{it.count}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function SearchInput({ value, onChange, label, placeholder, className }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string; className?: string }) {
  const id = useId();
  return (
    <div className={cn("relative", className)}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-full border border-line-2 bg-surface pe-4 ps-9 text-sm outline-none transition-colors placeholder:text-faint focus:border-ink/50 focus:ring-2 focus:ring-ink/10"
      />
    </div>
  );
}

export const SELECT_CLS = "h-10 cursor-pointer rounded-full border border-line-2 bg-surface px-3.5 text-sm outline-none focus:border-ink/50 focus:ring-2 focus:ring-ink/10";
