import { PhoneOff } from "lucide-react";
import { useRef } from "react";
import { useGsap } from "../../animations/motion";
import { isRTL, useLang, useT, type MessageKey } from "../../i18n";
import { cn } from "../../lib/format";

/** Idea Canvas box H: elapsed time per stage today. Max durations sum to 92 days, minimums to 24. */
const STAGES: { step: MessageKey; who: MessageKey; time: MessageKey; max: number; fails?: boolean }[] = [
  { step: "landing.problem.stage1.step", who: "landing.problem.stage1.who", time: "landing.problem.stage1.time", max: 3 },
  { step: "landing.problem.stage2.step", who: "landing.problem.stage2.who", time: "landing.problem.stage2.time", max: 5 },
  { step: "landing.problem.stage3.step", who: "landing.problem.stage3.who", time: "landing.problem.stage3.time", max: 3 },
  { step: "landing.problem.stage4.step", who: "landing.problem.stage4.who", time: "landing.problem.stage4.time", max: 56, fails: true },
  { step: "landing.problem.stage5.step", who: "landing.problem.stage5.who", time: "landing.problem.stage5.time", max: 10 },
  { step: "landing.problem.stage6.step", who: "landing.problem.stage6.who", time: "landing.problem.stage6.time", max: 15 },
];
const LEGAL = 120;
const pct = (days: number) => `${(days / LEGAL) * 100}%`;

/**
 * The 120-day track, scroll-scrubbed: as the reader scrolls, the six stages fill the track in order, each taking scroll
 * distance in proportion to its real duration (so the consulate's 8 weeks visibly eat the deadline). Only scaleX moves.
 */
export function DeadlineBar() {
  const t = useT();
  const lang = useLang();
  const root = useRef<HTMLElement>(null);

  useGsap(root, ({ gsap, reduce }) => {
    if (reduce) return;
    const origin = isRTL(lang) ? "100% 50%" : "0% 50%";
    const segs = gsap.utils.toArray<HTMLElement>("[data-seg]");
    gsap.set(segs, { scaleX: 0, transformOrigin: origin });
    const tl = gsap.timeline({ scrollTrigger: { trigger: "[data-track]", start: "top 88%", end: "top 38%", scrub: 0.6 } });
    segs.forEach((seg) => tl.to(seg, { scaleX: 1, ease: "none", duration: Number(seg.dataset.days) }));
    // timeline time is measured in days, so each marker appears as the fill reaches it
    const [best, worst] = gsap.utils.toArray<HTMLElement>("[data-marker]");
    tl.fromTo(best, { autoAlpha: 0, y: -4 }, { autoAlpha: 1, y: 0, duration: 4 }, 22).fromTo(worst, { autoAlpha: 0, y: -4 }, { autoAlpha: 1, y: 0, duration: 4 }, 88);
    gsap.from("[data-stage]", {
      autoAlpha: 0, y: 14, duration: 0.5, stagger: 0.06, clearProps: "opacity,visibility,transform",
      scrollTrigger: { trigger: "[data-stages]", start: "top 88%", once: true },
    });
  }, [lang]);

  return (
    <figure ref={root}>
      <figcaption className="sr-only">{t("landing.problem.barAlt")}</figcaption>
      <div className="flex items-end justify-between gap-4 text-[11.5px] text-muted">
        <span className="font-mono uppercase tracking-[0.14em]">{t("landing.problem.birth")}</span>
        <span className="text-end font-mono uppercase tracking-[0.14em] text-rose">{t("landing.problem.deadline")}</span>
      </div>

      <div className="relative mt-2.5" aria-hidden>
        {/* 120-day track */}
        <div data-track className="relative h-12 overflow-hidden rounded-2xl border border-line bg-paper-2/70 sm:h-14">
          <div className="absolute inset-y-0 flex w-full">
            {STAGES.map((s, i) => (
                <div
                  key={s.step}
                  data-seg
                  data-days={s.max}
                  className={cn(
                    "relative flex h-full items-center justify-center border-e-2 border-paper-2 font-mono text-[11px] font-medium",
                    s.fails ? "bg-amber-soft text-amber" : i % 2 ? "bg-civic/85 text-on-accent" : "bg-civic text-on-accent",
                  )}
                  style={{
                    width: pct(s.max),
                    backgroundImage: s.fails ? "repeating-linear-gradient(135deg, color-mix(in oklab, var(--color-amber) 18%, transparent) 0 6px, transparent 6px 12px)" : undefined,
                  }}
                >
                  {s.max >= 5 && <span className="num">{i + 1}</span>}
                  {s.fails && <PhoneOff className="ms-2 h-3.5 w-3.5" aria-hidden />}
                </div>
            ))}
          </div>
          {/* the 120-day legal line sits at the far end of the track */}
          <div className="absolute inset-y-0 end-0 w-[3px] bg-rose" />
        </div>

        {/* best-case / worst-case markers */}
        <div className="relative mt-2 h-12 text-[11.5px] sm:h-8">
          <span data-marker className="absolute top-0 -translate-x-1/2 rtl:translate-x-1/2" style={{ insetInlineStart: pct(24) }}>
            <span className="mx-auto block h-2.5 w-px bg-ink/50" />
            <span className="mt-1 block w-28 text-center font-mono text-ink-2 sm:w-auto sm:whitespace-nowrap">{t("landing.problem.best")}</span>
          </span>
          <span data-marker className="absolute top-0 -translate-x-1/2 rtl:translate-x-1/2" style={{ insetInlineStart: pct(92) }}>
            <span className="mx-auto block h-2.5 w-px bg-ink/50" />
            <span className="mt-1 block w-28 text-center font-mono text-ink-2 sm:w-auto sm:whitespace-nowrap">{t("landing.problem.worst")}</span>
          </span>
        </div>
      </div>

      <ol data-stages className="mt-5 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {STAGES.map((s, i) => (
          <li key={s.step} data-stage className={cn("min-w-0 rounded-2xl border p-3.5 sm:p-4", s.fails ? "border-amber/50 bg-amber-soft/60" : "border-line bg-surface")}>
            <p className={cn("font-mono text-[11px] tracking-[0.14em]", s.fails ? "text-amber" : "text-civic")}>{String(i + 1).padStart(2, "0")}</p>
            <p className="mt-1.5 font-display text-[17px] leading-tight text-ink">{t(s.step)}</p>
            <p className="mt-1 text-[12.5px] leading-snug text-muted">{t(s.who)}</p>
            <p className={cn("mt-2.5 text-[13px] font-medium", s.fails ? "text-amber" : "text-ink-2")}>{t(s.time)}</p>
            {s.fails && <p className="mt-1.5 text-[12.5px] leading-snug text-amber">{t("landing.problem.failsMost")}</p>}
          </li>
        ))}
      </ol>
    </figure>
  );
}
