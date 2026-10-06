import {
  Activity, AudioLines, BookOpen, ClipboardCheck, Database, FlaskConical, GitBranch, Landmark, Mic, PhoneCall, ScrollText, Send, ShieldCheck,
  UserRoundCheck, Users, Volume2, Webhook, Workflow, Wrench,
} from "lucide-react";
import { useRef } from "react";
import { Link } from "react-router-dom";
import { HoverLift, useGsap } from "../../animations/motion";
import { ArchitectureDiagram, PdMarker } from "../../components/architecture/ArchitectureDiagram";
import { EDGE_COLOR, KAFKA_TOPICS, PD_DOTS, type EdgeKind } from "../../components/architecture/diagram";
import { FlowSequence, type FlowStep } from "../../components/architecture/FlowSequence";
import { PublicFooter } from "../../components/landing/PublicFooter";
import { Reveal, RevealGroup, RevealItem, SectionHead, SplitWords } from "../../components/landing/Reveal";
import { BTN_SECONDARY, SECTION, WRAP } from "../../components/landing/styles";
import { PublicNav } from "../../components/layout/Shells";
import { MockBadge } from "../../components/ui/StatusBadge";
import { useT, type MessageKey } from "../../i18n";
import { cn } from "../../lib/format";

const LEGEND: { kind: EdgeKind; label: MessageKey; dashed?: boolean }[] = [
  { kind: "voice", label: "landing.arch.legend.voice" },
  { kind: "data", label: "landing.arch.legend.data" },
  { kind: "human", label: "landing.arch.legend.human" },
  { kind: "cache", label: "landing.arch.legend.cache" },
  { kind: "test", label: "landing.arch.legend.test", dashed: true },
  { kind: "fallback", label: "landing.arch.legend.fallback", dashed: true },
];

const COMPONENTS: { icon: typeof Mic; name: MessageKey; role: MessageKey }[] = [
  { icon: Users, name: "landing.arch.el.platform", role: "landing.arch.el.platformRole" },
  { icon: GitBranch, name: "landing.arch.el.workflows", role: "landing.arch.el.workflowsRole" },
  { icon: Workflow, name: "landing.arch.el.subagents", role: "landing.arch.el.subagentsRole" },
  { icon: Mic, name: "landing.arch.el.stt", role: "landing.arch.el.sttRole" },
  { icon: Volume2, name: "landing.arch.el.tts", role: "landing.arch.el.ttsRole" },
  { icon: BookOpen, name: "landing.arch.el.kb", role: "landing.arch.el.kbRole" },
  { icon: Wrench, name: "landing.arch.el.tools", role: "landing.arch.el.toolsRole" },
  { icon: PhoneCall, name: "landing.arch.el.telephony", role: "landing.arch.el.telephonyRole" },
  { icon: Webhook, name: "landing.arch.el.webhooks", role: "landing.arch.el.webhooksRole" },
  { icon: FlaskConical, name: "landing.arch.el.testing", role: "landing.arch.el.testingRole" },
];

const AFTER_CALL: FlowStep[] = [
  { icon: Webhook, title: "landing.arch.flowA.1", body: "landing.arch.flowA.1Body", tone: "azure" },
  { icon: Database, title: "landing.arch.flowA.2", body: "landing.arch.flowA.2Body", tone: "civic" },
  { icon: ScrollText, title: "landing.arch.flowA.3", body: "landing.arch.flowA.3Body", tone: "slate" },
  { icon: Activity, title: "landing.arch.flowA.4", body: "landing.arch.flowA.4Body", tone: "violet" },
];

const BEFORE_FILING: FlowStep[] = [
  { icon: ClipboardCheck, title: "landing.arch.flowB.1", body: "landing.arch.flowB.1Body", tone: "azure" },
  { icon: UserRoundCheck, title: "landing.arch.flowB.2", body: "landing.arch.flowB.2Body", tone: "violet" },
  { icon: Send, title: "landing.arch.flowB.3", body: "landing.arch.flowB.3Body", tone: "civic" },
  { icon: Landmark, title: "landing.arch.flowB.4", body: "landing.arch.flowB.4Body", tone: "amber" },
];

