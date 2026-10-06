import { ArrowLeft, Bot, Landmark, ShieldCheck, UserRound, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../api/client";
import { useT } from "../../i18n";
import { cn } from "../../lib/format";
import type { Tone } from "../../lib/status";
import { LiveDot } from "../layout/Shells";
import { Badge, ErrorState } from "../ui/primitives";
import { asOwner, type Owner } from "./text";

const OWNER_META: Record<Owner, { tone: Tone; icon: LucideIcon }> = {
  PARENT: { tone: "amber", icon: UserRound },
  OFFICER: { tone: "violet", icon: ShieldCheck },
  ENTITY: { tone: "civic", icon: Landmark },
  AGENT: { tone: "azure", icon: Bot },
  SYSTEM: { tone: "azure", icon: Bot },
};

/** Who acts next: You / Amer officer / Authority / LifeLoop. Icon + text, never colour alone. */
export function OwnerBadge({ owner, className }: { owner: string | null | undefined; className?: string }) {
  const t = useT();
  const o = asOwner(owner);
  const m = OWNER_META[o];
  const Icon = m.icon;
  return <Badge tone={m.tone} className={className} icon={<Icon className="h-3.5 w-3.5" aria-hidden />}>{t(`owner.${o}`)}</Badge>;
}

/** Page header for the case sub-pages: a way back to the case, the reference, and the live connection. */
export function CaseHeader({ reference, title, subtitle, connected, actions, back = true }: {
  reference: string; title: ReactNode; subtitle?: ReactNode; connected?: boolean; actions?: ReactNode; back?: boolean;
}) {
  const t = useT();
  return (
    <header className="mb-6">
      {back && (
        <Link to={`/app/cases/${reference}`}
          className="group -ms-1 mb-2 inline-flex min-h-10 items-center gap-1.5 rounded-full px-1 text-sm text-muted transition-colors hover:text-ink">
          <ArrowLeft className="h-4 w-4 rtl-flip" aria-hidden />
          {t("resident.case.back")}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="eyebrow mb-1.5 num">{t("resident.case.eyebrow", { ref: reference })}</p>
          <h1 className="text-3xl leading-tight sm:text-[38px]">{title}</h1>
          {subtitle && <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-muted">{subtitle}</p>}
        </div>
        {(connected !== undefined || actions) && (
          <div className="flex flex-wrap items-center gap-2">{connected !== undefined && <LiveDot connected={connected} />}{actions}</div>
        )}
      </div>
    </header>
  );
}

/** A case that cannot be loaded: say why, and offer the way back. */
export function CaseError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useT();
  const notFound = error instanceof ApiError && (error.status === 404 || error.status === 403);
  return (
    <div className="max-w-xl space-y-4 py-6">
      <h1 className="text-3xl">{notFound ? t("resident.case.notFoundTitle") : t("resident.case.errorTitle")}</h1>
      <p className="text-muted">{notFound ? t("resident.case.notFoundHint") : t("resident.case.errorHint")}</p>
      {!notFound && <ErrorState error={error} onRetry={onRetry} />}
      <LinkButton to="/app" variant="secondary" icon={<ArrowLeft className="h-4 w-4 rtl-flip" aria-hidden />}>{t("resident.case.home")}</LinkButton>
    </div>
  );
}

const LINK_VARIANTS = {
  primary: "bg-ink text-paper hover:bg-ink-2 shadow-sm",
  secondary: "bg-surface text-ink border border-line-2 hover:border-ink/40 hover:bg-paper-2",
  ghost: "text-ink-2 hover:bg-paper-2",
  civic: "bg-civic text-on-accent hover:bg-civic/90 shadow-sm",
  light: "border border-line bg-surface text-ink hover:bg-paper-2",
  night: "border border-line-2 text-ink hover:bg-paper-2",
} as const;
const LINK_SIZES = { sm: "min-h-8 px-3 py-1 text-[13px] gap-1.5", md: "min-h-10 px-4 py-1.5 text-sm gap-2", lg: "min-h-12 px-6 py-2 text-[15px] gap-2.5" } as const;

/** A link that looks like a Button (navigation stays a real <a>, never a button inside a link). */
export function LinkButton({ to, variant = "primary", size = "md", icon, children, className, state }: {
  to: string; variant?: keyof typeof LINK_VARIANTS; size?: keyof typeof LINK_SIZES; icon?: ReactNode; children: ReactNode; className?: string; state?: unknown;
}) {
  return (
    <Link to={to} state={state}
      className={cn("inline-flex max-w-full items-center justify-center text-center leading-tight rounded-full font-medium transition-[color,background-color,border-color,transform] duration-200 active:scale-[0.97] [&>svg]:shrink-0",
        LINK_SIZES[size], LINK_VARIANTS[variant], className)}>
      {icon}
      {children}
    </Link>
  );
}

/** Small titled panel used down the side of the case pages. */
export function Panel({ title, action, children, className, id }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section aria-labelledby={id ? `${id}-title` : undefined} id={id} className={cn("card p-4 sm:p-5", className)}>
      <div className="mb-2.5 flex items-start justify-between gap-3">
        <h2 id={id ? `${id}-title` : undefined} className="text-lg leading-snug">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Small "Open ..." link used in section headers. */
export function SectionLink({ to, icon: Icon, children }: { to: string; icon?: LucideIcon; children: ReactNode }) {
  return (
    <Link to={to} className="group inline-flex min-h-10 shrink-0 items-center gap-1.5 text-sm font-medium text-azure underline-offset-4 hover:underline sm:min-h-0">
      {Icon && <Icon className="h-4 w-4" aria-hidden />}{children}
    </Link>
  );
}
