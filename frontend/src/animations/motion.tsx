/**
 * Shared motion primitives. One motion language across the app:
 * - Framer Motion for component state (enter/exit, hover, layout, stagger, route transitions).
 * - GSAP + ScrollTrigger for scroll-driven sequences and SVG drawing (see `useGsap`).
 * - Ease: a long-tail settle (`ease`, GSAP "power3.out"). Smooth beats bouncy; no overshoot by default.
 * - Animate transform and opacity only. Every primitive is static under prefers-reduced-motion.
 */
import { useIsFetching } from "@tanstack/react-query";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  animate, AnimatePresence, motion, useInView, useMotionValue, useReducedMotion, useTransform, type HTMLMotionProps, type Variants,
} from "framer-motion";
import { useEffect, useLayoutEffect, useRef, type DependencyList, type ReactNode, type RefObject } from "react";
import { cn } from "../lib/format";
import { ease } from "./variants";

gsap.registerPlugin(ScrollTrigger);
gsap.defaults({ duration: 0.6, ease: "power3.out" });

export const VIEWPORT = { once: true, margin: "0px 0px -10% 0px" } as const;

const rise: Variants = {
  hidden: { opacity: 0, y: 18 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.6, ease } },
};
const group = (gap: number, delay: number): Variants => ({
  hidden: {},
  shown: { transition: { staggerChildren: gap, delayChildren: delay } },
});

type DivProps = Omit<HTMLMotionProps<"div">, "children"> & { children?: ReactNode };

/** Rises into place the first time it scrolls into view. */
export function Reveal({ children, className, delay = 0, y = 18, ...rest }: DivProps & { delay?: number; y?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={VIEWPORT}
      transition={{ duration: 0.6, ease, delay }} {...rest}>
      {children}
    </motion.div>
  );
}

/** Staggered reveal: children wrapped in <StaggerItem> enter one after another. */
export function Stagger({ children, className, gap = 0.07, delay = 0, as = "div" }: { children: ReactNode; className?: string; gap?: number; delay?: number; as?: "div" | "ul" | "ol" }) {
  const reduce = useReducedMotion();
  if (reduce) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }
  const Tag = motion[as];
  return <Tag className={className} initial="hidden" whileInView="shown" viewport={VIEWPORT} variants={group(gap, delay)}>{children}</Tag>;
}

export function StaggerItem({ children, className, as = "div" }: { children: ReactNode; className?: string; as?: "div" | "li" }) {
  const reduce = useReducedMotion();
  if (reduce) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }
  const Tag = motion[as];
  return <Tag className={className} variants={rise}>{children}</Tag>;
}

/** Heading text that rises word by word (spaces split words in all six languages; letters inside a word stay joined). */
export function TextReveal({ text, className, delay = 0, as = "span" }: { text: string; className?: string; delay?: number; as?: "span" | "h1" | "h2" | "p" }) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  if (reduce) {
    const Plain = as;
    return <Plain className={className}>{text}</Plain>;
  }
  const words = text.split(/(\s+)/);
  return (
    <Tag className={className} initial="hidden" whileInView="shown" viewport={VIEWPORT} variants={group(0.045, delay)} aria-label={text}>
      {words.map((w, i) => /^\s+$/.test(w) ? w : (
        <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-bottom" aria-hidden>
          <motion.span className="inline-block" variants={{ hidden: { y: "105%" }, shown: { y: 0, transition: { duration: 0.7, ease } } }}>{w}</motion.span>
        </span>
      ))}
    </Tag>
  );
}

/** Card that lifts slightly on hover and presses on tap. */
export function HoverLift({ children, className, lift = 3, ...rest }: DivProps & { lift?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={cn("transition-shadow duration-300 hover:shadow-[var(--shadow-pop)]", className)}
      whileHover={reduce ? undefined : { y: -lift }} whileTap={reduce ? undefined : { scale: 0.99 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }} {...rest}>
      {children}
    </motion.div>
  );
}

/** Counts from 0 to `value` once it scrolls into view (tabular numerals, so the width never jumps). */
export function CountUp({ value, duration = 1.2, className, format = (n: number) => Math.round(n).toLocaleString() }: {
  value: number; duration?: number; className?: string; format?: (n: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, VIEWPORT);
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? value : 0);
  const text = useTransform(mv, (n) => format(n));
  useEffect(() => {
    if (reduce) { mv.set(value); return; }
    if (!inView) return;
    const controls = animate(mv, value, { duration, ease });
    return () => controls.stop();
  }, [inView, value, duration, reduce, mv]);
  return <motion.span ref={ref} className={cn("num", className)}>{text}</motion.span>;
}

/**
 * GSAP inside React, cleaned up on unmount. `setup` runs in a gsap.context scoped to `scope`, so selector strings only
 * match inside it, and every tween and ScrollTrigger it creates is reverted when the component goes away.
 * `reduce` is true under prefers-reduced-motion: set end states instead of animating.
 */
export function useGsap(scope: RefObject<HTMLElement | SVGElement | null>, setup: (ctx: { gsap: typeof gsap; ScrollTrigger: typeof ScrollTrigger; reduce: boolean }) => void, deps: DependencyList = []) {
  useLayoutEffect(() => {
    if (!scope.current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ctx = gsap.context(() => setup({ gsap, ScrollTrigger, reduce }), scope.current);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** A thin bar across the top of the window while any data is loading. */
export function FetchBar() {
  const fetching = useIsFetching();
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {fetching > 0 && (
        <motion.div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[2px] origin-left overflow-hidden"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.3, delay: 0.15 } }}>
          <motion.div className="h-full w-1/3 bg-linear-to-r from-transparent via-civic to-transparent"
            animate={reduce ? undefined : { x: ["-100%", "300%"] }} transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { gsap, ScrollTrigger };