const FALLBACKS: { name: MessageKey; live: MessageKey; fallback: MessageKey; holds: MessageKey }[] = [
  { name: "landing.arch.fb.kafka", live: "landing.arch.fb.kafkaLive", fallback: "landing.arch.fb.kafkaFallback", holds: "landing.arch.fb.kafkaHolds" },
  { name: "landing.arch.fb.redis", live: "landing.arch.fb.redisLive", fallback: "landing.arch.fb.redisFallback", holds: "landing.arch.fb.redisHolds" },
  { name: "landing.arch.fb.neo4j", live: "landing.arch.fb.neo4jLive", fallback: "landing.arch.fb.neo4jFallback", holds: "landing.arch.fb.neo4jHolds" },
  { name: "landing.arch.fb.langfuse", live: "landing.arch.fb.langfuseLive", fallback: "landing.arch.fb.langfuseFallback", holds: "landing.arch.fb.langfuseHolds" },
  { name: "landing.arch.fb.elevenlabs", live: "landing.arch.fb.elevenlabsLive", fallback: "landing.arch.fb.elevenlabsFallback", holds: "landing.arch.fb.elevenlabsHolds" },
  { name: "landing.arch.fb.telephony", live: "landing.arch.fb.telephonyLive", fallback: "landing.arch.fb.telephonyFallback", holds: "landing.arch.fb.telephonyHolds" },
  { name: "landing.arch.fb.government", live: "landing.arch.fb.governmentLive", fallback: "landing.arch.fb.governmentFallback", holds: "landing.arch.fb.governmentHolds" },
];

const TH = "px-5 py-3 text-start font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted";

function LegendSwatch({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <svg width="28" height="8" aria-hidden className="rtl-flip shrink-0">
      <line x1="1" y1="4" x2="21" y2="4" stroke={color} strokeWidth="2" strokeDasharray={dashed ? "4 3" : undefined} />
      <path d="M21 0.5 L27 4 L21 7.5 z" fill={color} />
    </svg>
  );
}

function FallbackPill({ children }: { children: string }) {
  return <span className="inline-flex items-center rounded-full border border-dashed border-amber/50 bg-amber-soft/70 px-2.5 py-0.5 text-[13px] text-amber">{children}</span>;
}

