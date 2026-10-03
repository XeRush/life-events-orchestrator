import { ArrowRightLeft, FileWarning, MessageSquarePlus, ScrollText, Send, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { casesApi, officerApi } from "../../api";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "../../hooks/queries";
import { useT } from "../../i18n";
import { cn, titleCase } from "../../lib/format";
import type { DocumentItem, GraphNode, NodeKey } from "../../types/api";
import { Button, Modal, SelectField, TextArea } from "../ui/primitives";
import { MockBadge } from "../ui/StatusBadge";
import { InlineError, PreparedFields, useTx } from "./kit";

export interface ApprovalTarget {
  id: string;
  caseRef: string;
  nodeKey: NodeKey | null;
  nodeTitle: string | null;
  authority: string;
  summary: string;
  fields: { name: string; label: string; value: unknown }[];
}

/** Dialog forms fill the sheet on phones (the shared Modal is a bottom sheet up to 92vh) so the actions sit at the
 * bottom under the thumb; from `sm` up the dialog is a normal centred card. */
export const DIALOG_BODY = "flex min-h-[calc(92dvh-6.75rem)] flex-col sm:min-h-0";

/** Dialog buttons: pinned to the bottom of the sheet on phones (full-width targets), inline at the end from `sm` up. */
export function Actions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky -bottom-6 z-10 -mx-6 mt-auto flex flex-wrap justify-end gap-2 border-t border-line bg-surface px-6 py-3 max-sm:[&>*]:flex-1 sm:static sm:mx-0 sm:mt-6 sm:border-0 sm:bg-transparent sm:p-0">
      {children}
    </div>
  );
}

function NodeLine({ nodeKey, nodeTitle, authority, caseRef }: { nodeKey: NodeKey | null; nodeTitle: string | null; authority?: string; caseRef: string }) {
  const t = useT();
  return (
    <div className="mb-4 rounded-2xl border border-line bg-paper-2/50 px-4 py-3">
      <p className="eyebrow">{t("officer.common.case")} · <span dir="ltr">{caseRef}</span></p>
      <p className="mt-1 font-display text-lg leading-snug">{nodeKey ? t(`node.${nodeKey}`) : nodeTitle ?? "-"}</p>
      {authority && <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted">{authority} <MockBadge compact /></p>}
    </div>
  );
}

/** Approve & Release: the officer is the gate. The copy says exactly what happens - and what does not. */
export function ApproveDialog({ target, onClose }: { target: ApprovalTarget | null; onClose: () => void }) {
  const t = useT();
  const [note, setNote] = useState("");
  const m = useAction((a: { id: string; note: string }) => officerApi.approve(a.id, a.note), { success: t("officer.approve.done") });
  const close = () => {
    setNote("");
    m.reset();
    onClose();
  };
  return (
    <Modal open={!!target} onClose={close} title={t("officer.approve.title")} wide>
      {target && (
        <form
          className={DIALOG_BODY}
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate({ id: target.id, note: note.trim() }, { onSuccess: close });
          }}
        >
          <NodeLine nodeKey={target.nodeKey} nodeTitle={target.nodeTitle} authority={target.authority} caseRef={target.caseRef} />
          <div className="flex items-start gap-3 rounded-2xl border border-civic/30 bg-civic-soft px-4 py-3 text-[15px] text-ink">
            <Send className="mt-0.5 h-4 w-4 shrink-0 text-civic rtl-flip" aria-hidden />
            <p>{t("officer.approve.statement", { authority: target.authority })}</p>
          </div>
          {target.summary && <p className="mt-4 text-sm text-ink-2">{target.summary}</p>}
          <div className="mt-4">
            <p className="eyebrow mb-1.5">{t("officer.approve.fields")}</p>
            <div className="scroll-thin max-h-56 overflow-auto rounded-xl border border-line px-3 py-1">
              <PreparedFields fields={target.fields} />
            </div>
            <p className="mt-1.5 text-xs text-muted">{t("officer.approve.minimisation")}</p>
          </div>
          <TextArea className="mt-4" label={t("officer.approve.note")} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
          <p className="mt-3 flex items-center gap-2 text-xs text-muted"><ScrollText className="h-3.5 w-3.5 shrink-0" aria-hidden />{t("officer.approve.audited")}</p>
          <InlineError error={m.error} className="mt-4" />
          <Actions>
            <Button variant="secondary" onClick={close}>{t("common.cancel")}</Button>
            <Button type="submit" variant="civic" loading={m.isPending} icon={<ShieldCheck className="h-4 w-4" aria-hidden />}>{t("officer.action.approve")}</Button>
          </Actions>
        </form>
      )}
    </Modal>
  );
}

