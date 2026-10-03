import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { Footprints, Keyboard, PhoneOff, UserRoundCheck } from "lucide-react";
import { useState } from "react";
import { Stagger, StaggerItem } from "../../animations/motion";
import { ease } from "../../animations/variants";
import { useT, type MessageKey } from "../../i18n";
import { cn } from "../../lib/format";

type Mode = "today" | "lifeloop";
type Who = "you" | "you-present" | "lifeloop";

interface Row {
  node: MessageKey;
  entity: MessageKey;
  today: MessageKey;
  lifeloop: MessageKey;
  todayRetype: boolean;
  lifeloopWho: Who;
  parent?: boolean;
}

const ROWS: Row[] = [
  { node: "node.BIRTH_CERTIFICATE", entity: "landing.flow.entity.dha", today: "landing.journey.bc.today", lifeloop: "landing.journey.bc.lifeloop", todayRetype: true, lifeloopWho: "lifeloop" },
  { node: "node.MOFA_ATTESTATION", entity: "landing.flow.entity.mofa", today: "landing.journey.mofa.today", lifeloop: "landing.journey.mofa.lifeloop", todayRetype: true, lifeloopWho: "lifeloop" },
  { node: "node.CONSULATE_PASSPORT", entity: "landing.flow.entity.consulate", today: "landing.journey.consulate.today", lifeloop: "landing.journey.consulate.lifeloop", todayRetype: true, lifeloopWho: "you-present", parent: true },
  { node: "node.RESIDENCE_VISA", entity: "landing.flow.entity.gdrfa", today: "landing.journey.visa.today", lifeloop: "landing.journey.visa.lifeloop", todayRetype: true, lifeloopWho: "lifeloop" },
  { node: "node.EMIRATES_ID", entity: "landing.flow.entity.icp", today: "landing.journey.eid.today", lifeloop: "landing.journey.eid.lifeloop", todayRetype: true, lifeloopWho: "you-present" },
  { node: "node.INSURANCE", entity: "landing.flow.entity.insurer", today: "landing.journey.ins.today", lifeloop: "landing.journey.ins.lifeloop", todayRetype: true, lifeloopWho: "lifeloop" },
];

const COUNTS: Record<Mode, [number, number, number]> = { today: [6, 7, 6], lifeloop: [1, 2, 1] };
const COUNT_LABELS: MessageKey[] = ["landing.journey.count.entities", "landing.journey.count.visits", "landing.journey.count.reentries"];

function WhoChip({ who }: { who: Who | "you-today" }) {
  const t = useT();
  const base = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-medium";
  if (who === "lifeloop") return <span className={cn(base, "bg-civic-soft text-civic")}><UserRoundCheck className="h-3.5 w-3.5" aria-hidden />{t("landing.journey.who.lifeloop")}</span>;
  if (who === "you-present") return <span className={cn(base, "bg-amber-soft text-amber")}><Footprints className="h-3.5 w-3.5" aria-hidden />{t("landing.journey.who.present")}</span>;
  return <span className={cn(base, "bg-rose-soft text-rose")}><Footprints className="h-3.5 w-3.5" aria-hidden />{t("landing.journey.who.you")}</span>;
}

