import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Ban, Lock, MessageSquareText, Mic, PhoneOff, UserRound } from "lucide-react";
import { useState } from "react";
import { Stagger, StaggerItem } from "../../animations/motion";
import { ease } from "../../animations/variants";
import { useT } from "../../i18n";
import { cn } from "../../lib/format";
import { SAMPLES } from "./samples";

/** Language picker + a call transcript: the fixed disclosure always comes first, and "Stop calling" is honoured at once. */
export function VoiceShowcase() {
  const t = useT();
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(1);
  const sample = SAMPLES[index];

  return (
    <div className="mt-8 grid gap-5 lg:mt-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:gap-8">
      {/* languages */}
      <div className="min-w-0">
        <Stagger as="ul" gap={0.05} className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
          {SAMPLES.map((s, i) => {
            const on = i === index;
            return (
              <StaggerItem as="li" key={s.lang}>
                <button
                  type="button" aria-pressed={on} onClick={() => setIndex(i)}
                  className={cn(
                    "relative flex min-h-16 w-full cursor-pointer flex-col items-start gap-0.5 rounded-2xl border px-4 py-3 text-start transition-colors",
                    on ? "border-civic/50" : "border-line hover:border-line-2 hover:bg-stage-2/60",
                  )}
                >
                  {on && <motion.span layoutId="voice-lang" className="absolute inset-0 rounded-[15px] bg-stage-2 shadow-(--shadow-card)" transition={{ duration: reduce ? 0 : 0.35, ease }} aria-hidden />}
                  <span lang={s.lang} dir={s.dir} className="relative text-[1.12rem] leading-tight text-ink" style={{ fontFamily: s.font }}>{s.native}</span>
                  <span className="relative text-[12px] text-muted">{s.lang === "ar" ? t("landing.voice.arabicNote") : s.english}</span>
                </button>
              </StaggerItem>
            );
          })}
        </Stagger>
        <ul className="mt-5 space-y-2.5 text-[14.5px] leading-relaxed text-ink-2">
          <li className="flex gap-3"><Mic className="mt-1 h-4 w-4 shrink-0 text-civic" aria-hidden />{t("landing.voice.point1")}</li>
          <li className="flex gap-3"><MessageSquareText className="mt-1 h-4 w-4 shrink-0 text-civic" aria-hidden />{t("landing.voice.point2")}</li>
          <li className="flex gap-3"><PhoneOff className="mt-1 h-4 w-4 shrink-0 text-civic" aria-hidden />{t("landing.voice.point3")}</li>
        </ul>
      </div>

      {/* transcript */}
      <figure className="card-night relative min-w-0 overflow-hidden p-4 shadow-(--shadow-card) sm:p-6">
        <figcaption className="flex items-center justify-between gap-3">
          <span className="eyebrow">{t("landing.voice.transcriptTitle")}</span>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-rose-soft px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-rose">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose" aria-hidden />{t("landing.voice.recorded")}
          </span>
        </figcaption>

        <Stagger as="ol" gap={0.18} delay={0.1} className="mt-4 space-y-3.5">
          <StaggerItem as="li">
            <p className="mb-1.5 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-civic">
              <Lock className="h-3.5 w-3.5" aria-hidden />{t("landing.voice.disclosureTag")}
            </p>
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={sample.lang}
                lang={sample.lang}
                dir={sample.dir}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.4, ease } }}
                exit={reduce ? undefined : { opacity: 0, transition: { duration: 0.15 } }}
                className="rounded-2xl rounded-ss-md border border-civic/30 bg-civic-soft/60 px-4 py-3 text-[15px] leading-relaxed text-ink"
                style={{ fontFamily: sample.font === "var(--font-display)" ? "var(--font-sans)" : sample.font, lineHeight: sample.lang === "ur" ? 2.1 : undefined }}
              >
                {sample.disclosure}
              </motion.p>
            </AnimatePresence>
          </StaggerItem>
          <StaggerItem as="li" className="flex justify-end">
            <div className="max-w-[85%]">
              <p className="mb-1.5 flex items-center justify-end gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted"><UserRound className="h-3.5 w-3.5" aria-hidden />{t("landing.voice.caller")}</p>
              <p className="rounded-2xl rounded-se-md bg-ink px-4 py-3 text-[15px] text-paper">{t("landing.voice.stopUtterance")}</p>
            </div>
          </StaggerItem>
          <StaggerItem as="li">
            <p className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">{t("landing.voice.agent")}</p>
            <p className="rounded-2xl rounded-ss-md border border-line bg-paper px-4 py-3 text-[15px] leading-relaxed text-ink-2">{t("landing.voice.stopReply")}</p>
          </StaggerItem>
          <StaggerItem as="li" className="flex flex-wrap items-center gap-2 border-t border-line pt-3.5 text-[12.5px] text-muted">
            <Ban className="h-4 w-4 text-rose" aria-hidden />
            <span>{t("landing.voice.stopEffect")}</span>
          </StaggerItem>
        </Stagger>
      </figure>
    </div>
  );
}
