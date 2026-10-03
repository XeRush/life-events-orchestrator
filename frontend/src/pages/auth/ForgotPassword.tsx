import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, MailCheck } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { authApi } from "../../api";
import { AuthLayout, Notice } from "../../components/auth/AuthLayout";
import { authErrorMessage, isEmail, focusFirstInvalid } from "../../components/auth/authErrors";
import { DevMailbox } from "../../components/auth/DevMailbox";
import { Button, Field } from "../../components/ui/primitives";
import { useT } from "../../i18n";

/** Always the same confirmation, whether or not the account exists (no account enumeration). */
export default function ForgotPassword() {
  const t = useT();
  const formRef = useRef<HTMLFormElement>(null);
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const forgot = useMutation({
    mutationFn: (address: string) => authApi.forgot(address),
    onSuccess: (_, address) => setSentTo(address),
  });

  const emailError = submitted && !isEmail(email) ? t("auth.validation.email") : null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!isEmail(email)) return focusFirstInvalid(formRef.current);
    forgot.mutate(email.trim().toLowerCase());
  };

  if (sentTo) {
    return (
      <AuthLayout eyebrow={t("auth.forgot.eyebrow")} title={t("auth.forgot.sentTitle")} below={<DevMailbox email={sentTo} />}>
        <div className="flex items-start gap-4 rounded-2xl border border-line bg-paper/60 p-5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink text-paper"><MailCheck className="h-5 w-5" aria-hidden /></span>
          <div className="text-[14.5px] leading-relaxed text-ink-2">
            <p>{t("auth.forgot.sent", { email: sentTo })}</p>
            <p className="mt-2 text-muted">{t("auth.forgot.sentHint")}</p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/login" state={{ email: sentTo }} className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[14.5px] font-medium text-paper hover:bg-ink-2">
            <ArrowLeft className="rtl-flip h-4 w-4" aria-hidden />{t("auth.forgot.back")}
          </Link>
          <Button variant="secondary" size="lg" className="h-11" onClick={() => { setSentTo(null); forgot.reset(); }}>{t("auth.forgot.again")}</Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout eyebrow={t("auth.forgot.eyebrow")} title={t("auth.forgot.title")} subtitle={t("auth.forgot.subtitle")}>
      <form ref={formRef} onSubmit={submit} noValidate className="space-y-4">
        {forgot.isError && <Notice tone="error">{authErrorMessage(t, forgot.error)}</Notice>}
        <Field label={t("auth.field.email")} type="email" name="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} error={emailError} />
        <Button type="submit" size="lg" className="w-full" loading={forgot.isPending}>{t("auth.forgot.submit")}</Button>
      </form>
      <p className="mt-6 border-t border-line pt-4 text-[14px]">
        <Link to="/login" className="inline-flex min-h-10 items-center gap-1.5 text-ink-2 underline-offset-2 hover:text-ink hover:underline"><ArrowLeft className="rtl-flip h-3.5 w-3.5" aria-hidden />{t("auth.forgot.back")}</Link>
      </p>
    </AuthLayout>
  );
}
