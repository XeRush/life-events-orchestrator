import Lenis from "lenis";
import { useEffect, type ReactNode } from "react";
import { ScrollTrigger } from "./motion";

/** Smooth page scrolling, kept in step with GSAP ScrollTrigger. Skipped entirely for users who prefer reduced motion. */
export function SmoothScroll({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ duration: 1.1, smoothWheel: true, autoRaf: true });
    lenis.on("scroll", ScrollTrigger.update);
    return () => lenis.destroy();
  }, []);
  return <>{children}</>;
}
