import type { Lang } from "../types/api";

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

const LOCALES: Record<Lang, string> = { en: "en-GB", ar: "ar-AE", hi: "hi-IN", ur: "ur-PK", ml: "ml-IN", tl: "fil-PH" };

/** Timestamps are shown in Dubai time. A date-only value ("2026-10-01": a birth date, a deadline) is a calendar day,
 * not an instant, so it is formatted in UTC and never shifts by a day whatever the viewer's timezone. */
export function fmtDate(iso: string | null | undefined, lang: Lang = "en", opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  if (!iso) return "-";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const d = new Date(dateOnly ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat(LOCALES[lang], { ...opts, timeZone: dateOnly ? "UTC" : "Asia/Dubai" }).format(d);
}

export function fmtTime(iso: string | null | undefined, lang: Lang = "en"): string {
  return fmtDate(iso, lang, { hour: "2-digit", minute: "2-digit" });
}

export function fmtDateTime(iso: string | null | undefined, lang: Lang = "en"): string {
  return fmtDate(iso, lang, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function relative(iso: string | null | undefined, lang: Lang = "en"): string {
  if (!iso) return "-";
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(LOCALES[lang], { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

export function duration(seconds: number | null | undefined): string {
  if (seconds == null) return "-";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function titleCase(value: string): string {
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function humanEmirate(code: string): string {
  return titleCase(code);
}
