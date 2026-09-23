import type { GraphNode } from "../../types";
import { fmtDateTime } from "../../utils/format";
import { TaskStatusBadge } from "../ui/StatusBadge";

export function TaskList({ nodes, onSelect }: { nodes: GraphNode[]; onSelect?: (key: string) => void }) {
  const rows = nodes.filter((n) => !n.is_system).sort((a, b) => a.layer - b.layer);
  return (
    <ul className="divide-y divide-line/70">
      {rows.map((n) => (
        <li key={n.key}>
          <button onClick={() => onSelect?.(n.key)} className="flex w-full flex-wrap items-center justify-between gap-2 py-3 text-start cursor-pointer hover:bg-paper-2/50">
            <span>
              <span className="block font-medium">{n.name}</span>
              <span className="block text-xs text-muted">{n.entity?.name} · {n.external_ref ?? "not submitted"} · updated {fmtDateTime(n.updated_at)}</span>
            </span>
            <TaskStatusBadge status={n.status} replanned={n.replanned} />
          </button>
        </li>
      ))}
    </ul>
  );
}
