import { useMutation, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Database, FlaskConical, ListChecks, MessageSquareText, Play, RotateCcw, ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";
import { ease } from "../../animations/variants";
import { agentApi } from "../../api";
import { AgentConfigViewer } from "../../components/demo/AgentConfigViewer";
import { DemoFrame, DemoPanel } from "../../components/demo/DemoFrame";
import { ScenarioList } from "../../components/demo/ScenarioList";
import { EmptyNote, PageHead, useCardMotion } from "../../components/officer/kit";
import { Bones } from "../../components/ui/Bones";
import { Button, ErrorState, Ring } from "../../components/ui/primitives";
import { useLang, useT } from "../../i18n";
import { fmtTime } from "../../lib/format";
import { useUI } from "../../stores/ui";

export interface TestDefinition { name: string; success_condition: string; type?: string; chat_history?: { role: string; message: string }[] }

/** ElevenLabs Agent Testing definitions (also rendered with a fixture on /__bones for skeleton capture). */
export function DefinitionList({ items }: { items: TestDefinition[] }) {
  const t = useT();
  const card = useCardMotion();
  return (
    <ul className="grid gap-2.5 md:grid-cols-2">
      {items.map((d, i) => (
        <motion.li key={d.name} {...card(i)} className="flex min-w-0 flex-col rounded-xl border border-line bg-paper/50 p-3.5">
          <p className="flex items-start justify-between gap-2">
            <span className="min-w-0 font-display text-[1.05rem] leading-snug text-ink">{d.name}</span>
            {d.type && <span className="shrink-0 rounded-md bg-violet-soft px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-violet">{d.type}</span>}
          </p>
          {d.chat_history?.[0] && (
            <p className="mt-1.5 flex items-start gap-2 text-[13px] text-ink-2">
              <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
              <span><span className="text-muted">{t("demo.definitions.prompt")} </span>&ldquo;{d.chat_history[0].message}&rdquo;</span>
            </p>
          )}
          <p className="mt-2 rounded-lg border border-civic/20 bg-civic-soft/40 px-3 py-2 text-[13px] leading-relaxed text-ink">
            <span className="font-medium text-civic">{t("demo.definitions.success")} </span>{d.success_condition}
          </p>
        </motion.li>
      ))}
    </ul>
  );
}

/** /agent-testing - staff only. Guardrail scenarios, the ElevenLabs Agent Testing definitions, and the agent config dry run. */
export default function AgentTesting() {
  const t = useT();
  const lang = useLang();
  const reduce = useReducedMotion();
  const toast = useUI((s) => s.toast);
  const started = useRef(0);
  const [meta, setMeta] = useState<{ at: string; ms: number } | null>(null);

  const run = useMutation({
    mutationFn: () => {
      started.current = performance.now();
      return agentApi.runTests();
    },
    onSuccess: (r) => {
      setMeta({ at: new Date().toISOString(), ms: Math.round(performance.now() - started.current) });
      toast(r.passed === r.total ? "success" : "error", t("demo.testing.toast", { passed: r.passed, total: r.total }));
    },
    onError: (e: Error) => toast("error", e.message),
  });
  const definitions = useQuery({ queryKey: ["agent-test-definitions"], queryFn: agentApi.testDefinitions, staleTime: 300_000 });

  const result = run.data;
  const percent = result && result.total ? Math.round((result.passed / result.total) * 100) : 0;

  return (
    <div className="space-y-4">
      <PageHead
        eyebrow={<><FlaskConical className="h-3.5 w-3.5" aria-hidden />{t("demo.testing.eyebrow")}</>}
        eyebrowClassName="text-amber!"
        title={t("demo.testing.title")}
        subtitle={t("demo.testing.subtitle")}
      />

      <DemoFrame note={t("demo.testing.frameNote")}>
        <div className="space-y-4">
          {/* run + summary */}
          <section aria-labelledby="suite-title" className="card grid gap-4 p-4 sm:p-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="min-w-0">
              <h2 id="suite-title" className="text-[1.3rem] leading-tight">{t("demo.testing.suiteTitle")}</h2>
              <ul className="mt-2.5 space-y-1.5 text-[13.5px] leading-relaxed text-ink-2">
                <li className="flex gap-2.5"><Database className="mt-0.5 h-4 w-4 shrink-0 text-azure" aria-hidden />{t("demo.testing.isolated")}</li>
                <li className="flex gap-2.5"><RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-azure" aria-hidden />{t("demo.testing.rolledBack")}</li>
                <li className="flex gap-2.5"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-azure" aria-hidden />{t("demo.testing.semantics")}</li>
              </ul>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button size="lg" icon={<Play className="h-4 w-4" aria-hidden />} loading={run.isPending} onClick={() => run.mutate()}>
                  {t(result ? "demo.testing.rerun" : "demo.testing.run")}
                </Button>
                {run.isPending && <span className="text-[13px] text-muted" aria-live="polite">{t("demo.testing.running")}</span>}
                {meta && !run.isPending && <span className="text-[13px] text-muted">{t("demo.testing.lastRun", { time: fmtTime(meta.at, lang), seconds: (meta.ms / 1000).toFixed(1) })}</span>}
              </div>
            </div>
            <div className="flex items-center gap-4 lg:flex-col lg:items-end">
              <AnimatePresence mode="wait" initial={false}>
                {result ? (
                  <motion.div key="ring" className="flex items-center gap-4 lg:flex-col lg:items-end"
                    initial={reduce ? false : { opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, ease }}>
                    <Ring percent={percent} size={104} label={t("demo.testing.ringLabel")}>
                      <span className="num text-[1.5rem]">{result.passed}/{result.total}</span>
                    </Ring>
                    <p className={result.passed === result.total ? "text-[13.5px] font-medium text-civic" : "text-[13.5px] font-medium text-rose"}>
                      {t(result.passed === result.total ? "demo.testing.allMet" : "demo.testing.someMissed", { n: result.total - result.passed })}
                    </p>
                  </motion.div>
                ) : (
                  <motion.div key="idle" exit={{ opacity: 0 }}
                    className={`grid h-26 w-26 place-items-center rounded-full border-2 border-dashed border-line-2 px-3 text-center text-[12px] text-faint ${run.isPending && !reduce ? "animate-[spin_6s_linear_infinite]" : ""}`}>
                    <span className={run.isPending && !reduce ? "animate-[spin_6s_linear_infinite_reverse]" : undefined}>{t("demo.testing.notRunShort")}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </section>

          {run.isError && <ErrorState error={run.error} onRetry={() => run.mutate()} />}

          <DemoPanel id="scenarios" title={t("demo.testing.scenariosTitle")} hint={t("demo.testing.scenariosHint")}>
            <ScenarioList results={result?.results} running={run.isPending} />
          </DemoPanel>

          <DemoPanel id="definitions" title={t("demo.definitions.title")} hint={t("demo.definitions.hint")}>
            <Bones name="staff-agent-tests" loading={definitions.isLoading} lines={4}>
              {definitions.isError ? (
                <ErrorState error={definitions.error} onRetry={() => definitions.refetch()} />
              ) : definitions.data && definitions.data.length === 0 ? (
                <EmptyNote icon={<ListChecks aria-hidden />} title={t("demo.definitions.empty")} />
              ) : definitions.data ? (
                <DefinitionList items={definitions.data as TestDefinition[]} />
              ) : null}
            </Bones>
          </DemoPanel>

          <AgentConfigViewer />
        </div>
      </DemoFrame>
    </div>
  );
}
