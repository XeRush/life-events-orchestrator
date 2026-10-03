import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { MessageSquareText, Radio } from "lucide-react";
import { useState } from "react";
import { ease } from "../../animations/variants";
import { demoApi } from "../../api";
import { useLang, useT, type MessageKey } from "../../i18n";
import { cn, relative } from "../../lib/format";
import { TONE } from "../../lib/status";
import type { DemoStatus } from "../../types/api";
import { EmptyNote } from "../officer/kit";
import { Badge, Tabs } from "../ui/primitives";
import { MockBadge } from "../ui/StatusBadge";
import { DemoPanel } from "./DemoFrame";
import { OUTBOX_TONE, maskPhone, tOr } from "./labels";

type Filter = "ALL" | "PENDING" | "PUBLISHED" | "PROCESSED" | "FAILED";
const STATUSES: Exclude<Filter, "ALL">[] = ["PENDING", "PUBLISHED", "PROCESSED", "FAILED"];

interface Row { key: string; event_type: string; topic: string; status: string; created_at: string; attempts: number; error: string | null; node_key: string | null }

/** Outbox rows with their Kafka topic and delivery status, plus the broker's current mode. New entries slide in. */
export function EventInspector({ status }: { status: DemoStatus }) {
  const t = useT();
  const lang = useLang();
  const reduce = useReducedMotion();
  const [filter, setFilter] = useState<Filter>("ALL");
  const filtered = useQuery({
    queryKey: ["demo", "outbox", filter],
    queryFn: () => demoApi.outbox(filter === "ALL" ? undefined : filter),
    enabled: filter !== "ALL",
    refetchInterval: 4000,
  });

  const rows: Row[] = filter === "ALL"
    ? status.recent_events.map((e) => ({ key: `${e.created_at}-${e.event_type}-${e.topic}`, event_type: e.event_type, topic: e.topic, status: e.status, created_at: e.created_at, attempts: e.attempts, error: e.error, node_key: null }))
    : (filtered.data ?? []).map((e) => ({
        key: e.id, event_type: e.event_type, topic: e.topic, status: e.status, created_at: e.created_at, attempts: e.attempts,
        error: (e as { error?: string | null }).error ?? null, node_key: e.node_key,
      }));

  const broker = status.broker;
  return (
    <DemoPanel
      id="demo-events" title={t("demo.events.title")} hint={t("demo.events.hint")}
      action={
        <span className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] transition-colors duration-500", broker.healthy && !broker.simulated_failure ? "border-civic/30 bg-civic-soft text-civic" : "border-rose/30 bg-rose-soft text-rose")}>
          <Radio className="h-3.5 w-3.5" aria-hidden />
          {t("demo.events.broker", { mode: broker.mode })}
          <span className="font-medium">{t(broker.simulated_failure ? "demo.events.brokerDown" : broker.healthy ? "demo.events.brokerUp" : "demo.events.brokerUnhealthy")}</span>
        </span>
      }
    >
      {broker.fallback && <p className="mb-3 text-[12.5px] text-amber">{t("demo.events.fallback")}</p>}
      {broker.last_error && <p className="mb-3 break-words font-mono text-[11.5px] text-rose" dir="ltr">{broker.last_error}</p>}

      <Tabs<Filter>
        value={filter} onChange={setFilter} className="mb-3"
        items={[
          { value: "ALL", label: t("demo.events.recent"), count: status.recent_events.length },
          ...STATUSES.map((s) => ({ value: s, label: t(`demo.outbox.${s}` as MessageKey), count: status.outbox[s] ?? 0 })),
        ]}
      />

      {rows.length === 0 ? (
        <EmptyNote icon={<Radio aria-hidden />} title={filtered.isLoading ? t("common.loading") : t("demo.events.empty")} />
      ) : (
        <div className="scroll-thin max-h-[30rem] overflow-auto overscroll-x-contain rounded-xl border border-line">
          <table className="w-full min-w-[620px] border-separate border-spacing-0 text-[13px]">
            <caption className="sr-only">{t("demo.events.title")}</caption>
            <thead>
              <tr>
                {(["demo.events.col.time", "demo.events.col.event", "demo.events.col.topic", "demo.events.col.status", "demo.events.col.attempts"] as MessageKey[]).map((k, i) => (
                  <th key={k} scope="col" className={cn("sticky top-0 z-10 border-b border-line bg-paper-2 px-3 py-2.5 text-start font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted", i === 0 && "start-0 z-20")}>{t(k)}</th>
                ))}
              </tr>
            </thead>
            <tbody key={filter}>
              <AnimatePresence initial>
                {rows.map((r, i) => {
                  const tone = TONE[OUTBOX_TONE[r.status] ?? "slate"];
                  return (
                    <motion.tr
                      key={r.key}
                      layout="position"
                      initial={reduce ? false : { opacity: 0, x: -14 }}
                      animate={{ opacity: 1, x: 0, transition: { duration: 0.35, ease, delay: Math.min(i * 0.035, 0.3) } }}
                      exit={reduce ? undefined : { opacity: 0, transition: { duration: 0.15 } }}
                      transition={{ layout: { duration: 0.35, ease } }}
                      className="align-top"
                    >
                      <td className="sticky start-0 z-[5] whitespace-nowrap border-b border-e border-line bg-surface px-3 py-2.5 text-muted">{relative(r.created_at, lang)}</td>
                      <td className="border-b border-line px-3 py-2.5">
                        <span className="font-medium text-ink" dir="ltr">{r.event_type}</span>
                        {r.node_key && <span className="ms-2 font-mono text-[11px] text-faint" dir="ltr">{r.node_key}</span>}
                        {r.error && <p className="mt-1 break-words font-mono text-[11px] text-rose" dir="ltr">{r.error}</p>}
                      </td>
                      <td className="border-b border-line px-3 py-2.5 font-mono text-[11.5px] text-ink-2" dir="ltr">{r.topic}</td>
                      <td className="border-b border-line px-3 py-2.5">
                        <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11.5px] font-medium", tone.bg, tone.text, tone.border)}>
                          <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} aria-hidden />{tOr(t, `demo.outbox.${r.status}`, r.status)}
                        </span>
                      </td>
                      <td className="num border-b border-line px-3 py-2.5 text-ink-2">{r.attempts}</td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}
    </DemoPanel>
  );
}

/** Mock SMS outbox: what the SMS fallback would have sent. Numbers are masked. */
export function MockSmsPanel({ status }: { status: DemoStatus }) {
  const t = useT();
  const lang = useLang();
  const reduce = useReducedMotion();
  return (
    <DemoPanel id="demo-sms" title={t("demo.sms.title")} hint={t("demo.sms.hint")} action={<MockBadge compact />}>
      {status.mock_sms.length === 0 ? (
        <EmptyNote icon={<MessageSquareText aria-hidden />} title={t("demo.sms.empty")} hint={t("demo.sms.emptyHint")} />
      ) : (
        <ul className="flex flex-col gap-2">
          <AnimatePresence initial>
            {status.mock_sms.map((m, i) => (
              <motion.li
                key={`${m.at}-${m.to}`}
                layout="position"
                initial={reduce ? false : { opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.35, ease, delay: Math.min(i * 0.05, 0.3) } }}
                className="rounded-xl border border-line bg-paper/60 p-3"
              >
                <div className="flex items-center justify-between gap-3 text-[12px] text-muted">
                  <span className="num font-mono" dir="ltr">{maskPhone(m.to)}</span>
                  <span>{relative(m.at, lang)}</span>
                </div>
                <p className="mt-1 text-[13.5px] leading-relaxed text-ink" dir="auto">{m.body}</p>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      <div className="mt-3"><Badge tone="slate">{t("demo.sms.count", { n: status.mock_sms.length })}</Badge></div>
    </DemoPanel>
  );
}
