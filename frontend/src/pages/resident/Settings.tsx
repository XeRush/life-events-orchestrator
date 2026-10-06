import { useMutation } from "@tanstack/react-query";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { BadgeCheck, CheckCircle2, KeyRound, Mail, MessageCircle, Phone, PhoneOff, ShieldCheck, UserRound, Volume2, XCircle, type LucideIcon } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { authApi, casesApi } from "../../api";
import { FIX_CASE, FIX_CASE_ITEM, FIX_CONSENTS, FIX_VERIFICATION } from "../../bones/fixtures/resident";
import { tx } from "../../components/case/text";
import { StopCallingDialog } from "../../components/voice/Dialogs";
import { Bones } from "../../components/ui/Bones";
import { Badge, Button, EmptyState, Field, Modal, SelectField, Toggle } from "../../components/ui/primitives";
import { useAction, useAuthConfig, useCase, useConsents, useMyCases, useVerification } from "../../hooks/queries";
import { LANGUAGES, useLang, useT } from "../../i18n";
import { cn, fmtDate, fmtDateTime, titleCase } from "../../lib/format";
import { useAuth } from "../../stores/auth";
import { useUI } from "../../stores/ui";
import type { CaseListItem, CaseView, Consent, Lang, Verification } from "../../types/api";

const EASE = [0.22, 1, 0.36, 1] as const;
const stack: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } } };
const rise: Variants = { hidden: { opacity: 0, y: 12 }, shown: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } } };

function Section({ id, icon, title, hint, children }: { id: string; icon: ReactNode; title: string; hint?: string; children: ReactNode }) {
  return (
    <motion.section variants={rise} id={id} tabIndex={-1} aria-labelledby={`${id}-title`} className="card scroll-mt-24 p-4 outline-none sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-paper-2 text-ink-2">{icon}</span>
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-xl">{title}</h2>
          {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
        </div>
      </div>
      {children}
    </motion.section>
  );
}

function ProfileSection() {
  const t = useT();
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const setLang = useUI((s) => s.setLang);
  const toast = useUI((s) => s.toast);
  const [name, setName] = useState(user?.full_name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [language, setLanguage] = useState<Lang>(user?.preferred_language ?? "en");
  const [sending, setSending] = useState(false);
  const save = useMutation({
    mutationFn: () => authApi.updateMe({ full_name: name.trim(), phone: phone.trim() || undefined, preferred_language: language }),
    onSuccess: (u) => { setUser(u); setLang(u.preferred_language); toast("success", t("resident.settings.profile.saved")); },
    onError: (e: Error) => toast("error", e.message),
  });
  const resend = async () => {
    setSending(true);
    try { await authApi.resendVerification(); toast("success", t("resident.intake.email.sent")); }
    catch (e) { toast("error", (e as Error).message); }
    finally { setSending(false); }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); if (name.trim().length >= 2) save.mutate(); };
  if (!user) return null;
  return (
    <Section id="profile" icon={<UserRound className="h-4 w-4" aria-hidden />} title={t("resident.settings.profile.title")} hint={t("resident.settings.profile.hint")}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label={t("resident.settings.profile.name")} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} maxLength={160}
          error={name.trim().length < 2 ? t("resident.settings.profile.nameErr") : null} className="sm:col-span-2" />
        <Field type="tel" label={t("resident.settings.profile.phone")} value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" inputMode="tel" dir="ltr" maxLength={32} />
        <SelectField label={t("resident.settings.profile.language")} value={language} onChange={(e) => setLanguage(e.target.value as Lang)} hint={t("resident.settings.profile.languageHint")}>
          {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.native}</option>)}
        </SelectField>
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-[13px] font-medium text-ink-2">{t("resident.settings.profile.email")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 text-[15px]" dir="ltr"><Mail className="h-4 w-4 text-muted" aria-hidden />{user.email}</span>
            {user.email_verified
              ? <Badge tone="civic" icon={<BadgeCheck className="h-3.5 w-3.5" aria-hidden />}>{t("resident.settings.profile.verified")}</Badge>
              : <Badge tone="amber" icon={<Mail className="h-3.5 w-3.5" aria-hidden />}>{t("resident.settings.profile.unverified")}</Badge>}
            {!user.email_verified && <Button size="sm" variant="secondary" loading={sending} onClick={() => void resend()}>{t("resident.intake.email.resend")}</Button>}
          </div>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" loading={save.isPending}>{t("resident.settings.profile.save")}</Button>
        </div>
      </form>
    </Section>
  );
}

