import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight, BadgeCheck, Bot, Building2, ChevronDown, FileCheck2, FileWarning, Fingerprint, Info, Lock, Megaphone, PhoneIncoming, PhoneOutgoing,
  RefreshCw, RotateCcw, ShieldCheck, UserRound, Wrench, type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { ease } from "../../animations/variants";
import { casesApi, officerApi } from "../../api";
import { useAction } from "../../hooks/queries";
import { LANGUAGES, useLang, useT } from "../../i18n";
import { cn, duration, fmtTime, titleCase } from "../../lib/format";
import { DOC_STATUS, DONE, TONE, type Tone } from "../../lib/status";
import type { CallView, CaseView, Consent, DocStatus, DocumentCenter, DocumentItem, GraphNode, OfficerCaseDetail, TranscriptLine } from "../../types/api";
import { Badge, Button } from "../ui/primitives";
import { DocBadge, MockBadge } from "../ui/StatusBadge";
import type { ApprovalTarget } from "./dialogs";
import {
  AbsTime, BoolMark, CopyButton, EmptyNote, FieldValue, InlineError, Mono, Notice, PreparedFields, RelTime, SafeSourceBadge, SafeStateBadge, TableFrame, Td, Th,
  useCardMotion, useRowMotion, useTx,
} from "./kit";
import { NodeName } from "./lists";

export const langName = (code: string) => LANGUAGES.find((l) => l.code === code)?.english ?? code;

