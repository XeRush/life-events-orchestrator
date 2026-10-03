import en from "../../i18n/en";
import type { MessageKey, TFunction } from "../../i18n";
import { titleCase } from "../../lib/format";
import type { Tone } from "../../lib/status";

/** Translate a dynamic key when it exists; otherwise fall back to a readable version of the raw value. */
export function tOr(t: TFunction, key: string, fallback: string): string {
  return key in en ? t(key as MessageKey) : fallback;
}

export const actionLabel = (t: TFunction, action: string) => tOr(t, `demo.action.${action}`, titleCase(action));

export const ACTION_TONE: Record<string, Tone> = {
  RELEASE: "violet",
  READY: "azure",
  PROCESSING: "azure",
  APPOINTMENT_BOOKED: "azure",
  APPLICATION_SUBMITTED: "azure",
  CLEARED: "civic",
  COMPLETED: "civic",
  PASSPORT_ISSUED: "civic",
  BLOCKED: "rose",
  REJECTED: "rose",
  DOCUMENT_MISSING: "amber",
  STALLED: "amber",
  WAITING_FOR_PARENT: "amber",
  DELAYED: "amber",
};

export const GENERIC_ACTIONS = ["ADVANCE", "BLOCK", "STALL", "CLEAR"] as const;

export const ESCALATION_REASONS = ["SLA_STALL", "CONSULATE_STALL", "DISTRESS", "APPROVAL_QUESTION", "DISPUTED_RECORD", "RESIDENT_REQUEST"] as const;

export const OUTBOX_TONE: Record<string, Tone> = { PENDING: "amber", PUBLISHED: "azure", PROCESSED: "civic", FAILED: "rose" };

/** Phone numbers in the mock SMS outbox are shown with only the last four digits. */
export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length <= 4 ? value : `•••• ${digits.slice(-4)}`;
}
