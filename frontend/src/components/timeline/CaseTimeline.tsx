import { motion, useReducedMotion } from "framer-motion";
import { gsap } from "../../animations/motion";
import { Footprints } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { prefersReducedMotion } from "../../animations/variants";
import { LANGUAGES, isRTL, useLang, useT, type MessageKey, type TFunction } from "../../i18n";
import en from "../../i18n/en";
import { cn, fmtDate, fmtTime } from "../../lib/format";
import { SOURCE, TONE } from "../../lib/status";
import type { Lang, Source, TimelineEvent } from "../../types/api";

const SOURCES: Source[] = ["AI_AGENT", "GOVERNMENT_MOCK", "PARENT_REPORTED", "HUMAN_OFFICER", "RESIDENT", "SYSTEM"];

const known = (key: string): key is MessageKey => Object.hasOwn(en, key);

/** How each backend i18n param (a code, never English text) becomes words. Unlisted params (ref, count, ...) pass through. */
const PARAM_KEYS: Record<string, string> = {
  node: "node.", entity: "tl.entity.", type: "tl.consentType.", reason: "tl.reason.", cbReason: "tl.cbReason.",
  method: "tl.method.", channel: "tl.channel.", emirate: "resident.emirate.", doc: "resident.doc.type.",
};

function localiseParam(name: string, value: string, t: TFunction, lang: Lang): string | null {
  if (name === "docs") {
    const keys = value.split(",").filter(Boolean).map((d) => `resident.doc.type.${d}`);
    return keys.length && keys.every(known) ? keys.map((k) => t(k as MessageKey)).join(lang === "ar" || lang === "ur" ? "، " : ", ") : null;
  }
  if (name === "date") return /^\d{4}-\d{2}-\d{2}/.test(value) ? fmtDate(value.slice(0, 10), lang, { day: "numeric", month: "long", year: "numeric" }) : null;
  if (name === "language") return LANGUAGES.find((l) => l.code === value)?.native ?? null;
  const prefix = PARAM_KEYS[name];
  if (!prefix) return value;
  const key = `${prefix}${value}`;
  return known(key) ? t(key) : null;
}

/** Renders a dictionary key with the event's params, or null when the key or any placeholder's value is missing. */
function render(key: string, params: Record<string, string>, t: TFunction, lang: Lang): string | null {
  if (!known(key)) return null;
  const values: Record<string, string> = {};
  for (const [, name] of en[key].matchAll(/\{(\w+)\}/g)) {
    const raw = params[name];
    const value = raw === undefined || raw === null || raw === "" ? null : localiseParam(name, String(raw), t, lang);
    if (value === null) return null;
    values[name] = value;
  }
  return t(key, values);
}

/** Where a localised description comes from: "tl.<key>.desc", a family line such as "tl.consulate.desc", or an existing key. */
function descriptionKeys(key: string, params: Record<string, string>): string[] {
  if (key === "timeline.consent") return [`resident.consent.${params.type}.scope`];
  return [`tl.${key}.desc`, `tl.${key.split(".")[0]}.desc`];
}

/** Title and description for a timeline entry in the UI language.
 * English shows the backend's own title and description, exactly as recorded (officers, admins and the audit view rely on it).
 * Other languages render "tl.<i18n key>" with localised params, falling back to the English title when there is no key; the raw
 * English description is never shown there - only a localised one, or nothing. */
export function timelineText(e: TimelineEvent, t: TFunction, lang: Lang): { title: string; description: string } {
  if (lang === "en") return { title: e.title, description: e.description };
  const key = e.i18n?.key;
  if (!key) return { title: e.title, description: "" };
  const params = e.i18n?.params ?? {};
  const title = render(`tl.${key}`, params, t, lang) ?? e.title;
  const description = descriptionKeys(key, params).map((k) => render(k, params, t, lang)).find((d) => d !== null) ?? "";
  return { title, description };
}

export function useTimelineText() {
  const t = useT();
  const lang = useLang();
  return useCallback((e: TimelineEvent) => timelineText(e, t, lang), [t, lang]);
}

/** Chronological, grouped by day. Every entry shows who said it (source + actor), when, and the status it produced.
 * Entries rise in as they scroll into view; an entry that arrives live (SSE) slides in the same way. */