function SubTitle({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="mb-2.5">
      <h3 className="text-lg leading-tight">{children}</h3>
      {hint && <p className="mt-0.5 text-[13px] text-muted">{hint}</p>}
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------------------------
 * Node actions (rendered in the NodeDrawer's `actions` slot)
 * ------------------------------------------------------------------------------------------------------------- */

export function NodeActions({ node, detail, staff, onApprove, onReject, onRequestDocs }: {
  node: GraphNode; detail: OfficerCaseDetail; staff: boolean; onApprove: (a: ApprovalTarget) => void; onReject: (a: ApprovalTarget) => void; onRequestDocs: (n: GraphNode) => void;
}) {
  const t = useT();
  const ref = detail.case.reference;
  const prepare = useAction((k: GraphNode["key"]) => officerApi.prepare(ref, k), { success: t("officer.node.prepared") });
  const retry = useAction((k: GraphNode["key"]) => officerApi.retry(ref, k), { success: t("officer.node.retried") });
  const pending = detail.approvals.find((a) => a.node_key === node.key && a.state === "PENDING");
  const done = DONE.includes(node.state);
  const canPrepare = (node.state === "BLOCKED" || node.state === "REJECTED") && node.type === "ENTITY_FILING";
  const canRetry = node.state === "STALLED";
  const canRequest = node.required_documents.length > 0 && !done;
  const target: ApprovalTarget | null = pending
    ? { id: pending.id, caseRef: ref, nodeKey: node.key, nodeTitle: node.title, authority: node.entity_label, summary: pending.summary, fields: pending.fields }
    : null;
  return (
    <section aria-label={t("officer.node.actions")} className="rounded-2xl border border-violet/30 bg-violet-soft/40 p-4">
      <p className="eyebrow mb-3 flex items-center gap-1.5 text-violet"><ShieldCheck className="h-3.5 w-3.5" aria-hidden />{t("officer.node.actions")}</p>
      {!staff ? (
        <p className="text-sm text-ink-2">{t("officer.node.readOnly")}</p>
      ) : (
        <>
          {target && pending && (
            <div className="mb-3 rounded-xl border border-line bg-surface p-3.5">
              <p className="text-sm font-medium">{t("officer.node.awaiting")}</p>
              <p className="mt-0.5 text-xs text-muted">{t("officer.node.requestedBy", { who: pending.requested_by })} · <RelTime iso={pending.requested_at} /></p>
              <div className="mt-2"><PreparedFields fields={pending.fields} dense /></div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="civic" icon={<ShieldCheck className="h-4 w-4" aria-hidden />} onClick={() => onApprove(target)}>{t("officer.action.approve")}</Button>
                <Button size="sm" variant="secondary" onClick={() => onReject(target)}>{t("officer.action.reject")}</Button>
              </div>
            </div>
          )}
          {node.type === "PARENT_REPORTED" && <p className="mb-3 text-sm text-ink-2">{t("officer.node.parentReported")}</p>}
          <div className="flex flex-wrap gap-2">
            {canRequest && (
              <Button size="sm" variant="secondary" icon={<FileWarning className="h-4 w-4" aria-hidden />} onClick={() => onRequestDocs(node)}>{t("officer.action.requestDocs")}</Button>
            )}
            {canPrepare && (
              <Button size="sm" variant="secondary" icon={<RotateCcw className="h-4 w-4" aria-hidden />} loading={prepare.isPending} onClick={() => prepare.mutate(node.key)}>
                {t("officer.action.prepare")}
              </Button>
            )}
            {canRetry && (
              <Button size="sm" variant="secondary" icon={<RefreshCw className="h-4 w-4" aria-hidden />} loading={retry.isPending} onClick={() => retry.mutate(node.key)}>
                {t("officer.action.retry")}
              </Button>
            )}
          </div>
          {canPrepare && <p className="mt-2 text-xs text-muted">{t("officer.node.prepareHint")}</p>}
          {canRetry && <p className="mt-2 text-xs text-muted">{t("officer.node.retryHint")}</p>}
          {!pending && !canRequest && !canPrepare && !canRetry && <p className="text-sm text-muted">{t("officer.node.nothing")}</p>}
          <InlineError error={prepare.error ?? retry.error} className="mt-3" />
        </>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------------------------------------------------------
 * Documents
 * ------------------------------------------------------------------------------------------------------------- */

const fmtSize = (b: number | null) => (b == null ? "-" : b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

function DocTags({ d }: { d: DocumentItem }) {
  const t = useT();
  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-faint">
      <Mono className="text-[10.5px]">{d.doc_type}</Mono>
      {d.is_output && <span className="rounded bg-civic-soft px-1.5 text-civic">{t("officer.docs.output")}</span>}
      {d.declared_available && d.status === "REQUIRED" && <span className="rounded bg-paper-2 px-1.5">{t("officer.docs.declared")}</span>}
    </p>
  );
}

function DocActions({ d, staff, verify, onStatus, className }: {
  d: DocumentItem; staff: boolean; verify: { isPending: boolean; variables?: string; mutate: (v: string) => void }; onStatus: (d: DocumentItem) => void; className?: string;
}) {
  const t = useT();
  if (!staff) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {d.status === "UPLOADED" && (
        <Button size="sm" variant="civic" className="max-sm:min-h-10" icon={<FileCheck2 className="h-4 w-4" aria-hidden />}
          loading={verify.isPending && verify.variables === d.doc_type} onClick={() => verify.mutate(d.doc_type)}>
          {t("officer.docs.markChecked")}
        </Button>
      )}
      <Button size="sm" variant="ghost" className="max-sm:min-h-10" onClick={() => onStatus(d)} aria-label={t("officer.docs.changeStatusFor", { doc: d.title })}>{t("officer.docs.changeStatus")}</Button>
    </div>
  );
}

export function DocumentsSection({ center, caseRef, staff, onStatus }: { center: DocumentCenter; caseRef: string; staff: boolean; onStatus: (d: DocumentItem) => void }) {
  const t = useT();
  const tx = useTx();
  const row = useRowMotion();
  const verify = useAction((type: string) => casesApi.verifyDocument(caseRef, type), { success: t("officer.docs.checkedDone") });
  const groups = Object.entries(center.groups).filter(([, items]) => items.length);
  if (!groups.length) return <EmptyNote title={t("officer.docs.empty")} />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {Object.entries(center.counts).map(([s, n]) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            {s in DOC_STATUS ? <DocBadge status={s as DocStatus} /> : <Badge>{titleCase(s)}</Badge>}
            <span className="num text-sm font-medium">{n}</span>
          </span>
        ))}
      </div>
      <Notice tone="azure" icon={Info}>{center.disclaimer} {t("officer.docs.wording")}</Notice>
      <InlineError error={verify.error} />

      {/* Phones: grouped cards */}
      <div className="space-y-4 md:hidden">
        {groups.map(([cat, items]) => (
          <section key={cat} aria-label={tx(`officer.docCategory.${cat}`)}>
            <h4 className="eyebrow mb-2">{tx(`officer.docCategory.${cat}`)}</h4>
            <ul className="flex flex-col gap-2">
              <AnimatePresence initial>
                {items.map((d, i) => (
                  <motion.li key={d.id} {...row(i)} className="card p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium leading-snug">{d.title}</p>
                        <DocTags d={d} />
                      </div>
                      <DocBadge status={d.status} />
                    </div>
                    {d.notes && <p className="mt-1.5 text-xs text-muted">{d.notes}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5"><SafeSourceBadge source={d.source} /><span className="text-[12.5px] text-ink-2"><NodeName nodeKey={d.node_key} /></span></div>
                    <dl className="mt-2.5 grid grid-cols-3 gap-x-3 border-t border-dashed border-line pt-2.5 text-[12px]">
                      <div className="min-w-0"><dt className="text-faint">{t("officer.col.required")}</dt><dd><BoolMark value={d.required} /></dd></div>
                      <div className="min-w-0"><dt className="text-faint">{t("officer.col.uploaded")}</dt><dd className="text-ink-2"><RelTime iso={d.uploaded_at} /></dd></div>
                      <div className="min-w-0"><dt className="text-faint">{t("officer.col.checked")}</dt><dd className="text-ink-2"><RelTime iso={d.verified_at} /></dd></div>
                    </dl>
                    {d.file_name && <p className="mt-2 truncate text-[12px] text-ink-2" title={d.file_name}>{d.file_name}{d.size_bytes != null && <span className="num text-faint"> · {fmtSize(d.size_bytes)}</span>}</p>}
                    <DocActions d={d} staff={staff} verify={verify} onStatus={onStatus} className="mt-2.5" />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </section>
        ))}
      </div>

      {/* Tablet and up: one table grouped by category, scrolling sideways inside its own box with the document pinned */}
      <TableFrame caption={t("officer.docs.caption")} maxH={false} stickyFirst minW="min-w-[980px]" className="hidden md:block">
        <thead>
          <tr>
            <Th>{t("officer.col.document")}</Th>
            <Th>{t("officer.col.status")}</Th>
            <Th>{t("officer.col.required")}</Th>
            <Th>{t("officer.col.source")}</Th>
            <Th>{t("officer.col.node")}</Th>
            <Th>{t("officer.col.file")}</Th>
            <Th>{t("officer.col.uploaded")}</Th>
            <Th>{t("officer.col.checked")}</Th>
            <Th><span className="sr-only">{t("officer.col.actions")}</span></Th>
          </tr>
        </thead>
        {groups.map(([cat, items]) => (
          <tbody key={cat}>
            <tr>
              <th colSpan={9} scope="colgroup" className="border-b border-line bg-surface px-3 pb-1.5 pt-3.5 text-start font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-faint">
                {tx(`officer.docCategory.${cat}`)}
              </th>
            </tr>
            {items.map((d, i) => (
              <motion.tr key={d.id} {...row(i)} className="transition-colors hover:bg-paper-2/60">
                <Td className="w-56 min-w-52">
                  <p className="font-medium leading-snug">{d.title}</p>
                  <DocTags d={d} />
                  {d.notes && <p className="mt-1 max-w-sm text-xs text-muted">{d.notes}</p>}
                </Td>
                <Td><DocBadge status={d.status} /></Td>
                <Td><BoolMark value={d.required} /></Td>
                <Td><SafeSourceBadge source={d.source} /></Td>
                <Td className="whitespace-nowrap text-[13px] text-ink-2"><NodeName nodeKey={d.node_key} /></Td>
                <Td className="text-[13px] text-ink-2">
                  {d.file_name ? <span className="block max-w-44 truncate" title={d.file_name}>{d.file_name}</span> : <span className="text-faint">-</span>}
                  {d.size_bytes != null && <span className="num text-[11px] text-faint">{fmtSize(d.size_bytes)}</span>}
                </Td>
                <Td><RelTime iso={d.uploaded_at} className="text-[13px] text-ink-2" /></Td>
                <Td><RelTime iso={d.verified_at} className="text-[13px] text-ink-2" /></Td>
                <Td><DocActions d={d} staff={staff} verify={verify} onStatus={onStatus} className="flex-nowrap justify-end" /></Td>
              </motion.tr>
            ))}
          </tbody>
        ))}
      </TableFrame>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------------------------
 * Calls and transcripts
 * ------------------------------------------------------------------------------------------------------------- */

const ROLE: Record<TranscriptLine["role"], { tone: Tone; icon: LucideIcon }> = {
  AGENT: { tone: "azure", icon: Bot },
  RESIDENT: { tone: "slate", icon: UserRound },
  SYSTEM: { tone: "slate", icon: Building2 },
  OFFICER: { tone: "violet", icon: ShieldCheck },
};

function TranscriptLines({ lines }: { lines: TranscriptLine[] }) {
  const t = useT();
  const lang = useLang();
  if (!lines.length) return <p className="py-4 text-sm text-muted">{t("officer.calls.noTranscript")}</p>;
  return (
    <ol className="scroll-thin max-h-[28rem] divide-y divide-line overflow-auto rounded-xl border border-line bg-surface" aria-label={t("officer.calls.transcript")}>
      {lines.map((l, i) => {
        const m = ROLE[l.role] ?? ROLE.SYSTEM;
        const Icon = m.icon;
        const disclosure = l.is_disclosure || i === 0;
        return (
          <li key={l.seq} className="grid grid-cols-[96px_1fr] gap-3 px-3.5 py-2.5">
            <div className="pt-0.5">
              <span className={cn("inline-flex items-center gap-1 text-xs font-medium", TONE[m.tone].text)}><Icon className="h-3.5 w-3.5" aria-hidden />{t(`officer.role.${l.role}`)}</span>
              <time dateTime={l.at} className="num mt-0.5 block text-[11px] text-faint">{fmtTime(l.at, lang)}</time>
            </div>
            <div className="min-w-0">
              {disclosure && (
                <span className="mb-1 inline-flex items-center gap-1 rounded-md border border-amber/40 bg-amber-soft px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber">
                  <Megaphone className="h-3 w-3" aria-hidden />{t("officer.calls.disclosure")}
                </span>
              )}
              <p className="text-[14px] leading-relaxed">{l.text}</p>
              {(l.sub_agent || l.tool) && (
                <p className="mt-1 flex flex-wrap gap-1.5">
                  {l.sub_agent && <span className="rounded-md bg-azure-soft px-1.5 py-0.5 font-mono text-[10.5px] text-azure" title={t("officer.calls.subAgent")}>{l.sub_agent}</span>}
                  {l.tool && <span className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 font-mono text-[10.5px] text-ink-2" title={t("officer.calls.tool")}><Wrench className="h-3 w-3" aria-hidden />{l.tool}</span>}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function CallCard({ call, open, onToggle }: { call: CallView; open: boolean; onToggle: () => void }) {
  const t = useT();
  const tx = useTx();
  const reduce = useReducedMotion();
  const Dir = call.direction === "INBOUND" ? PhoneIncoming : PhoneOutgoing;
  const pid = `call-${call.id}`;
  return (
    <article className="card overflow-hidden">
      <button type="button" aria-expanded={open} aria-controls={pid} onClick={onToggle}
        className="flex w-full cursor-pointer flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 text-start transition-colors hover:bg-paper-2/50 sm:px-5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-azure-soft text-azure"><Dir className="h-4 w-4" aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{t(call.direction === "INBOUND" ? "officer.calls.inbound" : "officer.calls.outbound")} · <AbsTime iso={call.started_at} /></span>
          <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>{tx(`officer.provider.${call.provider}`)}</span>
            <span aria-hidden>·</span>
            <span>{tx(`officer.callState.${call.state}`)}</span>
            <span aria-hidden>·</span>
            <span className="num">{duration(call.duration_seconds)}</span>
            <span aria-hidden>·</span>
            <span>{langName(call.language)}</span>
          </span>
        </span>
        {call.verified ? (
          <Badge tone="civic" icon={<Fingerprint className="h-3.5 w-3.5" aria-hidden />}>{t("officer.calls.verified")}{call.verification_method ? ` · ${tx(`officer.verifyMethod.${call.verification_method}`)}` : ""}</Badge>
        ) : (
          <Badge tone="slate">{t("officer.calls.notVerified")}</Badge>
        )}
        <ChevronDown className={cn("h-4 w-4 text-muted transition-transform duration-300", open && "rotate-180")} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
      {open && (
        <motion.div
          id={pid}
          initial={reduce ? false : { height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={reduce ? undefined : { height: 0, opacity: 0 }}
          transition={{ duration: 0.32, ease }}
          className="overflow-hidden border-t border-line"
        >
        <div className="px-4 py-4 sm:px-5">
          <dl className="mb-3 grid grid-cols-2 gap-x-5 gap-y-2.5 text-[13px] sm:grid-cols-4">
            <div><dt className="eyebrow mb-0.5">{t("officer.calls.direction")}</dt><dd>{t(call.direction === "INBOUND" ? "officer.calls.inbound" : "officer.calls.outbound")}</dd></div>
            <div><dt className="eyebrow mb-0.5">{t("officer.calls.provider")}</dt><dd>{tx(`officer.provider.${call.provider}`)}</dd></div>
            <div><dt className="eyebrow mb-0.5">{t("officer.col.duration")}</dt><dd className="num">{duration(call.duration_seconds)}</dd></div>
            <div><dt className="eyebrow mb-0.5">{t("officer.calls.verification")}</dt><dd><BoolMark value={call.verified} yes={call.verification_method ? tx(`officer.verifyMethod.${call.verification_method}`) : undefined} /></dd></div>
            <div><dt className="eyebrow mb-0.5">{t("officer.col.outcome")}</dt><dd>{call.outcome ? titleCase(call.outcome) : "-"}</dd></div>
            <div><dt className="eyebrow mb-0.5">{t("officer.calls.subAgent")}</dt><dd><Mono>{call.sub_agent}</Mono></dd></div>
            <div><dt className="eyebrow mb-0.5">{t("officer.calls.stage")}</dt><dd><Mono>{call.agent?.stage ?? "-"}</Mono></dd></div>
            <div><dt className="eyebrow mb-0.5">{t("officer.calls.disclosureAt")}</dt><dd><AbsTime iso={call.disclosure_at} /></dd></div>
          </dl>
          {call.summary && <p className="mb-3 rounded-xl bg-paper-2 px-3.5 py-2.5 text-sm text-ink-2"><span className="font-medium">{t("officer.calls.summary")}: </span>{call.summary}</p>}
          <TranscriptLines lines={call.transcript} />
        </div>
        </motion.div>
      )}
      </AnimatePresence>
    </article>
  );
}

export function CallsSection({ calls }: { calls: CallView[] }) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(calls[0]?.id ?? null);
  if (!calls.length) return <EmptyNote title={t("officer.calls.empty")} hint={t("officer.calls.emptyHint")} />;
  return (
    <div className="space-y-2.5">
      <Notice tone="azure" icon={Bot}>{t("officer.calls.note")}</Notice>
      {calls.map((c) => <CallCard key={c.id} call={c} open={open === c.id} onToggle={() => setOpen((o) => (o === c.id ? null : c.id))} />)}
    </div>
  );
}

export function ExtractedSection({ extracted, calls }: { extracted: Record<string, Record<string, unknown>>; calls: CallView[] }) {
  const t = useT();
  const entries = Object.entries(extracted).filter(([, f]) => f && Object.keys(f).length);
  if (!entries.length) return <EmptyNote title={t("officer.extracted.empty")} />;
  return (
    <div className="space-y-4">
      <Notice tone="azure" icon={Bot}>{t("officer.extracted.note")}</Notice>
      {entries.map(([callId, fields]) => {
        const call = calls.find((c) => c.id === callId);
        return (
          <section key={callId}>
            <SubTitle hint={<span className="inline-flex items-center gap-1.5"><Mono className="text-[11px]">{callId.slice(0, 8)}</Mono>{call && <> · <AbsTime iso={call.started_at} /></>}</span>}>
              {t("officer.extracted.fromCall")}
            </SubTitle>
            <TableFrame caption={t("officer.extracted.caption")} maxH={false}>
              <thead><tr><Th>{t("officer.col.field")}</Th><Th>{t("officer.col.value")}</Th></tr></thead>
              <tbody>
                {Object.entries(fields).map(([k, v]) => (
                  <tr key={k} className="hover:bg-paper-2/60">
                    <Td className="w-1/3"><span className="block">{titleCase(k.replace(/\./g, " "))}</span><Mono className="text-[10.5px] text-faint">{k}</Mono></Td>
                    <Td className="font-medium"><FieldValue name={k} value={v} /></Td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          </section>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------------------------
 * Consent, verification, entity requests
 * ------------------------------------------------------------------------------------------------------------- */

export function ConsentSection({ consents, optOuts, view }: { consents: Consent[]; optOuts: OfficerCaseDetail["opt_outs"]; view: CaseView }) {
  const t = useT();
  const tx = useTx();
  const row = useRowMotion();
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-line bg-surface px-4 py-3"><p className="eyebrow">{t("officer.consent.callback")}</p><p className="mt-1.5"><BoolMark value={view.consent.callback} yes={t("officer.consent.granted")} no={t("officer.consent.notGranted")} /></p></div>
        <div className="rounded-2xl border border-line bg-surface px-4 py-3"><p className="eyebrow">{t("officer.consent.token")}</p><p className="mt-1.5"><BoolMark value={view.consent.token_present} yes={t("officer.consent.tokenYes")} no={t("officer.consent.tokenNo")} /></p></div>
        <div className="rounded-2xl border border-line bg-surface px-4 py-3"><p className="eyebrow">{t("officer.consent.channel")}</p><p className="mt-1.5 text-sm font-medium">{tx(`officer.channel.${view.channel_mode}`)}</p></div>
        <div className="rounded-2xl border border-line bg-surface px-4 py-3"><p className="eyebrow">{t("officer.consent.optedOut")}</p><p className="mt-1.5 text-sm">{view.opted_out ? <span className="font-medium text-rose">{t("common.yes")} · <RelTime iso={view.opted_out_at} /></span> : t("common.no")}</p></div>
      </div>
      <section>
        <SubTitle hint={t("officer.consent.hint")}>{t("officer.consent.records")}</SubTitle>
        {consents.length ? (
          <TableFrame caption={t("officer.consent.records")} maxH={false} stickyFirst minW="min-w-[900px]">
            <thead>
              <tr>
                <Th>{t("officer.col.type")}</Th><Th>{t("officer.col.status")}</Th><Th>{t("officer.col.version")}</Th><Th>{t("officer.col.scope")}</Th>
                <Th>{t("officer.col.source")}</Th><Th>{t("officer.col.language")}</Th><Th>{t("officer.col.token")}</Th><Th>{t("officer.col.captured")}</Th><Th>{t("officer.col.revoked")}</Th>
              </tr>
            </thead>
            <tbody>
              {consents.map((c, i) => (
                <motion.tr key={c.id} {...row(i)} className="hover:bg-paper-2/60">
                  <Td className="min-w-36 font-medium">{tx(`officer.consentType.${c.consent_type}`)}</Td>
                  <Td>{c.status === "GRANTED" ? <Badge tone="civic" icon={<BadgeCheck className="h-3.5 w-3.5" aria-hidden />}>{t("officer.consent.GRANTED")}</Badge> : <Badge tone="rose">{t("officer.consent.REVOKED")}</Badge>}</Td>
                  <Td><Mono>{c.version}</Mono></Td>
                  <Td className="max-w-60 text-[13px] text-ink-2">{c.scope}</Td>
                  <Td className="text-[13px]">{titleCase(c.source)}</Td>
                  <Td className="text-[13px]">{langName(c.language)}</Td>
                  <Td><BoolMark value={c.token_present} /></Td>
                  <Td><AbsTime iso={c.captured_at} className="text-[13px]" /></Td>
                  <Td><AbsTime iso={c.revoked_at} className="text-[13px]" /></Td>
                </motion.tr>
              ))}
            </tbody>
          </TableFrame>
        ) : <EmptyNote title={t("officer.consent.empty")} />}
      </section>
      <section>
        <SubTitle hint={t("officer.optout.hint")}>{t("officer.optout.title")}</SubTitle>
        {optOuts.length ? (
          <ul className="space-y-2">
            {optOuts.map((o, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm">
                {o.active ? <Badge tone="rose">{t("officer.optout.active")}</Badge> : <Badge tone="slate">{t("officer.optout.lifted")}</Badge>}
                <span className="text-ink-2">{o.reason || "-"}</span>
                <span className="text-xs text-muted">{titleCase(o.source)}</span>
                <AbsTime iso={o.created_at} className="ms-auto text-xs text-muted" />
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">{t("officer.optout.none")}</p>}
      </section>
    </div>
  );
}

export function VerificationSection({ items }: { items: OfficerCaseDetail["verification"] }) {
  const t = useT();
  const tx = useTx();
  const row = useRowMotion();
  if (!items.length) return <EmptyNote title={t("officer.verify.empty")} />;
  const ok = items.filter((v) => v.success).length;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">{t("officer.verify.summary", { ok, n: items.length })}</p>
      <TableFrame caption={t("officer.verify.caption")} maxH={false} stickyFirst minW="min-w-[760px]">
        <thead>
          <tr><Th className="text-end">#</Th><Th>{t("officer.col.method")}</Th><Th>{t("officer.col.result")}</Th><Th>{t("officer.col.facts")}</Th><Th>{t("officer.col.failure")}</Th><Th>{t("officer.col.call")}</Th><Th>{t("officer.col.time")}</Th></tr>
        </thead>
        <tbody>
          {items.map((v, i) => (
            <motion.tr key={v.id} {...row(i)} className={cn("hover:bg-paper-2/60", !v.success && "bg-rose-soft/30")}>
              <Td className="num text-end">{v.attempt_no}</Td>
              <Td className="font-medium">{tx(`officer.verifyMethod.${v.method}`)}</Td>
              <Td>{v.success ? <Badge tone="civic" icon={<BadgeCheck className="h-3.5 w-3.5" aria-hidden />}>{t("officer.verify.passed")}</Badge> : <Badge tone="rose">{t("officer.verify.failed")}</Badge>}</Td>
              <Td><span className="flex flex-wrap gap-1">{v.facts_checked.length ? v.facts_checked.map((f) => <span key={f} className="rounded-md border border-line px-1.5 py-0.5 font-mono text-[10.5px]">{f}</span>) : <span className="text-faint">-</span>}</span></Td>
              <Td className="text-[13px] text-ink-2">{v.failure_reason ?? <span className="text-faint">-</span>}</Td>
              <Td>{v.call_session_id ? <Mono className="text-[11px] text-muted">{v.call_session_id.slice(0, 8)}</Mono> : <span className="text-faint">-</span>}</Td>
              <Td><AbsTime iso={v.created_at} className="text-[13px]" /></Td>
            </motion.tr>
          ))}
        </tbody>
      </TableFrame>
    </div>
  );
}

export function EntityRequestsSection({ items }: { items: OfficerCaseDetail["entity_requests"] }) {
  const t = useT();
  const card = useCardMotion();
  if (!items.length) return <EmptyNote title={t("officer.requests.empty")} hint={t("officer.requests.emptyHint")} />;
  return (
    <div className="space-y-3">
      <Notice tone="amber" title={t("officer.requests.mockTitle")}>{t("officer.requests.mockBody")}</Notice>
      <div className="grid gap-3 xl:grid-cols-2">
        {items.map((r, i) => (
          <motion.article key={r.id} {...card(i)} className="card min-w-0 p-4">
            <header className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="eyebrow"><NodeName nodeKey={r.node_key} /></p>
                <h4 className="mt-1 font-display text-lg leading-snug">{r.entity_label}</h4>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted"><Mono className="text-[11px]">{r.request_type}</Mono><MockBadge compact /></p>
              </div>
              <SafeStateBadge state={r.state} />
            </header>
            <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2.5 text-[13px]">
              <div className="col-span-2">
                <dt className="eyebrow mb-0.5">{t("officer.requests.externalRef")}</dt>
                <dd className="flex items-center gap-1">{r.external_ref ? <><Mono>{r.external_ref}</Mono><CopyButton value={r.external_ref} label={t("officer.requests.copyRef")} /></> : <span className="text-faint">-</span>}</dd>
              </div>
              <div><dt className="eyebrow mb-0.5">{t("officer.requests.released")}</dt><dd><AbsTime iso={r.released_at} /></dd></div>
              <div><dt className="eyebrow mb-0.5">{t("officer.requests.submitted")}</dt><dd><AbsTime iso={r.submitted_at} /></dd></div>
              <div><dt className="eyebrow mb-0.5">{t("officer.requests.attempts")}</dt><dd className="num">{r.attempts}</dd></div>
              {r.error && <div className="col-span-2"><dt className="eyebrow mb-0.5">{t("officer.requests.error")}</dt><dd className="text-rose">{r.error}</dd></div>}
            </dl>
            <div className="mt-3">
              <p className="eyebrow mb-1.5 flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" aria-hidden />{t("officer.requests.fieldsSent")}</p>
              <ul className="flex flex-wrap gap-1.5">
                {r.fields_sent.map((f) => <li key={f} className={cn("rounded-md border px-2 py-0.5 font-mono text-[11px]", f.endsWith("_token") ? "border-violet/30 bg-violet-soft text-violet" : "border-line text-ink-2")}>{f}</li>)}
              </ul>
              <p className="mt-1.5 text-xs text-muted">{t("officer.requests.fieldsHint", { n: r.fields_sent.length })}</p>
            </div>
            {r.statuses.length > 0 && (
              <div className="mt-3">
                <p className="eyebrow mb-2">{t("officer.requests.history")}</p>
                <ol className="relative space-y-2.5 border-s border-line-2 ps-4">
                  {r.statuses.map((s, j) => (
                    <li key={j} className="relative text-[13px]">
                      <span aria-hidden className="absolute -start-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-civic" />
                      <p className="flex flex-wrap items-center gap-2"><span className="font-medium">{titleCase(s.status)}</span><span className="rounded bg-paper-2 px-1.5 font-mono text-[10px] uppercase tracking-wider text-muted">{s.channel}</span><AbsTime iso={s.received_at} className="text-xs text-faint" /></p>
                      {s.detail && <p className="mt-0.5 text-muted">{s.detail}</p>}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </motion.article>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------------------------
 * Approvals & officer reviews
 * ------------------------------------------------------------------------------------------------------------- */

const APPROVAL_TONE: Record<string, Tone> = { PENDING: "violet", APPROVED: "civic", REJECTED: "rose", CANCELLED: "slate" };
const DECISION_TONE: Record<string, Tone> = { APPROVED: "civic", REJECTED: "rose", DOCUMENTS_REQUESTED: "amber", ESCALATED: "violet", TRANSFERRED: "azure", RESOLVED: "civic", NOTE: "slate" };

export function ApprovalsSection({ detail, staff, onApprove, onReject }: { detail: OfficerCaseDetail; staff: boolean; onApprove: (a: ApprovalTarget) => void; onReject: (a: ApprovalTarget) => void }) {
  const t = useT();
  const tx = useTx();
  const nodes = Object.fromEntries(detail.graph.nodes.map((n) => [n.key, n]));
  const toTarget = (a: OfficerCaseDetail["approvals"][number]): ApprovalTarget => ({
    id: a.id, caseRef: detail.case.reference, nodeKey: a.node_key, nodeTitle: a.node_title,
    authority: (a.node_key && nodes[a.node_key]?.entity_label) || "-", summary: a.summary, fields: a.fields,
  });
  const row = useRowMotion();
  return (
    <div className="space-y-5">
      <section>
        <SubTitle hint={t("officer.approvals.historyHint")}>{t("officer.approvals.history")}</SubTitle>
        {detail.approvals.length ? (
          <TableFrame caption={t("officer.approvals.history")} maxH={false} stickyFirst minW="min-w-[880px]">
            <thead>
              <tr><Th>{t("officer.col.node")}</Th><Th>{t("officer.col.status")}</Th><Th>{t("officer.col.summary")}</Th><Th>{t("officer.col.requested")}</Th><Th>{t("officer.col.decided")}</Th><Th>{t("officer.col.reasonNote")}</Th><Th><span className="sr-only">{t("officer.col.actions")}</span></Th></tr>
            </thead>
            <tbody>
              {detail.approvals.map((a, i) => (
                <motion.tr key={a.id} {...row(i)} className="hover:bg-paper-2/60">
                  <Td className="whitespace-nowrap font-medium"><NodeName nodeKey={a.node_key} fallback={a.node_title} /></Td>
                  <Td><Badge tone={APPROVAL_TONE[a.state] ?? "slate"}>{tx(`officer.approvalState.${a.state}`)}</Badge></Td>
                  <Td className="max-w-72 text-[13px] text-ink-2">{a.summary}</Td>
                  <Td className="text-[13px]"><span className="block">{a.requested_by}</span><RelTime iso={a.requested_at} className="text-xs text-muted" /></Td>
                  <Td className="text-[13px]">{a.decided_by ? <><span className="inline-flex items-center gap-1 text-violet"><ShieldCheck className="h-3.5 w-3.5" aria-hidden />{a.decided_by}</span><RelTime iso={a.decided_at} className="block text-xs text-muted" /></> : <span className="text-faint">-</span>}</Td>
                  <Td className="max-w-60 text-[13px] text-ink-2">{a.reason ?? <span className="text-faint">-</span>}</Td>
                  <Td>
                    {staff && a.state === "PENDING" && (
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="civic" className="whitespace-nowrap" onClick={() => onApprove(toTarget(a))}>{t("officer.action.approve")}</Button>
                        <Button size="sm" variant="secondary" onClick={() => onReject(toTarget(a))}>{t("officer.action.reject")}</Button>
                      </div>
                    )}
                  </Td>
                </motion.tr>
              ))}
            </tbody>
          </TableFrame>
        ) : <EmptyNote title={t("officer.approvals.noneOnCase")} />}
      </section>
      <section>
        <SubTitle hint={t("officer.reviews.hint")}>{t("officer.reviews.title")}</SubTitle>
        {detail.reviews.length ? (
          <ol className="space-y-2">
            {detail.reviews.map((r, i) => (
              <motion.li key={i} {...row(i)} className="flex items-start gap-3 rounded-xl border border-line bg-surface px-3.5 py-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-violet-soft text-violet" title={t("source.HUMAN_OFFICER")}><ShieldCheck className="h-4 w-4" aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge tone={DECISION_TONE[r.decision] ?? "slate"}>{tx(`officer.decision.${r.decision}`)}</Badge>
                    <span className="font-medium">{r.officer}</span>
                    {r.node_key && <span className="text-muted">· <NodeName nodeKey={r.node_key} /></span>}
                    <AbsTime iso={r.created_at} className="ms-auto text-xs text-muted" />
                  </p>
                  {r.notes && <p className="mt-1 text-[14px] text-ink-2">{r.notes}</p>}
                </div>
              </motion.li>
            ))}
          </ol>
        ) : <p className="text-sm text-muted">{t("officer.reviews.none")}</p>}
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------------------------
 * LangGraph orchestrator runs: trigger -> graph-node path -> actions
 * ------------------------------------------------------------------------------------------------------------- */

const PATH_TONE: Record<string, Tone> = { START: "slate", END: "slate", ESCALATE: "violet", CALLBACK: "amber", ENTITY_ACTION: "civic", WAIT_FOR_EVENT: "slate" };

export function OrchestratorSection({ orchestrator }: { orchestrator: OfficerCaseDetail["orchestrator"] }) {
  const t = useT();
  const row = useRowMotion();
  if (!orchestrator.runs.length) return <EmptyNote title={t("officer.orch.empty")} />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">{t("officer.orch.hint")}</p>
        <p className="text-sm"><span className="num font-semibold">{orchestrator.steps}</span> <span className="text-muted">{t("officer.orch.steps")}</span></p>
      </div>
      <ol className="space-y-2.5">
        {orchestrator.runs.map((run, i) => (
          <motion.li key={`${run.at}-${i}`} {...row(i)} className="rounded-xl border border-line bg-surface px-3.5 py-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
              <span className="inline-flex items-center gap-1 rounded-md bg-ink px-2 py-0.5 font-mono text-[11px] text-paper" dir="ltr">{run.trigger}</span>
              {run.node && <span className="text-ink-2"><NodeName nodeKey={run.node} /></span>}
              <AbsTime iso={run.at} className="ms-auto text-xs text-muted" />
            </div>
            <ol className="mt-2.5 flex flex-wrap items-center gap-1" aria-label={t("officer.orch.path")} dir="ltr">
              {run.path.map((p, j) => {
                const tone = TONE[PATH_TONE[p] ?? "azure"];
                return (
                  <li key={j} className="inline-flex items-center gap-1">
                    <span className={cn("rounded-md border px-1.5 py-0.5 font-mono text-[10.5px]", tone.bg, tone.text, tone.border)}>{p}</span>
                    {j < run.path.length - 1 && <ArrowRight className="h-3 w-3 text-faint" aria-hidden />}
                  </li>
                );
              })}
            </ol>
            {run.actions.length > 0 && (
              <ul className="mt-2.5 space-y-0.5 text-[13px] text-ink-2">
                {run.actions.map((a, j) => <li key={j} className="flex items-start gap-1.5"><span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-faint" />{a}</li>)}
              </ul>
            )}
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
