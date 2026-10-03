import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Braces, CloudUpload, Database, FlaskConical, GitBranch, Languages, Lock, Wrench } from "lucide-react";
import { agentApi } from "../../api";
import { ApiError } from "../../api/client";
import { LANGUAGES, useT } from "../../i18n";
import { cn } from "../../lib/format";
import { useAuth } from "../../stores/auth";
import { Button } from "../ui/primitives";
import { DemoPanel } from "./DemoFrame";

interface ToolDef { name?: string; description?: string; type?: string; api_schema?: { url?: string; method?: string } }
interface AgentConfig {
  name?: string;
  tags?: string[];
  conversation_config?: {
    agent?: { first_message?: string; language?: string; prompt?: { tools?: ToolDef[]; rag?: { enabled?: boolean }; temperature?: number } };
    tts?: { model_id?: string };
    asr?: { quality?: string };
    language_presets?: Record<string, { overrides?: { agent?: { first_message?: string; language?: string } } }>;
  };
  workflow?: {
    nodes?: Record<string, { type?: string; label?: string; additional_prompt?: string }>;
    edges?: Record<string, { source: string; target: string; forward_condition?: { condition?: string } }>;
  };
  platform_settings?: { data_collection?: Record<string, { type?: string; description?: string }> };
}

const SECRET = /(secret|password|authorization|api[_-]?key|request_headers)/i;

/** Deep copy with anything secret-looking replaced: the dry run includes the tool secret header, which is never displayed. */
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET.test(k) ? "[redacted]" : redact(v)]));
  }
  return value;
}

const pathOf = (url?: string) => {
  if (!url) return "";
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
};

const langName = (code: string) => LANGUAGES.find((l) => l.code === code || (code === "fil" && l.code === "tl"));

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-paper/50 p-3.5">
      <p className="mb-2.5 flex items-center gap-2 text-[14px] font-medium text-ink">{icon}{title}</p>
      {children}
    </div>
  );
}

