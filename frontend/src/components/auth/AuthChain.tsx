import { Check, Hand } from "lucide-react";
import { useRef } from "react";
import { useGsap } from "../../animations/motion";
import { useT, type MessageKey } from "../../i18n";
import { cn } from "../../lib/format";

/** The same six-step chain as the landing hero, in miniature, for the auth brand panel. */
const CHAIN: { title: MessageKey; sub: MessageKey; parent?: boolean }[] = [
  { title: "landing.flow.entity.dha", sub: "node.BIRTH_CERTIFICATE" },
  { title: "landing.flow.entity.mofa", sub: "node.MOFA_ATTESTATION" },
  { title: "landing.flow.entity.consulate", sub: "landing.flow.consulateNote", parent: true },
  { title: "landing.flow.entity.gdrfa", sub: "node.RESIDENCE_VISA" },
  { title: "landing.flow.entity.icp", sub: "node.EMIRATES_ID" },
  { title: "landing.flow.entity.insurer", sub: "node.INSURANCE" },
];

/**
 * A vertical rail of the six filings: each step lights in order while the rail fills (scaleY), then the loop resets.
 * Decorative (the brand panel's text carries the meaning), so it is aria-hidden. Static and fully lit for reduced
 * motion; the loop only runs while the panel is on screen.
 */
export function AuthChain({ className }: { className?: string }) {
  const t = useT();
  const root = useRef<HTMLDivElement>(null);

  useGsap(root, ({ gsap, ScrollTrigger, reduce }) => {
    const q = gsap.utils.selector(root.current);
    if (reduce) return;
    gsap.set(q("[data-fill]"), { scaleY: 0, transformOrigin: "50% 0%" });
    gsap.set(q("[data-lit]"), { autoAlpha: 0, scale: 0.5 });
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.8, paused: true });
    tl.set(q("[data-lit]"), { autoAlpha: 0, scale: 0.5 });
    CHAIN.forEach((_, i) => {
      tl.to(q(`[data-lit='${i}']`), { autoAlpha: 1, scale: 1, duration: 0.35, ease: "power3.out" }, i === 0 ? 0.3 : ">");
      if (i < CHAIN.length - 1) tl.to(q("[data-fill]"), { scaleY: (i + 1) / (CHAIN.length - 1), duration: 0.55, ease: "power2.inOut" }, ">0.15");
    });
    tl.to({}, { duration: 1.8 })
      .to(q("[data-lit]"), { autoAlpha: 0, duration: 0.4 })
      .to(q("[data-fill]"), { scaleY: 0, duration: 0.4, ease: "power2.in" }, "<");
    ScrollTrigger.create({ trigger: root.current, start: "top bottom", end: "bottom top", onToggle: (self) => (self.isActive ? tl.play() : tl.pause()) });
  }, []);

  return (
    <div ref={root} aria-hidden className={cn("relative", className)}>
      <span className="absolute bottom-[22px] start-[10px] top-[22px] w-0.5 rounded-full bg-line-2" />
      <span data-fill className="absolute bottom-[22px] start-[10px] top-[22px] w-0.5 rounded-full bg-civic" />
      <ol className="relative">
        {CHAIN.map((c, i) => (
          <li key={c.title} className="flex h-11 items-center gap-3">
            <span className={cn("relative grid size-[22px] shrink-0 place-items-center rounded-full border bg-stage-2", c.parent ? "border-dashed border-amber" : "border-line-2")}>
              <span data-lit={i} className={cn("absolute -inset-px grid place-items-center rounded-full", c.parent ? "bg-amber" : "bg-civic")}>
                {c.parent ? <Hand className="h-3 w-3 text-on-accent" strokeWidth={2.5} /> : <Check className="h-3 w-3 text-on-accent" strokeWidth={3} />}
              </span>
            </span>
            <span className="min-w-0 truncate text-[13.5px]">
              <span className="font-medium text-ink">{t(c.title)}</span>
              <span className={cn("ms-2", c.parent ? "text-amber" : "text-muted")}>{t(c.sub)}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
