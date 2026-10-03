import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Loader2, PhoneOff, UserRoundCheck } from "lucide-react";
import { ease } from "../../animations/variants";
import { demoApi } from "../../api";
import { useAction } from "../../hooks/queries";
import { useT, type MessageKey } from "../../i18n";
import { cn } from "../../lib/format";
import { TONE } from "../../lib/status";
import type { CaseGraph, GraphNode, NodeKey } from "../../types/api";
import { NodeStateBadge, SourceBadge } from "../ui/StatusBadge";
import { ACTION_TONE, GENERIC_ACTIONS, actionLabel } from "./labels";

const ORDER: NodeKey[] = ["BIRTH_CERTIFICATE", "MOFA_ATTESTATION", "CONSULATE_PASSPORT", "RESIDENCE_VISA", "EMIRATES_ID", "INSURANCE"];

function NodeCard({ caseRef, nodeKey, index, node, actions }: { caseRef: string; nodeKey: NodeKey; index: number; node?: GraphNode; actions: string[] }) {
  const t = useT();
  const nodeTitle = t(`node.${nodeKey}` as MessageKey);
  const act = useAction((vars: { action: string }) => demoApi.act(caseRef, nodeKey, vars.action), {
    success: (r) => t("demo.toast.acted", { action: actionLabel(t, r.action), node: nodeTitle, via: r.via }),
  });
  const busy = (a: string) => act.isPending && act.variables?.action === a;
  const reduce = useReducedMotion();
  const parent = node?.type === "PARENT_REPORTED" || nodeKey === "CONSULATE_PASSPORT";
  const awaitingRelease = node?.state === "WAITING_FOR_HUMAN";

  return (
    <article aria-labelledby={`node-ctl-${nodeKey}`} className={cn("flex min-w-0 flex-col rounded-xl border bg-surface p-3.5 transition-colors duration-500", parent ? "border-dashed border-amber/50" : awaitingRelease ? "border-violet/40" : "border-line")}>
      <header className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[10.5px] tracking-[0.16em] text-faint">{String(index + 1).padStart(2, "0")}</span>
          <h3 id={`node-ctl-${nodeKey}`} className="text-[1.1rem] leading-tight">{nodeTitle}</h3>
        </div>
        {node && <p className="mt-0.5 truncate text-[12px] text-muted" title={node.entity_label}>{node.entity_label}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {node ? (
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={node.state} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3, ease }} className="inline-flex">
                <NodeStateBadge state={node.state} />
              </motion.span>
            </AnimatePresence>
          ) : <span className="shimmer h-6 w-20 rounded-full" aria-hidden />}
          {node && node.state !== "PENDING" && <SourceBadge source={node.status_source} className="text-[11px]" />}
        </div>
      </header>

      <p className="eyebrow mt-3">{t(parent ? "demo.node.milestones" : "demo.node.outcomes")}</p>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={t("demo.node.actionsFor", { node: nodeTitle })}>
        {actions.map((a) => {
          const tone = TONE[ACTION_TONE[a] ?? "slate"];
          const highlight = a === "RELEASE" && awaitingRelease;
          return (
            <button
              key={a} type="button" disabled={act.isPending} onClick={() => act.mutate({ action: a })}
              className={cn(
                "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-[filter,box-shadow,transform] hover:brightness-[0.97] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-8",
                tone.bg, tone.text, tone.border, highlight && "ring-2 ring-violet/40",
              )}
            >
              {busy(a) ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : a === "RELEASE" ? <UserRoundCheck className="h-3.5 w-3.5" aria-hidden /> : null}
              {actionLabel(t, a)}
            </button>
          );
        })}
      </div>

      <p className="eyebrow mt-3">{t("demo.node.generic")}</p>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={t("demo.node.genericFor", { node: nodeTitle })}>
        {GENERIC_ACTIONS.map((a) => (
          <button
            key={a} type="button" disabled={act.isPending} onClick={() => act.mutate({ action: a })}
            className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-line-2 px-3 text-[12px] text-ink-2 transition-transform hover:bg-paper-2 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-7"
          >
            {busy(a) && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            {actionLabel(t, a)}
          </button>
        ))}
      </div>

      <p className="mt-3 flex items-start gap-2 border-t border-line pt-2.5 text-[12px] leading-relaxed text-muted">
        {parent && <PhoneOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" aria-hidden />}
        {t(parent ? "demo.node.consulateHint" : awaitingRelease ? "demo.node.awaitingRelease" : "demo.node.releaseHint")}
      </p>
    </article>
  );
}

/** One card per node: authority outcomes / consulate milestones from status.controls, plus the generic controls. */
export function NodeControls({ caseRef, graph, controls }: { caseRef: string; graph?: CaseGraph; controls: Partial<Record<NodeKey, string[]>> }) {
  const byKey = Object.fromEntries((graph?.nodes ?? []).map((n) => [n.key, n])) as Partial<Record<NodeKey, GraphNode>>;
  return (
    <div className="grid gap-2.5 md:grid-cols-2">
      {ORDER.map((key, i) => (
        <NodeCard key={`${caseRef}-${key}`} caseRef={caseRef} nodeKey={key} index={i} node={byKey[key]} actions={controls[key] ?? []} />
      ))}
    </div>
  );
}
