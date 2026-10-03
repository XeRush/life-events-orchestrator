import {
  AlertTriangle, BadgeCheck, Ban, Bot, Building2, CheckCircle2, CircleDashed, Clock3, FileWarning, Hand, Hourglass, Landmark, Loader2,
  PauseCircle, PlayCircle, Send, ShieldCheck, UserRound, UserRoundCheck, XCircle, type LucideIcon,
} from "lucide-react";
import type { CallbackStatus, CaseStatus, DocStatus, NodeState, Risk, Source } from "../types/api";

export type Tone = "civic" | "azure" | "amber" | "rose" | "slate" | "violet" | "ink";

export interface Meta { tone: Tone; icon: LucideIcon; spin?: boolean; pulse?: "azure" | "amber" | "rose" }

/** Node state -> tone + icon. Labels come from i18n ("state.<STATE>"). Colour is never the only signal: every badge has an icon + text. */
export const NODE_STATE: Record<NodeState, Meta> = {
  PENDING: { tone: "slate", icon: CircleDashed },
  READY: { tone: "azure", icon: PlayCircle },
  WAITING_FOR_HUMAN: { tone: "violet", icon: UserRoundCheck, pulse: "azure" },
  SUBMITTING: { tone: "azure", icon: Send },
  SUBMITTED: { tone: "azure", icon: Send },
  PROCESSING: { tone: "azure", icon: Loader2, spin: true, pulse: "azure" },
  CLEARED: { tone: "civic", icon: CheckCircle2 },
  COMPLETED: { tone: "civic", icon: BadgeCheck },
  BLOCKED: { tone: "rose", icon: Ban, pulse: "rose" },
  DOCUMENT_MISSING: { tone: "amber", icon: FileWarning, pulse: "amber" },
  STALLED: { tone: "amber", icon: PauseCircle, pulse: "amber" },
  WAITING_FOR_PARENT: { tone: "amber", icon: Hand, pulse: "amber" },
  REJECTED: { tone: "rose", icon: XCircle },
};

export const DONE: NodeState[] = ["CLEARED", "COMPLETED"];
export const ATTENTION: NodeState[] = ["BLOCKED", "DOCUMENT_MISSING", "STALLED", "REJECTED"];

/** Who said it. The UI always distinguishes AI action, authority response, parent report and human approval. */
export const SOURCE: Record<Source, Meta> = {
  AI_AGENT: { tone: "azure", icon: Bot },
  GOVERNMENT_MOCK: { tone: "civic", icon: Landmark },
  PARENT_REPORTED: { tone: "amber", icon: UserRound },
  HUMAN_OFFICER: { tone: "violet", icon: ShieldCheck },
  RESIDENT: { tone: "slate", icon: UserRound },
  SYSTEM: { tone: "slate", icon: Building2 },
};

export const CASE_STATUS: Record<CaseStatus, Meta> = {
  INTAKE: { tone: "slate", icon: CircleDashed },
  ACTIVE: { tone: "azure", icon: Loader2 },
  WAITING_FOR_PARENT: { tone: "amber", icon: Hand },
  WAITING_FOR_HUMAN: { tone: "violet", icon: UserRoundCheck },
  ESCALATED: { tone: "violet", icon: ShieldCheck },
  COMPLETED: { tone: "civic", icon: BadgeCheck },
  CLOSED: { tone: "slate", icon: Ban },
};

export const RISK: Record<Risk, Meta> = {
  LOW: { tone: "civic", icon: CheckCircle2 },
  MEDIUM: { tone: "amber", icon: Clock3 },
  HIGH: { tone: "rose", icon: AlertTriangle },
};

export const DOC_STATUS: Record<DocStatus, Meta> = {
  REQUIRED: { tone: "slate", icon: CircleDashed },
  UPLOADED: { tone: "azure", icon: CheckCircle2 },
  VERIFIED: { tone: "civic", icon: BadgeCheck },
  MISSING: { tone: "amber", icon: FileWarning },
  EXPIRED: { tone: "rose", icon: Hourglass },
  NOT_APPLICABLE: { tone: "slate", icon: Ban },
};

export const CALLBACK: Record<CallbackStatus, Meta> = {
  SCHEDULED: { tone: "amber", icon: Clock3 },
  DIALING: { tone: "azure", icon: Loader2, spin: true },
  COMPLETED: { tone: "civic", icon: CheckCircle2 },
  NO_ANSWER: { tone: "slate", icon: Hourglass },
  FAILED: { tone: "rose", icon: XCircle },
  CANCELLED: { tone: "slate", icon: Ban },
  BLOCKED_NO_CONSENT: { tone: "rose", icon: Ban },
  SMS_ONLY: { tone: "violet", icon: Send },
};

export const TONE: Record<Tone, { bg: string; text: string; border: string; dot: string; solid: string; ring: string }> = {
  civic: { bg: "bg-civic-soft", text: "text-civic", border: "border-civic/30", dot: "bg-civic", solid: "var(--color-civic)", ring: "ring-civic/25" },
  azure: { bg: "bg-azure-soft", text: "text-azure", border: "border-azure/30", dot: "bg-azure", solid: "var(--color-azure)", ring: "ring-azure/25" },
  amber: { bg: "bg-amber-soft", text: "text-amber", border: "border-amber/40", dot: "bg-amber", solid: "var(--color-amber)", ring: "ring-amber/25" },
  rose: { bg: "bg-rose-soft", text: "text-rose", border: "border-rose/30", dot: "bg-rose", solid: "var(--color-rose)", ring: "ring-rose/25" },
  slate: { bg: "bg-slate-soft", text: "text-muted", border: "border-line-2", dot: "bg-faint", solid: "var(--color-faint)", ring: "ring-line-2" },
  violet: { bg: "bg-violet-soft", text: "text-violet", border: "border-violet/30", dot: "bg-violet", solid: "var(--color-violet)", ring: "ring-violet/25" },
  ink: { bg: "bg-ink", text: "text-paper", border: "border-ink", dot: "bg-paper", solid: "var(--color-ink)", ring: "ring-ink/25" },
};