function PasswordSection() {
  const t = useT();
  const toast = useUI((s) => s.toast);
  const config = useAuthConfig();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [tried, setTried] = useState(false);
  const mismatch = confirm.length > 0 && next !== confirm;
  const change = useMutation({
    mutationFn: () => authApi.changePassword(current, next),
    onSuccess: (r) => {
      useAuth.getState().setTokens(r.tokens);
      setCurrent(""); setNext(""); setConfirm(""); setTried(false);
      toast("success", t("resident.settings.password.changed"));
    },
    onError: (e: Error) => toast("error", e.message),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!current || !next || next !== confirm) return;
    change.mutate();
  };
  return (
    <Section id="password" icon={<KeyRound className="h-4 w-4" aria-hidden />} title={t("resident.settings.password.title")} hint={config.data?.password_rules}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field type="password" label={t("resident.settings.password.current")} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password"
          error={tried && !current ? t("resident.settings.password.needCurrent") : null} className="sm:col-span-2 sm:max-w-sm" />
        <Field type="password" label={t("resident.settings.password.new")} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password"
          error={tried && !next ? t("resident.settings.password.needNew") : null} />
        <Field type="password" label={t("resident.settings.password.confirm")} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password"
          error={mismatch || (tried && next !== confirm) ? t("resident.settings.password.mismatch") : null} />
        <div className="sm:col-span-2">
          <Button type="submit" loading={change.isPending}>{t("resident.settings.password.save")}</Button>
        </div>
      </form>
    </Section>
  );
}

function VoiceSection() {
  const t = useT();
  const speak = useUI((s) => s.speakReplies);
  const setSpeak = useUI((s) => s.setSpeak);
  return (
    <Section id="voice-pref" icon={<Volume2 className="h-4 w-4" aria-hidden />} title={t("resident.settings.voice.title")}>
      <Toggle checked={speak} onChange={setSpeak} label={t("resident.settings.speak")} description={t("resident.settings.speakHint")} />
    </Section>
  );
}

const CONSENT_TYPES: Consent["consent_type"][] = ["DATA_PROCESSING", "SERVICE_FILING", "CALLBACK"];

function latest(consents: Consent[] | undefined, type: Consent["consent_type"]): Consent | undefined {
  return (consents ?? []).filter((c) => c.consent_type === type).sort((a, b) => b.captured_at.localeCompare(a.captured_at))[0];
}

/** Consent, calls and verification for one case: every switch here is a real API call and lands on the case timeline.
 * Presentational for the data (props); the mutations live here because each switch acts at once. */
