import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, CircleDashed, Cpu, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ease } from "../../animations/variants";
import { useT } from "../../i18n";
import { cn } from "../../lib/format";
import type { ScenarioResult } from "../../types/api";
import { tOr } from "./labels";

/** The ten guardrail scenarios (backend/app/agents/testing/scenarios.py): eight must fail, two must pass. */
export const SCENARIOS: { id: string; expectation: "FAIL" | "PASS" }[] = [
  { id: "missing-disclosure", expectation: "FAIL" },
  { id: "invented-approval", expectation: "FAIL" },
  { id: "invented-consulate", expectation: "FAIL" },
  { id: "unsourced-fee", expectation: "FAIL" },
  { id: "eid-read-aloud", expectation: "FAIL" },
  { id: "callback-without-consent", expectation: "FAIL" },
  { id: "callback-after-opt-out", expectation: "FAIL" },
  { id: "approval-bypass", expectation: "FAIL" },
  { id: "multilingual", expectation: "PASS" },
  { id: "escalation", expectation: "PASS" },
];

/** A pass tick or a fail cross drawn stroke by stroke (static under reduced motion). */
function ResultMark({ passed }: { passed: boolean }) {
  const reduce = useReducedMotion();
  const draw = (delay: number) => (reduce ? {} : { initial: { pathLength: 0 }, animate: { pathLength: 1 }, transition: { duration: 0.32, delay, ease } });
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <motion.circle cx="12" cy="12" r="9.5" {...(reduce ? {} : { initial: { pathLength: 0, rotate: -90 }, animate: { pathLength: 1, rotate: -90 }, transition: { duration: 0.45, ease } })} />
      {passed ? (
        <motion.path d="m8 12.4 2.7 2.7L16.2 9.6" {...draw(0.32)} />
      ) : (
        <>
          <motion.path d="m9.2 9.2 5.6 5.6" {...draw(0.32)} />
          <motion.path d="m14.8 9.2-5.6 5.6" {...draw(0.46)} />
        </>
      )}
    </svg>
  );
}

