import { motion } from "framer-motion";
import { ChevronDown, PhoneCall, PhoneOutgoing } from "lucide-react";
import { useState } from "react";
import type { Callback } from "../../types";
import { cn, fmtDateTime, fmtDuration, relative, title } from "../../utils/format";
import { CALLBACK_STATUS } from "../../utils/status";
import { Badge } from "../ui/primitives";

export function CallbackCard({ cb, onExecute }: { cb: Callback; onExecute?: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const meta = CALLBACK_STATUS[cb.status] ?? { label: cb.status, tone: "slate" as const };
  const Icon = cb.status === "COMPLETED" ? PhoneCall : PhoneOutgoing;
  const upcoming = cb.status === "SCHEDULED" || cb.status === "IN_PROGRESS";
  return (
    <motion.li layout className="card overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-start gap-4 p-5 text-start cursor-pointer">
        <span className={cn("mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full", upcoming ? "bg-amber-soft text-amber" : "bg-civic-soft text-civic")}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="eyebrow block">Callback · Case {cb.case_reference}</span>
          <span className="mt-1 block font-display text-lg leading-snug">{cb.reason}</span>
          <span className="mt-1 block text-sm text-muted">
            Trigger: {title(cb.trigger_event_type)} · {upcoming ? `due ${relative(cb.scheduled_for)}` : fmtDateTime(cb.completed_at ?? cb.scheduled_for)}
          </span>
        </span>
        <span className="flex flex-col items-end gap-2">
          <Badge tone={meta.tone} dot>{meta.label}</Badge>
          {cb.duration_seconds != null && <span className="font-mono text-xs text-muted">{fmtDuration(cb.duration_seconds)}</span>}
          <ChevronDown className={cn("h-4 w-4 text-faint transition-transform", open && "rotate-180")} aria-hidden />
        </span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-line bg-paper/60 px-5 py-4 text-sm">
          {cb.payload.updates && cb.payload.updates.length > 0 && (
            <div><p className="eyebrow mb-2">Updates carried by this call</p>
              <ul className="list-disc space-y-1 ps-5">{cb.payload.updates.map((u, i) => <li key={i}>{u.text}</li>)}</ul></div>
          )}
          {cb.payload.script && (<div><p className="eyebrow mb-2">What the assistant said</p><p className="rounded-xl bg-surface p-3 leading-relaxed">{cb.payload.script}</p></div>)}
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div><dt className="eyebrow">Provider</dt><dd>{cb.provider ?? "-"}</dd></div>
            <div><dt className="eyebrow">Language</dt><dd>{cb.language.toUpperCase()}</dd></div>
            <div><dt className="eyebrow">Attempts</dt><dd>{cb.attempts}</dd></div>
            <div><dt className="eyebrow">Outcome</dt><dd>{cb.outcome ?? "Pending"}</dd></div>
          </dl>
          {cb.status === "SCHEDULED" && onExecute && (
            <button onClick={() => onExecute(cb.id)} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink-2 cursor-pointer">Place call now</button>
          )}
        </div>
      )}
    </motion.li>
  );
}
