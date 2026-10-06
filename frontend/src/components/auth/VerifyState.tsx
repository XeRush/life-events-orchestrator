import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { FIXTURE_VERIFIED_EMAIL } from "../../bones/fixtures/public";
import { useT } from "../../i18n";
import { Bones } from "../ui/Bones";

/** "Email address confirmed" panel with the way onward. */
export function VerifiedPanel({ email, continueTo, signedIn }: { email: string; continueTo: string; signedIn: boolean }) {
  const t = useT();
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4 rounded-2xl border border-civic/30 bg-civic-soft/60 p-5">
        <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-civic" aria-hidden />
        <div className="min-w-0 text-[14.5px] leading-relaxed text-ink-2">
          <p className="break-words font-medium text-civic">{t("auth.verify.done", { email })}</p>
          <p className="mt-1">{t("auth.verify.doneBody")}</p>
        </div>
      </div>
      <Link to={continueTo} state={signedIn ? undefined : { email }} className="group inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[14.5px] font-medium text-paper transition-colors hover:bg-ink-2">
        {t(signedIn ? "auth.verify.continue" : "auth.verify.signIn")}<ArrowRight className="rtl-flip h-4 w-4 transition-[translate] group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" aria-hidden />
      </Link>
    </div>
  );
}

/** The confirmation result while the single-use token is checked: "pub-verify-state". */
export function VerifyResult({ loading, email, continueTo, signedIn }: { loading: boolean; email: string | null; continueTo: string; signedIn: boolean }) {
  return (
    <Bones name="pub-verify-state" loading={loading} lines={3}
      fixture={<VerifiedPanel email={FIXTURE_VERIFIED_EMAIL} continueTo="/login" signedIn={false} />}>
      {email ? <VerifiedPanel email={email} continueTo={continueTo} signedIn={signedIn} /> : null}
    </Bones>
  );
}