export function CaseTimeline({ events, compact = false, limit, filterable = true }: { events: TimelineEvent[]; compact?: boolean; limit?: number; filterable?: boolean }) {
  const t = useT();
  const lang = useLang();
  const text = useTimelineText();
  const reduce = useReducedMotion();
  const shift = (isRTL(lang) ? 1 : -1) * 8;
  const [hidden, setHidden] = useState<Set<Source>>(new Set());
  const line = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => {
    const sorted = [...events].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    const filtered = sorted.filter((e) => !hidden.has(e.source));
    return limit ? filtered.slice(-limit) : filtered;
  }, [events, hidden, limit]);
  const days = useMemo(() => {
    const groups: { day: string; items: TimelineEvent[] }[] = [];
    shown.forEach((e) => {
      const day = fmtDate(e.occurred_at, lang, { weekday: "short", day: "numeric", month: "long" });
      if (groups.at(-1)?.day === day) groups.at(-1)!.items.push(e);
      else groups.push({ day, items: [e] });
    });
    return groups;
  }, [shown, lang]);

  // The rail draws once, on first view; live updates never redraw it.
  useEffect(() => {
    if (!line.current || prefersReducedMotion()) return;
    const tween = gsap.fromTo(line.current, { scaleY: 0 }, {
      scaleY: 1, transformOrigin: "top", duration: 1, ease: "power3.out",
      scrollTrigger: { trigger: line.current, start: "top 90%", once: true },
    });
    return () => { tween.scrollTrigger?.kill(); tween.kill(); };
  }, []);

  let n = 0;
  return (
    <div>
      {filterable && (
        <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label={t("timeline.filter")}>
          {SOURCES.filter((s) => events.some((e) => e.source === s)).map((s) => {
            const m = SOURCE[s];
            const on = !hidden.has(s);
            const Icon = m.icon;
            return (
              <button key={s} aria-pressed={on} onClick={() => setHidden((h) => { const next = new Set(h); if (on) next.add(s); else next.delete(s); return next; })}
                className={cn("inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors sm:min-h-8 sm:px-2.5",
                  on ? cn(TONE[m.tone].bg, TONE[m.tone].text, TONE[m.tone].border) : "border-line text-faint line-through")}>
                <Icon className="h-3.5 w-3.5" aria-hidden /> {t(`source.${s}`)}
              </button>
            );
          })}
        </div>
      )}
      <ol className={cn("relative", compact ? "space-y-5" : "space-y-6")}>
        <div ref={line} aria-hidden className="absolute start-[7px] top-2 bottom-2 w-px bg-line-2" />
        {days.map((g) => (
          <li key={g.day} className="relative">
            <motion.p className="eyebrow mb-2.5 ps-7" initial={reduce ? false : { opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.4 }}>
              {g.day}
            </motion.p>
            <ol className={compact ? "space-y-3" : "space-y-2.5"}>
              {g.items.map((e) => {
                const m = SOURCE[e.source];
                const Icon = m.icon;
                const { title, description } = text(e);
                const i = n++;
                return (
                  <motion.li key={e.id}
                    initial={reduce ? false : { opacity: 0, x: shift }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: "0px 0px -6% 0px" }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: Math.min(i * 0.04, 0.32) }}
                    className="relative grid grid-cols-[16px_minmax(0,1fr)] gap-3">
                    <span className={cn("relative z-10 mt-1.5 h-[15px] w-[15px] rounded-full border-2 border-paper", TONE[m.tone].dot)} aria-hidden />
                    <div className={cn("min-w-0 rounded-xl", !compact && "border border-line bg-surface px-4 py-3 transition-[border-color,box-shadow] duration-300 hover:border-line-2 hover:shadow-[var(--shadow-card)]")}>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <p className="min-w-0 font-medium leading-snug">{title}</p>
                        <time className="num shrink-0 text-xs text-faint" dateTime={e.occurred_at}>{fmtTime(e.occurred_at, lang)}</time>
                      </div>
                      {description && !compact && <p className="mt-1 text-sm text-muted">{description}</p>}
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className={cn("inline-flex items-center gap-1 font-medium", TONE[m.tone].text)}><Icon className="h-3.5 w-3.5" aria-hidden />{t(`source.${e.source}`)}</span>
                        <span className="text-faint">{e.actor}</span>
                        {e.status && <span className="font-mono text-[10.5px] uppercase tracking-wider text-faint">{e.status.replace(/_/g, " ")}</span>}
                        {e.resident_present && <span className="inline-flex items-center gap-1 text-amber"><Footprints className="h-3.5 w-3.5" aria-hidden />{t("timeline.inPerson")}</span>}
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </ol>
          </li>
        ))}
      </ol>
    </div>
  );
}
