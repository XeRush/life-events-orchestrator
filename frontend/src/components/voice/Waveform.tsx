import { motion } from "framer-motion";
import { prefersReducedMotion } from "../../animations/variants";
import { cn } from "../../utils/format";

export type VoiceState = "idle" | "listening" | "thinking" | "speaking";

const BARS = 41;

/** Animated waveform. Amplitude and colour follow the assistant state (idle / listening / thinking / speaking). */
export function Waveform({ state }: { state: VoiceState }) {
  const reduce = prefersReducedMotion();
  const amp = { idle: 0.08, listening: 0.45, thinking: 0.22, speaking: 1 }[state];
  const color = { idle: "bg-line-2", listening: "bg-azure", thinking: "bg-violet", speaking: "bg-civic" }[state];
  return (
    <div className="flex h-28 items-center justify-center gap-[3px]" role="img" aria-label={`Assistant is ${state}`}>
      {Array.from({ length: BARS }).map((_, i) => {
        const envelope = Math.sin((i / (BARS - 1)) * Math.PI); // taller in the middle
        const base = 8 + envelope * 64 * amp;
        return (
          <motion.span
            key={i}
            className={cn("w-[3px] rounded-full", color)}
            animate={reduce ? { height: base } : { height: state === "idle" ? base : [base * 0.35, base, base * 0.55, base * 0.9, base * 0.4] }}
            transition={{ duration: state === "thinking" ? 1.6 : 0.9 + (i % 5) * 0.08, repeat: Infinity, ease: "easeInOut", delay: (i % 9) * 0.05 }}
          />
        );
      })}
    </div>
  );
}
