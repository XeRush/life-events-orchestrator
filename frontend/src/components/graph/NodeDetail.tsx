import { AnimatePresence, motion } from "framer-motion";
import { FileText, Link2, UserRound } from "lucide-react";
import type { GraphNode } from "../../types";
import { fmtDateTime } from "../../utils/format";
import { TaskStatusBadge } from "../ui/StatusBadge";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/70 py-2 text-sm last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className="text-end font-medium">{value}</dd>
    </div>
  );
}

export function NodeDetail({ node, all }: { node: GraphNode | null; all: GraphNode[] }) {
  const names = (keys: string[]) => keys.map((k) => all.find((n) => n.key === k)?.name ?? k).join(", ") || "None";
  return (
    <AnimatePresence mode="wait">
      {node ? (
        <motion.aside key={node.key} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} aria-label={`Details for ${node.name}`}>
          <p className="eyebrow mb-1">{node.entity?.name ?? "LIFELOOP system step"}</p>
          <h3 className="text-2xl">{node.name}</h3>
          <div className="mt-2"><TaskStatusBadge status={node.status} replanned={node.replanned} /></div>
          <p className="mt-3 text-sm text-muted">{node.description}</p>
          {node.resident_action && (
            <div className="mt-4 flex gap-3 rounded-xl border border-amber/40 bg-amber-soft p-3 text-sm">
              <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-amber" aria-hidden />
              <div><p className="font-medium text-amber">Resident action</p><p>{node.resident_action}</p></div>
            </div>
          )}
          {node.status_reason && node.status !== "COMPLETED" && <p className="mt-3 text-sm text-muted">Note: {node.status_reason}</p>}
          <dl className="mt-4">
            <Row label="Created" value={fmtDateTime(node.created_at)} />
            <Row label="Started" value={fmtDateTime(node.started_at)} />
            <Row label="Completed" value={fmtDateTime(node.completed_at)} />
            <Row label="Last updated" value={fmtDateTime(node.updated_at)} />
            <Row label="Authority reference" value={node.external_ref ? <span className="font-mono text-xs">{node.external_ref}</span> : "Not submitted"} />
            <Row label="Depends on" value={<span className="inline-flex items-center gap-1"><Link2 className="h-3.5 w-3.5 text-faint" aria-hidden />{names(node.dependencies)}</span>} />
          </dl>
          {node.required_documents.length > 0 && (
            <div className="mt-4">
              <p className="eyebrow mb-2">Required documents</p>
              <ul className="space-y-1.5 text-sm">
                {node.required_documents.map((d) => (
                  <li key={d.type} className="flex items-center gap-2"><FileText className="h-4 w-4 text-muted" aria-hidden />{d.name}</li>
                ))}
              </ul>
            </div>
          )}
        </motion.aside>
      ) : (
        <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-muted">
          Select a step in the graph to see its authority, timing, dependencies and any resident action.
        </motion.p>
      )}
    </AnimatePresence>
  );
}