export function RejectDialog({ target, onClose }: { target: ApprovalTarget | null; onClose: () => void }) {
  const t = useT();
  const [reason, setReason] = useState("");
  const m = useAction((a: { id: string; reason: string }) => officerApi.reject(a.id, a.reason), { success: t("officer.reject.done") });
  const close = () => {
    setReason("");
    m.reset();
    onClose();
  };
  const valid = reason.trim().length >= 3;
  return (
    <Modal open={!!target} onClose={close} title={t("officer.reject.title")}>
      {target && (
        <form
          className={DIALOG_BODY}
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) m.mutate({ id: target.id, reason: reason.trim() }, { onSuccess: close });
          }}
        >
          <NodeLine nodeKey={target.nodeKey} nodeTitle={target.nodeTitle} authority={target.authority} caseRef={target.caseRef} />
          <p className="mb-4 text-sm text-ink-2">{t("officer.reject.explain")}</p>
          <TextArea label={t("officer.reject.reason")} required minLength={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} aria-describedby="reject-hint" />
          <p id="reject-hint" className="mt-1 text-xs text-muted">{t("officer.reject.hint")}</p>
          <InlineError error={m.error} className="mt-4" />
          <Actions>
            <Button variant="secondary" onClick={close}>{t("common.cancel")}</Button>
            <Button type="submit" variant="danger" disabled={!valid} loading={m.isPending} icon={<XCircle className="h-4 w-4" aria-hidden />}>{t("officer.action.reject")}</Button>
          </Actions>
        </form>
      )}
    </Modal>
  );
}

export function ResolveDialog({ escalationId, caseRef, onClose }: { escalationId: string | null; caseRef?: string | null; onClose: () => void }) {
  const t = useT();
  const [text, setText] = useState("");
  const m = useAction((a: { id: string; resolution: string }) => officerApi.resolve(a.id, a.resolution), { success: t("officer.resolve.done") });
  const close = () => {
    setText("");
    m.reset();
    onClose();
  };
  const valid = text.trim().length >= 3;
  return (
    <Modal open={!!escalationId} onClose={close} title={t("officer.resolve.title")}>
      <form
        className={DIALOG_BODY}
        onSubmit={(e) => {
          e.preventDefault();
          if (escalationId && valid) m.mutate({ id: escalationId, resolution: text.trim() }, { onSuccess: close });
        }}
      >
        {caseRef && <p className="eyebrow mb-3">{t("officer.common.case")} · <span dir="ltr">{caseRef}</span></p>}
        <p className="mb-4 text-sm text-ink-2">{t("officer.resolve.explain")}</p>
        <TextArea label={t("officer.resolve.resolution")} required minLength={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
        <InlineError error={m.error} className="mt-4" />
        <Actions>
          <Button variant="secondary" onClick={close}>{t("common.cancel")}</Button>
          <Button type="submit" disabled={!valid} loading={m.isPending}>{t("officer.action.resolve")}</Button>
        </Actions>
      </form>
    </Modal>
  );
}

const ESCALATE_REASONS = ["OFFICER_REFERRAL", "DISPUTED_RECORD", "SLA_STALL", "CONSULATE_STALL"] as const;

export function EscalateDialog({ open, caseRef, nodes, defaultNode, onClose }: { open: boolean; caseRef: string; nodes: GraphNode[]; defaultNode?: NodeKey | null; onClose: () => void }) {
  const t = useT();
  const tx = useTx();
  const [reason, setReason] = useState<(typeof ESCALATE_REASONS)[number]>("OFFICER_REFERRAL");
  const [node, setNode] = useState<string>(defaultNode ?? "");
  const [note, setNote] = useState("");
  const m = useAction((a: { reason: string; note: string; node: NodeKey | null }) => officerApi.escalate(caseRef, a.reason, a.note, a.node), { success: t("officer.escalate.done") });
  const close = () => {
    setReason("OFFICER_REFERRAL");
    setNode(defaultNode ?? "");
    setNote("");
    m.reset();
    onClose();
  };
  return (
    <Modal open={open} onClose={close} title={t("officer.escalate.title")}>
      <form
        className={cn(DIALOG_BODY, "space-y-4")}
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate({ reason, note: note.trim(), node: (node || null) as NodeKey | null }, { onSuccess: close });
        }}
      >
        <p className="text-sm text-ink-2">{t("officer.escalate.explain")}</p>
        <SelectField label={t("officer.escalate.reason")} value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
          {ESCALATE_REASONS.map((r) => <option key={r} value={r}>{tx(`officer.escReason.${r}`)}</option>)}
        </SelectField>
        <SelectField label={t("officer.escalate.node")} value={node} onChange={(e) => setNode(e.target.value)}>
          <option value="">{t("officer.escalate.wholeCase")}</option>
          {nodes.map((n) => <option key={n.key} value={n.key}>{t(`node.${n.key}`)}</option>)}
        </SelectField>
        <TextArea label={t("officer.escalate.note")} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        <InlineError error={m.error} />
        <Actions>
          <Button variant="secondary" onClick={close}>{t("common.cancel")}</Button>
          <Button type="submit" loading={m.isPending} icon={<ShieldAlert className="h-4 w-4" aria-hidden />}>{t("officer.action.escalate")}</Button>
        </Actions>
      </form>
    </Modal>
  );
}