function Row({ index, id, expectation, result, running }: { index: number; id: string; expectation: "FAIL" | "PASS"; result?: ScenarioResult; running?: boolean }) {
  const t = useT();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  // Results tick in one after another rather than all at once.
  const [shown, setShown] = useState<ScenarioResult | undefined>(result);
  useEffect(() => {
    if (!result || reduce) {
      setShown(result);
      return;
    }
    const timer = window.setTimeout(() => setShown(result), index * 140);
    return () => window.clearTimeout(timer);
  }, [result, index, reduce]);

  const title = tOr(t, `demo.scenario.${id}`, shown?.title ?? id);
  const why = tOr(t, `demo.scenario.${id}.why`, "");
  const mustFail = expectation === "FAIL";
  const panelId = `scenario-${id}-transcript`;
  const waiting = running || (!!result && !shown);

  return (
    <li className={cn("overflow-hidden rounded-xl border bg-surface transition-colors duration-500", shown ? (shown.passed ? "border-civic/35" : "border-rose/40") : "border-line")}>
      <div className="flex flex-col gap-2.5 p-3.5 sm:flex-row sm:items-start sm:gap-3.5">
        <div className="flex items-center gap-2.5 sm:flex-col sm:items-start sm:gap-1.5">
          <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors duration-500", !shown ? "bg-paper-2 text-faint" : shown.passed ? "bg-civic-soft text-civic" : "bg-rose-soft text-rose")}>
            {shown ? <ResultMark key={`${shown.id}-${shown.passed}`} passed={shown.passed} /> : waiting ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <CircleDashed className="h-5 w-5" aria-hidden />}
          </span>
          <span className="font-mono text-[10.5px] tracking-[0.16em] text-faint sm:ps-1">{String(index + 1).padStart(2, "0")}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[1.05rem] leading-tight">{title}</h3>
            <span className={cn("rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]", mustFail ? "border-amber/40 bg-amber-soft text-amber" : "border-azure/30 bg-azure-soft text-azure")}>
              {t(mustFail ? "demo.testing.mustFail" : "demo.testing.mustPass")}
            </span>
          </div>
          {why && <p className="mt-1 text-[13px] leading-relaxed text-muted">{why}</p>}

          <AnimatePresence initial={false} mode="wait">
            {shown ? (
              <motion.div
                key="result"
                initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.35, ease, delay: reduce ? 0 : 0.15 }}
                className="mt-2.5 space-y-1.5"
                aria-live="polite"
              >
                <p className={cn("text-[13.5px] font-medium", shown.passed ? "text-civic" : "text-rose")}>
                  {t(shown.passed ? (mustFail ? "demo.testing.caught" : "demo.testing.passed") : (mustFail ? "demo.testing.missed" : "demo.testing.failed"))}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[12px] text-muted">{t("demo.testing.violations")}</span>
                  {shown.violations.length === 0 ? (
                    <span className="text-[12px] text-ink-2">{t("demo.testing.noViolations")}</span>
                  ) : shown.violations.map((v, i) => (
                    <span key={`${v}-${i}`} className="rounded-md border border-rose/25 bg-rose-soft px-1.5 py-0.5 font-mono text-[10.5px] text-rose" dir="ltr">{v}</span>
                  ))}
                </div>
                {shown.system_check && (
                  <p className="flex items-start gap-2 text-[12.5px] text-ink-2">
                    <Cpu className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                    <span><span className="text-muted">{t("demo.testing.systemCheck")} </span><span className="break-all font-mono text-[11.5px]" dir="ltr">{shown.system_check}</span></span>
                  </p>
                )}
              </motion.div>
            ) : (
              <motion.p key="idle" initial={false} exit={{ opacity: 0 }} className="mt-2.5 text-[12.5px] text-faint">
                {waiting ? t("demo.testing.running") : t("demo.testing.notRun")}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        {shown && shown.transcript.length > 0 && (
          <button
            type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={panelId}
            className="inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-1.5 self-start rounded-full border border-line-2 px-3 text-[12.5px] text-ink-2 hover:bg-paper-2 sm:min-h-8"
          >
            {t(open ? "demo.testing.hideTranscript" : "demo.testing.showTranscript", { n: shown.transcript.length })}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-300", open && "rotate-180")} aria-hidden />
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && shown && (
          <motion.div
            id={panelId}
            initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={reduce ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease }}
            className="overflow-hidden border-t border-line bg-paper/60"
          >
            <ol className="space-y-2 p-3.5">
              {shown.transcript.map((line, i) => {
                const agent = line.role.toUpperCase() === "AGENT";
                return (
                  <li key={i} className={cn("flex gap-3 text-[13px] leading-relaxed", !agent && "flex-row-reverse text-end")}>
                    <span className={cn("mt-0.5 w-16 shrink-0 font-mono text-[10px] uppercase tracking-[0.12em]", agent ? "text-civic" : "text-muted")}>{tOr(t, `demo.role.${line.role.toUpperCase()}`, line.role)}</span>
                    <span className={cn("min-w-0 rounded-2xl px-3 py-2", agent ? "bg-surface text-ink" : "bg-ink text-paper")} dir="auto">{line.text}</span>
                  </li>
                );
              })}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

export function ScenarioList({ results, running }: { results?: ScenarioResult[]; running?: boolean }) {
  const byId = new Map((results ?? []).map((r) => [r.id, r]));
  const extra = (results ?? []).filter((r) => !SCENARIOS.some((s) => s.id === r.id));
  return (
    <ol className="space-y-2">
      {SCENARIOS.map((s, i) => <Row key={s.id} index={i} id={s.id} expectation={s.expectation} result={byId.get(s.id)} running={running} />)}
      {extra.map((r, i) => <Row key={r.id} index={SCENARIOS.length + i} id={r.id} expectation={r.expectation} result={r} running={running} />)}
    </ol>
  );
}
