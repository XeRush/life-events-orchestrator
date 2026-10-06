import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Footprints, PhoneOff, UserRoundCheck, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { LiveEvent } from "../../hooks/useLiveStream";
import { useLang, useT } from "../../i18n";
import { cn, relative } from "../../lib/format";
import { NODE_STATE, SOURCE, TONE } from "../../lib/status";
import type { GraphNode, NodeKey, NodeState, TimelineEvent } from "../../types/api";
import { useTimelineText } from "../timeline/CaseTimeline";
import { NodeStateBadge, SourceBadge } from "../ui/StatusBadge";
import { asSource, humanize, tx } from "./text";

type LegendId = "completed" | "active" | "human" | "parent" | "stalled" | "blocked" | "waiting";

const LEGEND: { id: LegendId; states: NodeState[] }[] = [
  { id: "completed", states: ["CLEARED", "COMPLETED"] },
  { id: "active", states: ["PROCESSING", "READY", "SUBMITTING", "SUBMITTED"] },
  { id: "human", states: ["WAITING_FOR_HUMAN"] },
  { id: "parent", states: ["WAITING_FOR_PARENT"] },
  { id: "stalled", states: ["STALLED"] },
  { id: "blocked", states: ["BLOCKED", "DOCUMENT_MISSING", "REJECTED"] },
  { id: "waiting", states: ["PENDING"] },
];

/** What each state looks like and how many of the six steps are in it right now. Icon + words, never colour alone. */
export function GraphLegend({ nodes }: { nodes: GraphNode[] }) {
  const t = useT();
  return (
    <ul className="divide-y divide-line">
      {LEGEND.map((row) => {
        const meta = NODE_STATE[row.states[0]];
        const Icon = meta.icon;
        const count = nodes.filter((n) => row.states.includes(n.state)).length;
        return (
          <li key={row.id} className={cn("flex items-start gap-3 py-2", count === 0 && "opacity-70")}>
            <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full", TONE[meta.tone].bg, TONE[meta.tone].text)}>
              <Icon className="h-3.5 w-3.5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 text-sm">
              <span className="block font-medium">{t(`resident.legend.${row.id}`)}</span>
              <span className="block text-[13px] leading-snug text-muted">{t(`resident.legend.${row.id}Hint`)}</span>
            </span>
            <span className="shrink-0 rounded-full bg-paper-2 px-2 py-0.5 text-xs font-medium num" aria-label={t("resident.legend.count", { n: count })}>{count}</span>
          </li>
        );
      })}
    </ul>
  );
}

const MARKERS: { id: "officer" | "inPerson" | "noApi"; icon: LucideIcon; tone: string }[] = [
  { id: "officer", icon: UserRoundCheck, tone: "text-violet" },
  { id: "inPerson", icon: Footprints, tone: "text-ink-2" },
  { id: "noApi", icon: PhoneOff, tone: "text-amber" },
];

/** The three small markers drawn on graph nodes. `dark` is accepted for older call sites and ignored (theme-driven). */
export function GraphMarkers(_props: { dark?: boolean } = {}) {
  const t = useT();
  return (
    <ul className="grid gap-x-5 gap-y-3 sm:grid-cols-3">
      {MARKERS.map((m) => {
        const Icon = m.icon;
        return (
          <li key={m.id} className="flex items-start gap-2.5 text-[13px] leading-snug">
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", m.tone)} aria-hidden />
            <span>
              <span className="block font-medium text-ink">{t(`resident.marker.${m.id}`)}</span>
              <span className="text-muted">{t(`resident.marker.${m.id}Hint`)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function useTick(ms = 15_000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((x) => x + 1), ms);
    return () => window.clearInterval(id);
  }, [ms]);
}

/**
 * "What changed": domain events as they are committed (SSE), newest first, each with who caused it and the state the
 * step is in now. Below, the latest timeline entries so the panel is never a blank box.
 */
export function LiveChanges({ events, timeline, nodes, limit = 6 }: { events: LiveEvent[]; timeline: TimelineEvent[]; nodes: GraphNode[]; limit?: number }) {
  const t = useT();
  const lang = useLang();
  const text = useTimelineText();
  const reduce = useReducedMotion();
  useTick();
  // Live events carry no id; each event object gets a stable key the first time it is seen.
  const keys = useRef(new WeakMap<LiveEvent, number>());
  const counter = useRef(0);
  const keyOf = (e: LiveEvent) => {
    let k = keys.current.get(e);
    if (k === undefined) { k = ++counter.current; keys.current.set(e, k); }
    return k;
  };
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const earlier = [...timeline].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).slice(0, limit);
  return (
    <div>
      <ol aria-live="polite" aria-relevant="additions" className="space-y-2">
        <AnimatePresence initial={false}>
          {events.map((e) => {
            const source = asSource(e.source);
            const m = SOURCE[source];
            const Icon = m.icon;
            const node = e.node_key ? byKey.get(e.node_key as NodeKey) : undefined;
            return (
              <motion.li
                key={keyOf(e)}
                layout={!reduce}
                initial={{ opacity: 0, y: reduce ? 0 : -10, scale: reduce ? 1 : 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-[var(--shadow-card)]"
              >
                <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full", TONE[m.tone].bg, TONE[m.tone].text)}><Icon className="h-3.5 w-3.5" aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug">{tx(t, `resident.live.event.${e.event_type}`, humanize(e.event_type))}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                    {e.node_key && <span className="text-ink-2">{tx(t, `node.${e.node_key}`, e.node_key)}</span>}
                    {node && <NodeStateBadge state={node.state} />}
                    <SourceBadge source={source} />
                  </div>
                </div>
                <time className="shrink-0 text-xs text-faint num" dateTime={new Date(e.at).toISOString()}>{relative(new Date(e.at).toISOString(), lang)}</time>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
      {events.length === 0 && <p className="rounded-2xl border border-dashed border-line-2 px-4 py-4 text-sm text-muted">{t("resident.live.waiting")}</p>}

      {earlier.length > 0 && (
        <>
          <h3 className="mb-2 mt-6 text-[13px] font-medium text-ink-2">{t("resident.live.earlier")}</h3>
          <ol className="divide-y divide-line">
            {earlier.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block leading-snug">{text(e).title}</span>
                  <span className="mt-1 inline-block"><SourceBadge source={e.source} /></span>
                </span>
                <time className="shrink-0 text-xs text-faint num" dateTime={e.occurred_at}>{relative(e.occurred_at, lang)}</time>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
