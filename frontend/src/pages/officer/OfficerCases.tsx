import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, AlertTriangle, Ban, Eye, Inbox, PauseCircle, ShieldAlert, ShieldCheck, UserRoundCheck } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { officerApi } from "../../api";
import { CaseLink } from "../../components/officer/lists";
import {
  DeadlineText, EmptyNote, InlineError, KpiGrid, KpiTile, OfficerCaseStatusBadge, PageHead, RelTime, SafeStateBadge, SearchInput, Segmented, TableFrame, Td, Th,
  useDebounced, useRowMotion,
} from "../../components/officer/kit";
import { Bones } from "../../components/ui/Bones";
import { Badge, ErrorState } from "../../components/ui/primitives";
import { useOfficerStats } from "../../hooks/queries";
import { useLang, useT } from "../../i18n";
import { cn, relative } from "../../lib/format";
import { RISK } from "../../lib/status";
import type { CaseListItem, OfficerStats } from "../../types/api";

export const QUEUES = ["all", "pending", "blocked", "stalled", "escalations", "active", "completed"] as const;
export type Queue = (typeof QUEUES)[number];

function ActionPill({ action }: { action: CaseListItem["officer_action"] }) {
  const t = useT();
  if (action === "RELEASE") {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-violet px-2.5 py-1 text-[12px] font-medium text-on-accent">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />{t("officer.cases.release")}
      </span>
    );
  }
  if (action === "REVIEW") {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-amber/50 bg-amber-soft px-2.5 py-1 text-[12px] font-medium text-amber">
        <Eye className="h-3.5 w-3.5" aria-hidden />{t("officer.cases.review")}
      </span>
    );
  }
  return <span className="text-faint">-</span>;
}

/** Compact risk pill for the dense queue table (icon + short word; the full label is in the tooltip). */
function RiskPill({ risk }: { risk: CaseListItem["risk"] }) {
  const t = useT();
  const m = RISK[risk];
  const Icon = m.icon;
  return <span title={t(`risk.${risk}`)}><Badge tone={m.tone} icon={<Icon className="h-3.5 w-3.5" aria-hidden />}>{t(`officer.risk.${risk}`)}</Badge></span>;
}

function SlaCell({ sla }: { sla: CaseListItem["sla"] }) {
  const t = useT();
  const lang = useLang();
  if (!sla.due_at) return <span className="block text-[13px] text-faint">{t("officer.cases.noSla")}</span>;
  if (sla.breached) {
    return (
      <span className="flex items-center gap-1 whitespace-nowrap text-[12.5px] font-semibold text-rose" title={relative(sla.due_at, lang)}>
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />{t("officer.cases.breached")}
      </span>
    );
  }
  return <span className="block whitespace-nowrap text-[13px] text-ink-2">{t("officer.cases.due")} <RelTime iso={sla.due_at} /></span>;
}

function CurrentNode({ node }: { node: CaseListItem["current_node"] }) {
  const t = useT();
  if (!node) return <span className="text-faint">-</span>;
  return (
    <span className="flex flex-col items-start gap-1">
      <span className="whitespace-nowrap text-[13px] font-medium">{t(`node.${node.key}`)}</span>
      <SafeStateBadge state={node.state} />
    </span>
  );
}

/* ---------------------------------------------------------------------------------------------------------------
 * Presentational pieces (also rendered with fixtures on /__bones for skeleton capture)
 * ------------------------------------------------------------------------------------------------------------- */

export function CaseKpis({ stats, current, onPick }: { stats: OfficerStats; current: Queue; onPick: (q: Queue) => void }) {
  const t = useT();
  const kpis: { key: Queue; label: string; value: number; icon: typeof Ban; tone: "violet" | "rose" | "amber" | "azure" }[] = [
    { key: "pending", label: t("officer.kpi.pending"), value: stats.pending_approval, icon: UserRoundCheck, tone: "violet" },
    { key: "blocked", label: t("officer.kpi.blocked"), value: stats.blocked, icon: Ban, tone: "rose" },
    { key: "stalled", label: t("officer.kpi.stalled"), value: stats.stalled, icon: PauseCircle, tone: "amber" },
    { key: "escalations", label: t("officer.kpi.escalations"), value: stats.escalations, icon: ShieldAlert, tone: "violet" },
    { key: "active", label: t("officer.kpi.active"), value: stats.active_cases, icon: Activity, tone: "azure" },
  ];
  return (
    <KpiGrid label={t("officer.kpi.label")} className="sm:grid-cols-3 xl:grid-cols-5 [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1">
      {kpis.map((k) => (
        <KpiTile key={k.key} label={k.label} value={k.value} icon={k.icon} tone={k.tone} active={current === k.key} onClick={() => onPick(current === k.key ? "all" : k.key)} />
      ))}
    </KpiGrid>
  );
}

