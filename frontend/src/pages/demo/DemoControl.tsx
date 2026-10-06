import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Ban, FlaskConical, Radio } from "lucide-react";
import { useId } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ease } from "../../animations/variants";
import { ApiError } from "../../api/client";
import { CaseActions } from "../../components/demo/CaseActions";
import { DemoFrame, DemoPanel } from "../../components/demo/DemoFrame";
import { EventInspector, MockSmsPanel } from "../../components/demo/EventInspector";
import { FailureSwitches } from "../../components/demo/FailureSwitches";
import { NodeControls } from "../../components/demo/NodeControls";
import { LifeEventGraph } from "../../components/graph/LifeEventGraph";
import { LiveDot } from "../../components/layout/Shells";
import { EmptyNote, PageHead } from "../../components/officer/kit";
import { Bones, ShimmerBlock } from "../../components/ui/Bones";
import { ErrorState } from "../../components/ui/primitives";
import { useDemoStatus, useGraph, useMyCases } from "../../hooks/queries";
import { useLiveStream, type LiveEvent } from "../../hooks/useLiveStream";
import { useLang, useT } from "../../i18n";
import { relative } from "../../lib/format";
import type { CaseGraph, DemoStatus } from "../../types/api";

const DEFAULT_REF = "LL-DEMO-001";

/** Live events for the selected case: newest slides in at the start of the row. */
function LiveEvents({ events }: { events: LiveEvent[] }) {
  const t = useT();
  const lang = useLang();
  const reduce = useReducedMotion();
  return (
    <div className="mt-4 border-t border-line pt-3">
      <p className="eyebrow">{t("demo.live.title")}</p>
      {events.length === 0 ? (
        <p className="mt-1.5 flex items-center gap-2 text-[13px] text-muted"><Radio className="h-3.5 w-3.5 shrink-0" aria-hidden />{t("demo.live.empty")}</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-live="polite">
          <AnimatePresence initial={false}>
            {events.slice(0, 6).map((e) => (
              <motion.li
                key={`${e.at}-${e.event_type}`}
                layout="position"
                initial={reduce ? false : { opacity: 0, x: -12, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                transition={{ duration: 0.35, ease }}
                className="inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-paper/60 px-3 py-1 text-[12px]"
              >
                <span className="truncate font-medium text-ink" dir="ltr">{e.event_type}</span>
                {e.node_key && <span className="font-mono text-[10.5px] text-faint" dir="ltr">{e.node_key}</span>}
                <span className="shrink-0 text-muted">{relative(new Date(e.at).toISOString(), lang)}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

/** Every control panel inside the demo frame (also rendered with fixtures on /__bones for skeleton capture). */
export function DemoPanels({ status, graph, caseRef, connected, events, graphError, onRetryGraph, onReset }: {
  status: DemoStatus; graph?: CaseGraph; caseRef: string; connected: boolean; events: LiveEvent[];
  graphError?: unknown; onRetryGraph?: () => void; onReset: (ref: string) => void;
}) {
  const t = useT();
  return (
    <div className="space-y-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-amber" dir="ltr">{status.label}</p>

      <DemoPanel id="demo-graph" title={t("demo.graph.title", { ref: caseRef })} hint={t("demo.graph.hint")} action={<LiveDot connected={connected} />}>
        {graph ? (
          <LifeEventGraph graph={graph} label={t("demo.graph.label", { ref: caseRef })} />
        ) : graphError ? (
          <ErrorState error={graphError} onRetry={onRetryGraph} />
        ) : (
          <ShimmerBlock lines={3} />
        )}
        <LiveEvents events={events} />
      </DemoPanel>

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <DemoPanel id="demo-nodes" title={t("demo.nodes.title")} hint={t("demo.nodes.hint")}>
          <NodeControls caseRef={caseRef} graph={graph} controls={status.controls} />
        </DemoPanel>
        <div className="min-w-0 space-y-4">
          <CaseActions caseRef={caseRef} onReset={onReset} />
          <FailureSwitches status={status} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <EventInspector status={status} />
        <MockSmsPanel status={status} />
      </div>
    </div>
  );
}

/** /demo - staff only. Simulates authority responses and failures through the real pipeline, on a chosen case. */
export default function DemoControl() {
  const t = useT();
  const selectId = useId();
  const [params, setParams] = useSearchParams();
  const ref = params.get("case") || DEFAULT_REF;
  const status = useDemoStatus();
  const cases = useMyCases();
  const graph = useGraph(ref);
  const live = useLiveStream(ref);

  const choose = (next: string) => setParams((p) => {
    const copy = new URLSearchParams(p);
    if (next === DEFAULT_REF) copy.delete("case");
    else copy.set("case", next);
    return copy;
  }, { replace: true });

  const refs = Array.from(new Set([DEFAULT_REF, ...(cases.data?.items ?? []).map((c) => c.reference)]));
  const caseLabel = (r: string) => {
    const item = cases.data?.items.find((c) => c.reference === r);
    return item?.child_name ? t("demo.select.option", { ref: r, name: item.child_name }) : r;
  };

  const disabled = status.error instanceof ApiError && status.error.code === "demo_disabled";

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow={<><FlaskConical className="h-3.5 w-3.5" aria-hidden />{t("demo.eyebrow")}</>}
        eyebrowClassName="text-amber!"
        title={t("demo.title")}
        subtitle={t("demo.subtitle")}
        actions={
          <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
            <label htmlFor={selectId} className="block w-full min-w-0 sm:w-auto">
              <span className="mb-1.5 block text-[12.5px] font-medium text-ink-2">{t("demo.select.label")}</span>
              <select
                id={selectId} value={ref} onChange={(e) => choose(e.target.value)}
                className="h-10 w-full cursor-pointer rounded-full border border-line-2 bg-surface px-4 text-[14px] outline-none focus:border-ink/50 focus:ring-2 focus:ring-ink/10 sm:w-auto sm:min-w-64"
              >
                {refs.map((r) => <option key={r} value={r}>{caseLabel(r)}</option>)}
              </select>
            </label>
            <Link to={`/officer/cases/${ref}`} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line-2 bg-surface px-4 text-[13.5px] text-ink-2 transition-colors hover:bg-paper-2">
              {t("demo.openOfficer")}<ArrowUpRight className="rtl-flip h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        }
      />

      <DemoFrame>
        {disabled ? (
          <EmptyNote icon={<Ban aria-hidden />} title={t("demo.disabled.title")} hint={t("demo.disabled.hint")} />
        ) : status.isError ? (
          <ErrorState error={status.error} onRetry={() => status.refetch()} />
        ) : (
          <Bones name="staff-demo-panels" loading={!status.data} lines={10}>
            {status.data ? (
              <DemoPanels
                status={status.data} graph={graph.data} caseRef={ref} connected={live.connected} events={live.events}
                graphError={graph.isError ? graph.error : undefined} onRetryGraph={() => graph.refetch()} onReset={choose}
              />
            ) : null}
          </Bones>
        )}
      </DemoFrame>
    </div>
  );
}
