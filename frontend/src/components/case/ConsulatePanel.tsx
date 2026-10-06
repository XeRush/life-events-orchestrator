import { AnimatePresence, motion } from "framer-motion";
import { CalendarCheck, Hourglass, PhoneOff, Send, Stamp, type LucideIcon } from "lucide-react";
import { useId, useState } from "react";
import { casesApi } from "../../api";
import { useAction } from "../../hooks/queries";
import { useLang, useT } from "../../i18n";
import { cn, fmtDateTime } from "../../lib/format";
import type { GraphNode, NodeState } from "../../types/api";
import { Button, Checkbox, Field, TextArea } from "../ui/primitives";
import { SourceBadge } from "../ui/StatusBadge";
import { fmtDay, localIsoDate, tx } from "./text";

type Milestone = "APPOINTMENT_BOOKED" | "APPLICATION_SUBMITTED" | "PASSPORT_ISSUED" | "DELAYED";

const MILESTONES: { id: Milestone; icon: LucideIcon }[] = [
  { id: "APPOINTMENT_BOOKED", icon: CalendarCheck },
  { id: "APPLICATION_SUBMITTED", icon: Send },
  { id: "PASSPORT_ISSUED", icon: Stamp },
  { id: "DELAYED", icon: Hourglass },
];

/** The consulate step is open to parent reports while it waits, processes or has stalled (same rule as the API). */
export const CONSULATE_OPEN: NodeState[] = ["WAITING_FOR_PARENT", "PROCESSING", "STALLED"];

/**
 * The consulate has no API, no SLA and no status feed. The parent reports each milestone here; LifeLoop records it,
 * timestamped and labelled parent-reported, and never claims the status itself.
 */
export function ConsulatePanel({ reference, node, compact = false }: { reference: string; node: GraphNode; compact?: boolean }) {
  const t = useT();
  const lang = useLang();
  const group = useId();
  const [milestone, setMilestone] = useState<Milestone | null>(null);
  const [date, setDate] = useState("");
  const [hasNumber, setHasNumber] = useState(false);
  const [notes, setNotes] = useState("");
  const report = useAction(
    (body: { milestone: Milestone; passport_number_present?: boolean; appointment_date?: string | null; notes?: string | null }) => casesApi.reportConsulate(reference, body),
    { success: t("resident.consulate.saved") },
  );
  const last = node.parent_report;
  const valid = milestone !== null && (milestone !== "PASSPORT_ISSUED" || hasNumber);
  const submit = () => {
    if (!milestone || !valid) return;
    report.mutate(
      {
        milestone,
        passport_number_present: milestone === "PASSPORT_ISSUED" ? hasNumber : false,
        appointment_date: milestone === "APPOINTMENT_BOOKED" && date ? date : null,
        notes: notes.trim() || null,
      },
      { onSuccess: () => { setMilestone(null); setDate(""); setHasNumber(false); setNotes(""); } },
    );
  };

  return (
    <section id={compact ? undefined : "consulate"} aria-labelledby={`${group}-title`}
      className={cn(!compact && "rounded-2xl border border-dashed border-amber/50 bg-amber-soft/35 p-4 sm:p-5")}>
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-soft text-amber"><PhoneOff className="h-5 w-5" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <h2 id={`${group}-title`} className={compact ? "text-lg" : "text-xl"}>{t("resident.consulate.title")}</h2>
          <p className="mt-1 font-medium text-amber">{t("resident.consulate.parentReported")}</p>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-2">{t("resident.consulate.why")}</p>
        </div>
      </div>

      {last && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-surface/70 px-3.5 py-2.5 text-sm">
          <SourceBadge source="PARENT_REPORTED" />
          <span>
            {t("resident.consulate.last", {
              label: tx(t, `resident.consulate.m.${last.reported_status}`, last.label),
              when: fmtDateTime(last.reported_at, lang),
            })}
          </span>
          {last.appointment_date && <span className="text-muted">{t("resident.consulate.appointmentOn", { date: fmtDay(last.appointment_date, lang) })}</span>}
        </div>
      )}

      <fieldset className="mt-4">
        <legend className="mb-2 text-[13px] font-medium text-ink-2">{t("resident.consulate.question")}</legend>
        <div className={cn("grid gap-2", !compact && "sm:grid-cols-2")}>
          {MILESTONES.map((m) => {
            const on = milestone === m.id;
            const Icon = m.icon;
            return (
              <label key={m.id}
                className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border bg-surface p-3.5 transition-[border-color,box-shadow] duration-200 focus-within:ring-2 focus-within:ring-ink/15",
                  on ? "border-ink/60 shadow-[var(--shadow-card)]" : "border-line hover:border-line-2")}>
                <input type="radio" name={group} value={m.id} checked={on} onChange={() => setMilestone(m.id)} className="sr-only" />
                <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", on ? "text-ink" : "text-muted")} aria-hidden />
                <span className="min-w-0">
                  <span className="block text-[15px] font-medium">{t(`resident.consulate.m.${m.id}`)}</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-muted">{t(`resident.consulate.d.${m.id}`)}</span>
                </span>
                <span aria-hidden className={cn("ms-auto mt-1 h-4 w-4 shrink-0 rounded-full border-2 transition-[background-color,border-color] duration-200", on ? "border-ink bg-ink shadow-[inset_0_0_0_3px_var(--color-surface)]" : "border-line-2")} />
              </label>
            );
          })}
        </div>
      </fieldset>

      <AnimatePresence initial={false}>
        {milestone && (
          <motion.div key="details" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mt-4 space-y-3">
              {milestone === "APPOINTMENT_BOOKED" && (
                <Field type="date" label={t("resident.consulate.date")} hint={t("resident.consulate.dateHint")} value={date} min={localIsoDate()}
                  onChange={(e) => setDate(e.target.value)} className="max-w-xs" />
              )}
              {milestone === "PASSPORT_ISSUED" && (
                <Checkbox checked={hasNumber} onChange={setHasNumber} label={t("resident.consulate.hasNumber")} description={t("resident.consulate.hasNumberHint")} required />
              )}
              {milestone === "DELAYED" && <p className="rounded-xl bg-surface/70 px-3.5 py-2.5 text-sm text-ink-2">{t("resident.consulate.delayedNote")}</p>}
              <TextArea label={t("resident.consulate.notes")} value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} placeholder={t("resident.consulate.notesHint")} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={submit} disabled={!valid} loading={report.isPending}>{t("resident.consulate.submit")}</Button>
        {milestone === "PASSPORT_ISSUED" && !hasNumber && <p className="text-xs text-muted">{t("resident.consulate.needNumber")}</p>}
      </div>
    </section>
  );
}
