import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, CheckCircle2, ChevronDown, FlaskConical, Fingerprint, Inbox, PhoneCall, PhoneOff, TrendingDown, UserRoundCheck, Users } from "lucide-react";
import { useRef } from "react";
import { ease } from "../../animations/variants";
import { ChartCard, HBars, Legend, MiniTable, StackedBar, StackedGroup, useGrowOnView, type Segment } from "../../components/officer/charts";
import { KpiGrid, KpiTile, Mono, PageHead, SafeStateBadge, useStatusLabel, useTx } from "../../components/officer/kit";
import { Bones } from "../../components/ui/Bones";
import { ErrorState } from "../../components/ui/primitives";
import { CallbackBadge, RiskBadge } from "../../components/ui/StatusBadge";
import { useAnalytics } from "../../hooks/queries";
import { useT } from "../../i18n";
import { cn } from "../../lib/format";
import { CALLBACK, NODE_STATE, TONE, type Tone } from "../../lib/status";
import type { Analytics as AnalyticsData, CallbackStatus, NodeState, Risk } from "../../types/api";

const NODE_ORDER = ["BIRTH_CERTIFICATE", "MOFA_ATTESTATION", "CONSULATE_PASSPORT", "RESIDENCE_VISA", "EMIRATES_ID", "INSURANCE"];

/** Node states folded into five status buckets so colour stays legible; the table view keeps every state. */
const BUCKETS: { key: string; states: NodeState[]; tone: Tone }[] = [
  { key: "done", states: ["CLEARED", "COMPLETED"], tone: "civic" },
  { key: "flight", states: ["READY", "SUBMITTING", "SUBMITTED", "PROCESSING"], tone: "azure" },
  { key: "waiting", states: ["WAITING_FOR_HUMAN", "WAITING_FOR_PARENT"], tone: "violet" },
  { key: "attention", states: ["BLOCKED", "DOCUMENT_MISSING", "STALLED", "REJECTED"], tone: "rose" },
  { key: "pending", states: ["PENDING"], tone: "slate" },
];

const sortNodes = (keys: string[]) => [...keys].sort((a, b) => (NODE_ORDER.indexOf(a) + 99) % 99 - (NODE_ORDER.indexOf(b) + 99) % 99);

