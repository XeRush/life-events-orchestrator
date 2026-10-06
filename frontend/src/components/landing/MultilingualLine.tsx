import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { ease } from "../../animations/variants";
import { useT } from "../../i18n";
import { cn } from "../../lib/format";
import { SAMPLES } from "./samples";

const DWELL = 3.4;

/**
 * "One call. One case. Every step after birth." in the six languages LifeLoop speaks, each in its own script.
 * Every sample is laid out in the same grid cell (only the active one is visible), so the card is always as tall as
 * the longest line and nothing below it jumps. Auto-advances with a progress hairline; pauses on hover/focus; static
 * for reduced motion. Every language is also a button.
 */
export function MultilingualLine({ className }: { className?: string }) {
  const t = useT();
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(1);
  const [paused, setPaused] = useState(false);
  const auto = !reduce && !paused;

  useEffect(() => {
    if (!auto) return;
    const id = window.setTimeout(() => setIndex((i) => (i + 1) % SAMPLES.length), DWELL * 1000);
    return () => window.clearTimeout(id);
  }, [auto, index]);

  return (
    <div
      className={cn("rounded-2xl border border-line bg-surface/85 px-4 pb-3 pt-3.5 shadow-(--shadow-card) backdrop-blur-sm", className)}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}
    >
      <p className="eyebrow">{t("landing.hero.languagesLabel")}</p>
      <div className="mt-2 grid items-center" aria-live="off">
        {SAMPLES.map((s, i) => {
          const active = i === index;
          return (
            <motion.p
              key={active ? `${s.lang}-on` : s.lang}
              lang={s.lang}
              dir={s.dir}
              aria-hidden={!active}
              className={cn("w-full text-[1.12rem] leading-snug text-ink [grid-area:1/1] sm:text-[1.28rem]", !active && "invisible")}
              style={{ fontFamily: s.font, lineHeight: s.lang === "ur" ? 2 : undefined }}
              initial={active && !reduce ? "hidden" : false}
              animate="shown"
              variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.05 } } }}
            >
              {active && !reduce
                ? s.tagline.split(/(\s+)/).map((w, k) => /^\s+$/.test(w) ? w : (
                  <motion.span key={k} className="inline-block" variants={{ hidden: { opacity: 0, y: "0.45em" }, shown: { opacity: 1, y: 0, transition: { duration: 0.5, ease } } }}>{w}</motion.span>
                ))
                : s.tagline}
            </motion.p>
          );
        })}
      </div>
      <div className="relative mt-2.5 h-px overflow-hidden bg-line" aria-hidden>
        {auto && (
          <motion.span key={index} className="absolute inset-0 origin-left bg-civic rtl:origin-right"
            initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: DWELL, ease: "linear" }} />
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1" role="group" aria-label={t("landing.hero.languagesLabel")}>
        {SAMPLES.map((s, i) => (
          <button
            key={s.lang}
            type="button"
            lang={s.lang}
            aria-pressed={i === index}
            onClick={() => setIndex(i)}
            className={cn(
              "relative min-h-10 cursor-pointer rounded-full px-3 text-[12.5px] transition-colors",
              i === index ? "text-civic" : "text-muted hover:bg-paper-2 hover:text-ink",
            )}
            style={{ fontFamily: s.lang === "en" || s.lang === "tl" ? undefined : s.font }}
          >
            {i === index && <motion.span layoutId="ml-chip" className="absolute inset-1 rounded-full bg-civic-soft" transition={{ duration: reduce ? 0 : 0.35, ease }} aria-hidden />}
            <span className="relative">{s.native}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
