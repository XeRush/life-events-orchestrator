/** Shared class strings for the public pages (landing + architecture), so rhythm and buttons stay identical. */

/** Section vertical rhythm: ~py-12 on phones, py-16 on tablets, py-20 on desktop. */
export const SECTION = "py-12 sm:py-16 lg:py-20";
/** Content column. */
export const WRAP = "mx-auto max-w-6xl px-4 sm:px-6";

export const BTN_PRIMARY =
  "group inline-flex h-12 items-center gap-2.5 rounded-full bg-civic px-6 text-[15px] font-semibold text-on-accent shadow-(--shadow-card) transition-[background-color,translate,scale] duration-200 hover:-translate-y-px hover:bg-civic/90 active:scale-[0.98]";
export const BTN_SECONDARY =
  "inline-flex h-12 items-center gap-2 rounded-full border border-line-2 bg-surface px-6 text-[15px] font-medium text-ink transition-colors hover:border-ink/30 hover:bg-paper-2";
export const BTN_GHOST =
  "inline-flex h-12 items-center gap-1.5 rounded-full px-3 text-[15px] text-ink-2 underline-offset-4 transition-colors hover:text-ink hover:underline";
/** Arrow inside BTN_PRIMARY: nudges forward on hover (backwards in RTL, where it is also mirrored). */
export const BTN_ARROW = "rtl-flip h-4 w-4 transition-[translate] duration-200 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5";
