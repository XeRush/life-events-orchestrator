import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { ArrowRight, BadgeCheck, Footprints, Phone, PhoneOff, UserRoundCheck, X } from "lucide-react";
import { useT } from "../../i18n";
import { cn } from "../../lib/format";
import { DONE, NODE_STATE, TONE } from "../../lib/status";
import type { CaseView, GraphNode, NodeKey } from "../../types/api";
import { NodeStateBadge, SourceBadge } from "../ui/StatusBadge";
import { LinkButton, OwnerBadge } from "./CaseBits";
import { asOwner } from "./text";

const EASE = [0.22, 1, 0.36, 1] as const;
const list: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } } };
const rise: Variants = { hidden: { opacity: 0, y: 10 }, shown: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } } };

/**
 * The first thing on the case page: the API's own one-sentence summary, set as a statement, then the step that is
 * moving and who acts next. The sentence re-animates only when it actually changes.
 */
export function WhereAreWe({ view, currentNode, onOpenNode }: { view: CaseView; currentNode?: GraphNode; onOpenNode: (key: NodeKey) => void }) {
  const t = useT();
  const reduce = useReducedMotion();
  const complete = view.status === "COMPLETED";
  const next = view.next_action;
  return (
    <section aria-labelledby="where-title">
      <h2 id="where-title" className="eyebrow mb-2">{t("resident.where.title")}</h2>
      <div aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={view.summary}
            initial={{ opacity: 0, y: reduce ? 0 : 10 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            className="max-w-3xl font-display text-[22px] leading-[1.3] text-ink sm:text-[27px] sm:leading-[1.25]"
          >
            {view.summary}
          </motion.p>
        </AnimatePresence>
      </div>

      {view.current_node && (
        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-2 text-sm">
          <span className="text-muted">{t("resident.where.current")}</span>
          <button
            type="button"
            onClick={() => onOpenNode(view.current_node!.key)}
            className="min-h-10 cursor-pointer font-medium underline decoration-line-2 underline-offset-4 transition-colors hover:decoration-ink sm:min-h-0"
          >
            {t(`node.${view.current_node.key}`)}
          </button>
          <span aria-live="polite" className="inline-flex flex-wrap items-center gap-2">
            <NodeStateBadge state={view.current_node.state} />
            {currentNode && <SourceBadge source={currentNode.status_source} />}
          </span>
          <span className="basis-full text-[13px] text-muted sm:basis-auto">{view.current_node.entity_label}</span>
        </div>
      )}

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.15 }}
        className="relative mt-4 flex flex-col gap-3 overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:p-5"
      >
        <span aria-hidden className="absolute inset-y-0 start-0 w-1 bg-civic" />
        <div className="min-w-0 flex-1 ps-1">
          {complete ? (
            <p className="flex items-center gap-2 text-[15px] font-medium text-civic"><BadgeCheck className="h-5 w-5" aria-hidden />{t("resident.next.complete")}</p>
          ) : next ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-medium text-ink-2">{t("resident.next.title")}</span>
                <OwnerBadge owner={next.owner} />
              </div>
              <p className="mt-1.5 text-[15px] leading-relaxed">{next.text}</p>
              <p className="mt-1 text-xs text-muted">{t(`resident.next.owner.${asOwner(next.owner)}`)}</p>
            </>
          ) : (
            <p className="text-[15px] leading-relaxed text-ink-2">{t("resident.next.none")}</p>
          )}
        </div>
        <LinkButton to={`/app/voice?case=${view.reference}`} variant="civic" icon={<Phone className="h-4 w-4" aria-hidden />} className="self-start sm:self-center">
          {t("resident.cta.talk")}
        </LinkButton>
      </motion.div>
    </section>
  );
}

