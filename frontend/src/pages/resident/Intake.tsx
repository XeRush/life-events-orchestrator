import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, CircleHelp, Lock, Mail, PencilLine, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { authApi, casesApi } from "../../api";
import { ApiError } from "../../api/client";
import { EMIRATES, fmtDay, isValidEid, localIsoDate, maskEid, type Emirate } from "../../components/case/text";
import { LanguagePicker } from "../../components/voice/Dialogs";
import { Button, Checkbox, Field, SelectField } from "../../components/ui/primitives";
import { useAuthConfig } from "../../hooks/queries";
import { LANGUAGES, isRTL, useLang, useT, type MessageKey } from "../../i18n";
import { cn } from "../../lib/format";
import { useAuth } from "../../stores/auth";
import { useUI } from "../../stores/ui";
import type { IntakeInput, Lang } from "../../types/api";

const STEPS = ["language", "child", "parents", "marriage", "consent", "review"] as const;
type Step = (typeof STEPS)[number];
type Marriage = "yes" | "no" | "unsure";

interface FormState {
  language: Lang; emirate: Emirate;
  childNameEn: string; childNameAr: string; dob: string; sex: "" | "F" | "M"; hospital: string; nationality: string; notificationRef: string;
  motherName: string; motherNationality: string; motherEid: string;
  fatherName: string; fatherNationality: string; fatherEid: string; phone: string;
  marriage: Marriage | null;
  consentData: boolean; consentFiling: boolean; consentCallback: boolean;
}
type Errors = Partial<Record<keyof FormState | "parents", MessageKey>>;

const CONSENT_VERSION = "2026-10";
// Data, not interface copy: the values the API and the voice agent recognise.
const NATIONALITIES = ["Indian", "Pakistani", "Filipino", "Bangladeshi", "Egyptian", "British", "Jordanian", "Lebanese", "Syrian", "Sri Lankan",
  "Nepali", "American", "Canadian", "Sudanese", "Indonesian", "Kenyan", "Nigerian", "Chinese", "Russian", "French", "German"];
const HOSPITALS = ["Latifa Hospital", "Dubai Hospital", "Mediclinic City Hospital", "American Hospital Dubai", "Corniche Hospital",
  "Danat Al Emarat Hospital", "Al Qassimi Women's and Children's Hospital", "Saudi German Hospital"];

function minDob(): string {
  const d = new Date();
  d.setDate(d.getDate() - 365);
  return localIsoDate(d);
}

function validate(step: Step, f: FormState): Errors {
  const e: Errors = {};
  if (step === "child") {
    if (f.childNameEn.trim().length < 2) e.childNameEn = "resident.intake.err.childName";
    if (!f.dob) e.dob = "resident.intake.err.dob";
    else if (f.dob > localIsoDate()) e.dob = "resident.intake.err.dobFuture";
    else if (f.dob < minDob()) e.dob = "resident.intake.err.dobOld";
    if (f.hospital.trim().length < 2) e.hospital = "resident.intake.err.hospital";
    if (f.nationality.trim().length < 2) e.nationality = "resident.intake.err.nationality";
  }
  if (step === "parents") {
    if (!f.fatherName.trim() && !f.motherName.trim()) e.parents = "resident.intake.err.parentRequired";
    if (f.motherEid.trim() && !isValidEid(f.motherEid)) e.motherEid = "resident.intake.err.eid";
    if (f.fatherEid.trim() && !isValidEid(f.fatherEid)) e.fatherEid = "resident.intake.err.eid";
    if (f.motherEid.trim() && !f.motherName.trim()) e.motherName = "resident.intake.err.nameForEid";
    if (f.fatherEid.trim() && !f.fatherName.trim()) e.fatherName = "resident.intake.err.nameForEid";
    if (f.phone.trim() && f.phone.replace(/\D/g, "").length < 7) e.phone = "resident.intake.err.phone";
  }
  if (step === "marriage" && f.marriage === null) e.marriage = "resident.intake.err.marriage";
  if (step === "consent") {
    if (!f.consentData) e.consentData = "resident.intake.err.consentData";
    if (!f.consentFiling) e.consentFiling = "resident.intake.err.consentFiling";
  }
  return e;
}

