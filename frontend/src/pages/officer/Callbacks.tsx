import { motion } from "framer-motion";
import { Ban, MessageSquare, PhoneCall, PhoneOff } from "lucide-react";
import { useMemo, useState } from "react";
import { CallbacksTable } from "../../components/officer/lists";
import { EmptyNote, KpiGrid, KpiTile, PageHead, SearchInput, Segmented, useDebounced } from "../../components/officer/kit";
import { Bones } from "../../components/ui/Bones";
import { ErrorState } from "../../components/ui/primitives";
import { CallbackBadge } from "../../components/ui/StatusBadge";
import { useOfficerCallbacks } from "../../hooks/queries";
import { useT } from "../../i18n";
import type { CallbackItem, CallbackStatus } from "../../types/api";

const ORDER: CallbackStatus[] = ["SCHEDULED", "DIALING", "COMPLETED", "NO_ANSWER", "FAILED", "CANCELLED", "BLOCKED_NO_CONSENT", "SMS_ONLY"];

/** Counts, filters and the callback log (rendered with fixtures on /__bones too). */
export function CallbacksBoard({ all, status, onStatus, search, onSearch }: {
  all: CallbackItem[]; status: CallbackStatus | "all"; onStatus: (s: CallbackStatus | "all") => void; search: string; onSearch: (v: string) => void;
}) {
  const t = useT();
  const needle = useDebounced(search.trim().toUpperCase(), 200);
  const counts = useMemo(() => {
    const out: Partial<Record<CallbackStatus, number>> = {};
    all.forEach((c) => { out[c.status] = (out[c.status] ?? 0) + 1; });
    return out;
  }, [all]);
  const items = all.filter((c) => (status === "all" || c.status === status) && (!needle || (c.case_reference ?? "").toUpperCase().includes(needle)));
  const placed = (counts.COMPLETED ?? 0) + (counts.NO_ANSWER ?? 0) + (counts.FAILED ?? 0) + (counts.DIALING ?? 0);
  const pick = (s: CallbackStatus) => onStatus(status === s ? "all" : s);
  return (
    <div className="space-y-5">
      <KpiGrid label={t("officer.kpi.label")} className="md:grid-cols-4">
        <KpiTile label={t("officer.callbacks.kpiScheduled")} value={counts.SCHEDULED ?? 0} icon={PhoneCall} tone="amber" active={status === "SCHEDULED"} onClick={() => pick("SCHEDULED")} />
        <KpiTile label={t("officer.callbacks.kpiPlaced")} value={placed} icon={PhoneCall} tone="civic" />
        <KpiTile label={t("cb.BLOCKED_NO_CONSENT")} value={counts.BLOCKED_NO_CONSENT ?? 0} icon={Ban} tone="rose" active={status === "BLOCKED_NO_CONSENT"} onClick={() => pick("BLOCKED_NO_CONSENT")} />
        <KpiTile label={t("cb.SMS_ONLY")} value={counts.SMS_ONLY ?? 0} icon={PhoneOff} tone="violet" active={status === "SMS_ONLY"} onClick={() => pick("SMS_ONLY")} />
      </KpiGrid>
      <section aria-label={t("officer.callbacks.caption")} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            size="sm"
            label={t("officer.callbacks.filter")}
            value={status}
            onChange={onStatus}
            items={[
              { value: "all", label: t("officer.queue.all"), count: all.length },
              ...ORDER.filter((s) => counts[s]).map((s) => ({ value: s, label: t(`cb.${s}`), count: counts[s] })),
            ]}
          />
          <SearchInput className="w-full sm:w-64" value={search} onChange={onSearch} label={t("officer.cases.search")} placeholder={t("officer.cases.searchPlaceholder")} />
        </div>
        {items.length ? (
          <>
            <CallbacksTable items={items} caption={t("officer.callbacks.caption")} />
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
              {t("officer.callbacks.legend")} <CallbackBadge status="BLOCKED_NO_CONSENT" /> <CallbackBadge status="SMS_ONLY" />
            </p>
          </>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            <EmptyNote icon={<PhoneOff aria-hidden />} title={t("officer.callbacks.empty")} hint={status !== "all" ? undefined : t("officer.callbacks.emptyHint")} />
          </motion.div>
        )}
      </section>
    </div>
  );
}

export default function Callbacks() {
  const t = useT();
  const q = useOfficerCallbacks();
  const [status, setStatus] = useState<CallbackStatus | "all">("all");
  const [search, setSearch] = useState("");

  return (
    <div className="space-y-5">
      <PageHead eyebrow={t("officer.callbacks.eyebrow")} title={t("officer.callbacks.title")} subtitle={t("officer.callbacks.subtitle")} />

      <section aria-labelledby="cb-policy" className="card p-4 sm:p-5">
        <h2 id="cb-policy" className="eyebrow mb-2.5">{t("officer.callbacks.policyTitle")}</h2>
        <ul className="grid gap-x-5 gap-y-2.5 text-sm md:grid-cols-3">
          <li className="flex items-start gap-2.5"><PhoneCall className="mt-0.5 h-4 w-4 shrink-0 text-civic" aria-hidden /><span>{t("officer.callbacks.policyWhen")}</span></li>
          <li className="flex items-start gap-2.5"><Ban className="mt-0.5 h-4 w-4 shrink-0 text-rose" aria-hidden /><span>{t("officer.callbacks.policyConsent")}</span></li>
          <li className="flex items-start gap-2.5"><MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-violet" aria-hidden /><span>{t("officer.callbacks.policyOptOut")}</span></li>
        </ul>
        <p className="mt-2.5 border-t border-dashed border-line pt-2.5 text-xs text-muted">{t("officer.callbacks.policyCoalesce")}</p>
      </section>

      <Bones name="staff-callbacks" loading={q.isLoading} lines={6}>
        {q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.data ? (
          <CallbacksBoard all={q.data} status={status} onStatus={setStatus} search={search} onSearch={setSearch} />
        ) : null}
      </Bones>
    </div>
  );
}
