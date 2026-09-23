import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BellOff, BellRing, Ban } from "lucide-react";
import { CallbackCard } from "../components/callbacks/CallbackCard";
import { Card, EmptyState, PageHeader, Skeleton } from "../components/ui/primitives";
import { useCallbacks } from "../hooks/queries";
import { useT } from "../i18n";
import { callbacksApi } from "../services/events";
import { useAuth } from "../stores/auth";
import { useUI } from "../stores/ui";

const CALLS = ["Milestone completed", "Additional document required", "Significant delay (72h+)", "Workflow replanned for the resident", "Escalation to a human", "Case completed"];
const SILENT = ["Task created or submitted", "Authority accepted / processing", "Waiting for a dependency", "Ordinary delays", "Internal retries"];

export default function Callbacks() {
  const t = useT();
  const { data, isLoading } = useCallbacks();
  const qc = useQueryClient();
  const toast = useUI((s) => s.toast);
  const staff = useAuth((s) => s.user?.role === "ADMIN" || s.user?.role === "OPERATOR");
  const exec = useMutation({ mutationFn: callbacksApi.execute, onSuccess: () => { qc.invalidateQueries(); toast("success", "Callback placed"); }, onError: (e: Error) => toast("error", e.message) });
  const upcoming = data?.filter((c) => c.status === "SCHEDULED" || c.status === "IN_PROGRESS") ?? [];
  const done = data?.filter((c) => !(c.status === "SCHEDULED" || c.status === "IN_PROGRESS")) ?? [];
  return (
    <>
      <PageHeader eyebrow="Proactive engine" title={t("cb.title")} subtitle={t("cb.subtitle")} />
      <div className="grid gap-8 xl:grid-cols-[1fr_320px]">
        <div className="space-y-10">
          <section aria-labelledby="up-h">
            <h2 id="up-h" className="mb-4 text-2xl">{t("cb.upcoming")}</h2>
            {isLoading ? <Skeleton className="h-24" /> : upcoming.length === 0 ? <EmptyState title="Nothing scheduled" hint="Callbacks are created when a meaningful state change happens, and coalesced so the resident gets one call, not five." /> : (
              <ul className="space-y-3">{upcoming.map((c) => <CallbackCard key={c.id} cb={c} onExecute={staff ? (id) => exec.mutate(id) : undefined} />)}</ul>
            )}
          </section>
          <section aria-labelledby="done-h">
            <h2 id="done-h" className="mb-4 text-2xl">{t("cb.completed")}</h2>
            {done.length === 0 ? <p className="text-sm text-muted">No completed callbacks yet.</p> : <ul className="space-y-3">{done.map((c) => <CallbackCard key={c.id} cb={c} />)}</ul>}
          </section>
        </div>
        <aside>
          <Card className="p-6 xl:sticky xl:top-24">
            <h2 className="mb-4 text-xl">{t("cb.policy")}</h2>
            <p className="eyebrow mb-2 flex items-center gap-2 !text-civic"><BellRing className="h-3.5 w-3.5" aria-hidden />Calls the resident</p>
            <ul className="mb-5 space-y-1.5 text-sm">{CALLS.map((x) => <li key={x} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-civic" aria-hidden />{x}</li>)}</ul>
            <p className="eyebrow mb-2 flex items-center gap-2"><BellOff className="h-3.5 w-3.5" aria-hidden />Stays silent</p>
            <ul className="mb-5 space-y-1.5 text-sm text-muted">{SILENT.map((x) => <li key={x} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-faint" aria-hidden />{x}</li>)}</ul>
            <p className="flex gap-2 rounded-xl bg-paper-2 p-3 text-xs text-muted"><Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />No call is placed without callback consent, or while a case is paused.</p>
          </Card>
        </aside>
      </div>
    </>
  );
}
