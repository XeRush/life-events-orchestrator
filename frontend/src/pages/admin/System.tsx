import { motion } from "framer-motion";
import {
  Activity, AlertTriangle, BookOpen, CheckCircle2, CircleDot, Cpu, Database, ExternalLink, FileText, FlaskConical, Gauge, HardDrive, Landmark, Lock,
  Mail, MessageSquare, Mic, Network, Phone, Radio, Share2, XCircle, type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { BoolMark, Mono, Notice, PageHead, Panel, useCardMotion, useTx } from "../../components/officer/kit";
import { Bones } from "../../components/ui/Bones";
import { Badge, ErrorState } from "../../components/ui/primitives";
import { MockBadge } from "../../components/ui/StatusBadge";
import { useEntities, useReady } from "../../hooks/queries";
import { useT } from "../../i18n";
import { cn, titleCase } from "../../lib/format";
import { TONE, type Tone } from "../../lib/status";
import type { EntityCatalogue, Readiness } from "../../types/api";

type DepState = "live" | "fallback" | "down" | "mock" | "info";
type Dep = Readiness["dependencies"][string];

const STATE_META: Record<DepState, { tone: Tone; icon: LucideIcon }> = {
  live: { tone: "civic", icon: CheckCircle2 },
  fallback: { tone: "amber", icon: AlertTriangle },
  down: { tone: "rose", icon: XCircle },
  mock: { tone: "violet", icon: FlaskConical },
  info: { tone: "slate", icon: CircleDot },
};

const ICONS: Record<string, LucideIcon> = {
  postgres: Database, kafka: Share2, redis: HardDrive, neo4j: Network, elevenlabs: Mic, langfuse: Activity, government: Landmark, email: Mail, sms: MessageSquare, telephony: Phone,
};
const ORDER = ["postgres", "kafka", "redis", "neo4j", "elevenlabs", "langfuse", "government", "email", "sms", "telephony"];

const str = (v: unknown) => (v == null || v === "" ? null : String(v));

interface DepView { state: DepState; headline: string; facts: { label: string; value: ReactNode }[]; error?: string | null; note?: string | null }

/** Each dependency reports itself differently; normalise into live / fallback / down / mock with an honest headline. */
function useDescribe() {
  const t = useT();
  return (key: string, d: Dep): DepView => {
    const mode = str(d.mode) ?? "";
    const err = str(d.last_error);
    switch (key) {
      case "postgres":
        return { state: d.healthy ? "live" : "down", headline: d.healthy ? t("admin.sys.pgLive") : t("admin.sys.pgDown"), facts: [{ label: t("admin.sys.mode"), value: mode || "-" }] };
      case "kafka": {
        const state: DepState = d.simulated_failure ? "down" : mode === "kafka" && d.healthy ? "live" : "fallback";
        const headline = d.simulated_failure ? t("admin.sys.kafkaDown") : state === "live" ? t("admin.sys.kafkaLive") : t("admin.sys.kafkaFallback", { mode: mode.replace(/-/g, " ") });
        return { state, headline, error: err, facts: [
          { label: t("admin.sys.mode"), value: <Mono>{mode}</Mono> },
          { label: t("admin.sys.outboxPending"), value: <span className="num font-semibold">{str(d.outbox_pending) ?? "-"}</span> },
        ] };
      }
      case "redis":
        return { state: mode === "redis" && d.healthy ? "live" : "fallback", headline: mode === "redis" && d.healthy ? t("admin.sys.redisLive") : t("admin.sys.redisFallback"), error: err, facts: [{ label: t("admin.sys.mode"), value: <Mono>{mode}</Mono> }] };
      case "neo4j":
        return { state: d.healthy ? "live" : "fallback", headline: d.healthy ? t("admin.sys.neoLive") : t("admin.sys.neoFallback"), error: err, facts: [{ label: t("admin.sys.mode"), value: <Mono>{mode}</Mono> }] };
      case "elevenlabs": {
        const state: DepState = d.healthy ? "live" : d.simulated_failure ? "down" : "fallback";
        return {
          state, note: str(d.note),
          headline: state === "live" ? t("admin.sys.voiceLive") : state === "down" ? t("admin.sys.voiceDown") : t("admin.sys.voiceFallback"),
          facts: [
            { label: t("admin.sys.configured"), value: <BoolMark value={!!d.configured} /> },
            { label: t("admin.sys.telephony"), value: str(d.telephony) ?? "-" },
            { label: t("admin.sys.tts"), value: <Mono className="text-[11px]">{str(d.tts_model) ?? "-"}</Mono> },
            { label: t("admin.sys.stt"), value: <Mono className="text-[11px]">{str(d.stt_model) ?? "-"}</Mono> },
          ],
        };
      }
      case "langfuse": {
        const live = d.backend === "langfuse";
        return { state: live ? "live" : "fallback", headline: live ? t("admin.sys.lfLive") : t("admin.sys.lfFallback"), facts: [
          { label: t("admin.sys.backend"), value: <Mono>{str(d.backend) ?? "-"}</Mono> },
          { label: t("admin.sys.configured"), value: <BoolMark value={!!d.configured} /> },
          { label: t("admin.sys.recentSpans"), value: <span className="num">{str(d.recent_spans) ?? "0"}</span> },
        ] };
      }
      case "government": {
        const failures = Object.entries((d.failures as Record<string, string> | undefined) ?? {});
        return { state: failures.length ? "down" : "mock", headline: failures.length ? t("admin.sys.govFailing", { n: failures.length }) : t("admin.sys.govMock"), facts: [
          { label: t("admin.sys.failures"), value: failures.length ? failures.map(([e, m]) => `${e}: ${m}`).join(", ") : t("common.none") },
        ], note: str(d.label) };
      }
      case "email": {
        const live = !!d.healthy;
        return { state: live ? "live" : "fallback", headline: live ? t("admin.sys.emailLive", { mode }) : t("admin.sys.emailFallback", { mode }), facts: [{ label: t("admin.sys.mode"), value: <Mono>{mode}</Mono> }] };
      }
      case "sms":
        return { state: d.mock ? "mock" : "live", headline: d.mock ? t("admin.sys.smsMock", { mode }) : t("admin.sys.smsLive", { mode }), facts: [{ label: t("admin.sys.mode"), value: <Mono>{mode}</Mono> }] };
      case "telephony": {
        const sim = mode.toUpperCase() === "SIMULATED";
        return { state: sim ? "fallback" : "live", headline: sim ? t("admin.sys.telSim") : t("admin.sys.telLive", { mode: titleCase(mode) }), facts: [{ label: t("admin.sys.mode"), value: <Mono>{mode}</Mono> }] };
      }
      default: {
        const state: DepState = d.healthy === true ? "live" : d.fallback ? "fallback" : d.healthy === false ? "down" : "info";
        return {
          state, headline: titleCase(key), error: err,
          facts: Object.entries(d).filter(([, v]) => v == null || typeof v !== "object").map(([k, v]) => ({ label: titleCase(k), value: str(v) ?? "-" })),
        };
      }
    }
  };
}

function DependencyCard({ name, dep, i }: { name: string; dep: Dep; i: number }) {
  const t = useT();
  const tx = useTx();
  const describe = useDescribe();
  const v = describe(name, dep);
  const meta = STATE_META[v.state];
  const tone = TONE[meta.tone];
  const Icon = ICONS[name] ?? Cpu;
  const StateIcon = meta.icon;
  const card = useCardMotion();
  return (
    <motion.article
      {...card(i)}
      className="card relative flex min-w-0 flex-col overflow-hidden p-4"
      aria-labelledby={`dep-${name}`}
    >
      <span aria-hidden className={cn("absolute inset-x-0 top-0 h-0.5", tone.dot)} />
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-paper-2 text-ink-2"><Icon className="h-4 w-4" aria-hidden /></span>
          <div className="min-w-0">
            <h3 id={`dep-${name}`} className="font-sans text-[15px] font-semibold leading-tight tracking-normal">{tx(`admin.dep.${name}`)}</h3>
            <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">{name}</p>
          </div>
        </div>
        <Badge tone={meta.tone} icon={<StateIcon className="h-3.5 w-3.5" aria-hidden />}>{t(`admin.state.${v.state}`)}</Badge>
      </div>
      <p className={cn("mt-2.5 text-[14px] font-medium", tone.text)}>{v.headline}</p>
      {v.note && <p className="mt-1 text-xs text-muted">{v.note}</p>}
      <div className="min-h-3 flex-1" aria-hidden />
      <dl className="space-y-1 border-t border-line pt-2.5 text-[12.5px]">
        {v.facts.map((f) => (
          <div key={f.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-muted">{f.label}</dt>
            <dd className="min-w-0 break-words text-end">{f.value}</dd>
          </div>
        ))}
      </dl>
      {v.error && <p className="mt-2 rounded-lg bg-rose-soft px-2.5 py-1.5 font-mono text-[11px] text-rose" title={v.error}>{v.error.slice(0, 160)}</p>}
    </motion.article>
  );
}

function EntityCard({ e, i }: { e: EntityCatalogue["entities"][number]; i: number }) {
  const t = useT();
  const card = useCardMotion();
  return (
    <motion.article
      {...card(i)}
      className="card flex min-w-0 flex-col p-4"
      aria-labelledby={`ent-${e.adapter}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">{e.entity} · <span className="normal-case tracking-normal">{e.adapter}</span></p>
          <h3 id={`ent-${e.adapter}`} className="mt-1 text-lg leading-snug">{e.label}</h3>
          <p className="mt-0.5 text-sm text-muted">{e.service}</p>
        </div>
        {e.is_mock && <MockBadge compact />}
      </header>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Badge tone={e.has_api ? "civic" : "amber"}>{e.has_api ? t("admin.ent.hasApi") : t("admin.ent.noApi")}</Badge>
        <Badge tone={e.has_status_feed ? "civic" : "amber"}>{e.has_status_feed ? t("admin.ent.hasFeed") : t("admin.ent.noFeed")}</Badge>
        {e.failure_mode
          ? <Badge tone="rose" icon={<AlertTriangle className="h-3.5 w-3.5" aria-hidden />}>{t("admin.ent.failing", { mode: e.failure_mode })}</Badge>
          : <Badge tone="slate">{t("admin.ent.normal")}</Badge>}
      </div>
      <dl className="mt-3 space-y-2.5 text-[13px]">
        <div><dt className="eyebrow mb-0.5">{t("admin.ent.requestType")}</dt><dd><Mono>{e.request_type}</Mono></dd></div>
        <div>
          <dt className="eyebrow mb-1 flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" aria-hidden />{t("admin.ent.fields")}</dt>
          <dd>
            {e.required_fields.length ? (
              <ul className="flex flex-wrap gap-1">
                {e.required_fields.map((f) => <li key={f} className={cn("rounded-md border px-1.5 py-0.5 font-mono text-[10.5px]", f.endsWith("_token") ? "border-violet/30 bg-violet-soft text-violet" : "border-line text-ink-2")}>{f}</li>)}
              </ul>
            ) : <span className="text-faint">-</span>}
          </dd>
        </div>
        <div>
          <dt className="eyebrow mb-1 flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" aria-hidden />{t("admin.ent.documents")}</dt>
          <dd className="text-ink-2">{e.required_documents.length ? e.required_documents.map((d) => titleCase(d)).join(", ") : <span className="text-faint">-</span>}</dd>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><dt className="eyebrow mb-0.5">{t("admin.ent.sla")}</dt><dd>{e.sla || "-"}</dd></div>
          <div>
            <dt className="eyebrow mb-0.5">{t("admin.ent.fee")}</dt>
            <dd>{e.published_fee ?? <span className="text-faint">-</span>}</dd>
          </div>
        </div>
        {e.fee_source && <div><dt className="eyebrow mb-0.5">{t("admin.ent.feeSource")}</dt><dd className="break-words text-xs text-muted">{e.fee_source}</dd></div>}
      </dl>
      {e.notes && <p className="mt-3 rounded-xl bg-paper-2 px-3 py-2 text-xs leading-relaxed text-ink-2">{e.notes}</p>}
    </motion.article>
  );
}

/** Overall readiness, workers and every dependency (also rendered with a fixture on /__bones for skeleton capture). */
export function ReadinessView({ r }: { r: Readiness }) {
  const t = useT();
  const deps = [...ORDER.filter((k) => k in r.dependencies), ...Object.keys(r.dependencies).filter((k) => !ORDER.includes(k))];
  const workers = Object.entries(r.workers.workers ?? {});
  return (
    <div className="space-y-5">
      <section aria-label={t("admin.sys.overall")} className="grid gap-3 md:grid-cols-3">
        <div className={cn("card flex items-center gap-3.5 p-4", r.status === "ready" ? "border-civic/40" : "border-rose/40")}>
          <span className={cn("relative grid h-11 w-11 shrink-0 place-items-center rounded-full", r.status === "ready" ? "bg-civic-soft text-civic" : "bg-rose-soft text-rose")}>
            {r.status === "ready" && <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-civic/20 [animation-duration:2.4s]" />}
            {r.status === "ready" ? <CheckCircle2 className="relative h-5 w-5" aria-hidden /> : <XCircle className="relative h-5 w-5" aria-hidden />}
          </span>
          <div className="min-w-0">
            <p className="eyebrow">{t("admin.sys.overall")}</p>
            <p className="text-lg font-semibold">{r.status === "ready" ? t("admin.sys.ready") : t("admin.sys.unavailable")}</p>
            <p className="text-xs text-muted">{t("admin.sys.pollNote")}</p>
          </div>
        </div>
        <div className="card p-4">
          <p className="eyebrow">{t("admin.sys.environment")}</p>
          <p className="mt-1 font-mono text-lg">{r.environment}</p>
          <p className="mt-1 text-sm">{r.demo_mode ? <Badge tone="amber" icon={<FlaskConical className="h-3.5 w-3.5" aria-hidden />}>{t("admin.sys.demoOn")}</Badge> : <Badge tone="slate">{t("admin.sys.demoOff")}</Badge>}</p>
        </div>
        <div className="card p-4">
          <p className="eyebrow mb-2 flex items-center gap-1.5"><Radio className="h-3.5 w-3.5" aria-hidden />{t("admin.sys.workers")}</p>
          {!r.workers.running && <p className="text-sm font-medium text-rose">{t("admin.sys.workersStopped")}</p>}
          {workers.length ? (
            <ul className="space-y-1 text-[13px]">
              {workers.map(([name, w]) => {
                const stale = w.last_beat_seconds_ago > 60;
                return (
                  <li key={name} className="flex items-center justify-between gap-3">
                    <span className="inline-flex min-w-0 items-center gap-1.5"><span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", stale ? "bg-rose" : "animate-pulse bg-civic")} aria-hidden /><Mono className="truncate text-[11.5px]">{name}</Mono></span>
                    <span className={cn("num shrink-0 text-xs", stale ? "font-medium text-rose" : "text-muted")}>{t("admin.sys.beat", { s: w.last_beat_seconds_ago })}{stale ? ` · ${t("admin.sys.stale")}` : ""}</span>
                  </li>
                );
              })}
            </ul>
          ) : r.workers.running ? <p className="text-sm text-muted">{t("admin.sys.noBeats")}</p> : null}
        </div>
      </section>

      <section aria-labelledby="deps-title" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 id="deps-title" className="text-xl sm:text-2xl">{t("admin.sys.deps")}</h2>
            <p className="mt-0.5 max-w-2xl text-sm text-muted">{t("admin.sys.depsHint")}</p>
          </div>
          <ul className="flex flex-wrap gap-1.5" aria-label={t("admin.sys.legend")}>
            {(["live", "fallback", "mock", "down"] as DepState[]).map((s) => {
              const m = STATE_META[s];
              const Icon = m.icon;
              return <li key={s}><Badge tone={m.tone} icon={<Icon className="h-3.5 w-3.5" aria-hidden />}>{t(`admin.state.${s}`)}</Badge></li>;
            })}
          </ul>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 min-[1360px]:grid-cols-4">
          {deps.map((k, i) => <DependencyCard key={k} name={k} dep={r.dependencies[k]} i={i} />)}
        </div>
      </section>
    </div>
  );
}

/** The mock authority catalogue (also rendered with a fixture on /__bones). */
export function EntityGrid({ catalogue }: { catalogue: EntityCatalogue }) {
  const t = useT();
  return (
    <div className="space-y-3">
      <Notice tone="amber" icon={FlaskConical} title={t("app.mock")}>{catalogue.label}</Notice>
      <div className="grid gap-3 md:grid-cols-2 min-[1360px]:grid-cols-3">
        {catalogue.entities.map((e, i) => <EntityCard key={e.adapter} e={e} i={i} />)}
      </div>
    </div>
  );
}

const LINK = "inline-flex min-h-10 items-center gap-2 rounded-full border border-line-2 bg-surface px-4 text-sm transition-colors hover:border-ink/40 hover:bg-paper-2";

export default function System() {
  const t = useT();
  const ready = useReady();
  const entities = useEntities();

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow={t("admin.sys.eyebrow")}
        title={t("admin.sys.title")}
        subtitle={t("admin.sys.subtitle")}
        actions={
          <>
            <a href="/docs" target="_blank" rel="noreferrer" className={LINK}>
              <BookOpen className="h-4 w-4" aria-hidden />{t("admin.sys.swagger")}<ExternalLink className="h-3.5 w-3.5 text-faint" aria-hidden />
            </a>
            <a href="/api/v1/metrics" target="_blank" rel="noreferrer" className={LINK}>
              <Gauge className="h-4 w-4" aria-hidden />{t("admin.sys.metrics")}<ExternalLink className="h-3.5 w-3.5 text-faint" aria-hidden />
            </a>
          </>
        }
      />

      <Bones name="staff-admin-system" loading={ready.isLoading} lines={8}>
        {ready.error ? <ErrorState error={ready.error} onRetry={() => ready.refetch()} /> : ready.data ? <ReadinessView r={ready.data} /> : null}
      </Bones>

      <Panel eyebrow={t("admin.ent.eyebrow")} title={t("admin.ent.title")} hint={t("admin.ent.hint")} action={<MockBadge />}>
        <Bones name="staff-admin-entities" loading={entities.isLoading} lines={8}>
          {entities.error ? <ErrorState error={entities.error} onRetry={() => entities.refetch()} /> : entities.data ? <EntityGrid catalogue={entities.data} /> : null}
        </Bones>
      </Panel>
    </div>
  );
}
