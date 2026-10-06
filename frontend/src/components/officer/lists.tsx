import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, CheckCircle2, ChevronDown, ChevronRight, MessageSquare, Phone, PhoneForwarded, ShieldAlert, UserRoundCheck } from "lucide-react";
import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import { ease } from "../../animations/variants";
import { officerApi } from "../../api";
import { useAction } from "../../hooks/queries";
import { useT } from "../../i18n";
import { cn, duration, titleCase } from "../../lib/format";
import { useAuth } from "../../stores/auth";
import type { AuditItem, CallbackItem, EscalationItem, NodeKey } from "../../types/api";
import { Badge, Button } from "../ui/primitives";
import { CallbackBadge } from "../ui/StatusBadge";
import {
  AbsTime, ActorTypeBadge, BoolMark, CopyButton, JsonBlock, Mono, RelTime, ResultBadge, SafeSourceBadge, TableFrame, Td, Th, useCardMotion, useIsStaff, useRowMotion, useTx,
} from "./kit";

const NODE_KEYS: NodeKey[] = ["BIRTH_CERTIFICATE", "MOFA_ATTESTATION", "CONSULATE_PASSPORT", "RESIDENCE_VISA", "EMIRATES_ID", "INSURANCE"];
export const isNodeKey = (k: string | null | undefined): k is NodeKey => !!k && (NODE_KEYS as string[]).includes(k);

export function NodeName({ nodeKey, fallback }: { nodeKey: string | null | undefined; fallback?: string | null }) {
  const t = useT();
  if (isNodeKey(nodeKey)) return <>{t(`node.${nodeKey}`)}</>;
  if (fallback) return <>{fallback}</>;
  if (nodeKey) return <>{titleCase(nodeKey)}</>;
  return <span className="text-faint">-</span>;
}

export function CaseLink({ reference, className }: { reference: string | null | undefined; className?: string }) {
  if (!reference) return <span className="text-faint">-</span>;
  return (
    <Link
      to={`/officer/cases/${reference}`}
      onClick={(e) => e.stopPropagation()}
      dir="ltr"
      className={cn("whitespace-nowrap font-mono text-[12.5px] font-medium text-ink underline decoration-line-2 underline-offset-4 hover:decoration-ink", className)}
    >
      {reference}
    </Link>
  );
}