/** Steps that need attention (blocked, missing a document, stalled, not approved), each opening its details. */
export function AttentionList({ view, onOpenNode }: { view: CaseView; onOpenNode: (key: NodeKey) => void }) {
  const t = useT();
  const reduce = useReducedMotion();
  if (!view.attention_nodes.length) return null;
  return (
    <section aria-labelledby="attention-title" className="space-y-2">
      <h2 id="attention-title" className="text-lg">{t("resident.attention.title", { n: view.attention_nodes.length })}</h2>
      <motion.ul className="space-y-2" initial={reduce ? false : "hidden"} animate="shown" variants={list}>
        <AnimatePresence initial={false}>
          {view.attention_nodes.map((n) => {
            const meta = NODE_STATE[n.state];
            const Icon = meta.icon;
            return (
              <motion.li key={n.key} variants={rise} layout={!reduce} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
                <button type="button" onClick={() => onOpenNode(n.key)}
                  className={cn("group flex w-full cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 text-start transition-colors hover:bg-surface", TONE[meta.tone].border, TONE[meta.tone].bg)}>
                  <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", TONE[meta.tone].text)} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{t("resident.attention.item", { step: t(`node.${n.key}`), state: t(`state.${n.state}`) })}</span>
                    {n.reason && <span className="mt-0.5 block text-sm text-ink-2">{n.reason}</span>}
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 self-center text-xs font-medium text-ink-2">
                    {t("resident.attention.details")}
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5 rtl-flip rtl:group-hover:-translate-x-0.5" aria-hidden />
                  </span>
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </motion.ul>
    </section>
  );
}

/** Compact, accessible list of the six steps (used on small screens instead of the drawn graph). */
export function StepList({ nodes, onSelect }: { nodes: GraphNode[]; onSelect: (key: NodeKey) => void }) {
  const t = useT();
  const reduce = useReducedMotion();
  return (
    <motion.ol className="relative" initial={reduce ? false : "hidden"} whileInView="shown" viewport={{ once: true }} variants={list}>
      <span aria-hidden className="absolute bottom-6 start-[23px] top-6 w-px bg-line-2" />
      {nodes.map((n, i) => {
        const meta = NODE_STATE[n.state];
        const Icon = meta.icon;
        const done = DONE.includes(n.state);
        return (
          <motion.li key={n.key} className="relative" variants={rise}>
            <button type="button" onClick={() => onSelect(n.key)}
              aria-label={t("resident.steps.aria", { n: i + 1, step: t(`node.${n.key}`), state: t(`state.${n.state}`) })}
              className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2.5 text-start transition-colors hover:bg-paper-2">
              <span className={cn("relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full ring-4 ring-surface", TONE[meta.tone].bg, TONE[meta.tone].text)}>
                <Icon className={cn("h-4 w-4", meta.spin && "animate-spin")} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate font-medium", done && "text-ink-2")}>{t(`node.${n.key}`)}</span>
                <span className="block truncate text-xs text-muted">{n.entity_label}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                {n.human_approval_required && <UserRoundCheck className="h-3.5 w-3.5 text-faint" aria-hidden />}
                {n.resident_present_required && <Footprints className="h-3.5 w-3.5 text-faint" aria-hidden />}
                {n.type === "PARENT_REPORTED" && <PhoneOff className="h-3.5 w-3.5 text-amber" aria-hidden />}
                <span className={cn("text-xs font-semibold", TONE[meta.tone].text)}>{t(`state.${n.state}`)}</span>
              </span>
            </button>
          </motion.li>
        );
      })}
    </motion.ol>
  );
}

/** Shown once, right after the web intake opens the case: a calm confirmation, not confetti. */
export function OpenedBanner({ reference, created, onDismiss }: { reference: string; created: boolean; onDismiss: () => void }) {
  const t = useT();
  const reduce = useReducedMotion();
  return (
    <motion.section
      role="status"
      initial={{ opacity: 0, y: reduce ? 0 : -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className="relative mb-6 overflow-hidden rounded-3xl border border-civic/30 bg-civic-soft/60 px-5 py-5 sm:px-6"
    >
      <div className="flex items-start gap-4">
        <svg viewBox="0 0 64 64" className="hidden h-14 w-14 shrink-0 sm:block" aria-hidden>
          <motion.path
            d="M32 12a20 20 0 1 1-19.1 14.1" fill="none" stroke="var(--color-civic)" strokeWidth="3.4" strokeLinecap="round"
            initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease: EASE }}
          />
          <motion.circle cx="12.9" cy="26.1" r="3.6" fill="var(--color-civic)" initial={{ scale: reduce ? 1 : 0 }} animate={{ scale: 1 }} transition={{ delay: reduce ? 0 : 1.05, ease: EASE }} />
          <motion.circle cx="32" cy="32" r="7" fill="var(--color-civic)" initial={{ scale: reduce ? 1 : 0 }} animate={{ scale: 1 }} transition={{ delay: reduce ? 0 : 1.2, ease: EASE }} />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl leading-snug text-ink sm:text-2xl">
            {created ? t("resident.opened.title", { ref: reference }) : t("resident.opened.existing", { ref: reference })}
          </p>
          <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-ink-2">{t("resident.opened.body")}</p>
        </div>
        <button type="button" onClick={onDismiss} aria-label={t("common.close")} className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full text-ink-2 hover:bg-ink/[0.06]">
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </motion.section>
  );
}
