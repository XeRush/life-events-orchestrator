import { motion } from "framer-motion";
import { Building2, CheckCheck, CircleUserRound, Hourglass, Loader, Phone, Plus, Radar } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { stagger } from "../animations/variants";
import { CaseCard } from "../components/cases/CaseCard";
import { NewCaseModal } from "../components/cases/NewCaseModal";
import { StatTile } from "../components/dashboard/StatTile";
import { Timeline } from "../components/timeline/Timeline";
import { Button, Card, EmptyState, PageHeader, Ring, Skeleton } from "../components/ui/primitives";
import { useDashboard } from "../hooks/queries";
import { useT } from "../i18n";
import { fmtDateTime, fmtDuration, relative } from "../utils/format";
import { CALLBACK_STATUS } from "../utils/status";
import { Badge } from "../components/ui/primitives";

export default function Dashboard() {
  const t = useT();
  const { data, isLoading } = useDashboard();
  const [open, setOpen] = useState(false);

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-1/2" />
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
        <Skeleton className="h-72" />
      </div>
    );
  }
  const c = data.counts;
  return (
    <>
      <PageHeader eyebrow="LIFELOOP" title={t("dash.title")} subtitle={t("dash.subtitle")} actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>{t("dash.startOne")}</Button>} />

      <motion.div variants={stagger} initial="initial" animate="animate" className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label={t("dash.active")} value={c.active_cases} icon={Radar} tone="azure" />
        <StatTile label={t("dash.completed")} value={c.completed_cases} icon={CheckCheck} tone="civic" />
        <StatTile label={t("dash.waiting")} value={c.waiting_for_resident} icon={CircleUserRound} tone="amber" />
        <StatTile label={t("dash.inProgress")} value={c.in_progress} icon={Loader} tone="azure" />
        <StatTile label={t("dash.entity")} value={c.entity_processing} icon={Building2} tone="slate" hint="services with authorities" />
        <StatTile label={t("dash.callbacks")} value={c.callbacks_completed + c.callbacks_scheduled} icon={Phone} tone="violet" hint={`${c.callbacks_scheduled} scheduled`} />
      </motion.div>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <section aria-labelledby="cases-h">
          <h2 id="cases-h" className="mb-4 text-2xl">{t("dash.currentCases")}</h2>
          {data.active_cases.length === 0 ? (
            <EmptyState title={t("dash.noActive")} hint="Report a life event and LIFELOOP will build the journey." action={<Button onClick={() => setOpen(true)}>{t("dash.startOne")}</Button>} />
          ) : (
            <motion.div variants={stagger} initial="initial" animate="animate" className="grid gap-5 md:grid-cols-2">
              {data.active_cases.map((cs) => (
                <CaseCard key={cs.id} reference={cs.reference} title={cs.title} eventType={cs.event_type} status={cs.status}
                  progress={cs.progress} currentStage={cs.current_stage} waitingOn={cs.waiting_on} residentActionRequired={cs.resident_action_required} />
              ))}
            </motion.div>
          )}
        </section>

        <aside className="space-y-6">
          <Card className="flex items-center gap-6 p-6">
            <Ring percent={data.service_completion_percent} label="Service completion" />
            <div>
              <p className="eyebrow">{t("dash.completion")}</p>
              <p className="mt-1 font-display text-2xl">{data.services.completed} of {data.services.total}</p>
              <p className="text-sm text-muted">services confirmed by their authorities</p>
            </div>
          </Card>
          <Card className="p-6">
            <h2 className="mb-3 text-xl">{t("dash.upcoming")}</h2>
            {data.upcoming_actions.length === 0 ? <p className="text-sm text-muted">{t("dash.noActions")}</p> : (
              <ul className="space-y-3">
                {data.upcoming_actions.map((a, i) => (
                  <li key={i} className="flex gap-3 rounded-xl bg-amber-soft p-3 text-sm">
                    <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-amber" aria-hidden />
                    <div><Link to={`/app/life-events/${a.case_reference}`} className="font-medium underline-offset-4 hover:underline">{a.case_reference} · {a.task}</Link><p className="text-muted">{a.action}</p></div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-5 text-2xl">{t("dash.recentTimeline")}</h2>
          <Timeline items={data.recent_timeline} showCase emptyText="No events yet." />
        </Card>
        <Card className="p-6">
          <div className="mb-5 flex items-center justify-between"><h2 className="text-2xl">{t("dash.recentCallbacks")}</h2><Link to="/app/callbacks" className="text-sm underline underline-offset-4">All callbacks</Link></div>
          {data.recent_callbacks.length === 0 ? <p className="text-sm text-muted">No callbacks yet. The assistant only calls when something meaningful changes.</p> : (
            <ul className="divide-y divide-line/70">
              {data.recent_callbacks.map((cb) => {
                const m = CALLBACK_STATUS[cb.status] ?? { label: cb.status, tone: "slate" as const };
                return (
                  <li key={cb.id} className="flex items-start justify-between gap-4 py-3">
                    <div><p className="font-medium leading-snug">{cb.reason}</p><p className="text-xs text-muted">{cb.case_reference} · {cb.status === "SCHEDULED" ? `due ${relative(cb.scheduled_for)}` : fmtDateTime(cb.scheduled_for)}</p></div>
                    <div className="flex flex-col items-end gap-1"><Badge tone={m.tone} dot>{m.label}</Badge><span className="font-mono text-xs text-muted">{fmtDuration(cb.duration_seconds)}</span></div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
      <NewCaseModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