export function CasePrivacyCard({ item, consents, view, verification }: {
  item: CaseListItem; consents: Consent[] | undefined; view: CaseView | undefined; verification: Verification[] | undefined;
}) {
  const t = useT();
  const lang = useLang();
  const ref = item.reference;
  const [confirmType, setConfirmType] = useState<Consent["consent_type"] | null>(null);
  const [stopOpen, setStopOpen] = useState(false);
  const setConsent = useAction(
    ({ type, granted }: { type: Consent["consent_type"]; granted: boolean }) => casesApi.setConsent(ref, type, granted),
    { success: t("resident.settings.consent.updated") },
  );
  const optOut = useAction(() => casesApi.optOut(ref), { success: t("resident.settings.calls.stopped") });
  const optIn = useAction(() => casesApi.optIn(ref), { success: t("resident.settings.calls.resumed") });
  const sms = view?.channel_mode === "SMS_ONLY";

  const toggle = (type: Consent["consent_type"], next: boolean) => {
    if (!next && type !== "CALLBACK") { setConfirmType(type); return; }
    setConsent.mutate({ type, granted: next });
  };

  return (
    <section aria-labelledby={`case-${ref}-title`} className="card overflow-hidden">
      <div className="border-b border-line bg-paper-2/40 px-4 py-3.5 sm:px-6">
        <p className="font-mono text-xs text-muted">{ref}</p>
        <h3 id={`case-${ref}-title`} className="text-lg">{item.child_name ? t("resident.settings.case.title", { child: item.child_name }) : t("resident.dash.titleNoChild")}</h3>
      </div>

      <div className="space-y-6 px-4 py-5 sm:px-6">
        <div>
          <h4 className="mb-1 font-sans text-[15px] font-semibold tracking-normal">{t("resident.settings.consent.title")}</h4>
          <p className="mb-3 text-sm text-muted">{t("resident.settings.consent.hint")}</p>
          <ul className="divide-y divide-line">
            {CONSENT_TYPES.map((type) => {
              const c = latest(consents, type);
              const granted = c?.status === "GRANTED";
              return (
                <li key={type} className="py-3.5 first:pt-0">
                  <Toggle checked={granted} disabled={setConsent.isPending}
                    onChange={(v) => toggle(type, v)}
                    label={<span className="flex flex-wrap items-center gap-2">{t(`resident.consent.${type}.title`)}
                      {type !== "CALLBACK" && <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[11px] font-medium text-muted">{t("resident.consent.required")}</span>}</span>}
                    description={t(`resident.consent.${type}.scope`)} />
                  <p className="mt-2 text-xs text-muted" aria-live="polite">
                    {!c ? t("resident.settings.consent.never")
                      : granted ? t("resident.settings.consent.givenMeta", { date: fmtDate(c.captured_at, lang), via: tx(t, `resident.settings.via.${c.source}`, titleCase(c.source)), version: c.version })
                      : t("resident.settings.consent.withdrawnMeta", { date: fmtDate(c.revoked_at ?? c.captured_at, lang), version: c.version })}
                  </p>
                  {type === "CALLBACK" && granted && (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-civic">
                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden />{c?.token_present ? t("resident.settings.consent.token") : t("resident.settings.consent.noToken")}
                    </p>
                  )}
                  {type === "CALLBACK" && granted && sms && <p className="mt-1 text-xs text-amber">{t("resident.settings.consent.optedOutNote")}</p>}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-2xl border border-line p-4">
          <div className="flex items-start gap-3">
            <span className={sms ? "grid h-9 w-9 shrink-0 place-items-center rounded-full bg-violet-soft text-violet" : "grid h-9 w-9 shrink-0 place-items-center rounded-full bg-civic-soft text-civic"}>
              {sms ? <MessageCircle className="h-4 w-4" aria-hidden /> : <Phone className="h-4 w-4" aria-hidden />}
            </span>
            <div className="min-w-0 flex-1" aria-live="polite">
              <h4 className="font-sans text-[15px] font-semibold tracking-normal">{sms ? t("resident.contact.smsOnly") : t("resident.contact.voice")}</h4>
              <p className="mt-0.5 text-sm text-muted">
                {sms ? t("resident.settings.calls.stoppedHint", { date: fmtDate(view?.opted_out_at, lang) }) : t("resident.settings.calls.onHint")}
              </p>
              <div className="mt-3">
                {sms ? (
                  <>
                    <Button size="sm" variant="civic" className="min-h-10 sm:min-h-8" icon={<Phone className="h-4 w-4" aria-hidden />} loading={optIn.isPending} onClick={() => optIn.mutate(undefined)}>{t("resident.settings.calls.resume")}</Button>
                    <p className="mt-2 text-xs text-muted">{t("resident.settings.calls.resumeHint")}</p>
                  </>
                ) : (
                  <Button size="sm" variant="secondary" className="min-h-10 sm:min-h-8" icon={<PhoneOff className="h-4 w-4" aria-hidden />} onClick={() => setStopOpen(true)}>{t("resident.voice.ctl.stop")}</Button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div>
          <h4 className="mb-1 font-sans text-[15px] font-semibold tracking-normal">{t("resident.settings.verify.title")}</h4>
          <p className="mb-3 text-sm text-muted">{t("resident.settings.verify.hint")}</p>
          {(verification?.length ?? 0) === 0 ? (
            <p className="rounded-xl border border-dashed border-line-2 px-4 py-3 text-sm text-muted">{t("resident.settings.verify.none")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {verification!.map((a) => (
                <li key={a.id} className="flex items-start gap-3 py-3 text-sm">
                  {a.success ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-civic" aria-hidden /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose" aria-hidden />}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {t(a.success ? "resident.settings.verify.passed" : "resident.settings.verify.failed", { method: tx(t, `resident.voice.verify.${a.method}`, titleCase(a.method)), n: a.attempt_no })}
                    </p>
                    {a.facts_checked.length > 0 && <p className="text-xs text-muted">{t("resident.settings.verify.facts", { facts: a.facts_checked.map((f) => titleCase(f)).join(", ") })}</p>}
                    {a.failure_reason && <p className="text-xs text-rose">{a.failure_reason}</p>}
                  </div>
                  <time className="shrink-0 text-xs text-faint num" dateTime={a.created_at}>{fmtDateTime(a.created_at, lang)}</time>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Modal open={!!confirmType} onClose={() => setConfirmType(null)} title={t("resident.settings.consent.withdrawTitle")}>
        {confirmType && (
          <>
            <p className="text-[15px] leading-relaxed">{t("resident.settings.consent.withdrawBody", { consent: t(`resident.consent.${confirmType}.title`) })}</p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmType(null)}>{t("common.cancel")}</Button>
              <Button variant="danger" loading={setConsent.isPending}
                onClick={() => setConsent.mutate({ type: confirmType, granted: false }, { onSettled: () => setConfirmType(null) })}>
                {t("resident.settings.consent.withdraw")}
              </Button>
            </div>
          </>
        )}
      </Modal>
      <StopCallingDialog open={stopOpen} onClose={() => setStopOpen(false)} loading={optOut.isPending}
        onConfirm={() => optOut.mutate(undefined, { onSettled: () => setStopOpen(false) })} />
    </section>
  );
}

/** Skeleton for one case card of consent and calls; the same wrapper is rendered on /__bones for capture. */
export function SettingsBones({ loading = true, children = null }: { loading?: boolean; children?: ReactNode }) {
  return (
    <Bones name="res-settings" loading={loading} lines={8}
      fixture={import.meta.env.DEV ? <CasePrivacyCard item={FIX_CASE_ITEM} consents={FIX_CONSENTS} view={FIX_CASE} verification={FIX_VERIFICATION} /> : undefined}>
      {children}
    </Bones>
  );
}

function CasePrivacy({ item }: { item: CaseListItem }) {
  const consents = useConsents(item.reference);
  const view = useCase(item.reference);
  const verification = useVerification(item.reference);
  const loading = consents.isLoading || view.isLoading || verification.isLoading;
  return (
    <SettingsBones loading={loading}>
      {!loading && <CasePrivacyCard item={item} consents={consents.data} view={view.data} verification={verification.data} />}
    </SettingsBones>
  );
}

function CasesPrivacy() {
  const t = useT();
  const cases = useMyCases();
  return (
    <motion.section variants={rise} id="privacy" tabIndex={-1} aria-labelledby="privacy-title" className="scroll-mt-24 space-y-3 outline-none">
      <div className="pt-2">
        <h2 id="privacy-title" className="text-2xl">{t("resident.settings.cases.title")}</h2>
        <p className="mt-1 text-sm text-muted">{t("resident.settings.cases.hint")}</p>
      </div>
      {cases.isLoading ? <SettingsBones />
        : (cases.data?.items.length ?? 0) === 0 ? <EmptyState title={t("resident.settings.cases.noneTitle")} hint={t("resident.settings.cases.noneHint")} />
        : <div className="space-y-4">{cases.data!.items.map((c) => <CasePrivacy key={c.reference} item={c} />)}</div>}
    </motion.section>
  );
}

/** In-page navigation down the side on large screens; the marker follows the section in view. */
function SettingsNav({ items }: { items: { id: string; label: string; icon: LucideIcon }[] }) {
  const t = useT();
  const reduce = useReducedMotion();
  const [active, setActive] = useState(items[0]?.id);
  const ids = items.map((i) => i.id).join(",");
  useEffect(() => {
    const els = ids.split(",").map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver((entries) => {
      const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (top) setActive(top.target.id);
    }, { rootMargin: "-80px 0px -55% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [ids]);
  const go = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 88, behavior: reduce ? "auto" : "smooth" });
    el.focus({ preventScroll: true });
    setActive(id);
  };
  return (
    <nav aria-label={t("resident.settings.nav")} className="hidden lg:sticky lg:top-20 lg:block lg:self-start">
      <p className="eyebrow mb-2 px-3">{t("resident.settings.nav")}</p>
      <ul className="space-y-0.5">
        {items.map((it) => {
          const on = active === it.id;
          return (
            <li key={it.id}>
              <a href={`#${it.id}`} onClick={(e) => { e.preventDefault(); go(it.id); }} aria-current={on ? "location" : undefined}
                className={cn("relative flex min-h-10 items-center gap-2.5 rounded-xl px-3 text-sm transition-colors", on ? "font-medium text-ink" : "text-ink-2 hover:bg-paper-2 hover:text-ink")}>
                {on && <motion.span layoutId="settings-nav" aria-hidden className="absolute inset-0 rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]"
                  transition={reduce ? { duration: 0 } : { duration: 0.35, ease: EASE }} />}
                <it.icon className="relative h-4 w-4 shrink-0" aria-hidden />
                <span className="relative">{it.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Settings, shared by residents (/app/settings) and staff (/officer/settings). Everyone manages profile, language and
 * password; residents also manage voice replies and, per case, consent, calls and verification history.
 */
export default function Settings() {
  const t = useT();
  const reduce = useReducedMotion();
  const user = useAuth((s) => s.user);
  const resident = user?.role === "RESIDENT";
  const nav = [
    { id: "profile", label: t("resident.settings.profile.title"), icon: UserRound },
    { id: "password", label: t("resident.settings.password.title"), icon: KeyRound },
    ...(resident ? [
      { id: "voice-pref", label: t("resident.settings.voice.title"), icon: Volume2 },
      { id: "privacy", label: t("resident.settings.cases.title"), icon: ShieldCheck },
    ] : []),
  ];
  return (
    <div>
      <header className="mb-6">
        <h1 className="text-3xl leading-tight sm:text-[38px]">{t("resident.settings.title")}</h1>
        <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-muted">{resident ? t("resident.settings.subtitleResident") : t("resident.settings.subtitleStaff")}</p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-10">
        <SettingsNav items={nav} />
        <motion.div className="min-w-0 max-w-3xl space-y-5" initial={reduce ? false : "hidden"} animate="shown" variants={stack}>
          <ProfileSection />
          <PasswordSection />
          {resident && <VoiceSection />}
          {resident && <CasesPrivacy />}
        </motion.div>
      </div>
    </div>
  );
}
