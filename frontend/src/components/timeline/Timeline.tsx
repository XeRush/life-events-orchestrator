import gsap from "gsap";
import {
  Baby, Bell, CheckCircle2, CircleDot, FileText, Flag, Phone, RefreshCw, ShieldCheck, TriangleAlert, type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { prefersReducedMotion } from "../../animations/variants";
import type { TimelineItem } from "../../types";
import { cn, fmtDay, fmtTime } from "../../utils/format";

const CATEGORY: Record<string, { icon: LucideIcon; color: string }> = {
  life_event: { icon: Baby, color: "text-ink bg-civic-soft" },
  consent: { icon: ShieldCheck, color: "text-azure bg-azure-soft" },
  workflow: { icon: CircleDot, color: "text-azure bg-azure-soft" },
  milestone: { icon: CheckCircle2, color: "text-civic bg-civic-soft" },
  exception: { icon: TriangleAlert, color: "text-amber bg-amber-soft" },
  action: { icon: FileText, color: "text-amber bg-amber-soft" },
  callback: { icon: Phone, color: "text-violet bg-violet-soft" },
  replan: { icon: RefreshCw, color: "text-violet bg-violet-soft" },
  case: { icon: Flag, color: "text-ink-2 bg-slate-soft" },
};

interface Props {
  items: TimelineItem[];
  showCase?: boolean;
  emptyText?: string;
}

/** Vertical timeline grouped by year and day. GSAP grows the spine and reveals entries as they arrive. */
export function Timeline({ items, showCase, emptyText = "Nothing has happened yet." }: Props) {
  const root = useRef<HTMLOListElement>(null);
  const seen = useRef<Set<string>>(new Set());

  const groups = useMemo(() => {
    const out: { year: string; days: { day: string; key: string; items: TimelineItem[] }[] }[] = [];
    for (const item of items) {
      const d = new Date(item.occurred_at);
      const year = String(d.getFullYear());
      const key = `${year}-${d.getMonth()}-${d.getDate()}`;
      let y = out.find((g) => g.year === year);
      if (!y) out.push((y = { year, days: [] }));
      let day = y.days.find((x) => x.key === key);
      if (!day) y.days.push((day = { day: fmtDay(item.occurred_at), key, items: [] }));
      day.items.push(item);
    }
    return out;
  }, [items]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const fresh = [...el.querySelectorAll<HTMLElement>("[data-entry]")].filter((n) => !seen.current.has(n.dataset.entry!));
    fresh.forEach((n) => seen.current.add(n.dataset.entry!));
    if (prefersReducedMotion() || !fresh.length) return;
    const ctx = gsap.context(() => {
      gsap.from("[data-spine]", { scaleY: 0, transformOrigin: "top", duration: 1, ease: "power2.out" });
      gsap.from(fresh, { opacity: 0, x: -14, duration: 0.5, stagger: 0.06, ease: "power3.out" });
    }, el);
    return () => ctx.revert();
  }, [items]);

  if (!items.length) return <p className="text-sm text-muted">{emptyText}</p>;

  return (
    <ol ref={root} className="relative" aria-label="Timeline">
      <span data-spine aria-hidden className="absolute start-[19px] top-2 bottom-2 w-px bg-line-2" />
      {groups.map((g) => (
        <li key={g.year} className="mb-2">
          <p className="eyebrow ms-14 py-2">{g.year}</p>
          <ol>
            {g.days.map((day) => (
              <li key={day.key} className="mb-5">
                <p className="ms-14 mb-2 font-display text-lg uppercase tracking-wide text-ink-2">{day.day}</p>
                <ol className="space-y-3.5">
                  {day.items.map((it) => {
                    const cat = CATEGORY[it.category] ?? CATEGORY.workflow;
                    const Icon = cat.icon ?? Bell;
                    return (
                      <li key={it.id} data-entry={it.id} className="relative flex gap-4">
                        <span className={cn("z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full border-4 border-paper", cat.color)}>
                          <Icon className="h-4 w-4" aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1 pt-1">
                          <p className="font-mono text-[11.5px] text-faint">
                            {fmtTime(it.occurred_at)}
                            {showCase && it.case_reference && <span className="ms-2 rounded bg-paper-2 px-1.5 py-0.5 text-muted">{it.case_reference}</span>}
                          </p>
                          <p className="text-[15px] font-medium leading-snug">{it.title}</p>
                          {it.description && <p className="mt-0.5 text-sm text-muted">{it.description}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ol>
  );
}