function CaseCard({ c, i }: { c: CaseListItem; i: number }) {
  const t = useT();
  const row = useRowMotion();
  return (
    <motion.li {...row(i)} layout="position">
      <Link to={`/officer/cases/${c.reference}`} className={cn("card relative block h-full overflow-hidden p-3.5 ps-4.5 transition-colors hover:border-ink/30", c.sla.breached && "border-rose/40")}>
        {c.sla.breached && <span aria-hidden className="absolute inset-y-0 start-0 w-1 bg-rose" />}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[12.5px] font-medium" dir="ltr">{c.reference}</p>
            <p className="mt-0.5 truncate font-display text-lg leading-tight">{c.child_name ?? t("officer.case.unnamed")}</p>
            <p className="truncate text-sm text-muted">{c.resident_name ?? "-"}</p>
          </div>
          {c.officer_action && <ActionPill action={c.officer_action} />}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {c.current_node && <SafeStateBadge state={c.current_node.state} />}
          <RiskPill risk={c.risk} />
          <OfficerCaseStatusBadge status={c.status} />
        </div>
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-line pt-2.5 text-xs text-muted">
          <span>{c.current_node ? t(`node.${c.current_node.key}`) : "-"}</span>
          <span className="inline-flex items-center gap-3"><DeadlineText deadline={c.deadline} compact /><RelTime iso={c.last_activity_at} /></span>
        </div>
      </Link>
    </motion.li>
  );
}

/** The queue: cards on phones, a dense table from tablet up. `setKey` changes when the queue or search changes,
 * so a deliberate filter replays the entrance while SSE refreshes only animate rows that were added or removed. */
export function CaseQueue({ items, caption, setKey }: { items: CaseListItem[]; caption: string; setKey: string }) {
  const t = useT();
  const navigate = useNavigate();
  const row = useRowMotion();
  return (
    <>
      <ul key={`m-${setKey}`} aria-label={caption} className="grid gap-2.5 sm:grid-cols-2 md:hidden">
        <AnimatePresence initial>{items.map((c, i) => <CaseCard key={c.id} c={c} i={i} />)}</AnimatePresence>
      </ul>
      <TableFrame dense stickyFirst caption={caption} className="hidden md:block" maxH="max-h-[calc(100vh-18rem)]">
        <thead>
          <tr>
            <Th>{t("officer.col.caseId")}</Th>
            <Th>{t("officer.col.child")} / {t("officer.col.resident")}</Th>
            <Th>{t("officer.col.currentNode")}</Th>
            <Th>{t("officer.col.risk")}</Th>
            <Th className="hidden xl:table-cell">{t("officer.col.status")}</Th>
            <Th className="hidden xl:table-cell">{t("officer.col.lastActivity")}</Th>
            <Th>{t("officer.col.slaDeadline")}</Th>
            <Th>{t("officer.col.officerAction")}</Th>
          </tr>
        </thead>
        <tbody key={`t-${setKey}`}>
          <AnimatePresence initial>
            {items.map((c, i) => (
              <motion.tr
                key={c.id}
                {...row(i)}
                layout="position"
                onClick={() => navigate(`/officer/cases/${c.reference}`)}
                className="group cursor-pointer transition-colors hover:bg-paper-2/60"
              >
                <Td className="relative">
                  {c.sla.breached && <span aria-hidden className="absolute inset-y-1.5 start-0 w-0.5 rounded-full bg-rose" />}
                  <CaseLink reference={c.reference} />
                </Td>
                <Td className="max-w-52">
                  <span className="block truncate font-medium" title={c.child_name ?? undefined}>{c.child_name ?? <span className="text-faint">-</span>}</span>
                  <span className="block truncate text-[12.5px] text-muted" title={c.resident_name ?? undefined}>{c.resident_name ?? "-"}</span>
                </Td>
                <Td><CurrentNode node={c.current_node} /></Td>
                <Td><RiskPill risk={c.risk} /></Td>
                <Td className="hidden xl:table-cell"><OfficerCaseStatusBadge status={c.status} /></Td>
                <Td className="hidden xl:table-cell"><RelTime iso={c.last_activity_at} className="text-[13px] text-ink-2" /></Td>
                <Td>
                  <SlaCell sla={c.sla} />
                  <span className="mt-0.5 block text-[12px]"><DeadlineText deadline={c.deadline} compact /></span>
                </Td>
                <Td><ActionPill action={c.officer_action} /></Td>
              </motion.tr>
            ))}
          </AnimatePresence>
        </tbody>
      </TableFrame>
    </>
  );
}

