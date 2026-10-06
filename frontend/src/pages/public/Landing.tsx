import { motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle, ArrowRight, ArrowUpRight, Bot, ClipboardList, EyeOff, FileLock, FingerprintPattern, Landmark, Lock, PhoneOff, Quote, ScrollText,
  ShieldCheck, UserRoundCheck,
} from "lucide-react";
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { CountUp, HoverLift, useGsap, VIEWPORT } from "../../animations/motion";
import { ease } from "../../animations/variants";
import { DeadlineBar } from "../../components/landing/DeadlineBar";
import { HeroFlow } from "../../components/landing/HeroFlow";
import { JourneyCompare } from "../../components/landing/JourneyCompare";
import { MultilingualLine } from "../../components/landing/MultilingualLine";
import { PublicFooter } from "../../components/landing/PublicFooter";
import { Reveal, RevealGroup, RevealItem, SectionHead, SplitWords } from "../../components/landing/Reveal";
import { BTN_ARROW, BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, SECTION, WRAP } from "../../components/landing/styles";
import { VoiceShowcase } from "../../components/landing/VoiceShowcase";
import { PublicNav } from "../../components/layout/Shells";
import { NodeStateBadge, SourceBadge } from "../../components/ui/StatusBadge";
import { useLang, useT, type MessageKey } from "../../i18n";
import { cn } from "../../lib/format";
import { homeFor, useAuth } from "../../stores/auth";

const PROBLEM_STATS: { value: number | [number, number]; label: MessageKey; tone?: "rose" }[] = [
  { value: 6, label: "landing.problem.stat.entities" },
  { value: 7, label: "landing.problem.stat.visits" },
  { value: 6, label: "landing.problem.stat.reentries" },
  { value: [24, 92], label: "landing.problem.stat.days", tone: "rose" },
];

const QUOTES: { text: MessageKey; role: MessageKey }[] = [
  { text: "landing.problem.quote1", role: "landing.problem.quote1Role" },
  { text: "landing.problem.quote2", role: "landing.problem.quote2Role" },
  { text: "landing.problem.quote3", role: "landing.problem.quote3Role" },
];

const OVERSIGHT: { icon: typeof Bot; title: MessageKey; body: MessageKey; tone: string }[] = [
  { icon: Bot, title: "landing.oversight.step1", body: "landing.oversight.step1Body", tone: "bg-azure-soft text-azure" },
  { icon: UserRoundCheck, title: "landing.oversight.step2", body: "landing.oversight.step2Body", tone: "bg-violet-soft text-violet" },
  { icon: Landmark, title: "landing.oversight.step3", body: "landing.oversight.step3Body", tone: "bg-civic-soft text-civic" },
];

const SECURITY: { icon: typeof Lock; title: MessageKey; body: MessageKey }[] = [
  { icon: ClipboardList, title: "landing.secure.consent", body: "landing.secure.consentBody" },
  { icon: FingerprintPattern, title: "landing.secure.verify", body: "landing.secure.verifyBody" },
  { icon: EyeOff, title: "landing.secure.eid", body: "landing.secure.eidBody" },
  { icon: FileLock, title: "landing.secure.minimum", body: "landing.secure.minimumBody" },
  { icon: ScrollText, title: "landing.secure.audit", body: "landing.secure.auditBody" },
  { icon: PhoneOff, title: "landing.secure.optout", body: "landing.secure.optoutBody" },
];

const METRICS: { from: number; to: number; title: MessageKey; target: MessageKey; measured: MessageKey }[] = [
  { from: 6, to: 1, title: "landing.metrics.entities", target: "landing.metrics.entitiesTarget", measured: "landing.metrics.entitiesMeasured" },
  { from: 7, to: 2, title: "landing.metrics.visits", target: "landing.metrics.visitsTarget", measured: "landing.metrics.visitsMeasured" },
  { from: 6, to: 1, title: "landing.metrics.reentries", target: "landing.metrics.reentriesTarget", measured: "landing.metrics.reentriesMeasured" },
];

/**
 * The headline is three lines and the last one ("Every step after birth") must stay on one line. The heading scales
 * its own font size down just enough for that line to fit the column; a translation too long to fit even at 62% wraps.
 */
