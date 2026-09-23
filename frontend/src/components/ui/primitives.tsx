import { AnimatePresence, motion } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useT } from "../../i18n";
import { cn } from "../../utils/format";
import { TONE_CLASSES, type Tone } from "../../utils/status";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "light";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:bg-ink-2 shadow-sm",
  secondary: "bg-surface text-ink border border-line-2 hover:border-ink/40 hover:bg-paper-2",
  ghost: "text-ink-2 hover:bg-paper-2",
  danger: "bg-rose text-white hover:bg-rose/90",
  light: "bg-paper text-ink hover:bg-white",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = "primary", size = "md", loading, icon, className, children, disabled, ...rest }: ButtonProps) {
  const sizes = { sm: "h-8 px-3 text-[13px] gap-1.5", md: "h-10 px-4 text-sm gap-2", lg: "h-12 px-6 text-[15px] gap-2.5" };
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center rounded-full font-medium whitespace-nowrap transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
        sizes[size], VARIANTS[variant], className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cn("card", className)}>
      {children}
    </div>
  );
}

export function Badge({ tone = "slate", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  const t = TONE_CLASSES[tone];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", t.bg, t.text, t.border, className)}>
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", t.dot)} aria-hidden />}
      {children}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  const t = useT();
  return (
    <div role="status" className="flex items-center gap-2 text-sm text-muted">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label ?? t("common.loading")}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-paper-2", className)} />;
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line-2 px-6 py-10 text-center">
      <p className="font-display text-lg">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: string; title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-3xl leading-tight sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-[15px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
          <motion.div
            ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
            initial={{ y: 24, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className={cn("relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-surface p-6 shadow-[var(--shadow-pop)] outline-none sm:rounded-3xl sm:p-8", wide ? "max-w-2xl" : "max-w-lg")}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <h2 className="text-2xl">{title}</h2>
              <button onClick={onClose} aria-label={t("common.close")} className="rounded-full p-1.5 text-muted hover:bg-paper-2 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ProgressBar({ percent, tone = "civic", label }: { percent: number; tone?: Tone; label?: string }) {
  return (
    <div role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={label} className="h-1.5 w-full overflow-hidden rounded-full bg-paper-2">
      <motion.div className="h-full rounded-full" style={{ background: TONE_CLASSES[tone].solid }} initial={{ width: 0 }} animate={{ width: `${percent}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
    </div>
  );
}

export function Ring({ percent, size = 96, label }: { percent: number; size?: number; label?: string }) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }} role="img" aria-label={`${label ?? "Completion"} ${percent}%`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-paper-2)" strokeWidth="8" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-civic)" strokeWidth="8" strokeLinecap="round" strokeDasharray={c}
          initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - percent / 100) }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-display text-2xl">{percent}%</span>
    </div>
  );
}

export function Toasts({ toasts, dismiss }: { toasts: { id: number; tone: "info" | "success" | "error"; text: string }[]; dismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id} layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            className={cn("pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl px-4 py-3 text-sm shadow-[var(--shadow-pop)]",
              t.tone === "error" ? "bg-rose text-white" : t.tone === "success" ? "bg-civic text-white" : "bg-ink text-paper")}
          >
            <span className="flex-1">{t.text}</span>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="opacity-80 hover:opacity-100 cursor-pointer"><X className="h-4 w-4" /></button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function Logo({ light, size = 28 }: { light?: boolean; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
        <rect width="64" height="64" rx="15" fill={light ? "#f7f5f0" : "#14202b"} />
        <circle cx="32" cy="32" r="9" fill="#4fd1a5" />
        <circle cx="32" cy="32" r="18" fill="none" stroke={light ? "#14202b" : "#f7f5f0"} strokeWidth="3" strokeDasharray="70 43" strokeLinecap="round" />
      </svg>
      <span className={cn("font-display text-xl tracking-[0.08em]", light ? "text-paper" : "text-ink")}>LIFELOOP</span>
    </span>
  );
}