export default function OfficerCases({ queue }: { queue: "all" | "blocked" }) {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get("queue");
  const current: Queue = (QUEUES as readonly string[]).includes(fromUrl ?? "") ? (fromUrl as Queue) : queue;
  const [search, setSearch] = useState(params.get("q") ?? "");
  const q = useDebounced(search.trim(), 300);
  const stats = useOfficerStats();
  // Same key and fetcher as useOfficerCases, plus keepPreviousData so switching queues never flashes a skeleton.
  const cases = useQuery({
    queryKey: ["officer", "cases", current, q || undefined],
    queryFn: () => officerApi.cases({ queue: current, q: q || undefined, limit: 100 }),
    placeholderData: keepPreviousData,
  });
  // The rows on screen belong to the last settled query; only a settled change of queue/search replays the entrance.
  const settled = useRef(`${current}|${q}`);
  if (!cases.isPlaceholderData && cases.data) settled.current = `${current}|${q}`;

  const setQueue = (v: Queue) => setParams((p) => { const n = new URLSearchParams(p); n.set("queue", v); return n; }, { replace: true });
  const items = cases.data?.items ?? [];
  const total = cases.data?.total ?? 0;
  const title = queue === "blocked" && current === "blocked" ? t("officer.cases.titleBlocked") : t("officer.cases.title");
  const caption = t("officer.cases.caption", { queue: t(`officer.queue.${current}`) });

  return (
    <div className="space-y-5">
      <PageHead eyebrow={t("officer.cases.eyebrow")} title={title} subtitle={t("officer.cases.subtitle")} />

      <Bones name="staff-cases-stats" loading={stats.isLoading} lines={2}>
        {stats.data ? <CaseKpis stats={stats.data} current={current} onPick={setQueue} /> : stats.error ? <InlineError error={stats.error} /> : null}
      </Bones>

      <section aria-label={caption} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented label={t("officer.cases.queues")} value={current} onChange={setQueue} items={QUEUES.map((v) => ({ value: v, label: t(`officer.queue.${v}`) }))} />
          <SearchInput className="w-full sm:w-64 lg:w-72" value={search} onChange={setSearch} label={t("officer.cases.search")} placeholder={t("officer.cases.searchPlaceholder")} />
        </div>

        <div className="flex min-h-4 items-center justify-between gap-3 text-xs text-muted" aria-live="polite">
          <span>{cases.isSuccess ? t("officer.cases.count", { shown: items.length, total }) : ""}</span>
          {cases.isFetching && !cases.isLoading && <span>{t("officer.common.refreshing")}</span>}
        </div>

        <Bones name={queue === "blocked" ? "staff-blocked-table" : "staff-cases-table"} loading={cases.isLoading} lines={6}>
          {cases.error ? (
            <ErrorState error={cases.error} onRetry={() => cases.refetch()} />
          ) : cases.data && !items.length ? (
            <EmptyNote icon={<Inbox aria-hidden />} title={t("officer.cases.empty")} hint={q ? t("officer.cases.emptySearch", { q }) : t("officer.cases.emptyHint")} />
          ) : cases.data ? (
            <div className={cn("transition-opacity duration-300", cases.isPlaceholderData && "opacity-60")}>
              <CaseQueue items={items} caption={caption} setKey={settled.current} />
              {total > items.length && <p className="mt-3 text-xs text-muted">{t("officer.cases.truncated", { n: items.length })}</p>}
            </div>
          ) : null}
        </Bones>
      </section>
    </div>
  );
}
