import {
  Ban, CheckCircle2, CircleDashed, Clock3, FileWarning, Hourglass, Loader2, Lock, PlayCircle, RefreshCw, Send, XCircle,
  type LucideIcon,
} from "lucide-react";
import type { TaskStatus } from "../types";

export type Tone = "civic" | "azure" | "amber" | "rose" | "slate" | "violet";

export interface StatusMeta {
  label: string;
  short: string;
  tone: Tone;
  icon: LucideIcon;
  spin?: boolean;
}

/** Resident-friendly wording for backend task states. Authority states stay the authority's. */
export const TASK_STATUS: Record<TaskStatus, StatusMeta> = {
  COMPLETED: { label: "Completed", short: "Done", tone: "civic", icon: CheckCircle2 },
  PROCESSING: { label: "In progress", short: "In progress", tone: "azure", icon: Loader2, spin: true },
  SUBMITTED: { label: "Submitted to authority", short: "Submitted", tone: "azure", icon: Send },
  READY: { label: "Ready to start", short: "Ready", tone: "azure", icon: PlayCircle },
  WAITING_FOR_ENTITY: { label: "Delayed at authority", short: "Waiting", tone: "amber", icon: Hourglass },
  WAITING_FOR_RESIDENT: { label: "Requires action", short: "Action", tone: "amber", icon: FileWarning },
  BLOCKED: { label: "Blocked by dependency", short: "Blocked", tone: "slate", icon: Lock },
  PENDING: { label: "Pending", short: "Pending", tone: "slate", icon: CircleDashed },
  REJECTED: { label: "Not approved", short: "Rejected", tone: "rose", icon: XCircle },
  FAILED: { label: "Failed", short: "Failed", tone: "rose", icon: XCircle },
  CANCELLED: { label: "Replaced", short: "Replaced", tone: "slate", icon: Ban },
};

export const REPLANNED = { label: "Replanned", tone: "violet" as Tone, icon: RefreshCw };
export const CLOCK = Clock3;

export const TONE_CLASSES: Record<Tone, { bg: string; text: string; border: string; dot: string; solid: string }> = {
  civic: { bg: "bg-civic-soft", text: "text-civic", border: "border-civic/30", dot: "bg-civic", solid: "#1f6f5c" },
  azure: { bg: "bg-azure-soft", text: "text-azure", border: "border-azure/30", dot: "bg-azure", solid: "#2b5c8a" },
  amber: { bg: "bg-amber-soft", text: "text-amber", border: "border-amber/40", dot: "bg-amber", solid: "#a8741a" },
  rose: { bg: "bg-rose-soft", text: "text-rose", border: "border-rose/30", dot: "bg-rose", solid: "#b4432f" },
  slate: { bg: "bg-slate-soft", text: "text-muted", border: "border-line-2", dot: "bg-faint", solid: "#8b95a0" },
  violet: { bg: "bg-violet-soft", text: "text-violet", border: "border-violet/30", dot: "bg-violet", solid: "#6a4c93" },
};

export const CASE_STATUS_LABEL: Record<string, { label: string; tone: Tone }> = {
  PENDING_CONSENT: { label: "Awaiting consent", tone: "amber" },
  IN_PROGRESS: { label: "In progress", tone: "azure" },
  PAUSED: { label: "Paused", tone: "slate" },
  ESCALATED: { label: "With a human officer", tone: "violet" },
  COMPLETED: { label: "Completed", tone: "civic" },
  CANCELLED: { label: "Cancelled", tone: "slate" },
};

export const CALLBACK_STATUS: Record<string, { label: string; tone: Tone }> = {
  SCHEDULED: { label: "Scheduled", tone: "amber" },
  IN_PROGRESS: { label: "In call", tone: "azure" },
  COMPLETED: { label: "Completed", tone: "civic" },
  FAILED: { label: "Failed", tone: "rose" },
  SKIPPED: { label: "Skipped", tone: "slate" },
  CANCELLED: { label: "Cancelled", tone: "slate" },
};
