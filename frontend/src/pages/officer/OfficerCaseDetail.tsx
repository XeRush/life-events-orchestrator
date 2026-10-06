import { motion, useReducedMotion, type Variants } from "framer-motion";
import {
  ArrowLeft, ArrowRight, ArrowRightLeft, Bot, ClipboardCheck, FileText, Fingerprint, GitBranch, History, Landmark, ListChecks, MessageSquarePlus,
  PhoneCall, PhoneOff, ScrollText, ShieldAlert, ShieldCheck, UserRoundCheck, Workflow,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ease } from "../../animations/variants";
import { ApiError } from "../../api/client";
import { ApprovalsSection, CallsSection, ConsentSection, DocumentsSection, EntityRequestsSection, ExtractedSection, NodeActions, OrchestratorSection, VerificationSection, langName } from "../../components/officer/caseSections";
import {
  ApproveDialog, DocStatusDialog, EscalateDialog, NoteDialog, RejectDialog, RequestDocumentsDialog, ResolveDialog, TransferDialog, type ApprovalTarget,
} from "../../components/officer/dialogs";
import { AuditTable, CallbacksTable, EscalationList } from "../../components/officer/lists";
import {
  CopyButton, DeadlineText, EmptyNote, InlineError, Mono, OfficerCaseStatusBadge, PageHead, SafeSourceBadge, SafeStateBadge, SectionTabs, TabPanel, useIsStaff, useTx,
} from "../../components/officer/kit";
import { LifeEventGraph } from "../../components/graph/LifeEventGraph";
import { NodeDrawer } from "../../components/graph/NodeDrawer";
import { CaseTimeline } from "../../components/timeline/CaseTimeline";
import { Bones } from "../../components/ui/Bones";
import { Badge, Button, ProgressBar } from "../../components/ui/primitives";
import { MockBadge, RiskBadge } from "../../components/ui/StatusBadge";
import { useCase, useOfficerCase } from "../../hooks/queries";
import { useLang, useT } from "../../i18n";
import { cn, fmtDate, humanEmirate, titleCase } from "../../lib/format";
import type { CaseView, DocumentItem, EscalationItem, GraphNode, NodeKey, OfficerCaseDetail as Detail } from "../../types/api";

const TABS = ["timeline", "documents", "calls", "extracted", "consent", "verification", "requests", "approvals", "escalations", "callbacks", "audit", "orchestrator"] as const;
type Tab = (typeof TABS)[number];

const factsVariants: Variants = { animate: { transition: { staggerChildren: 0.035, delayChildren: 0.1 } } };
const factVariants: Variants = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease } } };

function Fact({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <motion.div variants={factVariants} className={cn("min-w-0", className)}>
      <dt className="eyebrow mb-1">{label}</dt>
      <dd className="text-[14px] leading-snug">{children}</dd>
    </motion.div>
  );
}

function BackLink() {
  const t = useT();
  return (
    <nav aria-label={t("officer.case.breadcrumb")}>
      <Link to="/officer" className="inline-flex min-h-8 items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink">
        <ArrowLeft className="h-4 w-4 rtl-flip" aria-hidden />{t("officer.case.back")}
      </Link>
    </nav>
  );
}

