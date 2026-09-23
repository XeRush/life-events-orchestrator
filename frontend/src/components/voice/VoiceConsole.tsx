import { Mic, MicOff, PhoneCall, PhoneOff, Send, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "../../i18n";
import type { useVoiceCall } from "../../hooks/useVoiceCall";
import { useUI } from "../../stores/ui";
import { cn } from "../../utils/format";
import { Badge, Button, Card } from "../ui/primitives";
import { Waveform } from "./Waveform";

const SUGGESTIONS = ["My daughter was born yesterday.", "Yes.", "Where are we?", "What do I need to do?", "I don't have it right now.", "I have the document now.", "What's next?"];

type Call = ReturnType<typeof useVoiceCall>;

export function VoiceConsole({ call, provider, callbackId, onStartCallback }: { call: Call; provider: "elevenlabs" | "simulated"; callbackId?: string | null; onStartCallback?: () => void }) {
  const t = useT();
  const [text, setText] = useState("");
  const speak = useUI((s) => s.speakReplies);
  const setSpeak = useUI((s) => s.setSpeakReplies);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [call.messages.length]);
  const stateLabel = { idle: t("voice.idle"), listening: t("voice.listening"), thinking: t("voice.thinking"), speaking: t("voice.speaking") }[call.state];
  const stateTone = { idle: "slate", listening: "azure", thinking: "violet", speaking: "civic" }[call.state] as "slate" | "azure" | "violet" | "civic";

  return (
    <Card className="overflow-hidden">
      <div className="bg-ink px-6 pb-6 pt-5 text-paper">
        <div className="mb-2 flex items-center justify-between">
          <p className="eyebrow !text-paper/60">{provider === "elevenlabs" ? "ElevenLabs conversational agent" : "Backend dialog engine (ElevenLabs not configured)"}</p>
          <Badge tone={stateTone} dot>{stateLabel}</Badge>
        </div>
        <Waveform state={call.state} />
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          {!call.active ? (
            <>
              <Button variant="light" size="lg" icon={<PhoneCall className="h-4 w-4" />} onClick={() => call.start({ mode: "inbound" })}>{t("voice.start")}</Button>
              {callbackId && onStartCallback && <Button variant="secondary" size="lg" onClick={onStartCallback}>Answer the pending callback</Button>}
            </>
          ) : (
            <>
              <Button variant="danger" size="lg" icon={<PhoneOff className="h-4 w-4" />} onClick={call.end}>{t("voice.end")}</Button>
              {provider === "simulated" && (
                <Button variant="light" size="lg" icon={call.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />} onClick={call.listen} aria-pressed={call.listening}>{t("voice.mic")}</Button>
              )}
            </>
          )}
        </div>
        <label className="mx-auto mt-4 flex w-fit items-center gap-2 text-xs text-paper/70">
          <input type="checkbox" checked={speak} onChange={(e) => setSpeak(e.target.checked)} className="accent-[var(--color-civic-bright)]" />
          <Volume2 className="h-3.5 w-3.5" aria-hidden />{t("voice.speak")}
        </label>
      </div>

      <div className="px-6 py-5">
        <p className="eyebrow mb-3">{t("voice.transcript")}</p>
        <div className="scroll-thin h-72 space-y-3 overflow-y-auto pe-1" aria-live="polite">
          {call.messages.length === 0 && <p className="text-sm text-muted">Start a call, then say (or type) “My daughter was born yesterday.”</p>}
          {call.messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <p className={cn("max-w-[85%] rounded-2xl px-4 py-2.5 text-[14.5px] leading-relaxed", m.role === "user" ? "rounded-ee-md bg-ink text-paper" : "rounded-es-md bg-paper-2")}>{m.text}</p>
            </div>
          ))}
          {call.state === "thinking" && <p className="text-sm text-muted">…</p>}
          <div ref={endRef} />
        </div>
        {call.active && (
          <>
            {provider === "simulated" && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => call.send(s)} className="rounded-full border border-line-2 px-3 py-1 text-xs text-ink-2 hover:bg-paper-2 cursor-pointer">{s}</button>
                ))}
              </div>
            )}
            <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); call.send(text); setText(""); }}>
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("voice.say")} aria-label={t("voice.say")} className="h-11 flex-1 rounded-full border border-line-2 bg-surface px-4 text-sm" />
              <Button type="submit" icon={<Send className="h-4 w-4" />} disabled={!text.trim()}>{t("voice.send")}</Button>
            </form>
          </>
        )}
      </div>
    </Card>
  );
}
