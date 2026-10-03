import { motion, useReducedMotion } from "framer-motion";
import { BarChart3, Table2 } from "lucide-react";
import { useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { useGsap } from "../../animations/motion";
import { ease } from "../../animations/variants";
import { useT } from "../../i18n";
import { cn } from "../../lib/format";
import { TONE, type Tone } from "../../lib/status";

/* Hand-built, library-free charts. Thin marks, 4px rounded data-ends anchored at the start, 2px gaps between stacked
 * segments, values printed in ink (never only in colour), and every chart has a table twin. Bars grow from their
 * start edge (GSAP scaleX, transform only) the first time they scroll into view; reduced motion shows them at rest. */

export interface BarRow { key: string; label: ReactNode; value: number; display?: string; tone?: Tone; title?: string }

/** Grows every `[data-grow]` element inside `scope` from scaleX 0 when it enters the viewport (once per mount). */
export function useGrowOnView(scope: RefObject<HTMLElement | null>, axis: "x" | "y" = "x") {
  useGsap(scope, ({ gsap, ScrollTrigger, reduce }) => {
    if (reduce) return;
    const els = gsap.utils.toArray<HTMLElement>("[data-grow]");
    if (!els.length) return;
    const prop = axis === "x" ? "scaleX" : "scaleY";
    gsap.set(els, { [prop]: 0 });
    ScrollTrigger.batch(els, {
      start: "top 95%",
      once: true,
      onEnter: (batch) => gsap.to(batch, { [prop]: 1, duration: 0.75, ease: "power3.out", stagger: 0.06, overwrite: true }),
    });
  }, []);
}

export function ChartCard({ title, hint, eyebrow, children, table, className, aside }: {
  title: ReactNode; hint?: ReactNode; eyebrow?: ReactNode; children: ReactNode; table: ReactNode; className?: string; aside?: ReactNode;
}) {
  const t = useT();
  const id = useId();
  const pill = useId();
  const reduce = useReducedMotion();
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <section aria-labelledby={id} className={cn("card flex min-w-0 flex-col p-4 sm:p-5", className)}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
          <h3 id={id} className="text-lg leading-tight">{title}</h3>
          {hint && <p className="mt-1 text-[13px] text-muted">{hint}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {aside}
          <div role="group" aria-label={t("officer.chart.view")} className="inline-flex rounded-full border border-line p-0.5">
            {(["chart", "table"] as const).map((v) => {
              const Icon = v === "chart" ? BarChart3 : Table2;
              const on = view === v;
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={on}
                  aria-label={v === "chart" ? t("officer.chart.asChart") : t("officer.chart.asTable")}
                  title={v === "chart" ? t("officer.chart.asChart") : t("officer.chart.asTable")}
                  onClick={() => setView(v)}
                  className={cn("relative grid h-9 w-9 cursor-pointer place-items-center rounded-full transition-colors sm:h-7 sm:w-7", on ? "text-paper" : "text-muted hover:bg-paper-2")}
                >
                  {on && <motion.span layoutId={pill} aria-hidden className="absolute inset-0 rounded-full bg-ink" transition={reduce ? { duration: 0 } : { duration: 0.28, ease }} />}
                  <Icon className="relative h-3.5 w-3.5" aria-hidden />
                </button>
              );
            })}
          </div>
        </div>
      </header>
      <motion.div key={view} className="min-w-0 flex-1" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
        {view === "chart" ? children : table}
      </motion.div>
    </section>
  );
}

export function MiniTable({ head, rows, caption }: { head: ReactNode[]; rows: ReactNode[][]; caption: string }) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>{head.map((h, i) => <th key={i} scope="col" className={cn("border-b border-line pb-2 font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted", i === 0 ? "text-start" : "text-end")}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => j === 0
              ? <th key={j} scope="row" className="border-b border-line py-2 text-start font-normal">{c}</th>
              : <td key={j} className="num border-b border-line py-2 text-end">{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** One series -> one colour for every bar. Values are printed at the bar end. */
export function HBars({ rows, max, tone = "azure", labelWidth = "w-40", empty }: { rows: BarRow[]; max?: number; tone?: Tone; labelWidth?: string; empty?: string }) {
  const ref = useRef<HTMLUListElement>(null);
  useGrowOnView(ref);
  const top = Math.max(max ?? 0, ...rows.map((r) => r.value), 1);
  if (!rows.length) return <p className="py-4 text-sm text-muted">{empty ?? "-"}</p>;
  return (
    <ul ref={ref} className="space-y-2.5">
      {rows.map((r) => {
        const pct = (r.value / top) * 100;
        const color = TONE[r.tone ?? tone].solid;
        return (
          <li key={r.key} className="grid grid-cols-[minmax(0,auto)_1fr_auto] items-center gap-3" title={r.title}>
            <span className={cn("max-w-[45vw] truncate text-[13px] text-ink-2 sm:max-w-none", labelWidth)}>{r.label}</span>
            <span className="relative h-2 min-w-12 rounded-full bg-paper-2" aria-hidden>
              <span
                data-grow
                className="absolute inset-y-0 start-0 origin-left rounded-e-[4px] rounded-s-[1px] rtl:origin-right"
                style={{ background: color, width: `${Math.max(pct, r.value > 0 ? 1.5 : 0)}%` }}
              />
            </span>
            <span className="num min-w-10 text-end text-[13px] font-medium text-ink">{r.display ?? r.value}</span>
          </li>
        );
      })}
    </ul>
  );
}

export interface Segment { key: string; label: string; value: number; tone: Tone }

/** A 100%-stacked bar with 2px surface gaps between segments; counts listed underneath so colour is never the only cue. */
export function StackedBar({ label, segments, sublabel }: { label: ReactNode; segments: Segment[]; sublabel?: ReactNode }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const shown = segments.filter((s) => s.value > 0);
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="truncate text-[13.5px] font-medium">{label}</span>
        <span className="num shrink-0 text-xs text-muted">{sublabel}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-[4px] bg-paper-2">
        <div data-grow className="flex h-full w-full origin-left gap-[2px] rtl:origin-right" role="img" aria-label={shown.map((s) => `${s.label}: ${s.value}`).join(", ") || "0"}>
          {shown.map((s) => (
            <span
              key={s.key}
              title={`${s.label}: ${s.value}`}
              className="h-full first:rounded-s-[4px] last:rounded-e-[4px]"
              style={{ background: TONE[s.tone].solid, flexGrow: s.value / Math.max(total, 1), flexBasis: 0 }}
            />
          ))}
        </div>
      </div>
      <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-muted">
        {shown.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-[2px]" style={{ background: TONE[s.tone].solid }} aria-hidden />
            {s.label} <span className="num font-medium text-ink">{s.value}</span>
          </span>
        ))}
      </p>
    </div>
  );
}

/** A group of stacked bars that grow in together. */
export function StackedGroup({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useGrowOnView(ref);
  return <div ref={ref} className={className}>{children}</div>;
}

export function Legend({ items }: { items: { key: string; label: string; tone: Tone }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {items.map((it) => (
        <li key={it.key} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: TONE[it.tone].solid }} aria-hidden />
          {it.label}
        </li>
      ))}
    </ul>
  );
}
