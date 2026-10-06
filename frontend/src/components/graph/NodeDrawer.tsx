import { motion, useReducedMotion, type Variants } from "framer-motion";
import { ArrowRight, Clock3, FileText, Footprints, GitBranch, Lock, PhoneOff, UserRoundCheck } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { useImpact } from "../../hooks/queries";
import { useLang, useT } from "../../i18n";
import { fmtDateTime, titleCase } from "../../lib/format";
import type { GraphNode } from "../../types/api";
import { Drawer, KeyValue } from "../ui/primitives";
import { MockBadge, NodeStateBadge, SourceBadge } from "../ui/StatusBadge";

const FIELD_LABEL = (f: string) => titleCase(f.replace(/\./g, " ").replace(/_token$/, " (token)"));
const EASE = [0.22, 1, 0.36, 1] as const;
const list: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.05, delayChildren: 0.12 } } };
const item: Variants = { hidden: { opacity: 0, y: 10 }, shown: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } } };

/** Everything about one service: state and who reported it, what LifeLoop files, what the parent does, SLA, the exact
 * passport fields this authority receives (data minimisation), and which later services it is holding up.
 * Focus moves to the step's name when the drawer opens and returns to where it was when it closes. */
export function NodeDrawer({ node, caseRef, onClose, actions }: { node: GraphNode | null; caseRef: string; onClose: () => void; actions?: ReactNode }) {
  const t = useT();
  const lang = useLang();
  const reduce = useReducedMotion();
  const impact = useImpact(caseRef, node?.key);
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const key = node?.key ?? null;

  useEffect(() => {
    if (!key) return;
    if (!opener.current) opener.current = document.activeElement as HTMLElement | null;
    const id = window.requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(id);
  }, [key]);
  useEffect(() => {
    if (key || !opener.current) return;
    const el = opener.current;
    opener.current = null;
    if (el.isConnected) el.focus({ preventScroll: true });
  }, [key]);

  return (
    <Drawer
      open={!!node}
      onClose={onClose}
      title={node && (
        <div>
          <p className="eyebrow mb-1">{node.entity_label}</p>
          <h2 ref={heading} tabIndex={-1} className="text-2xl outline-none">{t(`node.${node.key}`)}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-live="polite">
            <NodeStateBadge state={node.state} />
            {node.state !== "PENDING" && <SourceBadge source={node.status_source} />}
            {node.is_mock && <MockBadge compact />}
          </div>
        </div>
      )}
    >
      {node && (
        <motion.div key={node.key} className="space-y-5 text-sm" initial={reduce ? false : "hidden"} animate="shown" variants={list}>
          <motion.section variants={item}>
            <p className="text-[15px] leading-relaxed">{node.status}</p>
            {node.blocked_reason && <p className="mt-3 rounded-xl border border-amber/40 bg-amber-soft px-3 py-2 text-amber">{node.blocked_reason}</p>}
          </motion.section>
          {node.type === "PARENT_REPORTED" && (
            <motion.section variants={item} className="rounded-2xl border border-dashed border-amber/50 bg-amber-soft/50 p-4">
              <p className="flex items-center gap-2 font-medium text-amber"><PhoneOff className="h-4 w-4" aria-hidden /> {t("drawer.noApi")}</p>
              <p className="mt-1 text-ink-2">{t("drawer.noApiBody")}</p>
              {node.parent_report && (
                <KeyValue className="mt-3" items={[
                  { label: t("drawer.lastReport"), value: node.parent_report.label },
                  { label: t("drawer.reported"), value: fmtDateTime(node.parent_report.reported_at, lang) },
                  { label: t("drawer.reportedBy"), value: node.parent_report.reported_by },
                  { label: t("drawer.passportAvailable"), value: node.parent_report.passport_number_present ? t("common.yes") : t("common.no") },
                  ...(node.parent_report.appointment_date ? [{ label: t("drawer.appointment"), value: fmtDateTime(node.parent_report.appointment_date, lang) }] : []),
                ]} />
              )}
            </motion.section>
          )}
          {node.next_action && (
            <motion.section variants={item} className="flex items-start gap-3 rounded-2xl bg-paper-2 p-4">
              <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 rtl-flip" aria-hidden />
              <div>
                <p className="eyebrow">{t(`owner.${(node.next_action_owner ?? "SYSTEM") as "PARENT"}`)}</p>
                <p className="mt-0.5 font-medium">{node.next_action}</p>
              </div>
            </motion.section>
          )}
          {actions && <motion.section variants={item}>{actions}</motion.section>}
          <motion.section variants={item}>
            <p className="eyebrow mb-2">{t("drawer.whatHappens")}</p>
            <p className="leading-relaxed"><span className="font-medium">{t("drawer.lifeloop")} </span>{node.lifeloop_does}</p>
            <p className="mt-2 leading-relaxed"><span className="font-medium">{t("drawer.you")} </span>{node.parent_does}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {node.human_approval_required && <span className="inline-flex items-center gap-1 rounded-full bg-violet-soft px-2.5 py-1 text-violet"><UserRoundCheck className="h-3.5 w-3.5" aria-hidden /> {t("drawer.officerRelease")}</span>}
              {node.resident_present_required && <span className="inline-flex items-center gap-1 rounded-full bg-amber-soft px-2.5 py-1 text-amber"><Footprints className="h-3.5 w-3.5" aria-hidden /> {node.resident_present_reason}</span>}
            </div>
          </motion.section>
          <motion.section variants={item}>
            <p className="eyebrow mb-1 flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" aria-hidden /> {t("drawer.timing")}</p>
            <KeyValue items={[
              { label: t("drawer.expected"), value: node.sla.label },
              { label: t("drawer.submitted"), value: fmtDateTime(node.submitted_at, lang) },
              { label: t("drawer.due"), value: node.sla.due_at ? <span className={node.sla.breached ? "text-rose" : ""}>{fmtDateTime(node.sla.due_at, lang)}{node.sla.breached ? ` · ${t("drawer.pastSla")}` : ""}</span> : "-" },
              { label: t("drawer.cleared"), value: fmtDateTime(node.cleared_at, lang) },
              { label: t("drawer.updated"), value: fmtDateTime(node.updated_at, lang) },
            ]} />
            <p className="mt-2 text-xs text-faint">{t("drawer.source", { source: node.sla.source })}</p>
            {node.fee_note && <p className="mt-2 rounded-xl bg-paper-2 px-3 py-2 text-xs">{node.fee_note}</p>}
          </motion.section>
          {node.form_fields.length > 0 && (
            <motion.section variants={item}>
              <p className="eyebrow mb-2 flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" aria-hidden /> {t("drawer.shared")}</p>
              <ul className="flex flex-wrap gap-1.5">
                {node.form_fields.map((f, i) => <li key={f} className="rounded-md border border-line bg-paper px-2 py-0.5 text-xs text-ink-2">{node.form_field_labels?.[i] ?? FIELD_LABEL(f)}</li>)}
              </ul>
              <p className="mt-2 text-xs text-muted">{t("drawer.sharedNote")}</p>
            </motion.section>
          )}
          {node.required_documents.length > 0 && (
            <motion.section variants={item}>
              <p className="eyebrow mb-2 flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" aria-hidden /> {t("drawer.documents")}</p>
              <ul className="space-y-1">{node.required_documents.map((d) => <li key={d} className="text-ink-2">{titleCase(d)}</li>)}</ul>
            </motion.section>
          )}
          <motion.section variants={item}>
            <p className="eyebrow mb-2 flex items-center gap-1.5"><GitBranch className="h-3.5 w-3.5" aria-hidden /> {t("drawer.dependsOn")}</p>
            <p className="text-ink-2">{node.dependencies.length ? node.dependencies.map((d) => t(`node.${d}`)).join(", ") : t("drawer.startsChain")}</p>
            {impact.data && impact.data.held_downstream.length > 0 && (
              <p className="mt-1 text-ink-2">{t("drawer.holdsUp", { nodes: impact.data.held_downstream.map((d) => t(`node.${d.key}`)).join(" → ") })} <span className="text-xs text-faint">{t("drawer.via", { source: impact.data.source })}</span></p>
            )}
          </motion.section>
        </motion.div>
      )}
    </Drawer>
  );
}
