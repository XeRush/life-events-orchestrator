import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { authApi } from "../../api";
import { AuthLayout, Notice } from "../../components/auth/AuthLayout";
import { DemoAccounts } from "../../components/auth/DemoAccounts";
import { authErrorMessage, isEmail, focusFirstInvalid } from "../../components/auth/authErrors";
import { PasswordField } from "../../components/auth/PasswordField";
import { Button, Field } from "../../components/ui/primitives";
import { useAuthConfig } from "../../hooks/queries";
import { useT } from "../../i18n";
import { homeFor, useAuth } from "../../stores/auth";

export default function Login() {
  const t = useT();
  const formRef = useRef<HTMLFormElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const config = useAuthConfig();
  const setSession = useAuth((s) => s.setSession);
  const current = useAuth((s) => s.user);
  const state = (location.state ?? {}) as { from?: string; email?: string };
  const demoHint = params.get("demo") === "1";

  const [email, setEmail] = useState(state.email ?? "");
  const [password, setPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const emailError = submitted && !isEmail(email) ? t("auth.validation.email") : null;
  const passwordError = submitted && !password ? t("auth.validation.passwordRequired") : null;

  const login = useMutation({
    mutationFn: () => authApi.login(email.trim(), password),
    onSuccess: (session) => {
      qc.clear();
      setSession(session);
      const from = state.from && !state.from.startsWith("/login") ? state.from : null;
      navigate(from ?? homeFor(session.user), { replace: true });
    },
    onError: (e) => setError(authErrorMessage(t, e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setError(null);
    if (!isEmail(email) || !password) return focusFirstInvalid(formRef.current);
    login.mutate();
  };

  const fill = (address: string) => {
    setEmail(address);
    setError(null);
    window.setTimeout(() => passwordRef.current?.focus(), 0);
  };

  const accounts = config.data?.demo_accounts ?? [];

  return (
    <AuthLayout eyebrow={t("auth.login.eyebrow")} title={t("auth.login.title")} subtitle={t("auth.login.subtitle")}>
      {current && (
        <Notice tone="info" className="mb-5">
          <p>{t("auth.login.signedInAs", { name: current.full_name })}</p>
          <Link to={homeFor(current)} className="mt-1 inline-flex items-center gap-1 font-medium underline underline-offset-2">
            {t("auth.login.continue")}<ArrowRight className="rtl-flip h-3.5 w-3.5" aria-hidden />
          </Link>
        </Notice>
      )}

      {(demoHint || config.isLoading || accounts.length > 0) && (
        <DemoAccounts loading={config.isLoading} accounts={accounts} highlight={demoHint} selected={email} onPick={fill} />
      )}

      <form ref={formRef} onSubmit={submit} noValidate className="mt-6 space-y-4 first:mt-0" aria-describedby={error ? "login-error" : undefined}>
        {error && <div id="login-error"><Notice tone="error">{error}</Notice></div>}
        <Field
          label={t("auth.field.email")} type="email" name="email" autoComplete="email" inputMode="email" required
          value={email} onChange={(e) => setEmail(e.target.value)} error={emailError}
        />
        <PasswordField
          ref={passwordRef} label={t("auth.field.password")} name="password" autoComplete="current-password" required
          value={password} onChange={(e) => setPassword(e.target.value)} error={passwordError}
        />
        <div className="-mt-1 flex justify-end">
          <Link to="/forgot-password" className="inline-flex min-h-10 items-center text-[13px] text-ink-2 underline-offset-2 hover:text-ink hover:underline">{t("auth.login.forgot")}</Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={login.isPending}>{t("auth.login.submit")}</Button>
      </form>

      <p className="mt-6 flex flex-wrap items-center gap-x-1.5 border-t border-line pt-4 text-[14px] text-muted">
        {t("auth.login.noAccount")}
        <Link to="/register" className="inline-flex min-h-10 items-center font-medium text-ink underline-offset-2 hover:underline">{t("auth.login.createAccount")}</Link>
      </p>
    </AuthLayout>
  );
}
