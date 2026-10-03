import { motion } from "framer-motion";
import { prefersReducedMotion } from "../../animations/variants";
import type { AgentState } from "../../hooks/useVoiceCall";
import { useT } from "../../i18n";
import { cn } from "../../lib/format";

const AMP: Record<AgentState, number> = { idle: 0.08, connecting: 0.15, listening: 0.45, thinking: 0.22, speaking: 1, ended: 0.05 };
const COLOR: Record<AgentState, string> = {
  idle: "bg-line-2", connecting: "bg-azure/60", listening: "bg-azure", thinking: "bg-violet", speaking: "bg-civic", ended: "bg-line-2",
};

/**
 * Animated waveform. Amplitude, rhythm and colour follow the assistant state (idle / connecting / listening /
 * thinking / speaking / ended). Thinking breathes slowly; speaking moves fast; muted flattens the bars.
 * Bars scale on the Y axis only (transform), so the animation never triggers layout.
 * The accessible name is the translated state, so screen readers hear the same thing sighted users see.
 * `dark` is accepted for older call sites and ignored: colours follow the theme.
 */
export function Waveform({ state, muted = false, size = "lg", className }: {
  state: AgentState; dark?: boolean; muted?: boolean; size?: "sm" | "lg"; className?: string;
}) {
  const t = useT();
  const reduce = prefersReducedMotion();
  const bars = size === "lg" ? 41 : 23;
  const box = size === "lg" ? 76 : 32;
  const amp = muted ? 0.06 : AMP[state];
  const still = state === "idle" || state === "ended" || muted;
  const color = muted ? "bg-line-2" : COLOR[state];
  return (
    <div className={cn("flex items-center justify-center gap-[3px]", size === "lg" ? "h-24" : "h-10", className)} role="img" aria-label={t(`resident.voice.state.${state}`)}>
      {Array.from({ length: bars }).map((_, i) => {
        const envelope = Math.sin((i / (bars - 1)) * Math.PI); // taller in the middle
        const base = Math.min(1, ((size === "lg" ? 6 : 4) + envelope * (box - 8) * amp) / box);
        return (
          <motion.span
            key={i}
            className={cn("rounded-full transition-colors duration-500", size === "lg" ? "w-[3px]" : "w-[2px]", color)}
            style={{ height: box }}
            initial={false}
            animate={reduce || still ? { scaleY: base } : { scaleY: [base * 0.35, base, base * 0.55, base * 0.9, base * 0.4] }}
            transition={reduce || still
              ? { duration: 0.4 }
              : { duration: state === "thinking" ? 1.6 : state === "speaking" ? 0.7 + (i % 5) * 0.06 : 0.9 + (i % 5) * 0.08, repeat: Infinity, ease: "easeInOut", delay: (i % 9) * 0.05 }}
          />
        );
      })}
    </div>
  );
}