/** Interactive before/after of the six-entity chain (Idea Canvas boxes D, H and M). */
export function JourneyCompare() {
  const t = useT();
  const reduce = useReducedMotion();
  const [mode, setMode] = useState<Mode>("today");
  const counts = COUNTS[mode];

  return (
    <div className="mt-8 lg:mt-10">
      <div role="tablist" aria-label={t("landing.journey.toggleLabel")} className="inline-flex max-w-full rounded-full border border-line-2 bg-surface p-1 shadow-(--shadow-card)">
        <LayoutGroup id="journey-toggle">
          {(["today", "lifeloop"] as Mode[]).map((m) => (
            <button
              key={m} role="tab" type="button" aria-selected={mode === m} aria-controls="journey-panel" id={`journey-tab-${m}`}
              onClick={() => setMode(m)}
              className={cn("relative min-h-10 cursor-pointer rounded-full px-5 text-sm font-medium transition-colors",
                mode === m ? (m === "today" ? "text-paper" : "text-on-accent") : "text-ink-2 hover:text-ink")}
            >
              {mode === m && <motion.span layoutId="journey-pill" className={cn("absolute inset-0 rounded-full", m === "today" ? "bg-ink" : "bg-civic")} transition={{ duration: reduce ? 0 : 0.35, ease }} />}
              <span className="relative">{t(m === "today" ? "landing.journey.today" : "landing.journey.lifeloop")}</span>
            </button>
          ))}
        </LayoutGroup>
      </div>

      <div id="journey-panel" role="tabpanel" aria-labelledby={`journey-tab-${mode}`} className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,2fr)] lg:gap-6">
        {/* counters */}
        <dl className="grid grid-cols-3 gap-2 sm:gap-3 lg:sticky lg:top-24 lg:grid-cols-1 lg:self-start">
          {counts.map((n, i) => (
            <div key={COUNT_LABELS[i]} className={cn("flex min-w-0 flex-col rounded-2xl border p-3 transition-colors duration-500 sm:p-4", mode === "today" ? "border-line bg-surface" : "border-civic/30 bg-civic-soft/60")}>
              <dt className="text-[12px] leading-snug text-muted sm:text-[12.5px]">{t(COUNT_LABELS[i])}</dt>
              <dd className="mt-auto flex items-baseline gap-2 pt-2">
                <span className="relative inline-grid overflow-hidden">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={`${mode}-${i}`}
                      initial={reduce ? false : { y: "100%", opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={reduce ? undefined : { y: "-100%", opacity: 0 }}
                      transition={{ duration: 0.45, ease, delay: reduce ? 0 : i * 0.06 }}
                      className={cn("num font-display text-[2.6rem] leading-none sm:text-5xl", mode === "today" ? "text-ink" : "text-civic")}
                    >
                      {n}
                    </motion.span>
                  </AnimatePresence>
                </span>
                {mode === "lifeloop" && <span className="hidden font-mono text-[11px] uppercase tracking-[0.12em] text-civic sm:inline">{t("landing.metrics.target")}</span>}
              </dd>
            </div>
          ))}
        </dl>

        {/* six rows */}
        <Stagger as="ol" gap={0.05} className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface shadow-(--shadow-card)">
          {ROWS.map((row, i) => {
            const who: Who | "you-today" = mode === "today" ? "you-today" : row.lifeloopWho;
            return (
              <StaggerItem as="li" key={row.node} className="grid gap-2.5 px-4 py-3.5 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center sm:gap-5 sm:px-6 sm:py-4">
                <span className={cn("hidden font-mono text-[11px] tracking-[0.16em] sm:block", row.parent ? "text-amber" : "text-faint")}>{String(i + 1).padStart(2, "0")}</span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="font-display text-[18px] leading-tight text-ink">{t(row.node)}</span>
                    <span className="text-[12.5px] text-muted">{t(row.entity)}</span>
                    {row.parent && <span className="inline-flex items-center gap-1 text-[11.5px] text-amber"><PhoneOff className="h-3 w-3" aria-hidden />{t("landing.journey.noFeed")}</span>}
                  </p>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.p
                      key={`${mode}-${row.node}`}
                      initial={reduce ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0, transition: { duration: 0.35, ease, delay: reduce ? 0 : i * 0.04 } }}
                      exit={reduce ? undefined : { opacity: 0, transition: { duration: 0.12 } }}
                      className="mt-1 text-[14.5px] leading-relaxed text-ink-2"
                    >
                      {t(mode === "today" ? row.today : row.lifeloop)}
                    </motion.p>
                  </AnimatePresence>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <WhoChip who={who} />
                  {mode === "today" && row.todayRetype && (
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line-2 px-2.5 py-1 text-[12px] text-muted"><Keyboard className="h-3.5 w-3.5" aria-hidden />{t("landing.journey.retype")}</span>
                  )}
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>
      <p className="mt-3 text-[12.5px] text-muted">{t(mode === "today" ? "landing.journey.noteToday" : "landing.journey.noteLifeloop")}</p>
    </div>
  );
}
