import { motion, useReducedMotion, type Variants } from "framer-motion";
import { Landmark } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { FIX_CASE, FIX_GRAPH, FIX_TIMELINE } from "../../bones/fixtures/resident";
import { CaseError, CaseHeader, Panel } from "../../components/case/CaseBits";
import { CONSULATE_OPEN, ConsulatePanel } from "../../components/case/ConsulatePanel";
import { GraphLegend, GraphMarkers, LiveChanges } from "../../components/case/GraphAside";
import { FillBar } from "../../components/case/Progress";
import { SourceKey } from "../../components/case/SidePanels";
import { LifeEventGraph } from "../../components/graph/LifeEventGraph";
import { NodeDrawer } from "../../components/graph/NodeDrawer";
import { LiveDot } from "../../components/layout/Shells";
import { Bones } from "../../components/ui/Bones";
import { MockBadge } from "../../components/ui/StatusBadge";
import { useCase, useGraph, useTimeline } from "../../hooks/queries";
import type { LiveEvent } from "../../hooks/useLiveStream";
import { useLiveStream } from "../../hooks/useLiveStream";
import { useT } from "../../i18n";
import { DONE } from "../../lib/status";
import type { CaseGraph as Graph, CaseView, NodeKey, TimelineEvent } from "../../types/api";

const EASE = [0.22, 1, 0.36, 1] as const;
const stack: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.08 } } };
const rise: Variants = { hidden: { opacity: 0, y: 14 }, shown: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } };
const noop = () => undefined;

interface GraphViewProps {
  graph: Graph; current?: CaseView["current_node"]; events: LiveEvent[]; timeline: TimelineEvent[]; connected: boolean;
  selected?: NodeKey | null; onSelect: (key: NodeKey) => void;
}

/** The stage with the full graph, then what changed (live) beside the legend. Presentational: data comes in as props. */
export function GraphView({ graph, current, events, timeline, connected, selected = null, onSelect }: GraphViewProps) {
  const t = useT();
  const reduce = useReducedMotion();
  const nodes = graph.nodes;
  const done = nodes.filter((n) => DONE.includes(n.state)).length;
  return (
    <motion.div className="space-y-6" initial={reduce ? false : "hidden"} animate="shown" variants={stack}>
      <motion.section variants={rise} aria-labelledby="graph-stage-title" className="stage grid-lines overflow-hidden rounded-3xl border border-line">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-stage/80 px-4 py-3.5 sm:px-6">
          <div className="min-w-0">
            <h2 id="graph-stage-title" className="font-display text-xl text-ink num">{t("resident.graph.stage", { done, total: nodes.length })}</h2>
            {current && (
              <p className="mt-0.5 text-sm text-muted" aria-live="polite">
                {t("resident.graph.now", { step: t(`node.${current.key}`), state: t(`state.${current.state}`) })}
              </p>
            )}
          </div>
          <div className="flex w-full items-center gap-3 sm:w-auto">
            <FillBar percent={nodes.length ? (done / nodes.length) * 100 : 0} label={t("resident.progress.ring")} className="flex-1 sm:w-40 sm:flex-none" />
            <LiveDot connected={connected} />
          </div>
        </div>
        <div className="overflow-x-auto px-2 py-5 sm:px-5 sm:py-6" data-lenis-prevent>
          <LifeEventGraph graph={graph} selected={selected} onSelect={onSelect} label={t("resident.graph.title")} />
        </div>
        <div className="border-t border-line bg-stage/80 px-4 py-3.5 sm:px-6">
          <p className="mb-2.5 text-[13px] text-muted">{t("resident.graph.clickHint")}</p>
          <GraphMarkers />
        </div>
      </motion.section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_332px] lg:items-start">
        <motion.div variants={rise} className="min-w-0 space-y-6">
          <section aria-labelledby="changes-title">
            <div className="mb-1 flex items-center justify-between gap-3">
              <h2 id="changes-title" className="text-xl">{t("resident.live.title")}</h2>
              <LiveDot connected={connected} />
            </div>
            <p className="mb-3 text-sm text-muted">{t("resident.live.hint")}</p>
            <LiveChanges events={events} timeline={timeline} nodes={nodes} />
          </section>
          <Panel id="honesty" title={t("resident.graph.honestTitle")}>
            <p className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-2">
              <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-civic" aria-hidden />
              {t("resident.graph.honest")}
            </p>
            <div className="mt-4 border-t border-line pt-4"><SourceKey detailed className="grid gap-x-6 gap-y-3 sm:grid-cols-2" /></div>
          </Panel>
        </motion.div>
        <motion.div variants={rise} className="lg:sticky lg:top-20">
          <Panel id="legend" title={t("resident.legend.title")}>
            <GraphLegend nodes={nodes} />
          </Panel>
        </motion.div>
      </div>
    </motion.div>
  );
}

/** Skeleton for the graph page; the same wrapper is rendered on /__bones for capture. */
export function GraphBones({ loading = true, children = null }: { loading?: boolean; children?: ReactNode }) {
  return (
    <Bones name="res-graph" loading={loading} lines={8}
      fixture={import.meta.env.DEV ? <GraphView graph={FIX_GRAPH} current={FIX_CASE.current_node} events={[]} timeline={FIX_TIMELINE} connected onSelect={noop} /> : undefined}>
      {children}
    </Bones>
  );
}

/**
 * The Life-Event Graph, full size, on its stage: six services, what each waits for, who reported each state,
 * and a live feed of what just changed. Selecting a step opens everything about it.
 */
export default function CaseGraph() {
  const t = useT();
  const { ref = "" } = useParams();
  const [selected, setSelected] = useState<NodeKey | null>(null);
  const graph = useGraph(ref);
  const caseQ = useCase(ref);
  const timeline = useTimeline(ref);
  const live = useLiveStream(ref);

  if (graph.isError || (!graph.isLoading && !graph.data)) return <CaseError error={graph.error} onRetry={() => graph.refetch()} />;
  const nodes = graph.data?.nodes ?? [];
  const selectedNode = selected ? nodes.find((n) => n.key === selected) ?? null : null;

  return (
    <div>
      <CaseHeader reference={ref} title={t("resident.graph.title")} subtitle={t("resident.graph.subtitle")}
        actions={nodes.some((n) => n.is_mock) ? <MockBadge /> : undefined} />
      <GraphBones loading={graph.isLoading}>
        {graph.data && (
          <GraphView graph={graph.data} current={caseQ.data?.current_node} events={live.events} timeline={timeline.data?.items ?? []}
            connected={live.connected} selected={selected} onSelect={setSelected} />
        )}
      </GraphBones>
      <NodeDrawer
        node={selectedNode}
        caseRef={ref}
        onClose={() => setSelected(null)}
        actions={selectedNode?.key === "CONSULATE_PASSPORT" && CONSULATE_OPEN.includes(selectedNode.state)
          ? <ConsulatePanel reference={ref} node={selectedNode} compact /> : undefined}
      />
    </div>
  );
}
