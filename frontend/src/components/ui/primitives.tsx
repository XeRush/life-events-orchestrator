import { AnimatePresence, motion } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { useT } from "../../i18n";
import { cn } from "../../lib/format";
import { TONE, type Tone } from "../../lib/status";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "light" | "civic";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:bg-ink-2 shadow-sm",
  secondary: "bg-surface text-ink border border-line-2 hover:border-ink/40 hover:bg-paper-2",
  ghost: "text-ink-2 hover:bg-paper-2",
  danger: "bg-rose text-on-accent hover:bg-rose/90",
  light: "border border-line bg-surface text-ink hover:bg-paper-2",
  civic: "bg-civic text-on-accent hover:bg-civic/90 shadow-sm",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon, className, children, disabled, type = "button", ...rest }, ref,
) {
  const sizes = { sm: "min-h-8 px-3 py-1 text-[13px] gap-1.5", md: "min-h-10 px-4 py-1.5 text-sm gap-2", lg: "min-h-12 px-6 py-2 text-[15px] gap-2.5" };
  return (
    <button
      ref={ref}
      type={type}
      {...rest}
      disabled={disabled || loading}
      className={cn(
        "inline-flex max-w-full cursor-pointer items-center justify-center text-center leading-tight rounded-full font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 [&>svg]:shrink-0",
        sizes[size], VARIANTS[variant], className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cn("card", className)}>{children}</div>;
}

export function Badge({ tone = "slate", children, className, icon, dot }: { tone?: Tone; children: ReactNode; className?: string; icon?: ReactNode; dot?: boolean }) {
  const t = TONE[tone];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium", t.bg, t.text, t.border, className)}>
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", t.dot)} aria-hidden />}
      {icon}
      {children}
    </span>
  );
}

export function Spinner({ label, className }: { label?: string; className?: string }) {
  const t = useT();
  return (
    <div role="status" className={cn("flex items-center gap-2 text-sm text-muted", className)}>
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label ?? t("common.loading")}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("shimmer rounded-lg", className)} />;
}