function useFitHeadline(deps: unknown[]) {
  const heading = useRef<HTMLHeadingElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState({ scale: 1, wrap: false });
  useLayoutEffect(() => {
    const h = heading.current;
    const pr = probe.current;
    if (!h || !pr) return;
    let scale = 1;
    const measure = () => {
      const natural = pr.offsetWidth / scale;
      if (!natural) return;
      const next = Math.min(1, (h.clientWidth * 0.97) / natural);
      scale = next < 0.62 ? 0.62 : next;
      setFit({ scale, wrap: next < 0.62 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(h);
    document.fonts?.ready.then(measure).catch(() => undefined);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { heading, probe, fit };
}

function Hero() {
  const t = useT();
  const lang = useLang();
  const { heading, probe, fit } = useFitHeadline([lang]);
  const user = useAuth((s) => s.user);
  const startTo = user ? homeFor(user) : "/register";
  const root = useRef<HTMLElement>(null);

  // Parallax: the soft glow drifts as the hero scrolls away. The wordmark's letters rise in one
  // after another when it enters the view, then the whole word drifts up a little with the scroll.
  useGsap(root, ({ gsap, reduce }) => {
    if (reduce) return;
    const scrollTrigger = { trigger: root.current, start: "top top", end: "bottom top", scrub: true };
    gsap.to("[data-glow='b']", { yPercent: -35, ease: "none", scrollTrigger });
    gsap.from("[data-wm-letter]", {
      yPercent: 55, autoAlpha: 0, duration: 0.9, stagger: 0.06, ease: "power3.out", clearProps: "transform,opacity,visibility",
      scrollTrigger: { trigger: "[data-wordmark]", start: "top 96%", once: true },
    });
    gsap.to("[data-wm-word]", { yPercent: -8, ease: "none", scrollTrigger: { trigger: "[data-wordmark]", start: "top bottom", end: "bottom top", scrub: true } });
  }, []);

  return (
    <section ref={root} aria-labelledby="hero-title" className="relative isolate overflow-hidden">
      <div aria-hidden className="grid-lines pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_80%_70%_at_70%_30%,#000_20%,transparent_80%)]" />
      <div aria-hidden data-glow="b" className="pointer-events-none absolute -bottom-72 start-[-18%] -z-10 size-[32rem] rounded-full bg-azure/10 blur-3xl" />

      <div className={cn(WRAP, "grid items-center gap-8 pb-6 pt-24 sm:pt-28 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)] lg:gap-10 lg:pb-8 lg:pt-32")}>
        <div className="min-w-0">
          <Reveal y={10}>
            <p className="inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-surface/80 py-1 pe-3 ps-1.5 text-[12.5px] text-ink-2 shadow-(--shadow-card) backdrop-blur-sm">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-civic-soft" aria-hidden><span className="size-1.5 animate-pulse rounded-full bg-civic" /></span>
              <span className="min-w-0 truncate">{t("landing.hero.eyebrow")}</span>
            </p>
          </Reveal>
          <h1 ref={heading} id="hero-title" style={{ "--hero-fit": fit.scale } as CSSProperties}
            className="relative mt-5 text-[length:calc(var(--hero-size)*var(--hero-fit,1))] leading-[1.04] tracking-[-0.025em] text-ink [--hero-size:3rem] sm:[--hero-size:3.75rem] lg:[--hero-size:4.1rem] xl:[--hero-size:4.6rem]">
            <span className="block"><SplitWords text={t("landing.hero.line1")} /></span>
            <span className="block"><SplitWords text={t("landing.hero.line2")} delay={0.12} /></span>
            <span className={cn("block italic text-civic rtl:not-italic", !fit.wrap && "whitespace-nowrap")}><SplitWords text={t("landing.hero.line3")} delay={0.24} /></span>
            <span ref={probe} aria-hidden className="pointer-events-none invisible absolute start-0 top-0 whitespace-nowrap italic rtl:not-italic">{t("landing.hero.line3")}</span>
          </h1>
          <Reveal delay={0.35} y={12}>
            <p className="mt-5 font-display text-[1.3rem] leading-snug text-ink-2 sm:text-[1.45rem]">{t("landing.hero.sub")}</p>
            <div className="mt-6 flex flex-wrap items-center gap-2.5">
              <Link to={startTo} className={BTN_PRIMARY}>{t("landing.hero.ctaStart")}<ArrowRight className={BTN_ARROW} aria-hidden /></Link>
              <Link to="/login?demo=1" className={BTN_SECONDARY}>{t("landing.hero.ctaDemo")}</Link>
              <Link to="/architecture" className={BTN_GHOST}>{t("landing.hero.ctaArchitecture")}<ArrowUpRight className="rtl-flip h-4 w-4" aria-hidden /></Link>
            </div>
          </Reveal>
          <Reveal delay={0.5} y={12} className="mt-8 max-w-xl">
            <MultilingualLine />
          </Reveal>
        </div>

        <Reveal delay={0.15} className="min-w-0">
          <div className="relative overflow-hidden rounded-[28px] border border-line bg-stage p-3 shadow-(--shadow-pop) sm:p-5">
            <div aria-hidden className="grid-lines pointer-events-none absolute inset-0 opacity-80" />
            <div className="relative"><HeroFlow /></div>
          </div>
        </Reveal>
      </div>

      {/* Wordmark: spans the content width edge to edge, letters spread evenly (justify-between), sized to the container. */}
      <div aria-hidden dir="ltr" data-wordmark className={cn(WRAP, "@container pb-2 sm:pb-4")}>
        <div data-wm-word className="flex select-none justify-between font-display text-[20.5cqi] leading-[0.86] tracking-normal">
          {"LifeLoop".split("").map((ch, i) => (
            <span key={i} data-wm-letter
              className="inline-block bg-linear-to-b from-ink/30 via-ink/[0.13] to-ink/[0.02] bg-clip-text pb-[0.08em] text-transparent transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-[0.05em]">
              {ch}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function Problem() {
  const t = useT();
  return (
    <section aria-labelledby="problem-title" className={cn("border-y border-line bg-surface", SECTION)}>
      <div className={WRAP}>
        <SectionHead id="problem-title" index="01" eyebrow={t("landing.problem.eyebrow")} title={t("landing.problem.title")} lead={t("landing.problem.lead")} />

        <RevealGroup list className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-line bg-line lg:mt-10 lg:grid-cols-4">
          {PROBLEM_STATS.map((s) => (
            <RevealItem li key={s.label} className="flex flex-col bg-surface p-4 sm:p-6">
              <p className={cn("font-display text-[2.6rem] leading-none tracking-[-0.03em] sm:text-[3.4rem]", s.tone === "rose" ? "text-rose" : "text-ink")} dir="ltr">
                {Array.isArray(s.value) ? <><CountUp value={s.value[0]} duration={1} />–<CountUp value={s.value[1]} duration={1.4} /></> : <CountUp value={s.value} duration={0.9} />}
              </p>
              <p className="mt-3 text-[13.5px] leading-snug text-ink-2 sm:text-[14.5px]">{t(s.label)}</p>
            </RevealItem>
          ))}
        </RevealGroup>
        <p className="mt-3 text-[12.5px] leading-relaxed text-muted">{t("landing.problem.source")}</p>

        <div className="mt-10"><DeadlineBar /></div>

        <Reveal className="mt-8 grid gap-3 rounded-3xl border border-rose/25 bg-rose-soft/60 p-5 sm:p-7 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-center lg:gap-10">
          <p className="font-display text-[1.3rem] leading-snug text-ink sm:text-[1.45rem]">{t("landing.problem.breaks")}</p>
          <p className="flex gap-3 text-[14.5px] leading-relaxed text-ink-2"><AlertTriangle className="mt-1 h-4 w-4 shrink-0 text-rose" aria-hidden />{t("landing.problem.fine")}</p>
        </Reveal>

        <RevealGroup className="mt-8 grid gap-3 md:grid-cols-3 lg:gap-4">
          {QUOTES.map((q) => (
            <RevealItem key={q.text}>
              <HoverLift className="card flex h-full flex-col justify-between gap-5 p-5 sm:p-6">
                <div>
                  <Quote className="rtl-flip h-5 w-5 text-civic" aria-hidden />
                  <blockquote className="mt-3 font-display text-[1.08rem] leading-snug text-ink">{t(q.text)}</blockquote>
                </div>
                <p className="border-t border-line pt-3 text-[12.5px] text-muted">{t(q.role)}</p>
              </HoverLift>
            </RevealItem>
          ))}
        </RevealGroup>
        <p className="mt-3 text-[12.5px] text-muted">{t("landing.problem.quotesSource")}</p>
      </div>
    </section>
  );
}

function Journey() {
  const t = useT();
  return (
    <section aria-labelledby="journey-title" className={SECTION}>
      <div className={WRAP}>
        <SectionHead id="journey-title" index="02" eyebrow={t("landing.journey.eyebrow")} title={t("landing.journey.title")} lead={t("landing.journey.lead")} />
        <JourneyCompare />
      </div>
    </section>
  );
}

function Voice() {
  const t = useT();
  return (
    <section aria-labelledby="voice-title" className={cn("relative isolate overflow-hidden border-y border-line bg-stage", SECTION)}>
      <div aria-hidden className="grid-lines pointer-events-none absolute inset-0 -z-10 opacity-70 [mask-image:linear-gradient(to_bottom,#000,transparent_80%)]" />
      <div className={WRAP}>
        <SectionHead id="voice-title" index="03" eyebrow={t("landing.voice.eyebrow")} title={t("landing.voice.title")} lead={t("landing.voice.lead")} />
        <VoiceShowcase />
      </div>
    </section>
  );
}

function Oversight() {
  const t = useT();
  const rail = useRef<HTMLDivElement>(null);
  // The rail between the three steps fills as the reader scrolls past them.
  useGsap(rail, ({ gsap, reduce }) => {
    if (reduce) return;
    gsap.fromTo("[data-rail]", { scaleY: 0 }, {
      scaleY: 1, ease: "none", transformOrigin: "50% 0%",
      scrollTrigger: { trigger: rail.current, start: "top 75%", end: "bottom 55%", scrub: 0.5 },
    });
  }, []);

  return (
    <section aria-labelledby="oversight-title" className={SECTION}>
      <div className={WRAP}>
        <SectionHead id="oversight-title" index="04" eyebrow={t("landing.oversight.eyebrow")} title={t("landing.oversight.title")} lead={t("landing.oversight.lead")} />
        <div className="mt-8 grid gap-5 lg:mt-10 lg:grid-cols-2 lg:items-center lg:gap-10">
          <div ref={rail} className="relative ps-9 sm:ps-11">
            <span aria-hidden className="absolute bottom-12 start-[11px] top-12 w-0.5 rounded-full bg-line sm:start-[15px]" />
            <span aria-hidden data-rail className="absolute bottom-12 start-[11px] top-12 w-0.5 rounded-full bg-civic sm:start-[15px]" />
            <RevealGroup list className="space-y-3">
              {OVERSIGHT.map((step, i) => (
                <RevealItem li key={step.title} className="relative">
                  <span aria-hidden className="num absolute -start-9 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full border-2 border-paper bg-ink font-mono text-[10px] text-paper sm:-start-11 sm:size-8 sm:text-[11px]">{i + 1}</span>
                  <div className="flex gap-4 rounded-2xl border border-line bg-surface p-4 shadow-(--shadow-card) sm:gap-5 sm:p-5">
                    <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", step.tone)}><step.icon className="h-5 w-5" aria-hidden /></span>
                    <div className="min-w-0">
                      <h3 className="text-[1.3rem] leading-tight sm:text-[1.4rem]">{t(step.title)}</h3>
                      <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">{t(step.body)}</p>
                    </div>
                  </div>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>

          <Reveal delay={0.1} className="min-w-0">
            <figure className="relative rounded-[28px] border border-line bg-surface p-5 shadow-(--shadow-pop) sm:p-7">
              <figcaption className="flex flex-wrap items-center justify-between gap-3">
                <span className="eyebrow">{t("landing.oversight.mockEyebrow")}</span>
                <NodeStateBadge state="WAITING_FOR_HUMAN" />
              </figcaption>
              <p className="mt-4 font-display text-[1.5rem] leading-tight">{t("landing.oversight.mockTitle")}</p>
              <p className="mt-1 text-[13px] text-muted">{t("landing.oversight.mockSub")}</p>
              <dl className="mt-4 divide-y divide-line rounded-2xl border border-line">
                {([
                  ["landing.oversight.field.child", "Aisha R. Khan"],
                  ["landing.oversight.field.passport", t("landing.oversight.field.passportValue")],
                  ["landing.oversight.field.father", "784-••••-•••••••-1"],
                  ["landing.oversight.field.mother", "784-••••-•••••••-2"],
                ] as [MessageKey, string][]).map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-4 px-4 py-2.5 text-[13.5px]">
                    <dt className="text-muted">{t(label)}</dt>
                    <dd className="num text-end font-medium text-ink" dir="auto">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 flex items-center gap-2 text-[12.5px] text-muted"><Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />{t("landing.oversight.mockMinimum")}</p>
              <div className="mt-5 flex flex-wrap gap-2" aria-hidden>
                <span className="inline-flex h-10 items-center gap-2 rounded-full bg-violet px-5 text-[14px] font-medium text-on-accent"><UserRoundCheck className="h-4 w-4" />{t("landing.oversight.mockRelease")}</span>
                <span className="inline-flex h-10 items-center rounded-full border border-line-2 px-5 text-[14px] text-ink-2">{t("landing.oversight.mockReturn")}</span>
              </div>
              <p className="mt-5 rounded-2xl bg-violet-soft px-4 py-3 text-[14px] font-medium text-violet">{t("landing.oversight.required")}</p>
            </figure>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Secure() {
  const t = useT();
  return (
    <section aria-labelledby="secure-title" className={cn("border-y border-line bg-surface", SECTION)}>
      <div className={WRAP}>
        <SectionHead id="secure-title" index="05" eyebrow={t("landing.secure.eyebrow")} title={t("landing.secure.title")} lead={t("landing.secure.lead")} />
        <RevealGroup list className="mt-8 grid gap-3 sm:grid-cols-2 lg:mt-10 lg:grid-cols-3 lg:gap-4">
          {SECURITY.map((item) => (
            <RevealItem li key={item.title} className="min-w-0">
              <HoverLift className="h-full rounded-2xl border border-line bg-paper p-5 sm:p-6">
                <span className="grid size-10 place-items-center rounded-xl bg-civic-soft text-civic"><item.icon className="h-5 w-5" aria-hidden /></span>
                <h3 className="mt-4 text-[1.2rem] leading-tight">{t(item.title)}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{t(item.body)}</p>
              </HoverLift>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}

function Truth() {
  const t = useT();
  return (
    <section aria-labelledby="truth-title" className={cn("relative isolate overflow-hidden bg-paper-2/70", SECTION)}>
      <div aria-hidden className="pointer-events-none absolute -end-40 top-1/2 -z-10 size-[30rem] -translate-y-1/2 rounded-full bg-amber/10 blur-3xl" />
      <div className={cn(WRAP, "grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-center lg:gap-14")}>
        <div className="min-w-0">
          <Reveal y={10}>
            <p className="eyebrow mb-3 flex items-center gap-2.5"><span className="num rounded-full border border-line-2 bg-surface px-2 py-0.5 text-civic">06</span>{t("landing.truth.eyebrow")}</p>
          </Reveal>
          <h2 id="truth-title" className="text-[2.1rem] leading-[1.05] sm:text-[2.9rem] lg:text-[3.2rem]"><SplitWords text={t("landing.truth.never")} /></h2>
          <Reveal delay={0.25} y={10}>
            <p className="mt-4 font-display text-[1.6rem] italic leading-tight text-amber rtl:not-italic sm:text-[2.1rem]">{t("landing.truth.consulate")}</p>
          </Reveal>
        </div>
        <RevealGroup className="grid min-w-0 gap-3">
          <RevealItem className="card p-5 sm:p-6">
            <ShieldCheck className="h-6 w-6 text-civic" aria-hidden />
            <p className="mt-3 text-[14.5px] leading-relaxed text-ink-2">{t("landing.truth.stalled")}</p>
            <p className="mt-3 flex flex-wrap items-center gap-2"><NodeStateBadge state="STALLED" /><span className="text-[13px] italic text-muted">{t("landing.truth.notCleared")}</span></p>
          </RevealItem>
          <RevealItem className="card p-5 sm:p-6">
            <p className="text-[14.5px] leading-relaxed text-ink-2">{t("landing.truth.sources")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <SourceBadge source="GOVERNMENT_MOCK" />
              <SourceBadge source="PARENT_REPORTED" />
              <SourceBadge source="HUMAN_OFFICER" />
              <SourceBadge source="AI_AGENT" />
            </div>
          </RevealItem>
        </RevealGroup>
      </div>
    </section>
  );
}

/** "6 -> 1": the baseline is struck through, then the target rises in. Decorative; the sentence is in sr-only text. */
function MetricDrop({ from, to, delay = 0 }: { from: number; to: number; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <p aria-hidden className="mt-3 flex items-baseline gap-4 font-display leading-none" dir="ltr">
      <span className="num relative text-[3.1rem] text-faint">
        {from}
        <motion.span className="absolute -inset-x-1 top-[55%] h-[3px] origin-left rounded-full bg-rose/70"
          initial={reduce ? false : { scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={VIEWPORT} transition={{ duration: 0.5, ease, delay: delay + 0.35 }} />
      </span>
      <ArrowRight className="h-6 w-6 shrink-0 text-faint" />
      <motion.span className="num text-[4.3rem] text-civic"
        initial={reduce ? false : { opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={VIEWPORT} transition={{ duration: 0.6, ease, delay: delay + 0.7 }}>
        {to}
      </motion.span>
    </p>
  );
}

function Metrics() {
  const t = useT();
  return (
    <section aria-labelledby="metrics-title" className={SECTION}>
      <div className={WRAP}>
        <SectionHead id="metrics-title" index="07" eyebrow={t("landing.metrics.eyebrow")} title={t("landing.metrics.title")} lead={t("landing.metrics.lead")} />
        <RevealGroup list className="mt-8 grid gap-3 md:grid-cols-3 lg:mt-10 lg:gap-4">
          {METRICS.map((m, i) => (
            <RevealItem li key={m.title} className="min-w-0">
              <HoverLift className="card flex h-full flex-col p-5 sm:p-6">
                <span className="self-start rounded-full border border-civic/40 bg-civic-soft px-2.5 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-civic">{t("landing.metrics.target")}</span>
                <h3 className="mt-3 text-[1.12rem] leading-snug md:min-h-[3lh]">{t(m.title)}</h3>
                <MetricDrop from={m.from} to={m.to} delay={i * 0.12} />
                <p className="sr-only">{t("landing.metrics.srChange", { from: m.from, to: m.to })}</p>
                <p className="mt-4 text-[14.5px] leading-relaxed text-ink-2">{t(m.target)}</p>
                <p className="mt-auto pt-4 text-[12.5px] leading-relaxed text-muted"><span className="font-medium text-ink-2">{t("landing.metrics.measuredBy")}</span> {t(m.measured)}</p>
              </HoverLift>
            </RevealItem>
          ))}
        </RevealGroup>
        <p className="mt-3 text-[12.5px] text-muted">{t("landing.metrics.note")}</p>
      </div>
    </section>
  );
}

function FinalCta() {
  const t = useT();
  const user = useAuth((s) => s.user);
  return (
    <section aria-labelledby="cta-title" className="pb-12 sm:pb-16 lg:pb-20">
      <div className={WRAP}>
        <Reveal className="relative isolate overflow-hidden rounded-[28px] border border-line bg-stage px-5 py-9 sm:px-10 sm:py-12 lg:px-14">
          <div aria-hidden className="grid-lines pointer-events-none absolute inset-0 -z-10 opacity-80" />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-12">
            <div className="max-w-2xl">
              <h2 id="cta-title" className="text-[2.1rem] leading-[1.05] sm:text-5xl"><SplitWords text={t("landing.cta.title")} /></h2>
              <p className="mt-3 text-[15.5px] leading-relaxed text-muted">{t("landing.cta.body")}</p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <Link to={user ? homeFor(user) : "/register"} className={BTN_PRIMARY}>{t("landing.hero.ctaStart")}<ArrowRight className={BTN_ARROW} aria-hidden /></Link>
              <Link to="/login?demo=1" className={BTN_SECONDARY}>{t("landing.hero.ctaDemo")}</Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default function Landing() {
  const t = useT();
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-paper">{t("app.skip")}</a>
      <PublicNav />
      <main id="main">
        <Hero />
        <Problem />
        <Journey />
        <Voice />
        <Oversight />
        <Secure />
        <Truth />
        <Metrics />
        <FinalCta />
      </main>
      <PublicFooter />
    </>
  );
}
