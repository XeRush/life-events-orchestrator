import { useEffect, useState } from "react";
import { DemoPanel } from "../components/demo/DemoPanel";
import { LifeEventGraph } from "../components/graph/LifeEventGraph";
import { Badge, Card, EmptyState, PageHeader, Skeleton } from "../components/ui/primitives";
import { useCases, useEvents, useGraph, useSnapshot } from "../hooks/queries";
import { useT } from "../i18n";
import { fmtDateTime, title } from "../utils/format";

function Live({ reference }: { reference: string }) {
  const { data: graph } = useGraph(reference);
  const { data: snap } = useSnapshot(reference);
  const { data: events } = useEvents(reference);
  const [sel, setSel] = useState<string | null>(null);
  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-xl">Live graph · {reference}</h2>{snap && <Badge tone="azure">{snap.progress.percent}% · {snap.progress.completed}/{snap.progress.total}</Badge>}</div>
        {graph ? <LifeEventGraph graph={graph} selected={sel} onSelect={setSel} /> : <Skeleton className="h-64" />}
        {snap && <p className="mt-4 rounded-xl bg-paper-2 p-3 text-sm">“{snap.summary}”</p>}
      </Card>
      <Card className="p-5">
        <h2 className="mb-3 text-xl">Event stream (audit log)</h2>
        <ul className="max-h-80 space-y-1.5 overflow-y-auto scroll-thin text-sm">
          {events?.items.map((e) => (
            <li key={e.id} className="flex items-baseline justify-between gap-3 border-b border-line/50 pb-1.5">
              <span><span className="font-mono text-[11px] text-faint">{fmtDateTime(e.created_at)}</span> <strong>{title(e.event_type)}</strong> <span className="text-muted">{String(e.metadata.task_name ?? "")}</span></span>
              <span className="shrink-0 text-xs text-faint">{e.actor_type.toLowerCase().replace("_", " ")}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export default function DemoControl() {
  const t = useT();
  const { data: cases } = useCases();
  const [ref, setRef] = useState<string>("");
  useEffect(() => { if (!ref && cases?.items.length) setRef((cases.items.find((c) => c.reference === "L-49281") ?? cases.items[0]).reference); }, [cases, ref]);
  return (
    <>
      <PageHeader eyebrow="Demo mode" title={t("demo.title")} subtitle={t("demo.subtitle")} />
      {!cases?.items.length ? <EmptyState title="No cases to drive" hint="Start a life event first (or run make seed for the demo case L-49281)." /> : (
        <>
          <label className="mb-6 flex items-center gap-3 text-sm"><span className="text-muted">Case</span>
            <select value={ref} onChange={(e) => setRef(e.target.value)} className="h-10 rounded-xl border border-line-2 bg-surface px-3 font-mono">
              {cases.items.map((c) => <option key={c.id} value={c.reference}>{c.reference} · {c.title} · {c.status.toLowerCase().replace("_", " ")}</option>)}
            </select></label>
          <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
            <DemoPanel caseRef={ref} />
            {ref && <Live reference={ref} />}
          </div>
        </>
      )}
    </>
  );
}
