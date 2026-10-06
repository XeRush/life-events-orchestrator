import { motion, useReducedMotion, type Variants } from "framer-motion";
import { GitBranch, ScrollText } from "lucide-react";
import type { ReactNode } from "react";
import { useLang, useT } from "../../i18n";
import { cn } from "../../lib/format";
import type { CallbackItem, CallView, CaseGraph, CaseView, NodeKey, TimelineEvent } from "../../types/api";
import { LifeEventGraph } from "../graph/LifeEventGraph";
import { LiveDot } from "../layout/Shells";
import { CaseTimeline } from "../timeline/CaseTimeline";
import { CaseStatusBadge, MockBadge } from "../ui/StatusBadge";
import { SectionLink } from "./CaseBits";
import { CONSULATE_OPEN, ConsulatePanel } from "./ConsulatePanel";
import { ProgressPanel } from "./Progress";
import { CallbacksPanel, CaseFacts, ContactPanel, DocumentsDue, RecentCalls, SourceKey } from "./SidePanels";
import { fmtDay } from "./text";
import { AttentionList, StepList, WhereAreWe } from "./Where";

const EASE = [0.22, 1, 0.36, 1] as const;
const column: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } };
const rise: Variants = { hidden: { opacity: 0, y: 14 }, shown: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } };

export interface CaseHomeProps {
  view: CaseView;
  graph?: CaseGraph;
  timeline?: TimelineEvent[];
  callbacks?: CallbackItem[];
  calls?: CallView[];
  connected: boolean;
  selected?: NodeKey | null;
  onOpenNode: (key: NodeKey) => void;
}

/** One block of the case page. On phones every block is a flex item of one column and `order` interleaves the two
 * columns (progress straight after the summary); from lg the columns are independent, so neither leaves a gap. */
function Block({ order, className, children }: { order: string; className?: string; children: ReactNode }) {
  return <motion.div variants={rise} className={cn(order, "lg:order-none", className)}>{children}</motion.div>;
}

/** The resident's case at a glance: where things stand, what happens next, and everything that supports it. */
export function CaseHome({ view, graph, timeline, callbacks, calls, connected, selected = null, onOpenNode }: CaseHomeProps) {
  const t = useT();
  const lang = useLang();
  const reduce = useReducedMotion();
  const nodes = graph?.nodes ?? [];
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const consulate = byKey.get("CONSULATE_PASSPORT");
  const showConsulate = !!consulate && CONSULATE_OPEN.includes(consulate.state);
  const events = timeline ?? [];

  return (
    <motion.div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_332px] lg:items-start"
      initial={reduce ? false : "hidden"} animate="shown" variants={column}>
      {/* main column */}
      <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
        <Block order="order-1">
          <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
            <div className="min-w-0">
              <p className="eyebrow mb-1.5 num">{t("resident.case.eyebrow", { ref: view.reference })}</p>
              <h1 className="text-3xl leading-tight sm:text-[40px]">
                {view.child ? t("resident.dash.title", { child: view.child.full_name_en }) : t("resident.dash.titleNoChild")}
              </h1>
              {view.child && (
                <p className="mt-1 text-[15px] text-muted">{t("resident.dash.born", { date: fmtDay(view.child.date_of_birth, lang), place: view.child.place_of_birth })}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <LiveDot connected={connected} />
              <span aria-live="polite"><CaseStatusBadge status={view.status} /></span>
            </div>
          </header>
        </Block>

        <Block order="order-2">
          <WhereAreWe view={view} currentNode={view.current_node ? byKey.get(view.current_node.key) : undefined} onOpenNode={onOpenNode} />
        </Block>

        {view.attention_nodes.length > 0 && <Block order="order-4"><AttentionList view={view} onOpenNode={onOpenNode} /></Block>}
        {showConsulate && consulate && <Block order="order-5"><ConsulatePanel reference={view.reference} node={consulate} /></Block>}

        <Block order="order-7">
          <section aria-labelledby="steps-title">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
              <div className="min-w-0">
                <h2 id="steps-title" className="text-xl">{t("resident.steps.title")}</h2>
                <p className="mt-0.5 max-w-2xl text-sm text-muted">{t("resident.steps.hint")}</p>
              </div>
              <SectionLink to={`/app/cases/${view.reference}/graph`} icon={GitBranch}>{t("resident.steps.open")}</SectionLink>
            </div>
            {graph && (
              <>
                <div className="card grid-lines hidden overflow-x-auto p-3 sm:p-4 md:block" data-lenis-prevent>
                  <LifeEventGraph graph={graph} selected={selected} onSelect={onOpenNode} label={t("resident.steps.title")} />
                </div>
                <div className="card p-2 md:hidden"><StepList nodes={graph.nodes} onSelect={onOpenNode} /></div>
              </>
            )}
          </section>
        </Block>

        <Block order="order-8">
          <section aria-labelledby="activity-title" className="min-w-0">
            <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
              <h2 id="activity-title" className="text-xl">{t("resident.activity.title")}</h2>
              <SectionLink to={`/app/cases/${view.reference}/timeline`} icon={ScrollText}>{t("resident.activity.open")}</SectionLink>
            </div>
            <div className="mb-4"><SourceKey /></div>
            {events.length === 0 ? <p className="text-sm text-muted">{t("resident.activity.none")}</p>
              : <CaseTimeline events={events} compact limit={6} filterable={false} />}
          </section>
        </Block>

        <Block order="order-12"><CaseFacts view={view} wide /></Block>
      </div>

      {/* side column */}
      <div className="contents lg:flex lg:flex-col lg:gap-4">
        <Block order="order-3"><ProgressPanel view={view} /></Block>
        <Block order="order-6"><DocumentsDue view={view} /></Block>
        <Block order="order-9"><ContactPanel view={view} /></Block>
        <Block order="order-10"><CallbacksPanel view={view} callbacks={callbacks} /></Block>
        <Block order="order-11"><RecentCalls calls={calls} /></Block>
        <Block order="order-last">
          <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-muted">
            <MockBadge compact />
            <span>{t("resident.dash.mockNote")}</span>
          </p>
        </Block>
      </div>
    </motion.div>
  );
}
