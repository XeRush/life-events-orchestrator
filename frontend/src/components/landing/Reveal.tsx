import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { Reveal, Stagger, StaggerItem, VIEWPORT } from "../../animations/motion";
import { ease } from "../../animations/variants";
import { useLang } from "../../i18n";
import { cn } from "../../lib/format";

export { Reveal };

/** Staggered reveal for lists: wrap each item in <RevealItem>. `list` renders a <ul>. */
export function RevealGroup({ children, className, list, gap = 0.06 }: { children: ReactNode; className?: string; list?: boolean; gap?: number }) {
  return <Stagger as={list ? "ul" : "div"} className={className} gap={gap}>{children}</Stagger>;
}

export function RevealItem({ children, className, li }: { children: ReactNode; className?: string; li?: boolean }) {
  return <StaggerItem as={li ? "li" : "div"} className={className}>{children}</StaggerItem>;
}

/**
 * Heading text that rises word by word, for use INSIDE a real <h1>/<h2> (so the heading keeps its id and its
 * accessible name: the full text is in an sr-only span, the animated words are aria-hidden).
 * Urdu (Nastaliq) glyphs overflow their line box, so there it fades in whole instead of being clipped per word.
 */
export function SplitWords({ text, delay = 0, className }: { text: string; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  const lang = useLang();
  if (reduce) return <span className={className}>{text}</span>;
  if (lang === "ur") {
    return (
      <motion.span className={cn("inline-block", className)} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={VIEWPORT}
        transition={{ duration: 0.7, ease, delay }}>
        {text}
      </motion.span>
    );
  }
  const parts = text.split(/(\s+)/);
  return (
    <>
      <span className="sr-only">{text}</span>
      <motion.span aria-hidden className={className} initial="hidden" whileInView="shown" viewport={VIEWPORT}
        variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.045, delayChildren: delay } } }}>
        {parts.map((w, i) => /^\s+$/.test(w) ? w : (
          <span key={i} className="-mx-[0.1em] -mb-[0.12em] inline-block overflow-hidden px-[0.1em] pb-[0.12em] align-bottom">
            <motion.span className="inline-block" variants={{ hidden: { y: "108%" }, shown: { y: 0, transition: { duration: 0.75, ease } } }}>{w}</motion.span>
          </span>
        ))}
      </motion.span>
    </>
  );
}

/**
 * Section scaffold, theme-driven: mono eyebrow with an index number and the display heading on the start side,
 * the lead paragraph on the end side from lg up (so copy uses the width instead of sitting in a centred column).
 */
export function SectionHead({ index, eyebrow, title, lead, className, id }: {
  index?: string; eyebrow: string; title: string; lead?: ReactNode; className?: string; id?: string;
}) {
  return (
    <div className={cn("grid gap-x-14 gap-y-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-end", className)}>
      <div className="min-w-0">
        <Reveal y={10}>
          <p className="eyebrow mb-3 flex items-center gap-2.5">
            {index && <span className="num rounded-full border border-line-2 bg-surface px-2 py-0.5 text-civic">{index}</span>}
            {eyebrow}
          </p>
        </Reveal>
        <h2 id={id} className="text-[1.9rem] leading-[1.08] text-ink sm:text-[2.45rem] lg:text-[2.75rem]"><SplitWords text={title} /></h2>
      </div>
      {lead && (
        <Reveal delay={0.12} y={10}>
          <p className="max-w-xl text-[15.5px] leading-relaxed text-muted lg:pb-1">{lead}</p>
        </Reveal>
      )}
    </div>
  );
}
