import Lenis from "lenis";
import { useEffect, type ReactNode } from "react";

/** Smooth page scrolling. Skipped entirely for users who prefer reduced motion. */
export function SmoothScroll({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ duration: 1.1, smoothWheel: true, autoRaf: true });
    return () => lenis.destroy();
  }, []);
  return <>{children}</>;
}