function toInput(f: FormState): IntakeInput {
  const opt = (s: string) => (s.trim() ? s.trim() : null);
  const eid = (s: string) => (s.trim() ? s.replace(/\D/g, "") : null);
  return {
    language: f.language, emirate: f.emirate,
    child_full_name_en: f.childNameEn.trim(), child_full_name_ar: opt(f.childNameAr), child_date_of_birth: f.dob, child_sex: f.sex || null,
    place_of_birth: f.hospital.trim(), child_nationality: f.nationality.trim(), birth_notification_ref: opt(f.notificationRef),
    mother_full_name: opt(f.motherName), mother_nationality: opt(f.motherNationality), mother_emirates_id: eid(f.motherEid),
    father_full_name: opt(f.fatherName), father_nationality: opt(f.fatherNationality), father_emirates_id: eid(f.fatherEid),
    marriage_certificate_attested: f.marriage === "yes" ? true : f.marriage === "no" ? false : null,
    phone: opt(f.phone),
    consent_data_processing: f.consentData, consent_service_filing: f.consentFiling, consent_callback: f.consentCallback,
  };
}

function Choice({ name, value, checked, onChange, title, hint, icon }: {
  name: string; value: string; checked: boolean; onChange: () => void; title: string; hint?: string; icon?: ReactNode;
}) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border bg-surface p-4 transition-colors focus-within:ring-2 focus-within:ring-ink/15",
      checked ? "border-ink/60 shadow-[var(--shadow-card)]" : "border-line hover:border-line-2")}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="mt-1 h-4 w-4 cursor-pointer accent-[var(--color-ink)]" />
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-[15px] font-medium">{icon}{title}</span>
        {hint && <span className="mt-0.5 block text-sm text-muted">{hint}</span>}
      </span>
    </label>
  );
}

function ReviewBlock({ title, onEdit, editLabel, children }: { title: string; onEdit: () => void; editLabel: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-5 first:border-t-0 first:pt-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="font-sans text-[15px] font-semibold tracking-normal">{title}</h3>
        <button type="button" onClick={onEdit} className="inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-sm text-azure hover:bg-azure-soft/60">
          <PencilLine className="h-3.5 w-3.5" aria-hidden />{editLabel}
        </button>
      </div>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium break-words">{value || "-"}</dd>
    </div>
  );
}