/** Smooth open/close for a disclosure panel (height + fade), static under reduced motion. */
function Collapse({ open, id, children, className }: { open: boolean; id: string; children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          id={id}
          initial={reduce ? false : { height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={reduce ? undefined : { height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease }}
          className={cn("overflow-hidden", className)}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------------------------------------------------------------------------------------------------------------
 * Callbacks: a dense table from tablet up, stacked cards on phones.
 * ------------------------------------------------------------------------------------------------------------- */

function ChannelCell({ channel }: { channel: string }) {
  const up = channel.toUpperCase();
  const Icon = up === "SMS" ? MessageSquare : Phone;
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-ink-2"><Icon className="h-3.5 w-3.5 text-faint" aria-hidden />{titleCase(channel)}</span>;
}

export function CallbackReasons({ cb }: { cb: CallbackItem }) {
  const tx = useTx();
  const reasons = cb.reasons?.length ? cb.reasons : [{ reason: cb.reason, node_key: cb.node_key ?? undefined }];
  return (
    <div className="min-w-0 sm:min-w-48">
      <ul className="space-y-0.5">
        {reasons.map((r, i) => (
          <li key={i} className="text-[13px] leading-snug" title={r.detail ?? undefined}>
            <span className="font-medium">{tx(`officer.cbReason.${r.reason}`)}</span>
            {(r.node_key || r.node_title) && <span className="text-muted"> · <NodeName nodeKey={r.node_key} fallback={r.node_title} /></span>}
          </li>
        ))}
      </ul>
      {reasons.length > 1 && <p className="mt-0.5 text-[11px] text-violet">{tx("officer.callbacks.coalesced", undefined, { n: reasons.length })}</p>}
    </div>
  );
}

function WhenCell({ cb, inline }: { cb: CallbackItem; inline?: boolean }) {
  const t = useT();
  const rows: [string, string | null][] = [
    [t("officer.col.scheduled"), cb.scheduled_for],
    [t("officer.col.dialed"), cb.dialed_at],
    [t("officer.col.completed"), cb.completed_at],
  ];
  return (
    <dl className={cn("text-[12px]", inline ? "grid grid-cols-3 gap-x-3" : "grid grid-cols-[auto_auto] gap-x-2 gap-y-0.5")}>
      {rows.map(([label, iso]) => inline ? (
        <div key={label} className="min-w-0">
          <dt className="text-faint">{label}</dt>
          <dd className="text-ink-2">{iso ? <RelTime iso={iso} /> : <span className="text-faint">-</span>}</dd>
        </div>
      ) : (
        <Fragment key={label}>
          <dt className="text-faint">{label}</dt>
          <dd className="text-ink-2">{iso ? <RelTime iso={iso} /> : <span className="text-faint">-</span>}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

export function CallbacksTable({ items, hideCase, caption }: { items: CallbackItem[]; hideCase?: boolean; caption: string }) {
  const t = useT();
  const row = useRowMotion();
  return (
    <>
      <ul aria-label={caption} className="flex flex-col gap-2.5 md:hidden">
        <AnimatePresence initial>
          {items.map((cb, i) => (
            <motion.li key={cb.id} {...row(i)} layout="position" className="card p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  {!hideCase && <CaseLink reference={cb.case_reference} />}
                  <CallbackReasons cb={cb} />
                </div>
                <CallbackBadge status={cb.status} />
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]">
                <ChannelCell channel={cb.channel} />
                <BoolMark value={cb.consent_checked} yes={t("officer.callbacks.consentYes")} no={t("officer.callbacks.consentNo")} />
                <span className="num text-muted">{t("officer.col.duration")}: {duration(cb.duration_seconds)}</span>
              </div>
              <div className="mt-2.5 border-t border-dashed border-line pt-2.5"><WhenCell cb={cb} inline /></div>
              {cb.outcome && <p className="mt-2 line-clamp-3 text-[13px] text-ink-2">{cb.outcome}</p>}
              <p className="mt-1.5 truncate font-mono text-[10.5px] text-faint" dir="ltr">{cb.trigger_event}</p>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <TableFrame dense caption={caption} className="hidden md:block">
        <thead>
          <tr>
            {!hideCase && <Th>{t("officer.col.case")}</Th>}
            <Th>{t("officer.col.reasons")}</Th>
            <Th>{t("officer.col.status")}</Th>
            <Th>{t("officer.col.channelConsent")}</Th>
            <Th>{t("officer.col.when")}</Th>
            <Th className="text-end">{t("officer.col.duration")}</Th>
            <Th>{t("officer.col.outcome")}</Th>
          </tr>
        </thead>
        <tbody>
          <AnimatePresence initial>
            {items.map((cb, i) => (
              <motion.tr key={cb.id} {...row(i)} layout="position" className="transition-colors hover:bg-paper-2/60">
                {!hideCase && <Td><CaseLink reference={cb.case_reference} /></Td>}
                <Td><CallbackReasons cb={cb} /><p className="mt-1 font-mono text-[10.5px] text-faint" dir="ltr">{cb.trigger_event}</p></Td>
                <Td><CallbackBadge status={cb.status} /></Td>
                <Td>
                  <span className="flex flex-col gap-1 text-[13px]">
                    <ChannelCell channel={cb.channel} />
                    <BoolMark value={cb.consent_checked} yes={t("officer.callbacks.consentYes")} no={t("officer.callbacks.consentNo")} />
                  </span>
                </Td>
                <Td><WhenCell cb={cb} /></Td>
                <Td className="num text-end">{duration(cb.duration_seconds)}</Td>
                <Td className="min-w-48 max-w-72"><p className="line-clamp-3 text-[13px] text-ink-2" title={cb.outcome ?? undefined}>{cb.outcome ?? <span className="text-faint">-</span>}</p></Td>
              </motion.tr>
            ))}
          </AnimatePresence>
        </tbody>
      </TableFrame>
    </>
  );
}

/* ---------------------------------------------------------------------------------------------------------------
 * Audit: a sticky-header table from tablet up with expandable details; stacked cards on phones.
 * ------------------------------------------------------------------------------------------------------------- */

function AuditDetails({ a }: { a: AuditItem }) {
  const t = useT();
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="min-w-0">
        <p className="eyebrow mb-1.5">{t("officer.audit.detailsTitle")}</p>
        <JsonBlock value={a.details ?? {}} label={t("officer.audit.detailsTitle")} />
        <p className="mt-1.5 text-xs text-muted">{t("officer.audit.redacted")}</p>
      </div>
      <dl className="space-y-2 text-xs">
        <div><dt className="eyebrow">{t("officer.audit.traceId")}</dt><dd className="mt-0.5 break-all font-mono" dir="ltr">{a.trace_id ?? "-"}</dd></div>
        <div><dt className="eyebrow">{t("officer.audit.requestId")}</dt><dd className="mt-0.5 break-all font-mono" dir="ltr">{a.request_id ?? "-"}</dd></div>
        <div><dt className="eyebrow">{t("officer.audit.eventId")}</dt><dd className="mt-0.5 break-all font-mono" dir="ltr">{a.id}</dd></div>
      </dl>
    </div>
  );
}

function AuditRow({ a, i, hideCase, expandable }: { a: AuditItem; i: number; hideCase?: boolean; expandable?: boolean }) {
  const t = useT();
  const row = useRowMotion();
  const [open, setOpen] = useState(false);
  const did = `audit-${a.id}`;
  const denied = a.result.toUpperCase() === "DENIED";
  const cols = 9 - (hideCase ? 1 : 0) + (expandable ? 1 : 0);
  return (
    <Fragment>
      <motion.tr {...row(i)} className={cn("transition-colors hover:bg-paper-2/60", denied && "bg-rose-soft/40")}>
        {expandable && (
          <Td className="w-8 pe-0">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={did}
              aria-label={t("officer.audit.toggleDetails", { action: a.action })}
              onClick={() => setOpen((o) => !o)}
              className="grid h-8 w-8 cursor-pointer place-items-center rounded-md text-muted hover:bg-paper-2 hover:text-ink"
            >
              <ChevronRight className={cn("h-4 w-4 transition-transform duration-300 rtl-flip", open && "rotate-90")} aria-hidden />
            </button>
          </Td>
        )}
        <Td><AbsTime iso={a.occurred_at} className="text-[12.5px]" /></Td>
        <Td className="max-w-36 truncate text-[13px]" title={a.actor}>{a.actor}</Td>
        <Td><ActorTypeBadge type={a.actor_type} /></Td>
        <Td><Mono className={cn("text-[11.5px] font-medium", denied && "text-rose")}>{a.action}</Mono></Td>
        {!hideCase && <Td><CaseLink reference={a.case_reference} /></Td>}
        <Td className="whitespace-nowrap text-[13px] text-ink-2"><NodeName nodeKey={a.node_key} /></Td>
        <Td><SafeSourceBadge source={a.source} /></Td>
        <Td><ResultBadge result={a.result} /></Td>
        <Td>
          {a.trace_id ? (
            <span className="inline-flex items-center gap-1">
              <Mono className="text-[11px] text-muted">{a.trace_id.slice(0, 6)}…</Mono>
              <CopyButton value={a.trace_id} label={t("officer.audit.copyTrace")} />
            </span>
          ) : <span className="text-faint">-</span>}
        </Td>
      </motion.tr>
      {expandable && (
        <tr>
          <td colSpan={cols} className={cn("p-0", open && "border-b border-line bg-paper-2/40")}>
            <Collapse open={open} id={did}><div className="px-4 py-4"><AuditDetails a={a} /></div></Collapse>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function AuditCard({ a, i, hideCase, expandable }: { a: AuditItem; i: number; hideCase?: boolean; expandable?: boolean }) {
  const t = useT();
  const row = useRowMotion();
  const [open, setOpen] = useState(false);
  const did = `audit-m-${a.id}`;
  const denied = a.result.toUpperCase() === "DENIED";
  return (
    <motion.li {...row(i)} className={cn("card overflow-hidden", denied && "border-rose/40")}>
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-3">
          <Mono className={cn("min-w-0 break-all text-[12px] font-medium", denied && "text-rose")}>{a.action}</Mono>
          <ResultBadge result={a.result} />
        </div>
        <p className="mt-1 truncate text-[13px] text-ink-2" title={a.actor}>{a.actor}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5"><ActorTypeBadge type={a.actor_type} /><SafeSourceBadge source={a.source} /></div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
          <AbsTime iso={a.occurred_at} />
          {!hideCase && a.case_reference && <CaseLink reference={a.case_reference} className="text-[12px]" />}
          {a.node_key && <span><NodeName nodeKey={a.node_key} /></span>}
        </div>
      </div>
      {expandable && (
        <>
          <button
            type="button" aria-expanded={open} aria-controls={did} onClick={() => setOpen((o) => !o)}
            className="flex min-h-10 w-full cursor-pointer items-center justify-between gap-2 border-t border-line px-3.5 text-[12.5px] text-ink-2 hover:bg-paper-2/60"
          >
            {t("officer.audit.detailsTitle")}
            <ChevronDown className={cn("h-4 w-4 transition-transform duration-300", open && "rotate-180")} aria-hidden />
          </button>
          <Collapse open={open} id={did} className="border-t border-line bg-paper-2/40"><div className="p-3.5"><AuditDetails a={a} /></div></Collapse>
        </>
      )}
    </motion.li>
  );
}

export function AuditTable({ items, hideCase, expandable, caption, maxH, setKey }: { items: AuditItem[]; hideCase?: boolean; expandable?: boolean; caption: string; maxH?: string | false; setKey?: string }) {
  const t = useT();
  return (
    <>
      <ul key={`m-${setKey}`} aria-label={caption} className="flex flex-col gap-2.5 md:hidden">
        <AnimatePresence initial>
          {items.map((a, i) => <AuditCard key={a.id} a={a} i={i} hideCase={hideCase} expandable={expandable} />)}
        </AnimatePresence>
      </ul>
      <TableFrame dense caption={caption} className="hidden md:block" maxH={maxH}>
        <thead>
          <tr>
            {expandable && <Th><span className="sr-only">{t("officer.audit.detailsTitle")}</span></Th>}
            <Th>{t("officer.col.time")}</Th>
            <Th>{t("officer.col.actor")}</Th>
            <Th>{t("officer.col.actorType")}</Th>
            <Th>{t("officer.col.action")}</Th>
            {!hideCase && <Th>{t("officer.col.case")}</Th>}
            <Th>{t("officer.col.node")}</Th>
            <Th>{t("officer.col.source")}</Th>
            <Th>{t("officer.col.result")}</Th>
            <Th>{t("officer.col.trace")}</Th>
          </tr>
        </thead>
        <tbody key={`t-${setKey}`}>
          <AnimatePresence initial>
            {items.map((a, i) => <AuditRow key={a.id} a={a} i={i} hideCase={hideCase} expandable={expandable} />)}
          </AnimatePresence>
        </tbody>
      </TableFrame>
    </>
  );
}

/* ---------------------------------------------------------------------------------------------------------------
 * Escalations
 * ------------------------------------------------------------------------------------------------------------- */

export function EscalationStatusBadge({ status }: { status: EscalationItem["status"] }) {
  const t = useT();
  if (status === "RESOLVED") return <Badge tone="civic" icon={<CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}>{t("officer.esc.RESOLVED")}</Badge>;
  if (status === "IN_PROGRESS") return <Badge tone="azure" icon={<UserRoundCheck className="h-3.5 w-3.5" aria-hidden />}>{t("officer.esc.IN_PROGRESS")}</Badge>;
  return <Badge tone="violet" icon={<ShieldAlert className="h-3.5 w-3.5" aria-hidden />}>{t("officer.esc.OPEN")}</Badge>;
}

export function EscalationCard({ e, i = 0, onResolve, showCase = true, staff: staffOverride }: { e: EscalationItem; i?: number; onResolve: (e: EscalationItem) => void; showCase?: boolean; staff?: boolean }) {
  const t = useT();
  const tx = useTx();
  const card = useCardMotion();
  const me = useAuth((s) => s.user);
  const isStaff = useIsStaff();
  const staff = staffOverride ?? isStaff;
  const take = useAction((id: string) => officerApi.take(id), { success: t("officer.esc.taken") });
  const resolved = e.status === "RESOLVED";
  const mine = !!me && e.assigned_officer?.id === me.id;
  const canTake = staff && !resolved && !(mine && e.status === "IN_PROGRESS");
  return (
    <motion.article
      {...card(i)}
      className={cn("card relative overflow-hidden p-4 ps-5", resolved && "bg-paper")}
      aria-label={`${tx(`officer.escReason.${e.reason}`, e.reason_label)} - ${e.case_reference ?? ""}`}
    >
      <span aria-hidden className={cn("absolute inset-y-0 start-0 w-1 transition-colors duration-500", resolved ? "bg-line-2" : e.status === "IN_PROGRESS" ? "bg-azure" : "bg-violet")} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <EscalationStatusBadge status={e.status} />
            {e.warm_transfer && <Badge tone="azure" icon={<PhoneForwarded className="h-3.5 w-3.5" aria-hidden />}>{t("officer.esc.warm")}</Badge>}
            {mine && !resolved && <Badge tone="ink">{t("officer.esc.mine")}</Badge>}
            <span className="text-xs text-muted">{t("officer.esc.opened")} <RelTime iso={e.opened_at} /></span>
          </div>
          <h3 className="mt-1.5 text-lg leading-snug first-letter:uppercase">{tx(`officer.escReason.${e.reason}`, e.reason_label)}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            {showCase && <CaseLink reference={e.case_reference} />}
            {e.node_key && <span><NodeName nodeKey={e.node_key} /></span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canTake && (
            <Button size="sm" variant="secondary" loading={take.isPending} onClick={() => take.mutate(e.id)}>{t("officer.action.take")}</Button>
          )}
          {staff && !resolved && <Button size="sm" onClick={() => onResolve(e)}>{t("officer.action.resolve")}</Button>}
          {showCase && e.case_reference && (
            <Link to={`/officer/cases/${e.case_reference}`} className="inline-flex min-h-8 items-center gap-1 rounded-full px-3 text-[13px] text-ink-2 hover:bg-paper-2">
              {t("officer.action.openCase")}<ArrowUpRight className="h-3.5 w-3.5 rtl-flip" aria-hidden />
            </Link>
          )}
        </div>
      </div>
      {e.summary && <p className="mt-2.5 max-w-3xl text-[14px] leading-relaxed text-ink-2">{e.summary}</p>}
      <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2.5 border-t border-dashed border-line pt-3 text-[13px] sm:grid-cols-4">
        <div><dt className="eyebrow mb-1">{t("officer.esc.openedBy")}</dt><dd><ActorTypeBadge type={e.opened_by} /></dd></div>
        <div><dt className="eyebrow mb-1">{t("officer.esc.assigned")}</dt><dd className="font-medium">{e.assigned_officer?.full_name ?? <span className="text-faint">{t("officer.esc.unassigned")}</span>}</dd></div>
        <div><dt className="eyebrow mb-1">{t("officer.esc.openedAt")}</dt><dd><AbsTime iso={e.opened_at} /></dd></div>
        {resolved && <div><dt className="eyebrow mb-1">{t("officer.esc.resolvedAt")}</dt><dd><AbsTime iso={e.resolved_at} /></dd></div>}
      </dl>
      {resolved && e.resolution && (
        <p className="mt-3 rounded-xl border border-civic/25 bg-civic-soft/70 px-3 py-2 text-sm text-ink-2">
          <span className="font-medium text-civic">{t("officer.esc.resolution")}: </span>{e.resolution}
        </p>
      )}
      {take.error != null && <p role="alert" className="mt-3 text-sm text-rose">{(take.error as Error).message}</p>}
    </motion.article>
  );
}

/** Escalation cards; one that gets resolved (and filtered out) slides away while the rest close the gap. */
export function EscalationList({ items, onResolve, showCase = true, staff }: { items: EscalationItem[]; onResolve: (e: EscalationItem) => void; showCase?: boolean; staff?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <AnimatePresence initial>
        {items.map((e, i) => <EscalationCard key={e.id} e={e} i={i} onResolve={onResolve} showCase={showCase} staff={staff} />)}
      </AnimatePresence>
    </div>
  );
}
