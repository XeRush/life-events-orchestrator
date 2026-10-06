import { useMutation } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, LinkIcon } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { authApi } from "../../api";
import { AuthLayout, Notice } from "../../components/auth/AuthLayout";
import { authErrorMessage, focusFirstInvalid } from "../../components/auth/authErrors";
import { PasswordField, passwordOk } from "../../components/auth/PasswordField";
import { Button } from "../../components/ui/primitives";
import { useT } from "../../i18n";
import { useAuth } from "../../stores/auth";

export default function ResetPassword() {
  const t = useT();
  const formRef = useRef<HTMLFormElement>(null);
  const [params] = useSearchParams();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const reset = useMutation({
    mutationFn: () => authApi.reset(token!, password),
    // A password change ends other sessions, so a signed-in browser signs in again with the new password.
    onSuccess: () => useAuth.getState().clear(),
  });

  const passwordError = submitted && !passwordOk(password) ? t("auth.validation.passwordRules") : null;
  const confirmError = submitted && confirm !== password ? t("auth.validation.mismatch") : null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!passwordOk(password) || confirm !== password) return focusFirstInvalid(formRef.current);
    reset.mutate();
  };

  if (!token) {
    return (
      <AuthLayout eyebrow={t("auth.reset.eyebrow")} title={t("auth.reset.missingTitle")} subtitle={t("auth.reset.missing")}>
        <Link to="/forgot-password" className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[14.5px] font-medium text-paper hover:bg-ink-2">
          <LinkIcon className="h-4 w-4" aria-hidden />{t("auth.reset.requestNew")}
        </Link>
      </AuthLayout>
    );
  }

  if (reset.isSuccess) {
    return (
      <AuthLayout eyebrow={t("auth.reset.eyebrow")} title={t("auth.reset.doneTitle")}>
        <div className="flex items-start gap-4 rounded-2xl border border-civic/30 bg-civic-soft/60 p-5">
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-civic" aria-hidden />
          <p className="text-[14.5px] leading-relaxed text-ink-2">{t("auth.reset.done", { email: reset.data.email })}</p>
        </div>
        <Link to="/login" state={{ email: reset.data.email }} className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[14.5px] font-medium text-paper hover:bg-ink-2">
          {t("nav.signIn")}<ArrowRight className="rtl-flip h-4 w-4" aria-hidden />
        </Link>
      </AuthLayout>
    );
  }

  const invalidToken = reset.error instanceof ApiError && reset.error.code !== "weak_password" && (reset.error.code === "invalid_token" || [400, 404, 422].includes(reset.error.status));
  return (
    <AuthLayout eyebrow={t("auth.reset.eyebrow")} title={t("auth.reset.title")} subtitle={t("auth.reset.subtitle")}>
      <form ref={formRef} onSubmit={submit} noValidate className="space-y-4">
        {reset.isError && (
          <Notice tone="error">
            <p>{authErrorMessage(t, reset.error, { tokenFlow: true })}</p>
            {invalidToken && <Link to="/forgot-password" className="mt-1 inline-block font-medium underline underline-offset-2">{t("auth.reset.requestNew")}</Link>}
          </Notice>
        )}
        <PasswordField label={t("auth.field.newPassword")} name="new-password" autoComplete="new-password" required showRules value={password} onChange={(e) => setPassword(e.target.value)} error={passwordError} />
        <PasswordField label={t("auth.field.confirmPassword")} name="confirm-password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} error={confirmError} />
        <Button type="submit" size="lg" className="w-full" loading={reset.isPending}>{t("auth.reset.submit")}</Button>
      </form>
    </AuthLayout>
  );
}
