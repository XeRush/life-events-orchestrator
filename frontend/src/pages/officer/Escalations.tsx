import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { PhoneForwarded, ShieldAlert, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { officerApi } from "../../api";
import { ResolveDialog } from "../../components/officer/dialogs";
import { EscalationList } from "../../components/officer/lists";
import { EmptyNote, KpiGrid, KpiTile, Notice, PageHead, Segmented, useTx } from "../../components/officer/kit";
import { Bones } from "../../components/ui/Bones";
import { ErrorState, Toggle } from "../../components/ui/primitives";
import { useT } from "../../i18n";
import { cn } from "../../lib/format";
import type { EscalationItem } from "../../types/api";

export type EscFilter = "all" | "OPEN" | "IN_PROGRESS" | "RESOLVED";

/** Counts, filters and the escalation cards (rendered with fixtures on /__bones too). */
export function EscalationsBoard({ all, filter, onFilter, reason, onReason, includeResolved, onIncludeResolved, onResolve, staff }: {
  all: EscalationItem[]; filter: EscFilter; onFilter: (f: EscFilter) => void; reason: string; onReason: (r: string) => void;
  includeResolved: boolean; onIncludeResolved: (v: boolean) => void; onResolve: (e: EscalationItem) => void; staff?: boolean;
}) {
  const t = useT();
  const tx = useTx();
  const reasons = useMemo(() => [...new Set(all.map((e) => e.reason))], [all]);
  const items = all.filter((e) => (filter === "all" || e.status === filter) && (reason === "all" || e.reason === reason));
  const open = all.filter((e) => e.status === "OPEN").length;
  const inProgress = all.filter((e) => e.status === "IN_PROGRESS").length;
  const warm = all.filter((e) => e.warm_transfer && e.status !== "RESOLVED").length;
  return (
    <div className="space-y-5">
      <KpiGrid label={t("officer.kpi.label")} className="md:grid-cols-4">
        <KpiTile label={t("officer.esc.OPEN")} value={open} icon={ShieldAlert} tone="violet" active={filter === "OPEN"} onClick={() => onFilter(filter === "OPEN" ? "all" : "OPEN")} />
        <KpiTile label={t("officer.esc.IN_PROGRESS")} value={inProgress} icon={ShieldCheck} tone="azure" active={filter === "IN_PROGRESS"} onClick={() => onFilter(filter === "IN_PROGRESS" ? "all" : "IN_PROGRESS")} />
        <KpiTile label={t("officer.esc.warmOpen")} value={warm} icon={PhoneForwarded} tone="azure" />
        <div className="card flex h-full items-center px-3.5 py-3 sm:px-4">
          <Toggle checked={includeResolved} onChange={onIncludeResolved} label={t("officer.esc.includeResolved")} description={t("officer.esc.includeResolvedHint")} />
        </div>
      </KpiGrid>
      <section aria-label={t("officer.esc.title")} className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            size="sm"
            label={t("officer.esc.filterStatus")}
            value={filter}
            onChange={onFilter}
            items={[
              { value: "all", label: t("officer.queue.all"), count: all.length },
              { value: "OPEN", label: t("officer.esc.OPEN"), count: open },
              { value: "IN_PROGRESS", label: t("officer.esc.IN_PROGRESS"), count: inProgress },
              ...(includeResolved ? [{ value: "RESOLVED" as const, label: t("officer.esc.RESOLVED"), count: all.filter((e) => e.status === "RESOLVED").length }] : []),
            ]}
          />
          {reasons.length > 1 && (
            <label className="inline-flex items-center gap-2 text-sm text-muted">
              {t("officer.esc.reasonFilter")}
              <select value={reason} onChange={(e) => onReason(e.target.value)} className="h-10 cursor-pointer rounded-full border border-line-2 bg-surface px-3 text-[13px] text-ink outline-none focus:border-ink/50 focus:ring-2 focus:ring-ink/10 sm:h-9">
                <option value="all">{t("officer.queue.all")}</option>
                {reasons.map((r) => <option key={r} value={r}>{tx(`officer.escReason.${r}`)}</option>)}
              </select>
            </label>
          )}
        </div>
        <EscalationList items={items} onResolve={onResolve} staff={staff} />
        {!items.length && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25, duration: 0.3 }}>
            <EmptyNote icon={<ShieldCheck aria-hidden />} title={t("officer.esc.empty")} hint={t("officer.esc.emptyHint")} />
          </motion.div>
        )}
      </section>
    </div>
  );
}

export default function Escalations() {
  const t = useT();
  const [includeResolved, setIncludeResolved] = useState(false);
  const [filter, setFilter] = useState<EscFilter>("all");
  const [reason, setReason] = useState<string>("all");
  const [resolving, setResolving] = useState<EscalationItem | null>(null);
  // Same key and fetcher as useEscalations, keeping the current cards while the resolved history loads.
  const q = useQuery({
    queryKey: ["officer", "escalations", includeResolved],
    queryFn: () => officerApi.escalations(includeResolved),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-5">
      <PageHead eyebrow={t("officer.esc.eyebrow")} title={t("officer.esc.title")} subtitle={t("officer.esc.subtitle")} />
      <Notice tone="violet" icon={ShieldAlert}>{t("officer.esc.policy")}</Notice>
      <Bones name="staff-escalations" loading={q.isLoading} lines={6}>
        {q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.data ? (
          <div className={cn("transition-opacity duration-300", q.isPlaceholderData && "opacity-60")}>
            <EscalationsBoard
              all={q.data}
              filter={filter}
              onFilter={setFilter}
              reason={reason}
              onReason={setReason}
              includeResolved={includeResolved}
              onIncludeResolved={(v) => { setIncludeResolved(v); if (!v && filter === "RESOLVED") setFilter("all"); }}
              onResolve={setResolving}
            />
          </div>
        ) : null}
      </Bones>
      <ResolveDialog escalationId={resolving?.id ?? null} caseRef={resolving?.case_reference} onClose={() => setResolving(null)} />
    </div>
  );
}
