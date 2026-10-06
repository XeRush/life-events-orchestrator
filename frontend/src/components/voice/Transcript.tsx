import { motion, useReducedMotion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { useEffect, useRef } from "react";
import { isRTL, useLang, useT } from "../../i18n";
import { cn, fmtTime } from "../../lib/format";
import type { TranscriptLine } from "../../types/api";
import { tx } from "../case/text";

/**
 * The redacted transcript as the server stores it. Line one is always the disclosure and is marked as such.
 * New lines are announced politely to screen readers; the list follows the newest line.
 * Bubbles slide in from their own side and fade (no spring): yours from the end edge, LifeLoop's from the start edge.
 */
export function Transcript({ lines, thinking }: { lines: TranscriptLine[]; thinking?: boolean }) {
  const t = useT();
  const lang = useLang();
  const reduce = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const flip = isRTL(lang) ? -1 : 1;

  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [lines.length, thinking, reduce]);

  return (
    <div ref={box} data-lenis-prevent className="scroll-thin max-h-[46vh] min-h-40 overflow-y-auto px-4 py-4 sm:max-h-[420px] sm:px-6">
      {lines.length === 0 && <p className="py-6 text-sm text-muted">{t("resident.voice.transcript.empty")}</p>}
      <ol className="space-y-3" aria-live="polite" aria-relevant="additions" aria-label={t("resident.voice.transcript.title")}>
        {lines.map((l, i) => {
          const mine = l.role === "RESIDENT";
          const who = l.role === "AGENT" ? t("resident.voice.role.agent") : l.role === "RESIDENT" ? t("resident.voice.role.you")
            : l.role === "OFFICER" ? t("resident.voice.role.officer") : t("resident.voice.role.system");
          return (
            <motion.li
              key={`${l.seq}-${i}`}
              initial={reduce ? false : { opacity: 0, x: (mine ? 14 : -14) * flip, y: 4 }} animate={{ opacity: 1, x: 0, y: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className={cn("flex flex-col", mine ? "items-end" : "items-start")}
            >
              {l.is_disclosure && (
                <span className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-civic/30 bg-civic-soft px-2 py-0.5 text-[11px] font-medium text-civic">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                  {t("resident.voice.disclosure")}
                </span>
              )}
              <div className={cn(
                "max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed",
                mine ? "rounded-ee-md bg-ink text-paper"
                  : l.is_disclosure ? "rounded-es-md border border-civic/30 bg-surface text-ink"
                  : "rounded-es-md border border-line bg-surface text-ink shadow-[var(--shadow-card)]",
              )}>
                {l.text}
              </div>
              <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 px-1 text-[11px] text-muted">
                <span>{who}</span>
                <time dateTime={l.at} className="num">{fmtTime(l.at, lang)}</time>
                {l.sub_agent && l.role === "AGENT" && <span>{t("resident.voice.subAgentLine", { agent: tx(t, `resident.voice.subAgent.${l.sub_agent}`, l.sub_agent) })}</span>}
                {l.tool && <span className="font-mono">{l.tool}</span>}
              </span>
            </motion.li>
          );
        })}
        {thinking && (
          <li className="flex items-center gap-1.5 px-1 text-muted" aria-label={t("resident.voice.state.thinking")}>
            {[0, 1, 2].map((d) => (
              <motion.span key={d} className="h-1.5 w-1.5 rounded-full bg-violet" animate={reduce ? {} : { opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1, repeat: Infinity, delay: d * 0.18 }} />
            ))}
          </li>
        )}
      </ol>
    </div>
  );
}
