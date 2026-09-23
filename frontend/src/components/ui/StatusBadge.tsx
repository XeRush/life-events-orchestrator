import { RefreshCw } from "lucide-react";
import type { CaseStatus, TaskStatus } from "../../types";
import { cn } from "../../utils/format";
import { CASE_STATUS_LABEL, TASK_STATUS, TONE_CLASSES } from "../../utils/status";
import { Badge } from "./primitives";

export function TaskStatusBadge({ status, replanned }: { status: TaskStatus; replanned?: boolean }) {
  const meta = TASK_STATUS[status];
  const Icon = meta.icon;
  const t = TONE_CLASSES[meta.tone];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", t.bg, t.text, t.border)}>
        <Icon className={cn("h-3.5 w-3.5", meta.spin && "animate-spin")} aria-hidden />
        {meta.label}
      </span>
      {replanned && (
        <Badge tone="violet">
          <RefreshCw className="h-3 w-3" aria-hidden /> Replanned
        </Badge>
      )}
    </span>
  );
}

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  const meta = CASE_STATUS_LABEL[status] ?? { label: status, tone: "slate" as const };
  return <Badge tone={meta.tone} dot>{meta.label}</Badge>;
}
