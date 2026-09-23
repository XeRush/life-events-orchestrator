import { motion } from "framer-motion";
import { Building2, Clock } from "lucide-react";
import { rise } from "../../animations/variants";
import type { EntityOps } from "../../types";
import { cn, relative, title } from "../../utils/format";

function Metric({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl bg-paper-2/70 px-3 py-2.5">
      <p className={cn("font-display text-2xl leading-none", value > 0 && tone)}>{value}</p>
      <p className="mt-1 text-[11px] uppercase tracking-wider text-muted">{label}</p>
    </div>
  );
}

export function EntityCard({ e }: { e: EntityOps }) {
  return (
    <motion.article variants={rise} className="card p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-azure-soft text-azure"><Building2 className="h-5 w-5" aria-hidden /></span>
        <div className="min-w-0">
          <h3 className="text-xl leading-tight">{e.name}</h3>
          <p className="text-sm text-muted">{e.description}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        <Metric label="Incoming" value={e.incoming} tone="text-azure" />
        <Metric label="Processing" value={e.processing} tone="text-azure" />
        <Metric label="Completed" value={e.completed} tone="text-civic" />
        <Metric label="Delayed" value={e.delayed} tone="text-amber" />
        <Metric label="Rejected" value={e.rejected} tone="text-rose" />
      </div>
      <p className="mt-4 flex items-center gap-2 text-sm text-muted">
        <Clock className="h-4 w-4" aria-hidden />
        {e.avg_processing_hours != null
          ? <>Average processing time <strong className="text-ink">{e.avg_processing_hours}h</strong> (observed)</>
          : <>Average processing time <strong className="text-ink">~{e.configured_avg_hours}h</strong> (configured, nothing completed yet)</>}
      </p>
      <div className="mt-5">
        <p className="eyebrow mb-2">Service catalog</p>
        <ul className="flex flex-wrap gap-1.5">{e.services.map((s) => <li key={s.code} title={s.description} className="rounded-full border border-line px-2.5 py-1 text-xs">{s.name}</li>)}</ul>
      </div>
      <div className="mt-5">
        <p className="eyebrow mb-2">Recent events</p>
        {e.recent_events.length === 0 ? <p className="text-sm text-muted">No events yet.</p> : (
          <ul className="space-y-1.5 text-sm">
            {e.recent_events.slice(0, 5).map((ev) => (
              <li key={ev.id} className="flex items-baseline justify-between gap-3">
                <span className="truncate"><span className="font-mono text-xs text-faint">{ev.case_reference}</span> {ev.task_name} · {title(ev.event_type.replace("TASK_", ""))}</span>
                <span className="shrink-0 text-xs text-faint">{relative(ev.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </motion.article>
  );
}
