import { PauseCircle, PhoneCall, PlayCircle, UserRoundCog } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PassportPanel } from "../components/cases/PassportPanel";
import { PendingActionCard } from "../components/cases/PendingActionCard";
import { DemoPanel } from "../components/demo/DemoPanel";
import { LifeEventGraph } from "../components/graph/LifeEventGraph";
import { NodeDetail } from "../components/graph/NodeDetail";
import { Breadcrumbs } from "../components/navigation/Breadcrumbs";
import { TaskList } from "../components/tasks/TaskList";
import { Timeline } from "../components/timeline/Timeline";
import { CaseStatusBadge } from "../components/ui/StatusBadge";
import { Button, Card, EmptyState, Skeleton } from "../components/ui/primitives";
import { useCase, useCaseAction, useCaseTimeline, useEvents, useGraph, usePassport, useSnapshot } from "../hooks/queries";
import { useT } from "../i18n";
import { casesApi } from "../services/cases";
import { useAuth } from "../stores/auth";
import { useUI } from "../stores/ui";
import { cn, fmtDate, fmtDateTime, title } from "../utils/format";

type Tab = "timeline" | "passport" | "services" | "audit";

export default function LifeEventDetail() {
  const { reference = "" } = useParams();
  const t = useT();
  const toast = useUI((s) => s.toast);
  const staff = useAuth((s) => s.user?.role === "ADMIN" || s.user?.role === "OPERATOR");
  const { data: cs, isError, error } = useCase(reference);
  const { data: graph } = useGraph(reference);
  const { data: snap } = useSnapshot(reference);
  const { data: tl } = useCaseTimeline(reference);
  const { data: passport } = usePassport(reference);
  const { data: audit } = useEvents(reference);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("timeline");
  const pause = useCaseAction(reference, "pause");
  const resume = useCaseAction(reference, "resume");
  const escalate = useCaseAction(reference, "escalate");

  // Default the detail panel to the step that matters most right now.
  const focus = useMemo(() => {
    const nodes = graph?.nodes.filter((n) => !n.is_system) ?? [];
    return (nodes.find((n) => n.status === "WAITING_FOR_RESIDENT") ?? nodes.find((n) => ["PROCESSING", "SUBMITTED", "WAITING_FOR_ENTITY"].includes(n.status)) ?? nodes[0])?.key ?? null;
  }, [graph]);
  useEffect(() => { if (!selected && focus) setSelected(focus); }, [focus, selected]);

  if (isError) return <EmptyState title="Case not found" hint={(error as Error).message} action={<Link to="/app/life-events" className="underline">Back to life events</Link>} />;
  if (!cs || !graph) return <div className="space-y-6"><Skeleton className="h-24" /><Skeleton className="h-96" /></div>;

  const node = graph.nodes.find((n) => n.key === selected) ?? null;
  const tabs: [Tab, string][] = [["timeline", t("case.timeline")], ["passport", t("case.passport")], ["services", t("case.services")], ["audit", "Audit log"]];

  return (
    <>
      <Breadcrumbs trail={[{ label: t("nav.lifeEvents"), to: "/app/life-events" }, { label: cs.reference }]} />
      <header className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="font-mono text-sm text-muted">{cs.reference}</p>
          <h1 className="mt-1 text-4xl sm:text-5xl">{cs.title}</h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
            <span>{t("case.created")}: <strong className="text-ink">{fmtDate(cs.created_at, { day: "numeric", month: "long", year: "numeric" })}</strong></span>
            <span>Event date: <strong className="text-ink">{fmtDate(cs.event_date)}</strong></span>
            <CaseStatusBadge status={cs.status} />
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {cs.status === "IN_PROGRESS" && <Button variant="secondary" size="sm" icon={<PauseCircle className="h-4 w-4" />} loading={pause.isPending} onClick={() => pause.mutate()}>{t("case.pause")}</Button>}
          {(cs.status === "PAUSED" || cs.status === "ESCALATED") && <Button variant="secondary" size="sm" icon={<PlayCircle className="h-4 w-4" />} loading={resume.isPending} onClick={() => resume.mutate()}>{t("case.resume")}</Button>}
          {cs.status !== "COMPLETED" && cs.status !== "ESCALATED" && <Button variant="secondary" size="sm" icon={<UserRoundCog className="h-4 w-4" />} loading={escalate.isPending} onClick={() => escalate.mutate()}>{t("case.escalate")}</Button>}
          <Button variant="secondary" size="sm" icon={<PhoneCall className="h-4 w-4" />} onClick={async () => { try { await casesApi.requestCallback(reference, "Resident requested a status call", "in 2 minutes"); toast("success", "Callback scheduled"); } catch (e) { toast("error", (e as Error).message); } }}>{t("case.callMe")}</Button>
          <Link to="/app/voice"><Button size="sm" icon={<PhoneCall className="h-4 w-4" />}>Talk to the assistant</Button></Link>
        </div>
      </header>

      <div className="mb-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-6">
          <p className="eyebrow mb-2">Where are we</p>
          <p className="font-display text-[22px] leading-snug">{snap?.summary ?? cs.summary}</p>
          <div className="mt-4 flex items-baseline gap-3"><span className="font-display text-4xl">{cs.progress.percent}%</span><span className="text-sm text-muted">{cs.progress.completed} of {cs.progress.total} {t("case.servicesDone")}</span></div>
        </Card>
        {snap && snap.pending_actions.length > 0 ? <PendingActionCard reference={cs.reference} actions={snap.pending_actions} /> : (
          <Card className="flex flex-col justify-center p-6"><p className="eyebrow mb-2">{t("case.residentAction")}</p><p className="font-display text-2xl text-civic">{t("waiting.none")}</p><p className="mt-1 text-sm text-muted">{cs.status === "COMPLETED" ? "This life event is complete." : "LIFELOOP will call when something meaningful changes."}</p></Card>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-2xl">{t("case.graph")}</h2><span className="text-xs text-muted">{t("case.aiRole")}</span></div>
          <LifeEventGraph graph={graph} selected={selected} onSelect={setSelected} />
        </Card>
        <Card className="p-6"><NodeDetail node={node} all={graph.nodes} /></Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="p-5 sm:p-6">
          <div role="tablist" aria-label="Case details" className="mb-6 flex flex-wrap gap-1 rounded-full bg-paper-2 p-1">
            {tabs.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("rounded-full px-4 py-1.5 text-sm transition-colors cursor-pointer", tab === k ? "bg-ink text-paper" : "text-ink-2 hover:bg-line/60")}>{label}</button>
            ))}
          </div>
          <div role="tabpanel">
            {tab === "timeline" && <Timeline items={tl?.items ?? []} />}
            {tab === "passport" && (passport ? <PassportPanel passport={passport} /> : <Skeleton className="h-48" />)}
            {tab === "services" && <TaskList nodes={graph.nodes} onSelect={(k) => { setSelected(k); window.scrollTo({ top: 0, behavior: "smooth" }); }} />}
            {tab === "audit" && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-start text-sm">
                  <thead><tr className="eyebrow border-b border-line text-start"><th className="py-2 text-start font-normal">When</th><th className="text-start font-normal">Event</th><th className="text-start font-normal">Actor</th><th className="text-start font-normal">State</th></tr></thead>
                  <tbody>
                    {audit?.items.map((e) => (
                      <tr key={e.id} className="border-b border-line/60 align-top">
                        <td className="py-2 pe-3 font-mono text-xs text-muted">{fmtDateTime(e.created_at)}</td>
                        <td className="pe-3">{title(e.event_type)}<span className="block text-xs text-faint">{String(e.metadata.task_name ?? "")}</span></td>
                        <td className="pe-3 text-xs"><span className="block">{e.actor}</span><span className="text-faint">{e.actor_type}</span></td>
                        <td className="text-xs">{e.old_state ? `${e.old_state} → ${e.new_state}` : e.new_state ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
        {staff && <div className="xl:sticky xl:top-24 xl:self-start"><DemoPanel caseRef={cs.reference} compact /></div>}
      </div>
    </>
  );
}
