import { AnimatePresence } from "framer-motion";
import { useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { FIX_CALLBACKS, FIX_CALLS, FIX_CASE, FIX_GRAPH, FIX_TIMELINE } from "../../bones/fixtures/resident";
import { CaseError } from "../../components/case/CaseBits";
import { CaseHome } from "../../components/case/CaseHome";
import { CONSULATE_OPEN, ConsulatePanel } from "../../components/case/ConsulatePanel";
import { OpenedBanner } from "../../components/case/Where";
import { NodeDrawer } from "../../components/graph/NodeDrawer";
import { Bones } from "../../components/ui/Bones";
import { useCase, useCaseCallbacks, useCaseCalls, useGraph, useTimeline } from "../../hooks/queries";
import { useLiveStream } from "../../hooks/useLiveStream";
import type { NodeKey } from "../../types/api";

const noop = () => undefined;

/** Skeleton for the case page; the same wrapper is rendered on /__bones for capture. Fixtures exist only in development. */
export function CaseHomeBones({ loading = true, children = null }: { loading?: boolean; children?: ReactNode }) {
  return (
    <Bones name="res-case-home" loading={loading} lines={10}
      fixture={import.meta.env.DEV ? <CaseHome view={FIX_CASE} graph={FIX_GRAPH} timeline={FIX_TIMELINE} callbacks={FIX_CALLBACKS} calls={FIX_CALLS} connected onOpenNode={noop} /> : undefined}>
      {children}
    </Bones>
  );
}

/** The resident's case at a glance: where things stand, what happens next, and everything that supports it. */
export default function CaseDashboard() {
  const { ref = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const opened = (location.state as { opened?: boolean; created?: boolean } | null)?.opened;
  const created = (location.state as { created?: boolean } | null)?.created ?? true;
  const [bannerOpen, setBannerOpen] = useState(!!opened);
  const [selected, setSelected] = useState<NodeKey | null>(null);

  const caseQ = useCase(ref);
  const graph = useGraph(ref);
  const timeline = useTimeline(ref);
  const callbacks = useCaseCallbacks(ref);
  const calls = useCaseCalls(ref);
  const live = useLiveStream(ref);

  if (caseQ.isError || (!caseQ.isLoading && !caseQ.data)) return <CaseError error={caseQ.error} onRetry={() => caseQ.refetch()} />;
  const loading = caseQ.isLoading || graph.isLoading || timeline.isLoading;
  const view = caseQ.data;
  const selectedNode = selected ? graph.data?.nodes.find((n) => n.key === selected) ?? null : null;

  const dismissBanner = () => {
    setBannerOpen(false);
    navigate(location.pathname, { replace: true, state: null });
  };

  return (
    <div>
      <AnimatePresence>{bannerOpen && view && <OpenedBanner reference={view.reference} created={created} onDismiss={dismissBanner} />}</AnimatePresence>
      <CaseHomeBones loading={loading}>
        {!loading && view && (
          <CaseHome view={view} graph={graph.data} timeline={timeline.data?.items} callbacks={callbacks.data} calls={calls.data}
            connected={live.connected} selected={selected} onOpenNode={setSelected} />
        )}
      </CaseHomeBones>
      {view && (
        <NodeDrawer
          node={selectedNode}
          caseRef={view.reference}
          onClose={() => setSelected(null)}
          actions={selectedNode?.key === "CONSULATE_PASSPORT" && CONSULATE_OPEN.includes(selectedNode.state)
            ? <ConsulatePanel reference={view.reference} node={selectedNode} compact /> : undefined}
        />
      )}
    </div>
  );
}
