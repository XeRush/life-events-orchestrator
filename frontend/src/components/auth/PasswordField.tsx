import { Check, Circle, Eye, EyeOff } from "lucide-react";
import { forwardRef, useId, useState, type InputHTMLAttributes } from "react";
import { useT, type MessageKey } from "../../i18n";
import { cn } from "../../lib/format";

/** Mirrors backend validate_password_strength: at least 10 characters, a letter and a number. */
export function passwordChecks(password: string) {
  return { length: password.length >= 10, letter: /\p{L}/u.test(password), number: /\d/.test(password) };
}
export const passwordOk = (password: string) => Object.values(passwordChecks(password)).every(Boolean);

const RULES: { key: keyof ReturnType<typeof passwordChecks>; label: MessageKey }[] = [
  { key: "length", label: "auth.password.ruleLength" },
  { key: "letter", label: "auth.password.ruleLetter" },
  { key: "number", label: "auth.password.ruleNumber" },
];

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  error?: string | null;
  hint?: string;
  showRules?: boolean;
  value: string;
}

/** Password input with a show/hide toggle and, optionally, live rule checks announced to screen readers. */
export const PasswordField = forwardRef<HTMLInputElement, Props>(function PasswordField({ label, error, hint, showRules, value, id, className, ...rest }, ref) {
  const t = useT();
  const auto = useId();
  const fid = id ?? auto;
  const [visible, setVisible] = useState(false);
  const checks = passwordChecks(value);
  const describedBy = [error || hint ? `${fid}-hint` : null, showRules ? `${fid}-rules` : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={className}>
      <label htmlFor={fid} className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</label>
      <div className="relative">
        <input
          ref={ref} id={fid} type={visible ? "text" : "password"} value={value} aria-invalid={!!error} aria-describedby={describedBy} {...rest}
          className={cn(
            "h-11 w-full rounded-xl border bg-surface ps-3.5 pe-12 text-[15px] outline-none transition-colors placeholder:text-faint focus:border-ink/50 focus:ring-2 focus:ring-ink/10",
            error ? "border-rose" : "border-line-2",
          )}
        />
        <button
          type="button" onClick={() => setVisible((v) => !v)} aria-pressed={visible} aria-controls={fid}
          aria-label={visible ? t("auth.password.hide") : t("auth.password.show")}
          className="absolute inset-y-0 end-1 my-1 grid w-10 cursor-pointer place-items-center rounded-lg text-muted hover:bg-paper-2 hover:text-ink"
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </button>
      </div>
      {(error || hint) && <p id={`${fid}-hint`} className={cn("mt-1 text-xs", error ? "text-rose" : "text-muted")}>{error ?? hint}</p>}
      {showRules && (
        <ul id={`${fid}-rules`} className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5" aria-live="polite">
          {RULES.map((rule) => {
            const ok = checks[rule.key];
            return (
              <li key={rule.key} className={cn("inline-flex items-center gap-1.5 text-[12.5px] transition-colors", ok ? "text-civic" : "text-muted")}>
                {ok ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Circle className="h-3 w-3" aria-hidden />}
                <span>{t(rule.label)}</span>
                <span className="sr-only">{ok ? t("auth.password.met") : t("auth.password.notMet")}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});