/** The whole case file below the breadcrumb (also rendered with a fixture on /__bones for skeleton capture). */
export function CaseDetailView({ d, view, staffOverride }: { d: Detail; view: CaseView; staffOverride?: boolean }) {
  const t = useT();
  const tx = useTx();
  const lang = useLang();
  const isStaff = useIsStaff();
  const staff = staffOverride ?? isStaff;
  const reduce = useReducedMotion();
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? "") ? (raw as Tab) : "timeline";
  const setTab = (v: Tab) => setParams((p) => { const n = new URLSearchParams(p); n.set("tab", v); return n; }, { replace: true });

  const [selected, setSelected] = useState<NodeKey | null>(null);
  const [approve, setApprove] = useState<ApprovalTarget | null>(null);
  const [reject, setReject] = useState<ApprovalTarget | null>(null);
  const [docsFor, setDocsFor] = useState<GraphNode | null>(null);
  const [docStatus, setDocStatus] = useState<DocumentItem | null>(null);
  const [resolving, setResolving] = useState<EscalationItem | null>(null);
  const [dialog, setDialog] = useState<"escalate" | "transfer" | "note" | null>(null);

  const docTitles = useMemo(() => {
    const out: Record<string, string> = {};
    Object.values(d.documents.groups).flat().forEach((x) => { out[x.doc_type] = x.title; });
    return out;
  }, [d.documents.groups]);

  const c = d.case;
  const pendingList = d.approvals.filter((a) => a.state === "PENDING");
  const node = selected ? d.graph.nodes.find((n) => n.key === selected) ?? null : null;
  const openEsc = d.escalations.filter((e) => e.status !== "RESOLVED").length;
  const docCount = Object.values(d.documents.groups).reduce((s, g) => s + g.length, 0);
  const missingDocs = (d.documents.counts.MISSING ?? 0) + (d.documents.counts.EXPIRED ?? 0);
  const failedVerif = d.verification.filter((v) => !v.success).length;

  const tabs: { value: Tab; label: string; count?: number; icon: typeof History; alert?: boolean }[] = [
    { value: "timeline", label: t("officer.tab.timeline"), count: d.timeline.length, icon: History },
    { value: "documents", label: t("officer.tab.documents"), count: docCount, icon: FileText, alert: missingDocs > 0 },
    { value: "calls", label: t("officer.tab.calls"), count: d.calls.length, icon: PhoneCall },
    { value: "extracted", label: t("officer.tab.extracted"), count: Object.keys(d.extracted_fields).length, icon: ListChecks },
    { value: "consent", label: t("officer.tab.consent"), count: d.consents.length, icon: ClipboardCheck },
    { value: "verification", label: t("officer.tab.verification"), count: d.verification.length, icon: Fingerprint, alert: failedVerif >= 2 },
    { value: "requests", label: t("officer.tab.requests"), count: d.entity_requests.length, icon: Landmark },
    { value: "approvals", label: t("officer.tab.approvals"), count: pendingList.length || d.approvals.length, icon: UserRoundCheck, alert: pendingList.length > 0 },
    { value: "escalations", label: t("officer.tab.escalations"), count: openEsc || d.escalations.length, icon: ShieldAlert, alert: openEsc > 0 },
    { value: "callbacks", label: t("officer.tab.callbacks"), count: d.callbacks.length, icon: PhoneOff },
    { value: "audit", label: t("officer.tab.audit"), count: d.audit.length, icon: ScrollText },
    { value: "orchestrator", label: t("officer.tab.orchestrator"), count: d.orchestrator.runs.length, icon: Workflow },
  ];

  return (
    <div className="space-y-5">
      {/* Header ------------------------------------------------------------------------------------------- */}
      <PageHead
        eyebrow={<>{t("officer.case.eyebrow")} · <Mono className="text-[11.5px] tracking-normal text-ink">{c.reference}</Mono><CopyButton value={c.reference} label={t("officer.case.copyRef")} className="-my-1.5" /></>}
        title={c.child?.full_name_en ?? t("officer.case.unnamed")}
        actions={staff ? (
          <>
            <Button variant="secondary" className="max-sm:flex-1" icon={<MessageSquarePlus className="h-4 w-4" aria-hidden />} onClick={() => setDialog("note")}>{t("officer.action.addNote")}</Button>
            <Button variant="secondary" className="max-sm:flex-1" icon={<ArrowRightLeft className="h-4 w-4" aria-hidden />} onClick={() => setDialog("transfer")}>{t("officer.action.transfer")}</Button>
            <Button className="max-sm:flex-1" icon={<ShieldAlert className="h-4 w-4" aria-hidden />} onClick={() => setDialog("escalate")}>{t("officer.action.escalate")}</Button>
          </>
        ) : undefined}
      >
        {c.child?.full_name_ar && <p dir="rtl" lang="ar" className="mt-0.5 text-start text-lg text-muted">{c.child.full_name_ar}</p>}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <OfficerCaseStatusBadge status={c.status} />
          <RiskBadge risk={c.risk} />
          {c.channel_mode === "SMS_ONLY" && <Badge tone="violet" icon={<PhoneOff className="h-3.5 w-3.5" aria-hidden />}>{t("officer.channel.SMS_ONLY")}</Badge>}
          {c.is_demo && <MockBadge />}
        </div>
      </PageHead>

      {/* Facts ---------------------------------------------------------------------------------------------- */}
      <section aria-label={t("officer.case.facts")} className="card p-4 sm:p-5">
        <motion.dl variants={factsVariants} initial={reduce ? false : "initial"} animate="animate" className="grid grid-cols-2 gap-x-5 gap-y-4 md:grid-cols-3 xl:grid-cols-5">
          <Fact label={t("officer.col.resident")}>
            <span className="font-medium">{c.resident?.full_name ?? "-"}</span>
            {c.resident?.phone && <span className="num block text-xs text-muted" dir="ltr">{c.resident.phone}</span>}
          </Fact>
          <Fact label={t("officer.col.child")}>
            {c.child ? <>{fmtDate(c.child.date_of_birth, lang)}<span className="block text-xs text-muted">{c.child.nationality} · {c.child.place_of_birth}</span></> : "-"}
          </Fact>
          <Fact label={t("officer.case.language")}>{langName(c.language)}</Fact>
          <Fact label={t("officer.case.channel")}>
            <span className="inline-flex items-center gap-1.5">{c.channel_mode === "VOICE" ? <PhoneCall className="h-3.5 w-3.5 text-civic" aria-hidden /> : <PhoneOff className="h-3.5 w-3.5 text-violet" aria-hidden />}{tx(`officer.channel.${c.channel_mode}`)}</span>
          </Fact>
          <Fact label={t("officer.case.emirate")}>{humanEmirate(c.emirate)}</Fact>
          <Fact label={t("deadline.title")}>
            <span className="block">{fmtDate(c.deadline.deadline_date, lang)}</span>
            <DeadlineText deadline={c.deadline} />
          </Fact>
          <Fact label={t("officer.case.officer")}>
            {c.assigned_officer ? <><span className="font-medium">{c.assigned_officer.full_name}</span>{c.assigned_officer.title && <span className="block text-xs text-muted">{c.assigned_officer.title}</span>}</> : <span className="text-faint">{t("officer.esc.unassigned")}</span>}
          </Fact>
          <Fact label={t("officer.case.organisation")}>
            {c.organization ? <>{c.organization.name}<Mono className="block text-[10.5px] text-faint">{c.organization.code}</Mono></> : "-"}
          </Fact>
          <Fact label={t("officer.case.progress")}>
            <span className="num font-medium">{c.progress.done}/{c.progress.total}</span>
            <span className="mt-1.5 block w-full max-w-36"><ProgressBar percent={c.progress.percent} label={t("officer.case.progress")} /></span>
          </Fact>
          <Fact label={t("officer.case.intake")}>
            {titleCase(c.intake_channel)}
            <span className="block text-xs text-muted">{fmtDate(c.created_at, lang)}</span>
          </Fact>
        </motion.dl>
      </section>

      {/* Where it stands -------------------------------------------------------------------------------------- */}
      <div className="grid gap-3 md:grid-cols-[1.4fr_1fr]">
        <section className="card min-w-0 p-4 sm:p-5" aria-label={t("officer.case.standing")}>
          <p className="eyebrow mb-1.5">{t("officer.case.standing")}</p>
          <p className="text-[15px] leading-relaxed text-ink-2">{view.summary}</p>
          {c.language !== lang && <p className="mt-1.5 text-xs text-muted">{t("officer.case.residentHears", { lang: langName(c.language) })}</p>}
          {view.next_action && (
            <div className="mt-3 flex items-start gap-3 rounded-xl bg-paper-2 p-3">
              <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 rtl-flip" aria-hidden />
              <div className="min-w-0">
                <p className="eyebrow">{t("officer.case.nextAction")} · {tx(`officer.owner.${view.next_action.owner}`)}</p>
                <p className="mt-0.5 font-medium">{view.next_action.text}</p>
              </div>
            </div>
          )}
        </section>
        <section className="card min-w-0 p-4 sm:p-5" aria-label={t("officer.case.attention")}>
          <p className="eyebrow mb-1.5">{t("officer.case.attention")}</p>
          {pendingList.length > 0 && (
            <ul className="mb-2 space-y-2">
              {pendingList.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => a.node_key && setSelected(a.node_key)}
                    className="flex min-h-11 w-full cursor-pointer flex-wrap items-center justify-between gap-2 rounded-xl border border-violet/30 bg-violet-soft/50 px-3 py-2.5 text-start transition-colors hover:border-violet/60">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{a.node_key ? t(`node.${a.node_key}`) : a.node_title}</span>
                      <span className="mt-0.5 block text-xs text-violet">{t("officer.node.awaiting")}</span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet px-2.5 py-1 text-[12px] font-medium text-on-accent">
                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden />{t("officer.case.reviewRelease")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {view.attention_nodes.length ? (
            <ul className="space-y-2">
              {view.attention_nodes.map((a) => (
                <li key={a.key}>
                  <button type="button" onClick={() => setSelected(a.key)} className="flex min-h-11 w-full cursor-pointer flex-wrap items-start justify-between gap-2 rounded-xl border border-line px-3 py-2.5 text-start transition-colors hover:border-ink/30 hover:bg-paper-2/50">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{t(`node.${a.key}`)}</span>
                      {a.reason && <span className="mt-0.5 block text-xs text-muted">{a.reason}</span>}
                    </span>
                    <SafeStateBadge state={a.state} />
                  </button>
                </li>
              ))}
            </ul>
          ) : !pendingList.length && <p className="text-sm text-muted">{t("officer.case.noAttention")}</p>}
          {c.outstanding_documents.length > 0 && (
            <p className="mt-2.5 text-xs text-amber">{t("officer.case.outstandingDocs", { n: c.outstanding_documents.length })}</p>
          )}
        </section>
      </div>

      {/* Graph -------------------------------------------------------------------------------------------------- */}
      <section aria-labelledby="graph-title" className="stage grid-lines relative overflow-hidden rounded-[18px] border border-line p-4 sm:p-5">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow mb-1 flex items-center gap-1.5"><GitBranch className="h-3.5 w-3.5" aria-hidden />{t("officer.graph.eyebrow")}</p>
            <h2 id="graph-title" className="text-xl sm:text-2xl">{t("officer.graph.title")}</h2>
            <p className="mt-0.5 text-sm text-muted">{t("officer.graph.hint")}</p>
          </div>
          <ul className="flex flex-wrap items-center gap-1.5" aria-label={t("officer.graph.legend")}>
            <li><SafeSourceBadge source="AI_AGENT" /></li>
            <li className="inline-flex items-center gap-1"><SafeSourceBadge source="GOVERNMENT_MOCK" /><MockBadge compact /></li>
            <li><SafeSourceBadge source="PARENT_REPORTED" /></li>
            <li><SafeSourceBadge source="HUMAN_OFFICER" /></li>
          </ul>
        </header>
        <LifeEventGraph graph={d.graph} selected={selected} onSelect={(k) => setSelected(k)} label={t("officer.graph.title")} />
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1"><UserRoundCheck className="h-3.5 w-3.5" aria-hidden />{t("officer.graph.legendRelease")}</span>
          <span className="inline-flex items-center gap-1"><PhoneOff className="h-3.5 w-3.5" aria-hidden />{t("officer.graph.legendParent")}</span>
          <span className="inline-flex items-center gap-1"><Bot className="h-3.5 w-3.5" aria-hidden />{t("officer.graph.legendAgent")}</span>
        </p>
      </section>

      {/* Sections ----------------------------------------------------------------------------------------------- */}
      <section aria-label={t("officer.case.sections")}>
        <SectionTabs idBase="case" label={t("officer.case.sections")} value={tab} onChange={setTab} items={tabs} />
        <TabPanel idBase="case" value={tab}>
          {tab === "timeline" && (d.timeline.length ? <CaseTimeline events={d.timeline} /> : <EmptyNote icon={<History aria-hidden />} title={t("officer.timeline.empty")} />)}
          {tab === "documents" && <DocumentsSection center={d.documents} caseRef={c.reference} staff={staff} onStatus={setDocStatus} />}
          {tab === "calls" && <CallsSection calls={d.calls} />}
          {tab === "extracted" && <ExtractedSection extracted={d.extracted_fields} calls={d.calls} />}
          {tab === "consent" && <ConsentSection consents={d.consents} optOuts={d.opt_outs} view={c} />}
          {tab === "verification" && <VerificationSection items={d.verification} />}
          {tab === "requests" && <EntityRequestsSection items={d.entity_requests} />}
          {tab === "approvals" && <ApprovalsSection detail={d} staff={staff} onApprove={setApprove} onReject={setReject} />}
          {tab === "escalations" && (
            d.escalations.length
              ? <EscalationList items={d.escalations} onResolve={setResolving} showCase={false} staff={staff} />
              : <EmptyNote icon={<ShieldAlert aria-hidden />} title={t("officer.esc.noneOnCase")} action={staff ? <Button size="sm" onClick={() => setDialog("escalate")}>{t("officer.action.escalate")}</Button> : undefined} />
          )}
          {tab === "callbacks" && (d.callbacks.length ? <CallbacksTable items={d.callbacks} hideCase caption={t("officer.callbacks.caption")} /> : <EmptyNote icon={<PhoneOff aria-hidden />} title={t("officer.callbacks.empty")} />)}
          {tab === "audit" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted">{t("officer.audit.caseHint")}</p>
                <Link to={`/officer/audit?case=${encodeURIComponent(c.reference)}`} className="inline-flex min-h-8 items-center gap-1 text-sm font-medium text-ink underline decoration-line-2 underline-offset-4 hover:decoration-ink">
                  {t("officer.audit.fullLog")}<ArrowRight className="h-3.5 w-3.5 rtl-flip" aria-hidden />
                </Link>
              </div>
              {d.audit.length ? <AuditTable items={d.audit} hideCase caption={t("officer.audit.caption")} maxH="max-h-[36rem]" /> : <EmptyNote icon={<ScrollText aria-hidden />} title={t("officer.audit.empty")} />}
            </div>
          )}
          {tab === "orchestrator" && <OrchestratorSection orchestrator={d.orchestrator} />}
        </TabPanel>
      </section>

      <p className="flex items-center gap-1.5 text-xs text-muted"><ShieldCheck className="h-3.5 w-3.5 shrink-0 text-violet" aria-hidden />{t("officer.case.openedAudited")}</p>

      {/* Drawer + dialogs (rendered last so modals stack above the drawer) ------------------------------------- */}
      <NodeDrawer
        node={node}
        caseRef={c.reference}
        onClose={() => setSelected(null)}
        actions={node ? <NodeActions node={node} detail={d} staff={staff} onApprove={setApprove} onReject={setReject} onRequestDocs={setDocsFor} /> : null}
      />
      <ApproveDialog target={approve} onClose={() => setApprove(null)} />
      <RejectDialog target={reject} onClose={() => setReject(null)} />
      <RequestDocumentsDialog node={docsFor} caseRef={c.reference} docTitles={docTitles} onClose={() => setDocsFor(null)} />
      <DocStatusDialog doc={docStatus} caseRef={c.reference} onClose={() => setDocStatus(null)} />
      <ResolveDialog escalationId={resolving?.id ?? null} caseRef={c.reference} onClose={() => setResolving(null)} />
      <EscalateDialog open={dialog === "escalate"} caseRef={c.reference} nodes={d.graph.nodes} defaultNode={selected} onClose={() => setDialog(null)} />
      <TransferDialog open={dialog === "transfer"} caseRef={c.reference} currentOfficerId={c.assigned_officer?.id} onClose={() => setDialog(null)} />
      <NoteDialog open={dialog === "note"} caseRef={c.reference} nodes={d.graph.nodes} onClose={() => setDialog(null)} />
    </div>
  );
}

export default function OfficerCaseDetail() {
  const { ref = "" } = useParams();
  const t = useT();
  const q = useOfficerCase(ref);
  // The officer bundle renders the summary in the resident's language; fetch the same view in the officer's UI language.
  const localized = useCase(ref);

  if (q.error) {
    const status = q.error instanceof ApiError ? q.error.status : 0;
    return (
      <div className="max-w-xl space-y-4 py-6">
        <BackLink />
        <h1 className="text-3xl">{status === 404 ? t("officer.case.notFound") : status === 403 ? t("officer.case.forbidden") : t("common.error")}</h1>
        <InlineError error={q.error} />
        <Button variant="secondary" onClick={() => q.refetch()}>{t("common.retry")}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <BackLink />
      <Bones name="staff-case-detail" loading={q.isLoading} lines={12}>
        {q.data ? <CaseDetailView d={q.data} view={localized.data ?? q.data.case} /> : null}
      </Bones>
    </div>
  );
}
