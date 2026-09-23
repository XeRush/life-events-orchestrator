import { Wrench } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { VoiceConsole } from "../components/voice/VoiceConsole";
import { Badge, Card, PageHeader } from "../components/ui/primitives";
import { CaseStatusBadge } from "../components/ui/StatusBadge";
import { useCallbacks, useCases, useConversations, useSnapshot, useVoiceConfig } from "../hooks/queries";
import { useVoiceCall } from "../hooks/useVoiceCall";
import { useT } from "../i18n";
import { cn, fmtDateTime, fmtDuration, title } from "../utils/format";

export default function VoiceAssistant() {
  const t = useT();
  const call = useVoiceCall();
  const { data: config } = useVoiceConfig();
  const { data: cases } = useCases();
  const { data: convs } = useConversations();
  const { data: callbacks } = useCallbacks();
  const [openConv, setOpenConv] = useState<string | null>(null);
  const activeCase = call.caseRef ?? cases?.items.find((c) => c.status !== "COMPLETED")?.reference ?? null;
  const { data: snap } = useSnapshot(activeCase);
  const pending = callbacks?.find((c) => c.status === "SCHEDULED" || c.status === "IN_PROGRESS");
  const provider = call.session?.provider ?? config?.provider ?? "simulated";

  return (
    <>
      <PageHeader eyebrow="ElevenLabs" title={t("voice.title")} subtitle={t("voice.subtitle")}
        actions={<Badge tone={config?.elevenlabs_configured ? "civic" : "amber"} dot>{config?.elevenlabs_configured ? "ElevenLabs live" : "Simulated voice (add ElevenLabs keys)"}</Badge>} />
      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <VoiceConsole call={call} provider={provider} callbackId={pending?.id} onStartCallback={() => call.start({ mode: "callback", callback_id: pending!.id })} />
        <div className="space-y-6">
          <Card className="p-6">
            <p className="eyebrow mb-3">{t("voice.currentCase")}</p>
            {snap && activeCase ? (
              <>
                <div className="flex items-center justify-between"><Link to={`/app/life-events/${activeCase}`} className="font-mono underline underline-offset-4">{activeCase}</Link><CaseStatusBadge status={snap.status} /></div>
                <p className="mt-3 font-display text-lg leading-snug">{snap.summary}</p>
                <p className="mt-2 text-xs text-muted">Read from the persistent case - the same source the ElevenLabs tools use.</p>
              </>
            ) : <p className="text-sm text-muted">No case yet. Report a life event on the call and it will appear here.</p>}
          </Card>
          <Card className="p-6">
            <p className="eyebrow mb-3">{t("voice.lastAction")}</p>
            {call.lastActions.length === 0 ? <p className="text-sm text-muted">Backend tool calls (create_life_event_case, get_case_status, …) appear here as the assistant uses them.</p> : (
              <ul className="space-y-2">
                {call.lastActions.map((a, i) => (
                  <li key={i} className="flex items-center gap-2 rounded-xl bg-paper-2 px-3 py-2 font-mono text-[13px]"><Wrench className="h-3.5 w-3.5 text-muted" aria-hidden />{a.name}<Badge tone={a.ok ? "civic" : "rose"} className="ms-auto">{a.ok ? "ok" : "refused"}</Badge></li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-6">
            <p className="eyebrow mb-3">{t("voice.history")}</p>
            {!convs?.length ? <p className="text-sm text-muted">No calls yet.</p> : (
              <ul className="divide-y divide-line/70">
                {convs.slice(0, 8).map((c) => (
                  <li key={c.id}>
                    <button onClick={() => setOpenConv(openConv === c.id ? null : c.id)} aria-expanded={openConv === c.id} className="flex w-full items-center justify-between gap-3 py-2.5 text-start text-sm cursor-pointer">
                      <span>{title(c.channel.replace("VOICE_", ""))} · {c.provider}<span className="block text-xs text-muted">{fmtDateTime(c.started_at)}</span></span>
                      <span className="font-mono text-xs text-muted">{fmtDuration(c.duration_seconds)}</span>
                    </button>
                    {openConv === c.id && (
                      <div className="mb-3 space-y-1.5 rounded-xl bg-paper-2 p-3 text-[13px]">
                        {c.transcript.map((m, i) => <p key={i}><span className={cn("me-1.5 font-semibold", m.role === "user" ? "text-azure" : "text-civic")}>{m.role === "user" ? "Resident" : "Assistant"}:</span>{m.text}</p>)}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
