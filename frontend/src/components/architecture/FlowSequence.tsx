import { ArrowDown, type LucideIcon } from "lucide-react";
import { Fragment, useRef } from "react";
import { useGsap } from "../../animations/motion";
import { isRTL, useLang, useT, type MessageKey } from "../../i18n";
import { cn } from "../../lib/format";

export interface FlowStep { icon: LucideIcon; title: MessageKey; body: MessageKey; tone: "civic" | "violet" | "azure" | "amber" | "slate" }

const TONES: Record<FlowStep["tone"], string> = {
  civic: "bg-civic-soft text-civic",
  violet: "bg-violet-soft text-violet",
  azure: "bg-azure-soft text-azure",
  amber: "bg-amber-soft text-amber",
  slate: "bg-slate-soft text-ink-2",
};

/**
 * A conceptual data flow as an ordered sequence. When it scrolls into view each step lights up in turn and the
 * connector between steps fills (scaleX/scaleY only), so the direction of travel is the thing you notice first.
 */
export function FlowSequence({ title, lead, steps, label }: { title: MessageKey; lead: MessageKey; steps: FlowStep[]; label: MessageKey }) {
  const t = useT();
  const lang = useLang();
  const root = useRef<HTMLDivElement>(null);

  useGsap(root, ({ gsap, reduce }) => {
    if (reduce) return;
    const q = gsap.utils.selector(root.current);
    gsap.set(q("[data-step]"), { autoAlpha: 0.25, y: 10 });
    gsap.set(q("[data-fill]"), { scaleX: 0, transformOrigin: isRTL(lang) ? "100% 50%" : "0% 50%" });
    const tl = gsap.timeline({ defaults: { ease: "power2.out" }, scrollTrigger: { trigger: root.current, start: "top 78%", once: true } });
    q("[data-step]").forEach((step, i) => {
      tl.to(step, { autoAlpha: 1, y: 0, duration: 0.45, clearProps: "opacity,visibility,transform" }, i === 0 ? 0 : ">-0.05");
      const fill = q(`[data-fill='${i}']`)[0];
      if (fill) tl.to(fill, { scaleX: 1, duration: 0.4, ease: "power1.inOut" }, ">-0.1");
    });
  }, [lang]);

  return (
    <section aria-label={t(label)} className="rounded-3xl border border-line bg-surface p-5 shadow-(--shadow-card) sm:p-7">
      <div className="grid gap-x-10 gap-y-1.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:items-end">
        <h3 className="text-[1.5rem] leading-tight">{t(title)}</h3>
        <p className="text-[14.5px] leading-relaxed text-muted">{t(lead)}</p>
      </div>
      <div ref={root}>
        <ol className="mt-5 flex flex-col gap-2 lg:flex-row lg:items-stretch lg:gap-0">
          {steps.map((step, i) => (
            <Fragment key={step.title}>
              <li data-step className="flex min-w-0 flex-1 gap-3 rounded-2xl border border-line bg-paper p-4 lg:flex-col">
                <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", TONES[step.tone])}><step.icon className="h-5 w-5" aria-hidden /></span>
                <div className="min-w-0">
                  <p className="font-mono text-[10.5px] tracking-[0.16em] text-muted">{String(i + 1).padStart(2, "0")}</p>
                  <p className="mt-0.5 font-display text-[1.1rem] leading-tight text-ink">{t(step.title)}</p>
                  <p className="mt-1.5 text-[13px] leading-snug text-muted">{t(step.body)}</p>
                </div>
              </li>
              {i < steps.length - 1 && (
                <li aria-hidden className="flex items-center justify-center lg:w-8 lg:shrink-0">
                  <span className="relative hidden h-0.5 w-full overflow-hidden rounded-full bg-line lg:block">
                    <span data-fill={i} className="absolute inset-0 bg-civic" />
                  </span>
                  <ArrowDown className="h-4 w-4 text-faint lg:hidden" />
                </li>
              )}
            </Fragment>
          ))}
        </ol>
      </div>
    </section>
  );
}
