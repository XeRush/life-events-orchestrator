import { ApiError } from "../../api/client";
import type { TFunction } from "../../i18n";

/** Maps API errors from /auth/* to plain-language messages. Unknown errors fall back to the server's own message. */
export function authErrorMessage(t: TFunction, error: unknown, opts: { tokenFlow?: boolean } = {}): string {
  if (error instanceof ApiError) {
    // On verify / reset / invite links, a malformed or unknown token comes back as a validation error.
    if (opts.tokenFlow && error.code !== "weak_password" && (error.status === 400 || error.status === 404 || error.status === 422)) return t("auth.error.invalidToken");
    switch (error.code) {
      case "invalid_credentials":
        return t("auth.error.invalidCredentials");
      case "account_locked":
        return t("auth.error.locked");
      case "rate_limited":
        return t("auth.error.rateLimited");
      case "email_taken":
        return t("auth.error.emailTaken");
      case "weak_password":
        return t("auth.error.weakPassword");
      case "invalid_token":
        return t("auth.error.invalidToken");
      default:
        break;
    }
    if (error.status === 423) return t("auth.error.locked");
    if (error.status === 429) return t("auth.error.rateLimited");
    if (error.status >= 500) return t("auth.error.server");
    return error.message || t("common.error");
  }
  return t("auth.error.network");
}

export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

/** After a failed submit, move focus to the first field marked invalid so keyboard and screen-reader users land on it. */
export function focusFirstInvalid(form: HTMLFormElement | null) {
  window.requestAnimationFrame(() => form?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
}
