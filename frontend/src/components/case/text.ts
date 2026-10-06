import type { MessageKey, TFunction } from "../../i18n";
import { fmtDate } from "../../lib/format";
import { SOURCE } from "../../lib/status";
import type { Lang, NodeKey, Source } from "../../types/api";

/**
 * Translate a key that is built from server data (document types, event names, milestones).
 * When the dictionary has no entry, the server's own English text is shown instead of the raw key.
 */
export function tx(t: TFunction, key: string, fallback: string, params?: Record<string, string | number>): string {
  const value = t(key as MessageKey, params);
  return value === key ? fallback : value;
}

/** "NodeAwaitingRelease" -> "Node awaiting release" (last-resort label for an event type with no translation). */
export function humanize(type: string): string {
  const spaced = type.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function asSource(value: string | null | undefined): Source {
  return value && value in SOURCE ? (value as Source) : "SYSTEM";
}

export type Owner = "PARENT" | "OFFICER" | "ENTITY" | "AGENT" | "SYSTEM";
const OWNERS: Owner[] = ["PARENT", "OFFICER", "ENTITY", "AGENT", "SYSTEM"];

export function asOwner(value: string | null | undefined): Owner {
  const v = (value ?? "").toUpperCase();
  return OWNERS.includes(v as Owner) ? (v as Owner) : "SYSTEM";
}

export const NODE_KEYS: NodeKey[] = ["BIRTH_CERTIFICATE", "MOFA_ATTESTATION", "CONSULATE_PASSPORT", "RESIDENCE_VISA", "EMIRATES_ID", "INSURANCE"];

export const EMIRATES = ["DUBAI", "ABU_DHABI", "SHARJAH", "AJMAN", "UMM_AL_QUWAIN", "RAS_AL_KHAIMAH", "FUJAIRAH"] as const;
export type Emirate = (typeof EMIRATES)[number];

export function asEmirate(value: string | null | undefined): Emirate | null {
  const v = (value ?? "").toUpperCase();
  return (EMIRATES as readonly string[]).includes(v) ? (v as Emirate) : null;
}

/** Emirates ID shown on screen: never the full number. */
export function maskEid(value: string): string {
  const d = value.replace(/\D/g, "");
  return d.length ? `784-••••-•••••••-${d.slice(-1)}` : "";
}

export const isValidEid = (value: string) => {
  const d = value.replace(/\D/g, "");
  return d.length === 15 && d.startsWith("784");
};

export function localIsoDate(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Calendar dates ("2026-10-01": date of birth, deadline, appointment) are shown as the same calendar day everywhere.
 * fmtDate() reads a date-only value as local midnight and then formats it in Asia/Dubai, which shifts it back a day
 * for browsers east of Dubai; date-only values are therefore formatted in the browser's own zone.
 */
export function fmtDay(iso: string | null | undefined, lang: Lang, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }): string {
  return fmtDate(iso, lang, iso && iso.length === 10 ? { ...opts, timeZone: undefined } : opts);
}
