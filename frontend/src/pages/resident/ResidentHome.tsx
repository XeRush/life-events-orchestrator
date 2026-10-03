import { motion, useReducedMotion, type Variants } from "framer-motion";
import { FileText, Footprints, Landmark, Phone, PhoneOff, ShieldCheck, UserRoundCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { TextReveal } from "../../animations/motion";
import { LinkButton } from "../../components/case/CaseBits";
import { NODE_KEYS } from "../../components/case/text";
import { Bones } from "../../components/ui/Bones";
import { ErrorState } from "../../components/ui/primitives";
import { MockBadge } from "../../components/ui/StatusBadge";
import { useMyCases } from "../../hooks/queries";
import { useT } from "../../i18n";
import { useAuth } from "../../stores/auth";

const MARK: Partial<Record<(typeof NODE_KEYS)[number], typeof Footprints>> = { CONSULATE_PASSPORT: PhoneOff, EMIRATES_ID: Footprints };
const EASE = [0.22, 1, 0.36, 1] as const;
const stack: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } } };
const rise: Variants = { hidden: { opacity: 0, y: 12 }, shown: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } };

/** The welcome for a resident without a case: in plain words, the six steps that follow a birth and the two ways to start. */
export function HomeWelcome({ name }: { name?: string }) {
  const t = useT();
  const reduce = useReducedMotion();
  const title = name ? t("resident.home.titleNamed", { name }) : t("resident.home.title");
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10">
      <motion.section aria-labelledby="welcome-title" initial={reduce ? false : "hidden"} animate="shown" variants={stack}>
        <h1 id="welcome-title" className="max-w-xl text-[32px] leading-[1.12] sm:text-[44px]">
          <TextReveal text={title} />
        </h1>
        <motion.p variants={rise} className="mt-3 max-w-lg text-[17px] leading-relaxed text-ink-2">{t("resident.home.lead")}</motion.p>
        <motion.div variants={rise} className="mt-5 flex flex-wrap gap-3">
          <LinkButton to="/app/intake" size="lg" icon={<FileText className="h-5 w-5" aria-hidden />}>{t("resident.home.report")}</LinkButton>
          <LinkButton to="/app/voice" size="lg" variant="secondary" icon={<Phone className="h-5 w-5" aria-hidden />}>{t("resident.home.call")}</LinkButton>
        </motion.div>
        <motion.p variants={rise} className="mt-3 max-w-lg text-sm text-muted">{t("resident.home.choice")}</motion.p>

        <motion.ul variants={stack} className="mt-6 max-w-lg space-y-3 border-t border-line pt-5 text-sm leading-relaxed text-ink-2">
          <motion.li variants={rise} className="flex gap-3"><UserRoundCheck className="mt-0.5 h-5 w-5 shrink-0 text-violet" aria-hidden />{t("resident.home.trust.officer")}</motion.li>
          <motion.li variants={rise} className="flex gap-3"><PhoneOff className="mt-0.5 h-5 w-5 shrink-0 text-amber" aria-hidden />{t("resident.home.trust.consulate")}</motion.li>
          <motion.li variants={rise} className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-civic" aria-hidden />{t("resident.home.trust.consent")}</motion.li>
          <motion.li variants={rise} className="flex gap-3"><Landmark className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden /><span>{t("resident.home.trust.mock")} <MockBadge compact className="ms-1 align-middle" /></span></motion.li>
        </motion.ul>
      </motion.section>

      <motion.section aria-labelledby="six-title" className="card p-5 sm:p-6"
        initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: EASE, delay: 0.1 }}>
        <h2 id="six-title" className="text-2xl">{t("resident.home.sixTitle")}</h2>
        <p className="mt-1 text-sm text-muted">{t("resident.home.sixHint")}</p>
        <motion.ol className="relative mt-4" initial={reduce ? false : "hidden"} animate="shown" variants={stack}>
          <span aria-hidden className="absolute bottom-5 start-[15px] top-5 w-px bg-line-2" />
          {NODE_KEYS.map((key, i) => {
            const Mark = MARK[key];
            return (
              <motion.li key={key} variants={rise} className="relative flex gap-3.5 pb-4 last:pb-0">
                <span className="relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line-2 bg-surface font-mono text-xs text-ink-2">{i + 1}</span>
                <div className="min-w-0 pt-0.5">
                  <h3 className="flex items-center gap-2 font-sans text-[15px] font-semibold tracking-normal">
                    {t(`node.${key}`)}
                    {Mark && <Mark className="h-3.5 w-3.5 text-amber" aria-hidden />}
                  </h3>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted">{t(`resident.home.step.${key}`)}</p>
                </div>
              </motion.li>
            );
          })}
        </motion.ol>
      </motion.section>
    </div>
  );
}

/** Skeleton for the resident home; the same wrapper is rendered on /__bones for capture. */
export function HomeBones({ loading = true, children = null }: { loading?: boolean; children?: ReactNode }) {
  return (
    <Bones name="res-home" loading={loading} lines={8} fixture={import.meta.env.DEV ? <HomeWelcome name="Demo" /> : undefined}>
      {children}
    </Bones>
  );
}

/**
 * /app: a resident with a case goes straight to it. A resident without one sees, in plain words, the six steps that
 * follow a birth and the two ways to start: the form, or a call.
 */
export default function ResidentHome() {
  const user = useAuth((s) => s.user);
  const cases = useMyCases();

  if (cases.isError) return <ErrorState error={cases.error} onRetry={() => cases.refetch()} />;
  const first = cases.data?.items[0];
  if (first) return <Navigate to={`/app/cases/${first.reference}`} replace />;
  return (
    <HomeBones loading={cases.isLoading}>
      {!cases.isLoading && <HomeWelcome name={user?.full_name?.split(" ")[0]} />}
    </HomeBones>
  );
}