export function EmptyState({ title, hint, action, icon }: { title: string; hint?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line-2 px-6 py-10 text-center">
      {icon && <div className="mb-1 text-faint">{icon}</div>}
      <p className="font-display text-lg">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useT();
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-2xl border border-rose/30 bg-rose-soft px-5 py-4 text-sm text-rose">
      <span>{(error as Error)?.message ?? t("common.error")}</span>
      {onRetry && <Button size="sm" variant="secondary" onClick={onRetry}>{t("common.retry")}</Button>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, subtitle, actions, children }: { eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-3xl leading-tight sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-[15px] text-muted">{subtitle}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function SectionTitle({ title, hint, action }: { title: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-xl">{title}</h2>
        {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
          <motion.div
            ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
            initial={{ y: 24, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className={cn("relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-surface p-6 shadow-[var(--shadow-pop)] outline-none sm:rounded-3xl sm:p-8", wide ? "max-w-3xl" : "max-w-lg")}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <h2 className="text-2xl">{title}</h2>
              <button onClick={onClose} aria-label={t("common.close")} className="cursor-pointer rounded-full p-1.5 text-muted hover:bg-paper-2">
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

export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  const t = useT();
  useEffect(() => {
    if (!open) return;
    // A modal opened from inside the drawer handles Escape itself; only the top-most dialog closes.
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && document.querySelectorAll('[aria-modal="true"]').length <= 1 && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/35 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
          <motion.aside
            role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-y-0 end-0 flex w-full max-w-md flex-col overflow-y-auto bg-surface shadow-[var(--shadow-pop)] rtl:[--tw-translate-x:0]"
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-surface/95 px-6 py-5 backdrop-blur">
              <div className="min-w-0 flex-1">{typeof title === "string" ? <h2 className="text-2xl">{title}</h2> : title}</div>
              <button onClick={onClose} aria-label={t("common.close")} className="cursor-pointer rounded-full p-1.5 text-muted hover:bg-paper-2"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 px-6 py-5">{children}</div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ProgressBar({ percent, tone = "civic", label }: { percent: number; tone?: Tone; label?: string }) {
  return (
    <div role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={label} className="h-1.5 w-full overflow-hidden rounded-full bg-paper-2">
      <motion.div className="h-full rounded-full" style={{ background: TONE[tone].solid }} initial={{ width: 0 }} animate={{ width: `${percent}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
    </div>
  );
}

export function Ring({ percent, size = 96, label, children }: { percent: number; size?: number; label?: string; children?: ReactNode }) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label ?? "Completion"} ${percent}%`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-paper-2)" strokeWidth="8" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-civic)" strokeWidth="8" strokeLinecap="round" strokeDasharray={c}
          initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - percent / 100) }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-display text-2xl">{children ?? `${percent}%`}</span>
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
              t.tone === "error" ? "bg-rose text-on-accent" : t.tone === "success" ? "bg-civic text-on-accent" : "bg-ink text-paper")}
          >
            <span className="flex-1">{t.text}</span>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="cursor-pointer opacity-80 hover:opacity-100"><X className="h-4 w-4" /></button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function Logo({ light, size = 28, wordmark = true, compactBelowSm = false }: { light?: boolean; size?: number; wordmark?: boolean; compactBelowSm?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5" dir="ltr">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
        <rect width="64" height="64" rx="16" className={light ? "fill-paper" : "fill-ink"} />
        <path d="M32 14a18 18 0 1 1-17.2 12.7" fill="none" className={light ? "stroke-ink" : "stroke-paper"} strokeWidth="3.4" strokeLinecap="round" />
        <circle cx="14.8" cy="26.7" r="3.6" fill="#4fd1a5" className="origin-center animate-[logo-dot_2.4s_ease-in-out_infinite] [transform-box:fill-box]" />
        <circle cx="32" cy="32" r="7" fill="#4fd1a5" />
      </svg>
      {wordmark && <span className={cn("font-display text-[21px] tracking-[0.02em]", light ? "text-paper" : "text-ink", compactBelowSm && "hidden sm:inline")}>LifeLoop</span>}
    </span>
  );
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> { label: string; hint?: string; error?: string | null }
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ label, hint, error, className, id, ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <label htmlFor={fid} className={cn("block", className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</span>
      <input
        ref={ref} id={fid} aria-invalid={!!error} aria-describedby={hint || error ? `${fid}-hint` : undefined} {...rest}
        className={cn("h-11 w-full rounded-xl border bg-surface px-3.5 text-[15px] outline-none transition-colors placeholder:text-faint focus:border-ink/50 focus:ring-2 focus:ring-ink/10",
          error ? "border-rose" : "border-line-2")}
      />
      {(hint || error) && <span id={`${fid}-hint`} className={cn("mt-1 block text-xs", error ? "text-rose" : "text-muted")}>{error ?? hint}</span>}
    </label>
  );
});

export function SelectField({ label, hint, children, className, id, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <label htmlFor={fid} className={cn("block", className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</span>
      <select id={fid} {...rest} className="h-11 w-full cursor-pointer rounded-xl border border-line-2 bg-surface px-3 text-[15px] outline-none focus:border-ink/50 focus:ring-2 focus:ring-ink/10">
        {children}
      </select>
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function TextArea({ label, className, id, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <label htmlFor={fid} className={cn("block", className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</span>
      <textarea id={fid} {...rest} className="min-h-24 w-full rounded-xl border border-line-2 bg-surface px-3.5 py-2.5 text-[15px] outline-none focus:border-ink/50 focus:ring-2 focus:ring-ink/10" />
    </label>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-[15px] font-medium">{label}</label>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      <button
        id={id} role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={cn("relative mt-0.5 h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors disabled:opacity-50", checked ? "bg-civic" : "bg-line-2")}
      >
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] dark:bg-ink", checked ? "start-[22px]" : "start-0.5")} />
      </button>
    </div>
  );
}

export function Checkbox({ checked, onChange, label, description, required }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; required?: boolean }) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors", checked ? "border-civic/50 bg-civic-soft/50" : "border-line hover:border-line-2")}>
      <input id={id} type="checkbox" checked={checked} required={required} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4 cursor-pointer accent-[var(--color-civic)]" />
      <span className="min-w-0">
        <span className="block text-[15px] font-medium">{label}</span>
        {description && <span className="mt-0.5 block text-sm text-muted">{description}</span>}
      </span>
    </label>
  );
}

export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; count?: number }[]; className?: string }) {
  const pill = useId();
  return (
    <div role="tablist" className={cn("inline-flex max-w-full flex-wrap gap-1 rounded-full border border-line bg-surface p-1", className)}>
      {items.map((it) => {
        const active = value === it.value;
        return (
          <button
            key={it.value} role="tab" aria-selected={active} onClick={() => onChange(it.value)}
            className={cn("relative inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors", active ? "text-paper" : "text-ink-2 hover:bg-paper-2")}
          >
            {active && <motion.span layoutId={pill} className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", stiffness: 420, damping: 36 }} aria-hidden />}
            <span className="relative inline-flex items-center gap-1.5">
              {it.label}
              {it.count != null && <span className={cn("rounded-full px-1.5 text-[11px]", active ? "bg-paper/20" : "bg-paper-2")}>{it.count}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function KeyValue({ items, className }: { items: { label: ReactNode; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-line", className)}>
      {items.map((it, i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
          <dt className="text-muted">{it.label}</dt>
          <dd className="text-end font-medium">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Stat({ label, value, hint, icon, tone = "slate" }: { label: ReactNode; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: Tone }) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="eyebrow">{label}</span>
        {icon && <span className={cn("grid h-8 w-8 place-items-center rounded-full", TONE[tone].bg, TONE[tone].text)}>{icon}</span>}
      </div>
      <span className="font-display text-4xl leading-none">{value}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </Card>
  );
}