/** Report a birth: six short steps, captured once. The case, the graph and the document list are built from this. */
export default function Intake() {
  const t = useT();
  const lang = useLang();
  const setLang = useUI((s) => s.setLang);
  const toast = useUI((s) => s.toast);
  const reduce = useReducedMotion();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const authConfig = useAuthConfig();
  const [index, setIndex] = useState(0);
  const [reached, setReached] = useState(0);
  const [dir, setDir] = useState(1);
  const [errors, setErrors] = useState<Errors>({});
  const [emailBlocked, setEmailBlocked] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const [form, setForm] = useState<FormState>({
    language: lang, emirate: "DUBAI",
    childNameEn: "", childNameAr: "", dob: "", sex: "", hospital: "", nationality: "", notificationRef: "",
    motherName: "", motherNationality: "", motherEid: "", fatherName: "", fatherNationality: "", fatherEid: "", phone: user?.phone ?? "",
    marriage: null, consentData: false, consentFiling: false, consentCallback: false,
  });
  const step = STEPS[index];
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      if (!e[key] && !(key.endsWith("Name") && e.parents)) return e;
      const next = { ...e };
      delete next[key];
      if (key.endsWith("Name")) delete next.parents;
      return next;
    });
  };
  const err = (key: keyof FormState) => (errors[key] ? t(errors[key]!) : null);

  // The header language switcher and the language step stay in agreement.
  useEffect(() => { setForm((f) => (f.language === lang ? f : { ...f, language: lang })); }, [lang]);

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }, [index, reduce]);

  const create = useMutation({
    mutationFn: (body: IntakeInput) => casesApi.create(body),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["cases"] });
      navigate(`/app/cases/${r.case.reference}`, { state: { opened: true, created: r.created } });
    },
    onError: (e: Error) => {
      if (e instanceof ApiError && e.code === "email_not_verified") { setEmailBlocked(true); setSubmitError(null); }
      else setSubmitError(e.message);
    },
  });

  const goTo = (target: number) => {
    if (target === index) return;
    if (target > index) {
      for (let i = index; i < target; i++) {
        const e = validate(STEPS[i], form);
        if (Object.keys(e).length) { setErrors(e); if (i !== index) { setDir(1); setIndex(i); } return; }
      }
    }
    setErrors({});
    setDir(target > index ? 1 : -1);
    setIndex(target);
    setReached((r) => Math.max(r, target));
  };
  const next = () => goTo(Math.min(index + 1, STEPS.length - 1));
  const back = () => goTo(Math.max(index - 1, 0));
  const chooseLanguage = (code: Lang) => {
    set("language", code);
    setLang(code);
    authApi.updateMe({ preferred_language: code }).then((u) => useAuth.getState().setUser(u)).catch(() => undefined);
  };
  const submit = () => {
    for (const s of STEPS) {
      const e = validate(s, form);
      if (Object.keys(e).length) { setErrors(e); setDir(-1); setIndex(STEPS.indexOf(s)); return; }
    }
    setSubmitError(null);
    create.mutate(toInput(form));
  };
  const resend = async () => {
    setResending(true);
    try { await authApi.resendVerification(); toast("success", t("resident.intake.email.sent")); }
    catch (e) { toast("error", (e as Error).message); }
    finally { setResending(false); }
  };
  const recheck = async () => {
    try {
      const me = await authApi.me();
      useAuth.getState().setUser(me);
      if (me.email_verified) { setEmailBlocked(false); toast("success", t("resident.intake.email.confirmed")); }
      else toast("info", t("resident.intake.email.stillPending"));
    } catch (e) { toast("error", (e as Error).message); }
  };

  const rtl = isRTL(lang);
  const shift = reduce ? 0 : 28 * (rtl ? -1 : 1);
  const variants = {
    enter: (d: number) => ({ opacity: 0, x: d * shift }),
    center: { opacity: 1, x: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const } },
    exit: (d: number) => ({ opacity: 0, x: -d * shift, transition: { duration: 0.18 } }),
  };
  const emailPending = !!user && !user.email_verified && !!authConfig.data?.require_email_verification;
  const hasErrors = Object.keys(errors).length > 0;
  const emirateName = (e: Emirate) => t(`resident.emirate.${e}`);
  const authorityKey: MessageKey = form.emirate === "DUBAI" ? "resident.intake.child.authority.DUBAI"
    : form.emirate === "ABU_DHABI" ? "resident.intake.child.authority.ABU_DHABI" : "resident.intake.child.authority.OTHER";

  const emailPanel = (
    <div role="alert" className="rounded-2xl border border-amber/40 bg-amber-soft/70 p-5">
      <p className="flex items-center gap-2 font-medium text-ink"><Mail className="h-5 w-5 text-amber" aria-hidden />{t("resident.intake.email.title")}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{t("resident.intake.email.body", { email: user?.email ?? "" })}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void resend()} loading={resending}>{t("resident.intake.email.resend")}</Button>
        <Button size="sm" variant="secondary" onClick={() => void recheck()}>{t("resident.intake.email.recheck")}</Button>
      </div>
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-10">
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <h1 className="text-3xl leading-tight sm:text-[38px]">{t("resident.intake.title")}</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{t("resident.intake.subtitle")}</p>

        <div className="mt-4 lg:hidden">
          <p className="mb-2 text-sm font-medium" aria-live="polite">{t("resident.intake.progress", { n: index + 1, total: STEPS.length, step: t(`resident.intake.step.${step}`) })}</p>
          <div role="progressbar" aria-valuenow={index + 1} aria-valuemin={1} aria-valuemax={STEPS.length} aria-label={t("resident.intake.progressLabel")}
            className="h-1.5 w-full overflow-hidden rounded-full bg-paper-2">
            <motion.div className="h-full w-full origin-left rounded-full bg-civic rtl:origin-right" initial={false}
              animate={{ scaleX: (index + 1) / STEPS.length }} transition={reduce ? { duration: 0 } : { duration: 0.5, ease: [0.22, 1, 0.36, 1] }} />
          </div>
        </div>

        <nav aria-label={t("resident.intake.progressLabel")} className="mt-6 hidden lg:block">
          <ol className="relative space-y-1">
            <span aria-hidden className="absolute bottom-4 start-[15px] top-4 w-px bg-line-2" />
            <motion.span aria-hidden className="absolute bottom-4 start-[15px] top-4 w-px origin-top bg-civic" initial={false}
              animate={{ scaleY: index / (STEPS.length - 1) }} transition={reduce ? { duration: 0 } : { duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />
            {STEPS.map((s, i) => {
              const done = i < index;
              const current = i === index;
              return (
                <li key={s}>
                  <button type="button" onClick={() => goTo(i)} disabled={i > reached && i > index + 1} aria-current={current ? "step" : undefined}
                    className={cn("relative flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-xl py-1 pe-2 text-start text-sm transition-colors disabled:cursor-default",
                      current ? "font-semibold text-ink" : done ? "text-ink-2 hover:text-ink" : "text-muted")}>
                    <span className={cn("relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs transition-[background-color,border-color,color,transform] duration-300",
                      current ? "scale-105 border-ink bg-ink text-paper" : done ? "border-civic bg-civic text-on-accent" : "border-line-2 bg-paper text-muted")}>
                      {done ? <Check className="h-4 w-4" aria-hidden /> : <span className="font-mono">{i + 1}</span>}
                    </span>
                    {t(`resident.intake.step.${s}`)}
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-muted">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-civic" aria-hidden />{t("resident.intake.once")}
          </p>
        </nav>
      </aside>

      <div className="min-w-0">
        {emailPending && !emailBlocked && <div className="mb-4">{emailPanel}</div>}
        <div className="card overflow-hidden">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div key={step} custom={dir} variants={variants} initial="enter" animate="center" exit="exit" className="p-4 sm:p-7">
              <h2 ref={heading} tabIndex={-1} className="text-2xl leading-snug outline-none sm:text-[28px]">{t(`resident.intake.${step}.title`)}</h2>
              <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">{t(`resident.intake.${step}.hint`)}</p>

              <div className="mt-5">
                {step === "language" && (
                  <LanguagePicker name={t("resident.intake.language.title")} value={form.language} onChange={chooseLanguage} />
                )}

                {step === "child" && (
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label={t("resident.intake.child.nameEn")} hint={t("resident.intake.child.nameEnHint")} value={form.childNameEn}
                      onChange={(e) => set("childNameEn", e.target.value)} error={err("childNameEn")} autoComplete="off" maxLength={160} required className="sm:col-span-2" />
                    <Field label={t("resident.intake.child.nameAr")} hint={t("resident.intake.optional")} value={form.childNameAr}
                      onChange={(e) => set("childNameAr", e.target.value)} dir="rtl" lang="ar" autoComplete="off" maxLength={160} className="sm:col-span-2" />
                    <Field type="date" label={t("resident.intake.child.dob")} value={form.dob} min={minDob()} max={localIsoDate()}
                      onChange={(e) => set("dob", e.target.value)} error={err("dob")} required />
                    <fieldset>
                      <legend className="mb-1.5 block text-[13px] font-medium text-ink-2">{t("resident.intake.child.sex")}</legend>
                      <div className="flex h-11 flex-wrap items-center gap-x-5 gap-y-1">
                        {([["F", "resident.intake.child.girl"], ["M", "resident.intake.child.boy"], ["", "resident.intake.child.unsaid"]] as const).map(([value, key]) => (
                          <label key={value || "none"} className="inline-flex cursor-pointer items-center gap-2 text-[15px]">
                            <input type="radio" name="sex" checked={form.sex === value} onChange={() => set("sex", value)} className="h-4 w-4 cursor-pointer accent-[var(--color-ink)]" />
                            {t(key)}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <SelectField label={t("resident.intake.child.emirate")} value={form.emirate} onChange={(e) => set("emirate", e.target.value as Emirate)}
                      hint={t(authorityKey)} className="sm:col-span-2">
                      {EMIRATES.map((e) => <option key={e} value={e}>{emirateName(e)}</option>)}
                    </SelectField>
                    <Field label={t("resident.intake.child.hospital")} value={form.hospital} list="ll-hospitals" onChange={(e) => set("hospital", e.target.value)}
                      error={err("hospital")} autoComplete="off" maxLength={160} required />
                    <Field label={t("resident.intake.child.nationality")} hint={t("resident.intake.child.nationalityHint")} value={form.nationality} list="ll-nationalities"
                      onChange={(e) => set("nationality", e.target.value)} error={err("nationality")} autoComplete="off" maxLength={60} required />
                    <Field label={t("resident.intake.child.notification")} hint={t("resident.intake.child.notificationHint")} value={form.notificationRef}
                      onChange={(e) => set("notificationRef", e.target.value)} autoComplete="off" maxLength={40} dir="ltr" className="sm:col-span-2" />
                    <datalist id="ll-hospitals">{HOSPITALS.map((h) => <option key={h} value={h} />)}</datalist>
                    <datalist id="ll-nationalities">{NATIONALITIES.map((n) => <option key={n} value={n} />)}</datalist>
                  </div>
                )}

                {step === "parents" && (
                  <div className="space-y-6">
                    {errors.parents && <p role="alert" className="rounded-xl bg-rose-soft px-4 py-3 text-sm text-rose">{t(errors.parents)}</p>}
                    {(["mother", "father"] as const).map((who) => {
                      const nameKey = `${who}Name` as const;
                      const natKey = `${who}Nationality` as const;
                      const eidKey = `${who}Eid` as const;
                      const eid = form[eidKey];
                      return (
                        <fieldset key={who} className="grid gap-5 sm:grid-cols-2">
                          <legend className="mb-3 font-display text-xl">{t(`resident.intake.parents.${who}`)}</legend>
                          <Field label={t("resident.intake.parents.name")} value={form[nameKey]} onChange={(e) => set(nameKey, e.target.value)}
                            error={err(nameKey)} autoComplete="off" maxLength={160} className="sm:col-span-2" />
                          <Field label={t("resident.intake.parents.nationality")} hint={t("resident.intake.parents.nationalityHint")} value={form[natKey]} list="ll-nationalities-p"
                            onChange={(e) => set(natKey, e.target.value)} autoComplete="off" maxLength={60} />
                          <div>
                            <Field label={t("resident.intake.parents.eid")} value={eid} onChange={(e) => set(eidKey, e.target.value)} error={err(eidKey)}
                              hint={t("resident.intake.parents.eidHint")} inputMode="numeric" autoComplete="off" spellCheck={false} maxLength={18} dir="ltr" placeholder="784-XXXX-XXXXXXX-X" />
                            {eid && isValidEid(eid) && (
                              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-civic">
                                <Lock className="h-3.5 w-3.5" aria-hidden />{t("resident.intake.parents.eidOk", { mask: maskEid(eid) })}
                              </p>
                            )}
                          </div>
                        </fieldset>
                      );
                    })}
                    <datalist id="ll-nationalities-p">{NATIONALITIES.map((n) => <option key={n} value={n} />)}</datalist>
                    <div className="border-t border-line pt-6">
                      <Field type="tel" label={t("resident.intake.parents.phone")} hint={t("resident.intake.parents.phoneHint")} value={form.phone}
                        onChange={(e) => set("phone", e.target.value)} error={err("phone")} autoComplete="tel" inputMode="tel" maxLength={32} dir="ltr" className="max-w-sm" />
                    </div>
                  </div>
                )}

                {step === "marriage" && (
                  <div className="space-y-6">
                    <ol className="grid gap-2 sm:grid-cols-3" aria-label={t("resident.intake.marriage.chain")}>
                      {(["home", "embassy", "mofa"] as const).map((s, i) => (
                        <li key={s} className="flex items-center gap-2 rounded-2xl border border-line bg-paper-2/60 px-4 py-3 text-sm">
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface font-mono text-xs">{i + 1}</span>
                          <span className="min-w-0 flex-1">{t(`resident.intake.marriage.${s}`)}</span>
                          {i < 2 && <ArrowRight className="hidden h-4 w-4 shrink-0 text-faint rtl-flip sm:block" aria-hidden />}
                        </li>
                      ))}
                    </ol>
                    <fieldset>
                      <legend className="mb-3 text-[15px] font-medium">{t("resident.intake.marriage.question")}</legend>
                      <div className="grid gap-2">
                        <Choice name="marriage" value="yes" checked={form.marriage === "yes"} onChange={() => set("marriage", "yes")} title={t("resident.intake.marriage.yes")} hint={t("resident.intake.marriage.yesHint")} />
                        <Choice name="marriage" value="no" checked={form.marriage === "no"} onChange={() => set("marriage", "no")} title={t("resident.intake.marriage.no")} hint={t("resident.intake.marriage.noHint")} />
                        <Choice name="marriage" value="unsure" checked={form.marriage === "unsure"} onChange={() => set("marriage", "unsure")} title={t("resident.intake.marriage.unsure")}
                          hint={t("resident.intake.marriage.unsureHint")} icon={<CircleHelp className="h-4 w-4 text-muted" aria-hidden />} />
                      </div>
                      {errors.marriage && <p role="alert" className="mt-2 text-sm text-rose">{t(errors.marriage)}</p>}
                    </fieldset>
                    <AnimatePresence initial={false}>
                      {form.marriage === "no" && (
                        <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden rounded-2xl border border-amber/40 bg-amber-soft/60 px-4 py-3 text-sm leading-relaxed text-ink-2">
                          {t("resident.intake.marriage.waits")}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {step === "consent" && (
                  <div className="space-y-3">
                    <Checkbox checked={form.consentData} onChange={(v) => set("consentData", v)} required
                      label={<span className="flex flex-wrap items-center gap-2">{t("resident.consent.DATA_PROCESSING.title")}<span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-medium text-paper">{t("resident.consent.required")}</span></span>}
                      description={t("resident.consent.DATA_PROCESSING.scope")} />
                    {errors.consentData && <p role="alert" className="ps-1 text-sm text-rose">{t(errors.consentData)}</p>}
                    <Checkbox checked={form.consentFiling} onChange={(v) => set("consentFiling", v)} required
                      label={<span className="flex flex-wrap items-center gap-2">{t("resident.consent.SERVICE_FILING.title")}<span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-medium text-paper">{t("resident.consent.required")}</span></span>}
                      description={t("resident.consent.SERVICE_FILING.scope")} />
                    {errors.consentFiling && <p role="alert" className="ps-1 text-sm text-rose">{t(errors.consentFiling)}</p>}
                    <Checkbox checked={form.consentCallback} onChange={(v) => set("consentCallback", v)}
                      label={<span className="flex flex-wrap items-center gap-2">{t("resident.consent.CALLBACK.title")}<span className="rounded-full border border-line-2 px-2 py-0.5 text-[11px] font-medium text-muted">{t("resident.consent.optional")}</span></span>}
                      description={<>{t("resident.consent.CALLBACK.scope")} <strong className="font-medium text-ink-2">{t("resident.consent.CALLBACK.stop")}</strong></>} />
                    <div className="mt-5 rounded-2xl bg-paper-2/70 px-4 py-3.5 text-sm leading-relaxed text-ink-2">
                      <p>{t("resident.consent.how")}</p>
                      <p className="mt-2 font-mono text-xs text-muted">{t("resident.consent.version", { version: CONSENT_VERSION })}</p>
                    </div>
                  </div>
                )}

                {step === "review" && (
                  <div>
                    <ReviewBlock title={t("resident.intake.step.language")} onEdit={() => goTo(0)} editLabel={t("resident.intake.edit")}>
                      <Row label={t("resident.intake.review.language")} value={LANGUAGES.find((l) => l.code === form.language)?.native} />
                    </ReviewBlock>
                    <ReviewBlock title={t("resident.intake.step.child")} onEdit={() => goTo(1)} editLabel={t("resident.intake.edit")}>
                      <Row label={t("resident.intake.child.nameEn")} value={form.childNameEn} />
                      {form.childNameAr && <Row label={t("resident.intake.child.nameAr")} value={<span dir="rtl" lang="ar">{form.childNameAr}</span>} />}
                      <Row label={t("resident.intake.child.dob")} value={form.dob ? fmtDay(form.dob, lang) : ""} />
                      <Row label={t("resident.intake.child.sex")} value={form.sex === "F" ? t("resident.intake.child.girl") : form.sex === "M" ? t("resident.intake.child.boy") : t("resident.intake.child.unsaid")} />
                      <Row label={t("resident.intake.child.emirate")} value={emirateName(form.emirate)} />
                      <Row label={t("resident.intake.child.hospital")} value={form.hospital} />
                      <Row label={t("resident.intake.child.nationality")} value={form.nationality} />
                      {form.notificationRef && <Row label={t("resident.intake.child.notification")} value={form.notificationRef} />}
                    </ReviewBlock>
                    <ReviewBlock title={t("resident.intake.step.parents")} onEdit={() => goTo(2)} editLabel={t("resident.intake.edit")}>
                      {form.motherName && <Row label={t("resident.intake.parents.mother")} value={<>{form.motherName}{form.motherEid && <span className="block font-mono text-xs font-normal text-muted" dir="ltr">{maskEid(form.motherEid)}</span>}</>} />}
                      {form.fatherName && <Row label={t("resident.intake.parents.father")} value={<>{form.fatherName}{form.fatherEid && <span className="block font-mono text-xs font-normal text-muted" dir="ltr">{maskEid(form.fatherEid)}</span>}</>} />}
                      <Row label={t("resident.intake.parents.phone")} value={form.phone ? <span dir="ltr">{form.phone}</span> : t("resident.intake.review.noPhone")} />
                    </ReviewBlock>
                    <ReviewBlock title={t("resident.intake.step.marriage")} onEdit={() => goTo(3)} editLabel={t("resident.intake.edit")}>
                      <Row label={t("resident.intake.marriage.question")} value={form.marriage ? t(`resident.intake.marriage.${form.marriage}`) : ""} />
                    </ReviewBlock>
                    <ReviewBlock title={t("resident.intake.step.consent")} onEdit={() => goTo(4)} editLabel={t("resident.intake.edit")}>
                      <Row label={t("resident.consent.DATA_PROCESSING.title")} value={form.consentData ? t("resident.consent.given") : t("resident.consent.notGiven")} />
                      <Row label={t("resident.consent.SERVICE_FILING.title")} value={form.consentFiling ? t("resident.consent.given") : t("resident.consent.notGiven")} />
                      <Row label={t("resident.consent.CALLBACK.title")} value={form.consentCallback ? t("resident.consent.given") : t("resident.consent.notGiven")} />
                      <Row label={t("resident.consent.versionLabel")} value={<span className="font-mono">{CONSENT_VERSION}</span>} />
                    </ReviewBlock>
                    <p className="mt-2 rounded-2xl bg-paper-2/70 px-4 py-3.5 text-sm leading-relaxed text-ink-2">{t("resident.intake.review.next")}</p>
                    {emailBlocked && <div className="mt-5">{emailPanel}</div>}
                    {submitError && <p role="alert" className="mt-5 rounded-xl bg-rose-soft px-4 py-3 text-sm text-rose">{submitError}</p>}
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-paper-2/40 px-4 py-3.5 sm:px-7">
            <Button variant="ghost" onClick={back} disabled={index === 0} icon={<ArrowLeft className="h-4 w-4 rtl-flip" aria-hidden />}>{t("common.back")}</Button>
            <div className="flex items-center gap-3">
              {hasErrors && <p role="alert" className="hidden text-sm text-rose sm:block">{t("resident.intake.err.summary")}</p>}
              {step === "review" ? (
                <Button variant="civic" size="lg" onClick={submit} loading={create.isPending} icon={<Check className="h-4 w-4" aria-hidden />}>{t("resident.intake.submit")}</Button>
              ) : (
                <Button onClick={next} icon={<ArrowRight className="h-4 w-4 rtl-flip" aria-hidden />} className="flex-row-reverse">{t("common.continue")}</Button>
              )}
            </div>
          </div>
          {hasErrors && <p role="alert" className="px-5 pb-4 text-sm text-rose sm:hidden">{t("resident.intake.err.summary")}</p>}
        </div>
      </div>
    </div>
  );
}
