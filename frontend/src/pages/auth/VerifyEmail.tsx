import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Loader2, MailCheck, MailX } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { authApi } from "../../api";
import { AuthLayout, Notice } from "../../components/auth/AuthLayout";
import { authErrorMessage } from "../../components/auth/authErrors";
import { DevMailbox } from "../../components/auth/DevMailbox";
import { VerifyResult } from "../../components/auth/VerifyState";
import { Button } from "../../components/ui/primitives";
import { useT } from "../../i18n";
import { homeFor, useAuth } from "../../stores/auth";

function Resend() {
  const t = useT();
  const resend = useMutation({ mutationFn: authApi.resendVerification });
  return (
    <div className="space-y-3">
      {resend.isSuccess && <Notice tone="success">{t("auth.check.resent")}</Notice>}
      {resend.isError && <Notice tone="error">{authErrorMessage(t, resend.error)}</Notice>}
      <Button variant="secondary" loading={resend.isPending} onClick={() => resend.mutate()}>{t("auth.check.resend")}</Button>
    </div>
  );
}

/** /verify-email?token=... confirms the address once; without a token it is the "check your inbox" screen. */
export default function VerifyEmail() {
  const t = useT();
  const [params] = useSearchParams();
  const token = params.get("token");
  const user = useAuth((s) => s.user);
  const signedIn = useAuth((s) => !!s.tokens);
  const started = useRef(false);

  const verify = useMutation({
    mutationFn: (raw: string) => authApi.verifyEmail(raw),
    onSuccess: async () => {
      if (!useAuth.getState().tokens) return;
      try {
        useAuth.getState().setUser(await authApi.me());
      } catch {
        /* the profile refreshes on the next request anyway */
      }
    },
  });

  useEffect(() => {
    // Tokens are single-use: guard against the double effect run in development (StrictMode).
    if (!token || started.current) return;
    started.current = true;
    verify.mutate(token);
  }, [token, verify]);

  if (token) {
    const continueTo = signedIn && user ? homeFor(user) : "/login";
    return (
      <AuthLayout eyebrow={t("auth.verify.eyebrow")} title={t(verify.isError ? "auth.verify.failedTitle" : verify.isSuccess ? "auth.verify.doneTitle" : "auth.verify.workingTitle")}>
        <div aria-live="polite">
          {(verify.isPending || verify.isIdle) && (
            <p className="mb-4 flex items-center gap-3 text-[15px] text-muted"><Loader2 className="h-5 w-5 animate-spin" aria-hidden />{t("auth.verify.working")}</p>
          )}
          {!verify.isError && (
            <VerifyResult loading={verify.isPending || verify.isIdle} email={verify.data?.email ?? null} continueTo={continueTo} signedIn={signedIn} />
          )}
          {verify.isError && (
            <div className="space-y-5">
              <div className="flex items-start gap-4 rounded-2xl border border-rose/30 bg-rose-soft p-5">
                <MailX className="mt-0.5 h-6 w-6 shrink-0 text-rose" aria-hidden />
                <div className="text-[14.5px] leading-relaxed text-ink-2">
                  <p className="font-medium text-rose">{authErrorMessage(t, verify.error, { tokenFlow: true })}</p>
                  <p className="mt-1">{t(signedIn ? "auth.verify.failedSignedIn" : "auth.verify.failedSignedOut")}</p>
                </div>
              </div>
              {signedIn ? <Resend /> : (
                <Link to="/login" className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[14.5px] font-medium text-paper hover:bg-ink-2">{t("auth.verify.signIn")}</Link>
              )}
            </div>
          )}
        </div>
      </AuthLayout>
    );
  }

  // No token: the "check your inbox" screen.
  const verified = !!user?.email_verified;
  return (
    <AuthLayout
      eyebrow={t("auth.verify.eyebrow")}
      title={t(verified ? "auth.verify.alreadyTitle" : "auth.check.title")}
      subtitle={user && !verified ? t("auth.check.sent", { email: user.email }) : undefined}
      below={!verified ? <DevMailbox email={user?.email ?? null} /> : undefined}
    >
      {verified ? (
        <div className="space-y-6">
          <Notice tone="success">{t("auth.verify.already", { email: user!.email })}</Notice>
          <Link to={homeFor(user)} className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[14.5px] font-medium text-paper hover:bg-ink-2">
            {t("auth.verify.continue")}<ArrowRight className="rtl-flip h-4 w-4" aria-hidden />
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-start gap-4 rounded-2xl border border-line bg-paper/60 p-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink text-paper"><MailCheck className="h-5 w-5" aria-hidden /></span>
            <p className="text-[14.5px] leading-relaxed text-ink-2">{t(signedIn ? "auth.check.body" : "auth.verify.signedOutBody")}</p>
          </div>
          {signedIn ? <Resend /> : (
            <Link to="/login" state={{ from: "/verify-email" }} className="inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[14.5px] font-medium text-paper hover:bg-ink-2">{t("auth.verify.signIn")}</Link>
          )}
        </div>
      )}
    </AuthLayout>
  );
}