export function TransferDialog({ open, caseRef, currentOfficerId, onClose }: { open: boolean; caseRef: string; currentOfficerId?: string | null; onClose: () => void }) {
  const t = useT();
  // Same key as useOfficers, fetched only once the dialog opens.
  const officers = useQuery({ queryKey: ["officers"], queryFn: officerApi.officers, staleTime: 60_000, enabled: open });
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const m = useAction((a: { to: string; note: string }) => officerApi.transfer(caseRef, a.to, a.note), { success: t("officer.transfer.done") });
  const close = () => {
    setTo("");
    setNote("");
    m.reset();
    onClose();
  };
  const choices = (officers.data ?? []).filter((o) => o.id !== currentOfficerId && o.is_active);
  return (
    <Modal open={open} onClose={close} title={t("officer.transfer.title")}>
      <form
        className={cn(DIALOG_BODY, "space-y-4")}
        onSubmit={(e) => {
          e.preventDefault();
          if (to) m.mutate({ to, note: note.trim() }, { onSuccess: close });
        }}
      >
        <p className="text-sm text-ink-2">{t("officer.transfer.explain")}</p>
        <SelectField label={t("officer.transfer.to")} value={to} required onChange={(e) => setTo(e.target.value)} disabled={officers.isLoading}>
          <option value="" disabled>{officers.isLoading ? t("common.loading") : t("officer.transfer.pick")}</option>
          {choices.map((o) => (
            <option key={o.id} value={o.id}>{o.full_name}{o.title ? ` - ${o.title}` : ""}{o.organization_name ? ` (${o.organization_name})` : ""}</option>
          ))}
        </SelectField>
        {officers.isSuccess && choices.length === 0 && <p className="text-sm text-muted">{t("officer.transfer.none")}</p>}
        <TextArea label={t("officer.transfer.note")} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        <InlineError error={m.error ?? officers.error} />
        <Actions>
          <Button variant="secondary" onClick={close}>{t("common.cancel")}</Button>
          <Button type="submit" disabled={!to} loading={m.isPending} icon={<ArrowRightLeft className="h-4 w-4" aria-hidden />}>{t("officer.action.transfer")}</Button>
        </Actions>
      </form>
    </Modal>
  );
}

export function NoteDialog({ open, caseRef, nodes, defaultNode, onClose }: { open: boolean; caseRef: string; nodes: GraphNode[]; defaultNode?: NodeKey | null; onClose: () => void }) {
  const t = useT();
  const [note, setNote] = useState("");
  const [node, setNode] = useState<string>(defaultNode ?? "");
  const m = useAction((a: { note: string; node: NodeKey | null }) => officerApi.note(caseRef, a.note, a.node), { success: t("officer.note.done") });
  const close = () => {
    setNote("");
    setNode(defaultNode ?? "");
    m.reset();
    onClose();
  };
  return (
    <Modal open={open} onClose={close} title={t("officer.note.title")}>
      <form
        className={cn(DIALOG_BODY, "space-y-4")}
        onSubmit={(e) => {
          e.preventDefault();
          if (note.trim()) m.mutate({ note: note.trim(), node: (node || null) as NodeKey | null }, { onSuccess: close });
        }}
      >
        <p className="text-sm text-ink-2">{t("officer.note.explain")}</p>
        <SelectField label={t("officer.note.node")} value={node} onChange={(e) => setNode(e.target.value)}>
          <option value="">{t("officer.escalate.wholeCase")}</option>
          {nodes.map((n) => <option key={n.key} value={n.key}>{t(`node.${n.key}`)}</option>)}
        </SelectField>
        <TextArea label={t("officer.note.text")} required maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
        <InlineError error={m.error} />
        <Actions>
          <Button variant="secondary" onClick={close}>{t("common.cancel")}</Button>
          <Button type="submit" disabled={!note.trim()} loading={m.isPending} icon={<MessageSquarePlus className="h-4 w-4" aria-hidden />}>{t("officer.action.addNote")}</Button>
        </Actions>
      </form>
    </Modal>
  );
}

