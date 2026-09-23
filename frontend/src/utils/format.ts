import { useUI } from "../stores/ui";

const locale = () => (useUI.getState().lang === "ar" ? "ar-AE" : "en-GB");

export const fmtDate = (iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) =>
  iso ? new Intl.DateTimeFormat(locale(), { timeZone: "UTC", ...opts }).format(new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso)) : "-";

export const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat(locale(), { hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(iso));

export const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat(locale(), { month: "long", day: "numeric" }).format(new Date(iso));

export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "-";

export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "-";
  const s = Math.round(seconds);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function relative(iso: string): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

export const cn = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

export const title = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