function KpiCompare({ k, i }: { k: AnalyticsData["kpis"][number]; i: number }) {
  const t = useT();
  const reduce = useReducedMotion();
  const max = Math.max(k.baseline, k.target, k.measured, 1);
  const rows: { key: string; label: string; value: number; tone: Tone }[] = [
    { key: "baseline", label: t("officer.analytics.baseline"), value: k.baseline, tone: "slate" },
    { key: "target", label: t("officer.analytics.target"), value: k.target, tone: "civic" },
    { key: "measured", label: t("officer.analytics.measured"), value: k.measured, tone: "azure" },
  ];
  const met = k.measured <= k.target;
  const better = k.measured < k.baseline;
  const reduction = k.baseline ? Math.round(((k.baseline - k.measured) / k.baseline) * 100) : 0;
  return (
    <motion.article
      initial={reduce ? false : { opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      transition={{ duration: 0.5, ease, delay: i * 0.07 }}
      className="card flex min-w-0 flex-col p-4"
      aria-labelledby={`kpi-${k.id}`}
    >
      <p className="eyebrow mb-1">{t("officer.analytics.kpiN", { n: i + 1 })}</p>
      <h3 id={`kpi-${k.id}`} className="text-[16.5px] leading-snug">{k.label}</h3>
      <ul className="mt-3 space-y-2.5" aria-label={t("officer.analytics.compare")}>
        {rows.map((r) => (
          <li key={r.key}>
            <div className="mb-1 flex items-baseline justify-between text-[12.5px]">
              <span className="text-ink-2">{r.label}</span>
              <span className="num text-[15px] font-semibold text-ink">{r.value}</span>
            </div>
            <div className="h-2.5 rounded-full bg-paper-2" aria-hidden>
              <div
                data-grow
                className="h-full origin-left rounded-e-[4px] rounded-s-[1px] rtl:origin-right"
                style={{ background: TONE[r.tone].solid, width: `${Math.max((r.value / max) * 100, r.value > 0 ? 2 : 0)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className={cn("mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium", met ? "text-civic" : better ? "text-amber" : "text-rose")}>
        {met ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : better ? <TrendingDown className="h-4 w-4" aria-hidden /> : <AlertTriangle className="h-4 w-4" aria-hidden />}
        {met ? t("officer.analytics.met") : better ? t("officer.analytics.better", { pct: reduction }) : t("officer.analytics.notBetter")}
      </p>
      <p className="mt-1 text-xs text-muted">{t("officer.analytics.targetNote")}: {k.target_note}</p>
      <div className="mt-auto pt-3">
        <dl className="space-y-1 border-t border-line pt-2.5 text-[11.5px] text-muted">
          <div><dt className="inline font-medium text-ink-2">{t("officer.analytics.measuredBy")}: </dt><dd className="inline">{k.measured_by}</dd></div>
          <div><dt className="inline font-medium text-ink-2">{t("officer.analytics.source")}: </dt><dd className="inline">{k.source}</dd></div>
        </dl>
      </div>
    </motion.article>
  );
}

/** Everything below the page header (also rendered with a fixture on /__bones for skeleton capture). */
export function AnalyticsView({ a }: { a: AnalyticsData }) {
  const t = useT();
  const tx = useTx();
  const statusLabel = useStatusLabel();
  const kpiRef = useRef<HTMLDivElement>(null);
  useGrowOnView(kpiRef);

  const statusRows = Object.entries(a.cases.by_status).sort((x, y) => y[1] - x[1]).map(([k, v]) => ({ key: k, label: statusLabel("case", k), value: v }));
  const riskRows = (["HIGH", "MEDIUM", "LOW"] as Risk[]).filter((r) => a.cases.by_risk[r] != null).map((r) => ({
    key: r, label: <RiskBadge risk={r} />, value: a.cases.by_risk[r] ?? 0, tone: (r === "HIGH" ? "rose" : r === "MEDIUM" ? "amber" : "civic") as Tone,
  }));
  const nodeKeys = sortNodes(Object.keys(a.nodes.by_key_state));
  const bucketLabel = (k: string) => tx(`officer.analytics.bucket.${k}`);
  const segmentsFor = (states: Record<string, number>): Segment[] => BUCKETS.map((b) => ({
    key: b.key, label: bucketLabel(b.key), tone: b.tone, value: b.states.reduce((s, st) => s + (states[st] ?? 0), 0),
  }));
  const allStates = [...new Set(Object.values(a.nodes.by_key_state).flatMap((m) => Object.keys(m)))]
    .sort((x, y) => Object.keys(NODE_STATE).indexOf(x) - Object.keys(NODE_STATE).indexOf(y));
  const hourRows = sortNodes(Object.keys(a.avg_hours_to_clear)).map((k) => ({ key: k, label: tx(`node.${k}`), value: a.avg_hours_to_clear[k], display: t("officer.analytics.hours", { n: a.avg_hours_to_clear[k] }) }));
  const cbRows = Object.entries(a.callbacks).sort((x, y) => y[1] - x[1]).map(([k, v]) => ({
    key: k, label: k in CALLBACK ? <CallbackBadge status={k as CallbackStatus} /> : k, value: v, tone: (k in CALLBACK ? CALLBACK[k as CallbackStatus].tone : "slate") as Tone,
  }));
  const escRows = Object.entries(a.escalations).sort((x, y) => y[1] - x[1]).map(([k, v]) => ({ key: k, label: tx(`officer.escReason.${k}`), value: v }));
  const vPct = a.verification.attempts ? Math.round((a.verification.succeeded / a.verification.attempts) * 100) : 0;
  const legend = BUCKETS.map((b) => ({ key: b.key, label: bucketLabel(b.key), tone: b.tone }));

  return (
    <div className="space-y-6">
      <div role="note" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border-2 border-dashed border-amber/60 bg-amber-soft/70 px-4 py-3">
        <span className="inline-flex items-center gap-2 rounded-lg bg-amber px-2.5 py-1 font-mono text-[11.5px] font-semibold uppercase tracking-[0.16em] text-on-accent">
          <FlaskConical className="h-4 w-4" aria-hidden />{t("officer.analytics.demoBadge")}
        </span>
        <p className="min-w-0 flex-1 basis-60 text-sm text-ink-2">{a.label}</p>
      </div>

      {/* Canvas KPIs ------------------------------------------------------------------------------------------- */}
      <section aria-labelledby="kpis-title" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 id="kpis-title" className="text-xl sm:text-2xl">{t("officer.analytics.kpisTitle")}</h2>
            <p className="mt-0.5 text-sm text-muted">{t("officer.analytics.kpisHint")}</p>
          </div>
          <Legend items={[
            { key: "b", label: t("officer.analytics.baseline"), tone: "slate" },
            { key: "t", label: t("officer.analytics.target"), tone: "civic" },
            { key: "m", label: t("officer.analytics.measured"), tone: "azure" },
          ]} />
        </div>
        <div ref={kpiRef} className="grid gap-3 md:grid-cols-3">{a.kpis.map((k, i) => <KpiCompare key={k.id} k={k} i={i} />)}</div>
        <details className="group text-sm">
          <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
            <ChevronDown className="h-4 w-4 transition-transform duration-300 group-open:rotate-180" aria-hidden />{t("officer.analytics.kpiTable")}
          </summary>
          <div className="card mt-2 overflow-x-auto p-4">
            <MiniTable caption={t("officer.analytics.kpisTitle")} head={[t("officer.analytics.kpi"), t("officer.analytics.baseline"), t("officer.analytics.target"), t("officer.analytics.measured")]}
              rows={a.kpis.map((k) => [k.label, k.baseline, k.target, k.measured])} />
          </div>
        </details>
      </section>

      {/* Operational summary ------------------------------------------------------------------------------------ */}
      <KpiGrid label={t("officer.analytics.summary")} className="md:grid-cols-3 xl:grid-cols-6">
        <KpiTile label={t("officer.analytics.totalCases")} value={a.cases.total} icon={Users} tone="ink" />
        <KpiTile label={t("officer.kpi.pending")} value={a.approvals_pending} icon={UserRoundCheck} tone="violet" />
        <KpiTile label={t("officer.analytics.calls")} value={a.calls} icon={PhoneCall} tone="azure" />
        <KpiTile label={t("officer.analytics.optOuts")} value={a.opt_outs} icon={PhoneOff} tone="violet" />
        <KpiTile label={t("officer.analytics.verification")} value={a.verification.attempts ? `${vPct}%` : "-"} icon={Fingerprint} tone="civic" hint={t("officer.analytics.verificationHint", { ok: a.verification.succeeded, n: a.verification.attempts })} />
        <KpiTile label={t("officer.analytics.bottlenecks")} value={a.bottlenecks.items.length} icon={Inbox} tone="rose" hint={t("officer.analytics.via", { source: a.bottlenecks.source })} />
      </KpiGrid>

      <div className="grid gap-3 md:grid-cols-2">
        <ChartCard title={t("officer.analytics.byStatus")} table={<MiniTable caption={t("officer.analytics.byStatus")} head={[t("officer.col.status"), t("officer.analytics.cases")]} rows={statusRows.map((r) => [r.label, r.value])} />}>
          <HBars rows={statusRows} tone="azure" labelWidth="w-28 sm:w-36" empty={t("officer.analytics.noData")} />
        </ChartCard>
        <ChartCard title={t("officer.analytics.byRisk")} table={<MiniTable caption={t("officer.analytics.byRisk")} head={[t("officer.col.risk"), t("officer.analytics.cases")]} rows={riskRows.map((r) => [t(`risk.${r.key}`), r.value])} />}>
          <HBars rows={riskRows} labelWidth="w-28 sm:w-32" empty={t("officer.analytics.noData")} />
        </ChartCard>
      </div>

      {/* Node states by step ------------------------------------------------------------------------------------ */}
      <ChartCard
        title={t("officer.analytics.nodeStates")}
        hint={t("officer.analytics.nodeStatesHint")}
        aside={<span className="hidden lg:block"><Legend items={legend} /></span>}
        table={
          <div className="scroll-thin overflow-x-auto">
            <MiniTable
              caption={t("officer.analytics.nodeStates")}
              head={[t("officer.col.node"), ...allStates.map((s) => <SafeStateBadge key={s} state={s} />)]}
              rows={nodeKeys.map((k) => [tx(`node.${k}`), ...allStates.map((s) => a.nodes.by_key_state[k]?.[s] ?? 0)])}
            />
          </div>
        }
      >
        <div className="mb-3 lg:hidden"><Legend items={legend} /></div>
        {nodeKeys.length ? (
          <StackedGroup className="grid gap-x-8 gap-y-4 md:grid-cols-2">
            {nodeKeys.map((k) => {
              const states = a.nodes.by_key_state[k] ?? {};
              const n = Object.values(states).reduce((s, v) => s + v, 0);
              return <StackedBar key={k} label={tx(`node.${k}`)} sublabel={t("officer.analytics.nCases", { n })} segments={segmentsFor(states)} />;
            })}
          </StackedGroup>
        ) : <p className="py-4 text-sm text-muted">{t("officer.analytics.noData")}</p>}
      </ChartCard>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <ChartCard title={t("officer.analytics.hoursToClear")} hint={t("officer.analytics.hoursHint")} table={<MiniTable caption={t("officer.analytics.hoursToClear")} head={[t("officer.col.node"), t("officer.analytics.avgHours")]} rows={hourRows.map((r) => [r.label, r.value])} />}>
          <HBars rows={hourRows} tone="civic" labelWidth="w-28 sm:w-36" empty={t("officer.analytics.noCleared")} />
        </ChartCard>
        <ChartCard title={t("officer.analytics.callbacks")} table={<MiniTable caption={t("officer.analytics.callbacks")} head={[t("officer.col.status"), t("officer.analytics.count")]} rows={cbRows.map((r) => [tx(`cb.${r.key}`), r.value])} />}>
          <HBars rows={cbRows} labelWidth="w-32 sm:w-40" empty={t("officer.analytics.noData")} />
        </ChartCard>
        <ChartCard className="md:col-span-2 xl:col-span-1" title={t("officer.analytics.escalations")} table={<MiniTable caption={t("officer.analytics.escalations")} head={[t("officer.col.reason"), t("officer.analytics.count")]} rows={escRows.map((r) => [r.label, r.value])} />}>
          <HBars rows={escRows} tone="violet" labelWidth="w-32 sm:w-40" empty={t("officer.analytics.noData")} />
        </ChartCard>
      </div>

      {/* Bottlenecks ------------------------------------------------------------------------------------------- */}
      <section aria-labelledby="bn-title" className="card p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 id="bn-title" className="text-lg">{t("officer.analytics.bottlenecks")}</h2>
            <p className="mt-0.5 text-[13px] text-muted">{t("officer.analytics.bottlenecksHint")}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-muted">
            {t("officer.analytics.source")}: <Mono className="text-[11px] text-ink">{a.bottlenecks.source}</Mono>
          </span>
        </div>
        {a.bottlenecks.items.length ? (
          <div className="scroll-thin -mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[520px] text-sm">
              <caption className="sr-only">{t("officer.analytics.bottlenecks")}</caption>
              <thead>
                <tr className="border-b border-line">
                  {[t("officer.col.node"), t("officer.analytics.authority"), t("officer.col.status"), t("officer.analytics.cases"), t("officer.analytics.heldDownstream")].map((h, i) => (
                    <th key={i} scope="col" className={cn("pb-2 font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted", i >= 3 ? "text-end" : "text-start", i === 0 && "sticky start-0 bg-surface")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {a.bottlenecks.items.map((b, i) => (
                  <tr key={`${b.key}-${b.state}-${i}`} className="border-b border-line last:border-0">
                    <th scope="row" className="sticky start-0 bg-surface py-2.5 pe-3 text-start font-medium">{tx(`node.${b.key}`)}</th>
                    <td className="py-2.5 pe-3"><Mono className="text-[11.5px] text-muted">{b.entity}</Mono></td>
                    <td className="py-2.5 pe-3"><SafeStateBadge state={b.state} /></td>
                    <td className="num py-2.5 text-end font-semibold">{b.cases}</td>
                    <td className="num py-2.5 text-end">{b.held_downstream ?? <span className="text-faint">-</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="py-3 text-sm text-muted">{t("officer.analytics.noBottlenecks")}</p>}
      </section>
    </div>
  );
}

export default function Analytics() {
  const t = useT();
  const q = useAnalytics();
  return (
    <div className="space-y-5">
      <PageHead eyebrow={t("officer.analytics.eyebrow")} title={t("officer.analytics.title")} subtitle={t("officer.analytics.subtitle")} />
      <Bones name="staff-analytics" loading={q.isLoading} lines={10}>
        {q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data ? <AnalyticsView a={q.data} /> : null}
      </Bones>
    </div>
  );
}
