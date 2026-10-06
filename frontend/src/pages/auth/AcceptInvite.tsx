import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LinkIcon, ShieldCheck } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { authApi } from "../../api";
import { AuthLayout, Notice } from "../../components/auth/AuthLayout";
import { authErrorMessage, focusFirstInvalid } from "../../components/auth/authErrors";
import { PasswordField, passwordOk } from "../../components/auth/PasswordField";
import { Button, Field } from "../../components/ui/primitives";
import { useT } from "../../i18n";
import { homeFor, useAuth } from "../../stores/auth";

/** Activates a provisioned officer or admin account, then opens the officer workspace. */
export default function AcceptInvite() {
  const t = useT();
  const formRef = useRef<HTMLFormElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const token = params.get("token");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const accept = useMutation({
    mutationFn: () => authApi.acceptInvite(token!, password, name.trim() || undefined),
    onSuccess: (session) => {
      qc.clear();
      useAuth.getState().setSession(session);
      navigate(session.user.role === "RESIDENT" ? homeFor(session.user) : "/officer", { replace: true });
    },
  });

  const nameError = submitted && name.trim() !== "" && name.trim().length < 2 ? t("auth.validation.name") : null;
  const passwordError = submitted && !passwordOk(password) ? t("auth.validation.passwordRules") : null;
  const confirmError = submitted && confirm !== password ? t("auth.validation.mismatch") : null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if ((name.trim() !== "" && name.trim().length < 2) || !passwordOk(password) || confirm !== password) return focusFirstInvalid(formRef.current);
    accept.mutate();
  };

  const aside = (
    <>
      <p className="mt-3 font-display text-[2.15rem] leading-[1.08] text-ink xl:text-[2.45rem]">{t("auth.invite.asideTitle")}</p>
      <p className="mt-5 flex gap-3 text-[14px] leading-relaxed text-ink-2">
        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-violet-soft text-violet"><ShieldCheck className="h-3.5 w-3.5" aria-hidden /></span>{t("auth.invite.asideBody")}
      </p>
    </>
  );

  if (!token) {
    return (
      <AuthLayout aside={aside} eyebrow={t("auth.invite.eyebrow")} title={t("auth.invite.missingTitle")} subtitle={t("auth.invite.missing")}>
        <Link to="/login" className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[14.5px] font-medium text-paper hover:bg-ink-2">
          <LinkIcon className="h-4 w-4" aria-hidden />{t("nav.signIn")}
        </Link>
      </AuthLayout>
    );
  }

  const invalidToken = accept.error instanceof ApiError && accept.error.code !== "weak_password" && (accept.error.code === "invalid_token" || [400, 404, 422].includes(accept.error.status));
  return (
    <AuthLayout aside={aside} eyebrow={t("auth.invite.eyebrow")} title={t("auth.invite.title")} subtitle={t("auth.invite.subtitle")}>
      <form ref={formRef} onSubmit={submit} noValidate className="space-y-4">
        {accept.isError && (
          <Notice tone="error">
            <p>{authErrorMessage(t, accept.error, { tokenFlow: true })}</p>
            {invalidToken && <p className="mt-1">{t("auth.invite.askAdmin")}</p>}
          </Notice>
        )}
        <Field label={t("auth.field.fullNameOptional")} name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={nameError} hint={nameError ? undefined : t("auth.invite.nameHint")} />
        <PasswordField label={t("auth.field.newPassword")} name="new-password" autoComplete="new-password" required showRules value={password} onChange={(e) => setPassword(e.target.value)} error={passwordError} />
        <PasswordField label={t("auth.field.confirmPassword")} name="confirm-password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} error={confirmError} />
        <Button type="submit" size="lg" className="w-full" loading={accept.isPending}>{t("auth.invite.submit")}</Button>
      </form>
    </AuthLayout>
  );
}
