import { FlaskConical, UserRound } from "lucide-react";
import { useT } from "../../i18n";
import { cn } from "../../lib/format";
import { CALLBACK, CASE_STATUS, DOC_STATUS, NODE_STATE, RISK, SOURCE } from "../../lib/status";
import type { CallbackStatus, CaseStatus, DocStatus, NodeState, Risk, Source } from "../../types/api";
import { Badge } from "./primitives";

const icon = (Icon: typeof UserRound, spin?: boolean) => <Icon className={cn("h-3.5 w-3.5", spin && "animate-spin")} aria-hidden />;

export function NodeStateBadge({ state, className }: { state: NodeState; className?: string }) {
  const t = useT();
  const m = NODE_STATE[state];
  return <Badge tone={m.tone} icon={icon(m.icon, m.spin)} className={className}>{t(`state.${state}`)}</Badge>;
}

export function SourceBadge({ source, className }: { source: Source; className?: string }) {
  const t = useT();
  const m = SOURCE[source];
  return <Badge tone={m.tone} icon={icon(m.icon)} className={className}>{t(`source.${source}`)}</Badge>;
}

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  const t = useT();
  const m = CASE_STATUS[status];
  return <Badge tone={m.tone} icon={icon(m.icon)}>{t(`case.status.${status}`)}</Badge>;
}

export function RiskBadge({ risk }: { risk: Risk }) {
  const t = useT();
  const m = RISK[risk];
  return <Badge tone={m.tone} icon={icon(m.icon)}>{t(`risk.${risk}`)}</Badge>;
}

export function DocBadge({ status }: { status: DocStatus }) {
  const t = useT();
  const m = DOC_STATUS[status];
  return <Badge tone={m.tone} icon={icon(m.icon)}>{t(`doc.${status}`)}</Badge>;
}

export function CallbackBadge({ status }: { status: CallbackStatus }) {
  const t = useT();
  const m = CALLBACK[status];
  return <Badge tone={m.tone} icon={icon(m.icon, m.spin)}>{t(`cb.${status}`)}</Badge>;
}

/** Always shown next to simulated government data: LifeLoop never presents mock data as live government data. */
export function MockBadge({ className, compact }: { className?: string; compact?: boolean }) {
  const t = useT();
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border border-dashed border-amber/60 bg-amber-soft/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber", className)} title={t("app.mockLong")}>
      <FlaskConical className="h-3 w-3" aria-hidden />
      {compact ? "Mock" : t("app.mock")}
    </span>
  );
}