export default function Architecture() {
  const t = useT();
  const hero = useRef<HTMLElement>(null);
  useGsap(hero, ({ gsap, reduce }) => {
    if (reduce) return;
    gsap.to("[data-glow]", { yPercent: 40, ease: "none", scrollTrigger: { trigger: hero.current, start: "top top", end: "bottom top", scrub: true } });
  }, []);

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-paper">{t("app.skip")}</a>
      <PublicNav />
      <main id="main">
        {/* hero + diagram */}
        <section ref={hero} aria-labelledby="arch-title" className="relative isolate overflow-hidden pb-12 sm:pb-16 lg:pb-20">
          <div aria-hidden className="grid-lines pointer-events-none absolute inset-x-0 top-0 -z-10 h-[46rem] [mask-image:radial-gradient(ellipse_85%_70%_at_50%_0%,#000_25%,transparent_80%)]" />
          <div aria-hidden data-glow className="pointer-events-none absolute -top-56 start-1/3 -z-10 size-[36rem] rounded-full bg-violet/10 blur-3xl" />
          <div className={cn(WRAP, "grid gap-x-14 gap-y-4 pt-24 sm:pt-28 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-end lg:pt-32")}>
            <div className="min-w-0">
              <Reveal y={10}>
                <p className="eyebrow flex items-center gap-2.5"><span className="num rounded-full border border-line-2 bg-surface px-2 py-0.5 text-civic">L</span>{t("landing.arch.eyebrow")}</p>
              </Reveal>
              <h1 id="arch-title" className="mt-4 text-[2.5rem] leading-[1.04] tracking-[-0.02em] sm:text-[3.4rem] lg:text-[3.8rem]"><SplitWords text={t("landing.arch.title")} /></h1>
            </div>
            <Reveal delay={0.15} y={10} className="min-w-0">
              <p className="text-[15.5px] leading-relaxed text-muted">{t("landing.arch.lead")}</p>
              <p className="mt-3 flex flex-wrap items-center gap-2.5 text-[13px] text-muted">
                <MockBadge />
                <span>{t("landing.arch.mockNote")}</span>
              </p>
            </Reveal>
          </div>

          <div className={cn(WRAP, "mt-8")}>
            <Reveal delay={0.1} className="flex flex-wrap gap-x-5 gap-y-2.5 rounded-2xl border border-line bg-surface/80 px-4 py-3.5 shadow-(--shadow-card) backdrop-blur-sm sm:px-5">
              <p className="sr-only">{t("landing.arch.legendTitle")}</p>
              {LEGEND.map((l) => (
                <span key={l.kind} className="inline-flex items-center gap-2 text-[12.5px] text-ink-2">
                  <LegendSwatch color={EDGE_COLOR[l.kind]} dashed={l.dashed} />{t(l.label)}
                </span>
              ))}
              <span className="inline-flex items-center gap-2 text-[12.5px] text-ink-2"><PdMarker n={1} small />{t("landing.arch.legend.pd")}</span>
            </Reveal>
          </div>

          <div className="mx-auto mt-5 max-w-[1240px] px-4 sm:px-6">
            <div className="relative rounded-[28px] border border-line bg-stage p-3 sm:p-5 lg:p-6">
              <div aria-hidden className="grid-lines pointer-events-none absolute inset-0 rounded-[28px] opacity-70" />
              <div className="relative"><ArchitectureDiagram /></div>
            </div>
          </div>

          <div className={cn(WRAP, "mt-6")}>
            <p className="eyebrow">{t("landing.arch.topicsTitle")}</p>
            <RevealGroup list gap={0.04} className="mt-2.5 flex flex-wrap gap-2">
              {KAFKA_TOPICS.map((topic) => (
                <RevealItem li key={topic}>
                  <span dir="ltr" className="inline-block rounded-full border border-line bg-surface px-3 py-1 font-mono text-[11.5px] text-ink-2">{topic}</span>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </section>

        {/* personal-data boundaries */}
        <section aria-labelledby="pd-title" className={cn("border-y border-line bg-surface", SECTION)}>
          <div className={WRAP}>
            <SectionHead id="pd-title" index="01" eyebrow={t("landing.arch.pd.eyebrow")} title={t("landing.arch.pd.title")} lead={t("landing.arch.pd.lead")} />
            {/* phones: one card per boundary */}
            <RevealGroup list className="mt-8 space-y-3 md:hidden">
              {PD_DOTS.map((p) => (
                <RevealItem li key={p.n} className="rounded-2xl border border-line bg-paper p-4">
                  <p className="flex items-center gap-2.5"><span className="sr-only">{t("landing.arch.pdTitle", { n: p.n })}</span><PdMarker n={p.n} /><span className="font-display text-[1.08rem] leading-snug text-ink">{t(p.where)}</span></p>
                  <dl className="mt-3 space-y-2.5 text-[14px] leading-relaxed">
                    <div><dt className="eyebrow">{t("landing.arch.pd.col.what")}</dt><dd className="mt-0.5 text-ink-2">{t(p.what)}</dd></div>
                    <div><dt className="eyebrow">{t("landing.arch.pd.col.guard")}</dt><dd className="mt-0.5 text-muted">{t(p.guard)}</dd></div>
                  </dl>
                </RevealItem>
              ))}
            </RevealGroup>
            {/* tablet and up: the table */}
            <Reveal className="mt-10 hidden overflow-hidden rounded-3xl border border-line bg-paper shadow-(--shadow-card) md:block">
              <table className="w-full text-start text-[14px]">
                <caption className="sr-only">{t("landing.arch.pd.title")}</caption>
                <thead>
                  <tr className="border-b border-line bg-surface/60">
                    <th scope="col" className={cn(TH, "w-16")}>{t("landing.arch.pd.col.dot")}</th>
                    <th scope="col" className={TH}>{t("landing.arch.pd.col.where")}</th>
                    <th scope="col" className={TH}>{t("landing.arch.pd.col.what")}</th>
                    <th scope="col" className={TH}>{t("landing.arch.pd.col.guard")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {PD_DOTS.map((p) => (
                    <tr key={p.n} className="align-top transition-colors hover:bg-surface/70">
                      <td className="px-5 py-4"><span className="sr-only">{t("landing.arch.pdTitle", { n: p.n })}</span><PdMarker n={p.n} /></td>
                      <th scope="row" className="px-5 py-4 text-start font-display text-[1.05rem] font-medium leading-snug text-ink">{t(p.where)}</th>
                      <td className="px-5 py-4 leading-relaxed text-ink-2">{t(p.what)}</td>
                      <td className="px-5 py-4 leading-relaxed text-muted">{t(p.guard)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Reveal>
            <Reveal className="mt-4 flex items-start gap-3 rounded-2xl border border-civic/30 bg-civic-soft/60 px-5 py-3.5 text-[14.5px] text-civic">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />{t("landing.arch.pd.rule")}
            </Reveal>
          </div>
        </section>

        {/* ElevenLabs components */}
        <section aria-labelledby="el-title" className={SECTION}>
          <div className={WRAP}>
            <SectionHead id="el-title" index="02" eyebrow={t("landing.arch.el.eyebrow")} title={t("landing.arch.el.title")} lead={t("landing.arch.el.lead")} />
            <RevealGroup list gap={0.04} className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-3xl border border-line bg-line min-[480px]:grid-cols-2 md:grid-cols-3 lg:mt-10 lg:grid-cols-5">
              {COMPONENTS.map((c) => (
                <RevealItem li key={c.name} className="group bg-surface p-4 transition-colors hover:bg-stage-2 sm:p-5">
                  <span className="grid size-9 place-items-center rounded-xl bg-violet-soft text-violet transition-transform duration-300 group-hover:-translate-y-0.5"><c.icon className="h-[18px] w-[18px]" aria-hidden /></span>
                  <p className="mt-3 font-display text-[1.08rem] leading-tight text-ink">{t(c.name)}</p>
                  <p className="mt-1 text-[13px] leading-snug text-muted">{t(c.role)}</p>
                </RevealItem>
              ))}
            </RevealGroup>
            <RevealGroup className="mt-4 grid gap-3 md:grid-cols-2 lg:gap-4">
              {([["landing.arch.el.webhooks", "landing.arch.el.whyWebhooks"], ["landing.arch.el.testing", "landing.arch.el.whyTesting"]] as [MessageKey, MessageKey][]).map(([name, why]) => (
                <RevealItem key={name}>
                  <HoverLift className="h-full rounded-2xl border border-line bg-surface p-5 sm:p-6">
                    <p className="eyebrow">{t("landing.arch.el.whyTitle")}</p>
                    <p className="mt-2 font-display text-[1.15rem] text-ink">{t(name)}</p>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{t(why)}</p>
                  </HoverLift>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </section>

        {/* conceptual data flows */}
        <section aria-labelledby="flows-title" className={cn("border-y border-line bg-stage/60", SECTION)}>
          <div className={WRAP}>
            <SectionHead id="flows-title" index="03" eyebrow={t("landing.arch.flows.eyebrow")} title={t("landing.arch.flows.title")} lead={t("landing.arch.flows.lead")} />
            <div className="mt-8 space-y-4 lg:mt-10">
              <FlowSequence label="landing.arch.flowA.title" title="landing.arch.flowA.title" lead="landing.arch.flowA.lead" steps={AFTER_CALL} />
              <FlowSequence label="landing.arch.flowB.title" title="landing.arch.flowB.title" lead="landing.arch.flowB.lead" steps={BEFORE_FILING} />
            </div>
          </div>
        </section>

        {/* fallbacks */}
        <section aria-labelledby="fb-title" className={SECTION}>
          <div className={WRAP}>
            <SectionHead id="fb-title" index="04" eyebrow={t("landing.arch.fb.eyebrow")} title={t("landing.arch.fb.title")} lead={t("landing.arch.fb.lead")} />
            <RevealGroup list className="mt-8 grid gap-3 sm:grid-cols-2 md:hidden">
              {FALLBACKS.map((f) => (
                <RevealItem li key={f.name} className="rounded-2xl border border-line bg-surface p-4">
                  <p className="font-display text-[1.1rem] text-ink">{t(f.name)}</p>
                  <dl className="mt-2.5 space-y-2 text-[14px] leading-relaxed">
                    <div className="flex flex-wrap items-baseline gap-x-2"><dt className="eyebrow">{t("landing.arch.fb.col.live")}</dt><dd className="text-ink-2">{t(f.live)}</dd></div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><dt className="eyebrow">{t("landing.arch.fb.col.fallback")}</dt><dd><FallbackPill>{t(f.fallback)}</FallbackPill></dd></div>
                    <div><dt className="eyebrow">{t("landing.arch.fb.col.holds")}</dt><dd className="mt-0.5 text-muted">{t(f.holds)}</dd></div>
                  </dl>
                </RevealItem>
              ))}
            </RevealGroup>
            <Reveal className="mt-10 hidden overflow-hidden rounded-3xl border border-line bg-surface shadow-(--shadow-card) md:block">
              <table className="w-full text-[14px]">
                <caption className="sr-only">{t("landing.arch.fb.title")}</caption>
                <thead>
                  <tr className="border-b border-line bg-paper/60">
                    {(["landing.arch.fb.col.component", "landing.arch.fb.col.live", "landing.arch.fb.col.fallback", "landing.arch.fb.col.holds"] as MessageKey[]).map((k) => (
                      <th key={k} scope="col" className={TH}>{t(k)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {FALLBACKS.map((f) => (
                    <tr key={f.name} className="align-top transition-colors hover:bg-paper/70">
                      <th scope="row" className="px-5 py-3.5 text-start font-display text-[1.05rem] font-medium text-ink">{t(f.name)}</th>
                      <td className="px-5 py-3.5 text-ink-2">{t(f.live)}</td>
                      <td className="px-5 py-3.5"><FallbackPill>{t(f.fallback)}</FallbackPill></td>
                      <td className="px-5 py-3.5 leading-relaxed text-muted">{t(f.holds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Reveal>
            <Reveal className="mt-4 flex items-start gap-3 rounded-2xl border border-line bg-surface px-5 py-3.5 text-[14.5px] text-ink-2">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-civic" aria-hidden />
              <span>{t("landing.arch.fb.stalled")}</span>
            </Reveal>
          </div>
        </section>

        <section aria-labelledby="arch-cta" className="pb-12 sm:pb-16 lg:pb-20">
          <div className={WRAP}>
            <Reveal className="relative isolate overflow-hidden rounded-[28px] border border-line bg-stage px-5 py-8 sm:px-10 sm:py-10 lg:px-14">
              <div aria-hidden className="grid-lines pointer-events-none absolute inset-0 -z-10 opacity-80" />
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-12">
                <div>
                  <h2 id="arch-cta" className="text-[2rem] leading-tight sm:text-[2.4rem]"><SplitWords text={t("landing.arch.cta.title")} /></h2>
                  <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted">{t("landing.arch.cta.body")}</p>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  <Link to="/login?demo=1" className="group inline-flex h-12 items-center gap-2 rounded-full bg-civic px-6 text-[15px] font-semibold text-on-accent shadow-(--shadow-card) transition-colors hover:bg-civic/90">
                    <AudioLines className="h-4 w-4" aria-hidden />{t("landing.hero.ctaDemo")}
                  </Link>
                  <Link to="/" className={BTN_SECONDARY}>{t("landing.arch.cta.back")}</Link>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
