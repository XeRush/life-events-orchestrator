import type { Variants } from "framer-motion";

export const ease = [0.22, 1, 0.36, 1] as const;

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.18 } },
};

export const stagger: Variants = {
  animate: { transition: { staggerChildren: 0.06 } },
};

export const rise: Variants = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.45, ease } },
};

export const fade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.4 } },
};

export const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