/** Request documents for one step: cancels any prepared submission and moves the step to Document missing. */
export function RequestDocumentsDialog({ node, caseRef, docTitles, onClose }: { node: GraphNode | null; caseRef: string; docTitles: Record<string, string>; onClose: () => void }) {
  const t = useT();
  const gid = useId();
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const m = useAction((a: { key: NodeKey; docs: string[]; note: string }) => officerApi.requestDocuments(caseRef, a.key, a.docs, a.note), { success: t("officer.requestDocs.done") });
  const close = () => {
    setPicked([]);
    setNote("");
    m.reset();
    onClose();
  };
  const toggle = (d: string) => setPicked((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));
  return (
    <Modal open={!!node} onClose={close} title={t("officer.requestDocs.title")}>
      {node && (
        <form
          className={DIALOG_BODY}
          onSubmit={(e) => {
            e.preventDefault();
            if (picked.length) m.mutate({ key: node.key, docs: picked, note: note.trim() }, { onSuccess: close });
          }}
        >
          <NodeLine nodeKey={node.key} nodeTitle={node.title} authority={node.entity_label} caseRef={caseRef} />
          <p className="mb-4 text-sm text-ink-2">{t("officer.requestDocs.explain")}</p>
          <fieldset aria-describedby={`${gid}-hint`}>
            <legend className="mb-2 text-[13px] font-medium text-ink-2">{t("officer.requestDocs.pick")}</legend>
            <ul className="space-y-1.5">
              {node.required_documents.map((d) => {
                const on = picked.includes(d);
                return (
                  <li key={d}>
                    <label className={cn("flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors", on ? "border-amber/50 bg-amber-soft/60" : "border-line hover:border-line-2")}>
                      <input type="checkbox" checked={on} onChange={() => toggle(d)} className="h-4 w-4 cursor-pointer accent-[var(--color-amber)]" />
                      <span className="min-w-0 flex-1">{docTitles[d] ?? titleCase(d)}</span>
                      <span className="font-mono text-[10.5px] text-faint" dir="ltr">{d}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <p id={`${gid}-hint`} className="mt-1.5 text-xs text-muted">{t("officer.requestDocs.hint")}</p>
          </fieldset>
          <TextArea className="mt-4" label={t("officer.requestDocs.note")} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
          <InlineError error={m.error} className="mt-4" />
          <Actions>
            <Button variant="secondary" onClick={close}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={!picked.length} loading={m.isPending} icon={<FileWarning className="h-4 w-4" aria-hidden />}>{t("officer.action.requestDocs")}</Button>
          </Actions>
        </form>
      )}
    </Modal>
  );
}

const DOC_STATUSES = ["REQUIRED", "MISSING", "EXPIRED", "NOT_APPLICABLE"] as const;

export function DocStatusDialog({ doc, caseRef, onClose }: { doc: DocumentItem | null; caseRef: string; onClose: () => void }) {
  const t = useT();
  const [status, setStatus] = useState<(typeof DOC_STATUSES)[number] | "">("");
  const [note, setNote] = useState("");
  const m = useAction((a: { type: string; status: string; note: string }) => casesApi.setDocumentStatus(caseRef, a.type, a.status, a.note || undefined), {
    success: t("officer.docs.statusDone"),
  });
  const close = () => {
    setStatus("");
    setNote("");
    m.reset();
    onClose();
  };
  return (
    <Modal open={!!doc} onClose={close} title={t("officer.docs.statusTitle")}>
      {doc && (
        <form
          className={cn(DIALOG_BODY, "space-y-4")}
          onSubmit={(e) => {
            e.preventDefault();
            if (status) m.mutate({ type: doc.doc_type, status, note: note.trim() }, { onSuccess: close });
          }}
        >
          <div className="rounded-2xl border border-line bg-paper-2/50 px-4 py-3">
            <p className="font-medium">{doc.title}</p>
            <p className="mt-0.5 font-mono text-[11px] text-faint" dir="ltr">{doc.doc_type}</p>
          </div>
          <SelectField label={t("officer.docs.newStatus")} value={status} required onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="" disabled>{t("officer.docs.pickStatus")}</option>
            {DOC_STATUSES.map((s) => <option key={s} value={s} disabled={s === doc.status}>{t(`doc.${s}`)}</option>)}
          </SelectField>
          <TextArea label={t("officer.docs.note")} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          <p className="text-xs text-muted">{t("officer.docs.statusHint")}</p>
          <InlineError error={m.error} />
          <Actions>
            <Button variant="secondary" onClick={close}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={!status} loading={m.isPending}>{t("common.save")}</Button>
          </Actions>
        </form>
      )}
    </Modal>
  );
}
