import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Bot, Inbox, Lock, ScrollText, ShieldCheck, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApproveDialog, RejectDialog, type ApprovalTarget } from "../../components/officer/dialogs";
import { CaseLink } from "../../components/officer/lists";
import { DeadlineText, EmptyNote, Notice, PageHead, PreparedFields, RelTime, SafeSourceBadge, Segmented, useCardMotion, useIsStaff } from "../../components/officer/kit";
import { Bones } from "../../components/ui/Bones";
import { Button, ErrorState } from "../../components/ui/primitives";
import { MockBadge, RiskBadge } from "../../components/ui/StatusBadge";
import { useApprovals } from "../../hooks/queries";
import { useT } from "../../i18n";
import { cn } from "../../lib/format";
import type { ApprovalItem } from "../../types/api";

type Sort = "oldest" | "deadline" | "risk";
const RISK_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;

const toTarget = (a: ApprovalItem): ApprovalTarget => ({
  id: a.id, caseRef: a.case_reference, nodeKey: a.node_key, nodeTitle: a.node_title, authority: a.entity_label, summary: a.summary, fields: a.fields,
});

function ApprovalCard({ a, i, staff, onApprove, onReject }: { a: ApprovalItem; i: number; staff: boolean; onApprove: () => void; onReject: () => void }) {
  const t = useT();
  const card = useCardMotion();
  const urgent = a.risk === "HIGH" || a.deadline.status === "OVERDUE" || a.deadline.status === "AT_RISK";
  return (
    <motion.article {...card(i)} className="card relative overflow-hidden" aria-labelledby={`approval-${a.id}`}>
      <span aria-hidden className={cn("absolute inset-y-0 start-0 w-1", urgent ? "bg-rose" : "bg-violet")} />
      <div className="grid xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 p-4 ps-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <CaseLink reference={a.case_reference} />
            <RiskBadge risk={a.risk} />
            <span className="text-[13px]"><DeadlineText deadline={a.deadline} /></span>
            <span className="text-xs text-muted">{t("officer.approvals.requested")} <RelTime iso={a.requested_at} /></span>
          </div>
          <h2 id={`approval-${a.id}`} className="mt-2 text-xl leading-tight sm:text-2xl">{t(`node.${a.node_key}`)}</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted">{a.entity_label} <MockBadge compact /></p>
          <p className="mt-2.5 flex items-start gap-2 text-[14px] text-ink-2">
            <Bot className="mt-0.5 h-4 w-4 shrink-0 text-azure" aria-hidden />
            <span>{a.summary}</span>
          </p>
          <div className="mt-3">
            <p className="eyebrow mb-1 flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" aria-hidden />{t("officer.approvals.fields", { n: a.fields.length })}</p>
            <PreparedFields fields={a.fields} />
          </div>
        </div>
        <aside className="flex flex-col gap-3 border-t border-line bg-paper-2/40 p-4 ps-5 xl:justify-between xl:border-s xl:border-t-0 xl:ps-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5"><SafeSourceBadge source="AI_AGENT" /><span className="text-xs text-muted">{t("officer.approvals.preparedBy")}</span></div>
            <p className="text-[13px] leading-relaxed text-ink-2">{t("officer.approvals.whatHappens", { authority: a.entity_label })}</p>
          </div>
          <div className="space-y-2">
            {staff ? (
              <div className="flex flex-col gap-2 sm:flex-row xl:flex-col">
                <Button variant="civic" className="sm:flex-1 xl:w-full xl:flex-none" icon={<ShieldCheck className="h-4 w-4" aria-hidden />} onClick={onApprove}>{t("officer.action.approve")}</Button>
                <div className="flex gap-2 sm:flex-1">
                  <Button variant="secondary" className="flex-1" icon={<XCircle className="h-4 w-4" aria-hidden />} onClick={onReject}>{t("officer.action.reject")}</Button>
                  <Link to={`/officer/cases/${a.case_reference}`} className="inline-flex min-h-10 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-full px-3 text-sm text-ink-2 hover:bg-paper-2">
                    {t("officer.action.openCase")}<ArrowUpRight className="h-4 w-4 rtl-flip" aria-hidden />
                  </Link>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">{t("officer.node.readOnly")}</p>
            )}
            <p className="flex items-center gap-1.5 text-[11.5px] text-muted"><ScrollText className="h-3.5 w-3.5 shrink-0" aria-hidden />{t("officer.approvals.audited")}</p>
          </div>
        </aside>
      </div>
    </motion.article>
  );
}

/** Pending submissions. A released or rejected one slides out and the rest close the gap; the toast confirms it. */
export function ApprovalList({ items, staff, onApprove, onReject }: { items: ApprovalItem[]; staff: boolean; onApprove: (a: ApprovalItem) => void; onReject: (a: ApprovalItem) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <AnimatePresence initial>
        {items.map((a, i) => <ApprovalCard key={a.id} a={a} i={i} staff={staff} onApprove={() => onApprove(a)} onReject={() => onReject(a)} />)}
      </AnimatePresence>
    </div>
  );
}

export default function Approvals() {
  const t = useT();
  const staff = useIsStaff();
  const q = useApprovals();
  const [sort, setSort] = useState<Sort>("oldest");
  const [approve, setApprove] = useState<ApprovalTarget | null>(null);
  const [reject, setReject] = useState<ApprovalTarget | null>(null);
  const items = useMemo(() => {
    const list = [...(q.data ?? [])];
    if (sort === "oldest") list.sort((x, y) => x.requested_at.localeCompare(y.requested_at));
    if (sort === "deadline") list.sort((x, y) => (x.deadline.days_remaining ?? 9999) - (y.deadline.days_remaining ?? 9999));
    if (sort === "risk") list.sort((x, y) => RISK_ORDER[x.risk] - RISK_ORDER[y.risk]);
    return list;
  }, [q.data, sort]);

  return (
    <div className="space-y-5">
      <PageHead eyebrow={t("officer.approvals.eyebrow")} title={t("officer.approvals.title")} subtitle={t("officer.approvals.subtitle")} />
      <Notice tone="violet" icon={ShieldCheck} title={t("officer.approvals.gateTitle")}>{t("officer.approvals.gateBody")}</Notice>
      <section aria-label={t("officer.approvals.title")} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted" aria-live="polite">{q.isSuccess ? t("officer.approvals.count", { n: items.length }) : ""}</p>
          <Segmented
            size="sm"
            label={t("officer.approvals.sort")}
            value={sort}
            onChange={setSort}
            items={[
              { value: "oldest", label: t("officer.approvals.sortOldest") },
              { value: "deadline", label: t("officer.approvals.sortDeadline") },
              { value: "risk", label: t("officer.approvals.sortRisk") },
            ]}
          />
        </div>
        <Bones name="staff-approvals" loading={q.isLoading} lines={6}>
          {q.error ? (
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          ) : q.data ? (
            <>
              <ApprovalList items={items} staff={staff} onApprove={(a) => setApprove(toTarget(a))} onReject={(a) => setReject(toTarget(a))} />
              {!items.length && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25, duration: 0.3 }}>
                  <EmptyNote icon={<Inbox aria-hidden />} title={t("officer.approvals.empty")} hint={t("officer.approvals.emptyHint")} />
                </motion.div>
              )}
            </>
          ) : null}
        </Bones>
      </section>
      <ApproveDialog target={approve} onClose={() => setApprove(null)} />
      <RejectDialog target={reject} onClose={() => setReject(null)} />
    </div>
  );
}