/** "Agent config (dry run)": the ElevenLabs agent definition built from code, shown without sending anything. Admin only. */
export function AgentConfigViewer() {
  const t = useT();
  const isAdmin = useAuth((s) => s.user?.role === "ADMIN");
  const load = useMutation({ mutationFn: agentApi.syncDryRun });
  const push = useMutation({ mutationFn: agentApi.syncAgent });
  const pushTests = useMutation({ mutationFn: agentApi.syncTests });
  const forbidden = load.error instanceof ApiError && load.error.status === 403;
  const config = (load.data?.config ?? null) as AgentConfig | null;

  const agent = config?.conversation_config?.agent;
  const tools = agent?.prompt?.tools ?? [];
  const nodes = Object.entries(config?.workflow?.nodes ?? {});
  const edges = Object.values(config?.workflow?.edges ?? {});
  const presets = Object.entries(config?.conversation_config?.language_presets ?? {});
  const collection = Object.entries(config?.platform_settings?.data_collection ?? {});

  return (
    <DemoPanel
      id="demo-agent-config" title={t("demo.config.title")} hint={t("demo.config.hint")}
      action={<Button variant="secondary" size="sm" icon={<Braces className="h-4 w-4" aria-hidden />} loading={load.isPending} onClick={() => load.mutate()}>{t(config ? "demo.config.reload" : "demo.config.load")}</Button>}
    >
      {!isAdmin && !config && !forbidden && <p className="mb-3 flex items-center gap-2 text-[13px] text-muted"><Lock className="h-3.5 w-3.5" aria-hidden />{t("demo.config.adminOnly")}</p>}
      {forbidden && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-line-2 bg-paper-2/60 px-3.5 py-2.5 text-[14px] text-ink-2">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
          <span>{t("demo.config.forbidden")}</span>
        </div>
      )}
      {load.isError && !forbidden && <p role="alert" className="rounded-xl border border-rose/30 bg-rose-soft px-3.5 py-2.5 text-[14px] text-rose">{(load.error as Error).message}</p>}

      {config && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="font-display text-[1.15rem] text-ink">{config.name}</span>
            <span className={cn("rounded-full border px-2.5 py-0.5 text-[12px]", load.data?.configured ? "border-civic/30 bg-civic-soft text-civic" : "border-amber/40 bg-amber-soft text-amber")}>
              {t(load.data?.configured ? "demo.config.connected" : "demo.config.notConnected")}
            </span>
            {(config.tags ?? []).map((tag) => <span key={tag} className="rounded-full bg-paper-2 px-2.5 py-0.5 font-mono text-[11px] text-ink-2" dir="ltr">{tag}</span>)}
          </div>

          {isAdmin && (
            <div className="rounded-xl border border-line bg-paper-2/50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" icon={<CloudUpload className="h-4 w-4" aria-hidden />} disabled={!load.data?.configured} loading={push.isPending} onClick={() => push.mutate()}>
                  {t("demo.config.push")}
                </Button>
                <Button size="sm" variant="secondary" icon={<FlaskConical className="h-4 w-4" aria-hidden />} disabled={!load.data?.configured} loading={pushTests.isPending}
                  onClick={() => pushTests.mutate()}>
                  {t("demo.config.pushTests")}
                </Button>
              </div>
              <p className="mt-2 text-[12.5px] text-muted" role="status" aria-live="polite">
                {!load.data?.configured ? t("demo.config.needsKey")
                  : push.isError ? (push.error as Error).message
                  : pushTests.isError ? (pushTests.error as Error).message
                  : pushTests.data ? t("demo.config.testsSynced", { n: pushTests.data.created })
                  : push.data ? t("demo.config.pushed", { id: String(push.data.agent_id ?? "") })
                  : t("demo.config.pushHint")}
              </p>
            </div>
          )}

          <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {[
              [t("demo.config.tts"), config.conversation_config?.tts?.model_id ?? "-"],
              [t("demo.config.asr"), config.conversation_config?.asr?.quality ?? "-"],
              [t("demo.config.rag"), agent?.prompt?.rag?.enabled ? t("common.yes") : t("common.no")],
              [t("demo.config.temperature"), String(agent?.prompt?.temperature ?? "-")],
            ].map(([k, v]) => (
              <div key={k} className="min-w-0 rounded-xl border border-line bg-surface px-3.5 py-2.5">
                <dt className="eyebrow">{k}</dt>
                <dd className="mt-1 truncate font-mono text-[13px] text-ink" dir="ltr" title={v}>{v}</dd>
              </div>
            ))}
          </dl>

          {agent?.first_message && (
            <Section icon={<Lock className="h-4 w-4 text-civic" aria-hidden />} title={t("demo.config.firstMessage")}>
              <p className="rounded-xl border border-civic/25 bg-civic-soft/50 px-3 py-2 text-[13.5px] text-ink" dir="auto">{agent.first_message}</p>
            </Section>
          )}

          <Section icon={<GitBranch className="h-4 w-4 text-violet" aria-hidden />} title={t("demo.config.workflow", { n: nodes.length })}>
            <ul className="flex flex-wrap gap-2">
              {nodes.map(([id, node]) => (
                <li key={id} className="rounded-xl border border-violet/25 bg-violet-soft/50 px-3 py-2">
                  <p className="text-[13px] font-medium text-ink">{node.label ?? id}</p>
                  <p className="font-mono text-[10.5px] text-muted" dir="ltr">{id} · {node.type}</p>
                </li>
              ))}
            </ul>
            <ul className="mt-3 space-y-1.5">
              {edges.map((e) => (
                <li key={`${e.source}-${e.target}`} className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
                  <span className="font-mono text-ink" dir="ltr">{e.source}</span>
                  <ArrowRight className="rtl-flip h-3 w-3 self-center text-faint" aria-hidden />
                  <span className="font-mono text-ink" dir="ltr">{e.target}</span>
                  {e.forward_condition?.condition && <span className="text-muted">{e.forward_condition.condition}</span>}
                </li>
              ))}
            </ul>
          </Section>

          <Section icon={<Wrench className="h-4 w-4 text-azure" aria-hidden />} title={t("demo.config.tools", { n: tools.length })}>
            <div className="scroll-thin overflow-x-auto overscroll-x-contain">
              <table className="w-full min-w-[560px] border-separate border-spacing-0 text-[12.5px]">
                <thead>
                  <tr>
                    <th scope="col" className="sticky start-0 z-[5] border-b border-line bg-paper-2 py-2 pe-3 ps-1 text-start font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{t("demo.config.toolName")}</th>
                    <th scope="col" className="border-b border-line py-2 pe-3 text-start font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{t("demo.config.toolDescription")}</th>
                    <th scope="col" className="border-b border-line py-2 text-start font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{t("demo.config.toolEndpoint")}</th>
                  </tr>
                </thead>
                <tbody>
                  {tools.map((tool) => (
                    <tr key={tool.name} className="align-top">
                      <td className="sticky start-0 z-[5] border-b border-line bg-paper py-2 pe-3 ps-1 font-mono text-ink" dir="ltr">{tool.name}</td>
                      <td className="border-b border-line py-2 pe-3 text-ink-2">{tool.description}</td>
                      <td className="border-b border-line py-2 font-mono text-[11px] text-muted" dir="ltr">{tool.api_schema?.method} {pathOf(tool.api_schema?.url)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[12px] text-muted"><Lock className="h-3 w-3" aria-hidden />{t("demo.config.secretHidden")}</p>
          </Section>

          <Section icon={<Languages className="h-4 w-4 text-civic" aria-hidden />} title={t("demo.config.presets", { n: presets.length })}>
            <ul className="space-y-2">
              {presets.map(([code, preset]) => {
                const lang = langName(code);
                return (
                  <li key={code} className="grid gap-1 rounded-xl border border-line bg-surface px-3 py-2 sm:grid-cols-[8rem_1fr] sm:gap-3">
                    <span className="text-[12.5px] font-medium text-ink">{lang ? `${lang.native} · ${code}` : code}</span>
                    <span className="text-[13px] text-ink-2" dir="auto" lang={lang?.code}>{preset.overrides?.agent?.first_message}</span>
                  </li>
                );
              })}
            </ul>
          </Section>

          {collection.length > 0 && (
            <Section icon={<Database className="h-4 w-4 text-ink-2" aria-hidden />} title={t("demo.config.dataCollection")}>
              <ul className="grid gap-2 sm:grid-cols-2">
                {collection.map(([key, field]) => (
                  <li key={key} className="rounded-xl border border-line bg-surface px-3 py-2">
                    <p className="font-mono text-[12px] text-ink" dir="ltr">{key} <span className="text-faint">· {field.type}</span></p>
                    <p className="mt-0.5 text-[12.5px] text-muted">{field.description}</p>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <details className="rounded-xl border border-line bg-surface p-3.5">
            <summary className="inline-flex min-h-8 cursor-pointer items-center text-[13px] font-medium text-ink-2">{t("demo.config.raw")}</summary>
            <pre className="scroll-thin mt-2.5 max-h-96 overflow-auto rounded-xl border border-line bg-stage p-3.5 font-mono text-[11px] leading-relaxed text-ink-2" dir="ltr">{JSON.stringify(redact(config), null, 2)}</pre>
          </details>
        </div>
      )}
    </DemoPanel>
  );
}
