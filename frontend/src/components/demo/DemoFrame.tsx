import { FlaskConical } from "lucide-react";
import type { ReactNode } from "react";
import { useT } from "../../i18n";
import { cn } from "../../lib/format";

/**
 * Amber dashed "DEMO / SIMULATION" frame. Everything inside it is a demo tool, visibly separate from the real
 * officer interface: different colour, different border, a hazard stripe and a standing explanation.
 */
export function DemoFrame({ children, note }: { children: ReactNode; note?: ReactNode }) {
  const t = useT();
  return (
    <div className="relative mt-4 rounded-[24px] border-2 border-dashed border-amber/60 bg-amber-soft/25 p-3 pt-6 sm:p-5 sm:pt-7">
      <span className="absolute -top-3.5 start-5 inline-flex items-center gap-1.5 rounded-full bg-amber px-3 py-1 font-mono text-[10.5px] font-semibold uppercase tracking-[0.2em] text-on-accent shadow-sm">
        <FlaskConical className="h-3.5 w-3.5" aria-hidden />{t("demo.frame.badge")}
      </span>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-6 top-0 h-1.5 rounded-b-full opacity-60"
        style={{ backgroundImage: "repeating-linear-gradient(135deg, var(--color-amber) 0 8px, transparent 8px 16px)" }}
      />
      <p className="mb-4 max-w-4xl rounded-xl border border-amber/30 bg-surface/70 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ink-2">
        {note ?? t("demo.frame.note")}
      </p>
      {children}
    </div>
  );
}

/** A titled card inside the demo frame. */
export function DemoPanel({ title, hint, action, children, className, id }: { title: ReactNode; hint?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section aria-labelledby={id} className={cn("card min-w-0 p-4 sm:p-5", className)}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={id} className="text-[1.2rem] leading-tight">{title}</h2>
          {hint && <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
