import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, MailCheck } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../api/client";
import { authApi } from "../../api";
import { AuthLayout, Notice } from "../../components/auth/AuthLayout";
import { authErrorMessage, isEmail, focusFirstInvalid } from "../../components/auth/authErrors";
import { DevMailbox } from "../../components/auth/DevMailbox";
import { PasswordField, passwordOk } from "../../components/auth/PasswordField";
import { Button, Field, SelectField } from "../../components/ui/primitives";
import { useAuthConfig } from "../../hooks/queries";
import { LANGUAGES, useLang, useT } from "../../i18n";
import { useAuth } from "../../stores/auth";
import { useUI } from "../../stores/ui";
import type { Lang } from "../../types/api";

const PHONE = /^\+?[0-9 ()-]{7,20}$/;

export default function Register() {
  const t = useT();
  const formRef = useRef<HTMLFormElement>(null);
  const uiLang = useLang();
  const setLang = useUI((s) => s.setLang);
  const qc = useQueryClient();
  const config = useAuthConfig();
  const setSession = useAuth((s) => s.setSession);

  const [form, setForm] = useState({ full_name: "", email: "", phone: "", preferred_language: uiLang as Lang, password: "" });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<{ text: string; taken?: boolean } | null>(null);
  const [registered, setRegistered] = useState<string | null>(null);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const errors = {
    full_name: submitted && form.full_name.trim().length < 2 ? t("auth.validation.name") : null,
    email: submitted && !isEmail(form.email) ? t("auth.validation.email") : null,
    phone: submitted && form.phone.trim() && !PHONE.test(form.phone.trim()) ? t("auth.validation.phone") : null,
    password: submitted && !passwordOk(form.password) ? t("auth.validation.passwordRules") : null,
  };

  const register = useMutation({
    mutationFn: () => authApi.register({
      full_name: form.full_name.trim(), email: form.email.trim(), password: form.password,
      phone: form.phone.trim() || undefined, preferred_language: form.preferred_language,
    }),
    onSuccess: (session) => {
      qc.clear();
      setSession(session);
      setLang(session.user.preferred_language);
      setRegistered(session.user.email);
    },
    onError: (e) => setError({ text: authErrorMessage(t, e), taken: e instanceof ApiError && e.code === "email_taken" }),
  });

  const resend = useMutation({ mutationFn: authApi.resendVerification });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setError(null);
    if (form.full_name.trim().length < 2 || !isEmail(form.email) || (form.phone.trim() && !PHONE.test(form.phone.trim())) || !passwordOk(form.password)) return focusFirstInvalid(formRef.current);
    register.mutate();
  };

  if (registered) {
    return (
      <AuthLayout eyebrow={t("auth.register.eyebrow")} title={t("auth.check.title")} subtitle={t("auth.check.sent", { email: registered })} below={<DevMailbox email={registered} />}>
        <div className="flex items-start gap-4 rounded-2xl border border-civic/30 bg-civic-soft/60 p-5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-civic text-on-accent"><MailCheck className="h-5 w-5" aria-hidden /></span>
          <div className="text-[14.5px] leading-relaxed text-ink-2">
            <p>{t("auth.check.body")}</p>
            {config.data?.require_email_verification && <p className="mt-2 font-medium text-civic">{t("auth.check.required")}</p>}
          </div>
        </div>
        {resend.isSuccess && <Notice tone="success" className="mt-4">{t("auth.check.resent")}</Notice>}
        {resend.isError && <Notice tone="error" className="mt-4">{authErrorMessage(t, resend.error)}</Notice>}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/app" className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[14.5px] font-medium text-paper hover:bg-ink-2">
            {t("auth.check.continue")}<ArrowRight className="rtl-flip h-4 w-4" aria-hidden />
          </Link>
          <Button variant="secondary" size="lg" className="h-11" loading={resend.isPending} onClick={() => resend.mutate()}>{t("auth.check.resend")}</Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout eyebrow={t("auth.register.eyebrow")} title={t("auth.register.title")} subtitle={t("auth.register.subtitle")}>
      <form ref={formRef} onSubmit={submit} noValidate className="space-y-4">
        {error && (
          <Notice tone="error">
            <p>{error.text}</p>
            {error.taken && (
              <p className="mt-1 flex flex-wrap gap-x-4">
                <Link to="/login" state={{ email: form.email.trim() }} className="font-medium underline underline-offset-2">{t("auth.register.signInInstead")}</Link>
                <Link to="/forgot-password" className="font-medium underline underline-offset-2">{t("auth.login.forgot")}</Link>
              </p>
            )}
          </Notice>
        )}
        <Field label={t("auth.field.fullName")} name="name" autoComplete="name" required value={form.full_name} onChange={(e) => set("full_name", e.target.value)} error={errors.full_name} />
        <Field label={t("auth.field.email")} type="email" name="email" autoComplete="email" inputMode="email" required value={form.email} onChange={(e) => set("email", e.target.value)} error={errors.email} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("auth.field.phone")} type="tel" name="phone" autoComplete="tel" inputMode="tel" placeholder="+971 50 000 0000"
            value={form.phone} onChange={(e) => set("phone", e.target.value)} error={errors.phone} hint={errors.phone ? undefined : t("auth.field.phoneHint")}
          />
          <SelectField label={t("auth.field.language")} value={form.preferred_language} onChange={(e) => set("preferred_language", e.target.value as Lang)} hint={t("auth.field.languageHint")}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code} lang={l.code}>{l.code === "en" ? l.native : `${l.native} · ${l.english}`}</option>)}
          </SelectField>
        </div>
        <PasswordField
          label={t("auth.field.password")} name="new-password" autoComplete="new-password" required showRules
          value={form.password} onChange={(e) => set("password", e.target.value)} error={errors.password}
        />
        <p className="rounded-2xl border border-dashed border-amber/40 bg-amber-soft/40 px-4 py-3 text-[12.5px] leading-relaxed text-ink-2">{t("auth.register.prototypeNote")}</p>
        <Button type="submit" size="lg" className="w-full" loading={register.isPending}>{t("auth.register.submit")}</Button>
      </form>
      <p className="mt-6 flex flex-wrap items-center gap-x-1.5 border-t border-line pt-4 text-[14px] text-muted">
        {t("auth.register.haveAccount")}
        <Link to="/login" className="inline-flex min-h-10 items-center font-medium text-ink underline-offset-2 hover:underline">{t("nav.signIn")}</Link>
      </p>
    </AuthLayout>
  );
}
