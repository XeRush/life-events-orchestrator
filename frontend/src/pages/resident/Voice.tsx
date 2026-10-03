import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import {
  AudioLines, Bot, Check, Fingerprint, Headset, Languages, Mic, MicOff, Phone, PhoneCall, PhoneOff, SendHorizontal, ShieldCheck, Volume2, VolumeX, X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { agentApi } from "../../api";
import { FIX_CASE } from "../../bones/fixtures/resident";
import { LinkButton, OwnerBadge, Panel } from "../../components/case/CaseBits";
import { FillBar } from "../../components/case/Progress";
import { tx } from "../../components/case/text";
import { LanguageDialog, LanguagePicker, StopCallingDialog } from "../../components/voice/Dialogs";
import { QuickReplies } from "../../components/voice/QuickReplies";
import { Transcript } from "../../components/voice/Transcript";
import { Waveform } from "../../components/voice/Waveform";
import { Bones } from "../../components/ui/Bones";
import { Button, Toggle } from "../../components/ui/primitives";
import { MockBadge, NodeStateBadge } from "../../components/ui/StatusBadge";
import { useAgentConfig, useCase, useMyCases, useRinging } from "../../hooks/queries";
import type { AgentState } from "../../hooks/useVoiceCall";
import { useVoiceCall } from "../../hooks/useVoiceCall";
import { LANGUAGES, useLang, useT } from "../../i18n";
import { cn, duration } from "../../lib/format";
import { useUI } from "../../stores/ui";
import type { CallView, CaseView, Lang } from "../../types/api";

const EASE = [0.22, 1, 0.36, 1] as const;
const STATE_DOT: Record<AgentState, string> = {
  idle: "bg-faint", connecting: "bg-azure animate-pulse", listening: "bg-azure", thinking: "bg-violet animate-pulse", speaking: "bg-civic", ended: "bg-faint",
};
const side: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } } };
const rise: Variants = { hidden: { opacity: 0, y: 12 }, shown: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } };

function ProviderBadge({ provider }: { provider: CallView["provider"] }) {
  const t = useT();
  const live = provider === "ELEVENLABS";
  const Icon = live ? AudioLines : Bot;
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium",
      live ? "border-ink bg-ink text-paper" : "border-line-2 bg-surface text-ink-2")}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {live ? t("resident.voice.provider.elevenlabs") : t("resident.voice.provider.simulated")}
    </span>
  );
}

/** Round, labelled phone-style control. The label is always visible, so no control relies on its icon alone. */
function Ctl({ icon: Icon, label, onClick, pressed, disabled, tone = "default" }: {
  icon: LucideIcon; label: string; onClick: () => void; pressed?: boolean; disabled?: boolean; tone?: "default" | "danger" | "accent";
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={pressed}
      className="group flex min-w-0 cursor-pointer flex-col items-center gap-1.5 rounded-2xl px-1 py-1 text-[12px] text-ink-2 disabled:cursor-not-allowed disabled:opacity-40">
      <span className={cn("grid h-12 w-12 place-items-center rounded-full border transition-[background-color,border-color,color,transform] duration-200 group-active:scale-95",
        tone === "danger" ? "border-transparent bg-rose text-on-accent group-hover:bg-rose/90"
          : tone === "accent" ? "border-transparent bg-civic text-on-accent group-hover:bg-civic/90"
          : pressed ? "border-transparent bg-ink text-paper" : "border-line-2 bg-surface text-ink group-hover:bg-paper-2")}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="text-center leading-tight">{label}</span>
    </button>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="mt-0.5 text-[13px] leading-snug text-ink [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

/** The case the call is about: reference, child, the moving step, progress and who acts next. */
export function VoiceCaseCard({ view }: { view: CaseView | undefined }) {
  const t = useT();
  return (
    <Panel id="voice-case" title={t("resident.voice.case.title")}
      action={view && <LinkButton to={`/app/cases/${view.reference}`} size="sm" variant="ghost" className="-me-2 -mt-1 min-h-10 sm:min-h-8">{t("common.open")}</LinkButton>}>
      {view ? (
        <div className="space-y-3 text-sm">
          <div>
            <p className="font-mono text-xs text-muted">{view.reference}</p>
            {view.child && <p className="mt-0.5 font-medium">{view.child.full_name_en}</p>}
          </div>
          {view.current_node && (
            <div className="flex flex-wrap items-center gap-2" aria-live="polite">
              <span>{t(`node.${view.current_node.key}`)}</span>
              <NodeStateBadge state={view.current_node.state} />
            </div>
          )}
          <div>
            <FillBar percent={view.progress.percent} label={t("resident.progress.ring")} />
            <p className="mt-1.5 text-xs text-muted num">{t("resident.progress.count", { done: view.progress.done, total: view.progress.total })}</p>
          </div>
          {view.next_action && (
            <div className="rounded-xl bg-paper-2 px-3 py-2.5">
              <OwnerBadge owner={view.next_action.owner} />
              <p className="mt-1.5 leading-snug">{view.next_action.text}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3 text-sm text-muted">
          <p>{t("resident.voice.case.none")}</p>
          <LinkButton to="/app/intake" size="sm" variant="secondary">{t("resident.home.report")}</LinkButton>
        </div>
      )}
    </Panel>
  );
}

/** Skeleton for the call's case card; the same wrapper is rendered on /__bones for capture. */
export function VoiceCaseBones({ loading = true, children = null }: { loading?: boolean; children?: ReactNode }) {
  return (
    <Bones name="res-voice-case" loading={loading} lines={6} fixture={import.meta.env.DEV ? <VoiceCaseCard view={FIX_CASE} /> : undefined}>
      {children}
    </Bones>
  );
}

export default function Voice() {
  const t = useT();
  const uiLang = useLang();
  const reduce = useReducedMotion();
  const toast = useUI((s) => s.toast);
  const speak = useUI((s) => s.speakReplies);
  const setSpeak = useUI((s) => s.setSpeak);
  const [params, setParams] = useSearchParams();
  const incomingId = params.get("call");
  const presetCase = params.get("case");
  const v = useVoiceCall();
  const cases = useMyCases();
  const config = useAgentConfig();
  const ringing = useRinging(v.state === "idle" && !incomingId);
  const [callLang, setCallLang] = useState<Lang>(uiLang);
  const [chosenCase, setChosenCase] = useState("");
  const [langOpen, setLangOpen] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [draft, setDraft] = useState("");
  const answered = useRef(false);
  const callRef = useRef<CallView | null>(null);
  callRef.current = v.call;

  const caseItems = cases.data?.items ?? [];
  const selectedRef = v.call?.case_reference ?? (chosenCase || presetCase || caseItems[0]?.reference || null);
  const caseQ = useCase(selectedRef ?? undefined);
  const view = caseQ.data;

  // An incoming callback opened from the banner (?call=<id>) is answered once, then the parameter is cleared.
  useEffect(() => {
    if (!incomingId || answered.current) return;
    answered.current = true;
    void v.answer(incomingId);
    setParams((p) => { p.delete("call"); return p; }, { replace: true });
  }, [incomingId, v, setParams]);

  // Leaving the page mid-call ends the call on the server too, so it never hangs "active".
  useEffect(() => () => {
    const c = callRef.current;
    if (c && c.state === "ACTIVE") agentApi.end(c.id).catch(() => undefined);
  }, []);

  const callEnded = !!v.call && ["ENDED", "TRANSFERRED", "FAILED"].includes(v.call.state);
  const phase: "idle" | "live" | "ended" = v.state === "idle" ? "idle" : v.state === "ended" || callEnded ? "ended" : "live";
  const finalCall = useQuery({ queryKey: ["call", v.call?.id], queryFn: () => agentApi.call(v.call!.id), enabled: phase === "ended" && !!v.call?.id });

  const provider: CallView["provider"] = v.call?.provider ?? (config.data?.voice.provider === "elevenlabs" ? "ELEVENLABS" : "SIMULATED");
  const elevenLive = v.transport?.provider === "elevenlabs" && !!v.transport.signed_url;
  const simulated = provider === "SIMULATED";
  const busy = v.state === "thinking" || v.state === "connecting";
  const muted = !!v.call?.muted;
  const canTalk = phase === "live" && v.active && !muted && !busy;
  const subAgent = v.last?.sub_agent ?? v.call?.sub_agent ?? null;
  const stage = v.last?.stage ?? v.call?.agent.stage ?? null;
  const language = LANGUAGES.find((l) => l.code === (v.call?.language ?? callLang));
  const srSupported = v.canListen; // Scribe v2 on the server when configured, else the browser's recognition
  const showUaePass = v.active && v.call?.direction === "OUTBOUND" && !v.call.verified;
  const transferred = v.call?.state === "TRANSFERRED";
  const elapsed = phase === "ended" ? (finalCall.data?.duration_seconds ?? v.elapsed) : v.elapsed;
  const caseRef = v.call?.case_reference ?? selectedRef;
  const caseLoading = cases.isLoading || (!!selectedRef && caseQ.isLoading);

  const safe = (p: Promise<unknown>) => p.catch((e: Error) => toast("error", e.message));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !canTalk) return;
    setDraft("");
    void v.send(text);
  };
  // With a live ElevenLabs session the agent itself hears these requests; the simulated channel has explicit endpoints.
  const act = (kind: "human" | "stop" | "uaePass") => {
    if (elevenLive) return v.send(t(`resident.voice.say.${kind}`));
    return kind === "human" ? v.requestHuman() : kind === "stop" ? v.stopCalling() : v.uaePass();
  };
  const confirmStop = async () => {
    setStopping(true);
    try {
      await act("stop");
    } finally {
      setStopping(false);
      setStopOpen(false);
    }
  };

  const consentText = !view ? t("resident.voice.fact.noCase")
    : view.opted_out || view.channel_mode === "SMS_ONLY" ? t("resident.voice.fact.smsOnly")
    : view.consent.callback ? t("resident.voice.fact.callbacksOn") : t("resident.voice.fact.callbacksOff");

  const ring = ringing.data?.[0];

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl leading-tight sm:text-[38px]">{t("resident.voice.title")}</h1>
          <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-muted">{t("resident.voice.subtitle")}</p>
        </div>
        <span className="hidden sm:inline-flex"><ProviderBadge provider={provider} /></span>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <motion.section aria-label={t("resident.voice.console")} className="stage overflow-hidden rounded-3xl border border-line"
          initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
          <AnimatePresence mode="wait" initial={false}>
            {phase === "idle" ? (
              <motion.div key="idle" className="grid-lines px-4 py-6 sm:px-8 sm:py-8"
                initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
                <AnimatePresence>
                  {ring && (
                    <motion.div role="alertdialog" aria-label={t("resident.voice.ring.title")}
                      initial={{ opacity: 0, y: reduce ? 0 : -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-civic/30 bg-civic-soft px-4 py-4">
                      <span className="phone-ring grid h-11 w-11 shrink-0 place-items-center rounded-full bg-civic text-on-accent"><PhoneCall className="h-5 w-5" aria-hidden /></span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink">{t("resident.voice.ring.title")}</p>
                        <p className="text-sm text-ink-2">{t("resident.voice.ring.body", { ref: ring.case_reference ?? "" })}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => safe(agentApi.end(ring.id).then(() => ringing.refetch()))}>{t("resident.voice.ring.decline")}</Button>
                        <Button size="sm" variant="civic" icon={<Phone className="h-4 w-4" aria-hidden />} onClick={() => void v.answer(ring.id)}>{t("resident.voice.ring.answer")}</Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="mb-4 w-36"><Waveform state="idle" size="sm" className="justify-start" /></div>
                <h2 className="max-w-xl font-display text-[26px] leading-tight text-ink sm:text-[34px]">{t("resident.voice.start.title")}</h2>
                <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-2">{t("resident.voice.start.body")}</p>

                <div className="mt-6">
                  <p className="mb-2 text-[13px] font-medium text-ink-2">{t("resident.voice.start.language")}</p>
                  <LanguagePicker name={t("resident.voice.start.language")} value={callLang} onChange={setCallLang} />
                </div>

                <div className="mt-5 text-sm text-ink-2">
                  {caseItems.length > 1 ? (
                    <label className="block max-w-sm">
                      <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{t("resident.voice.start.whichCase")}</span>
                      <select value={selectedRef ?? ""} onChange={(e) => setChosenCase(e.target.value)}
                        className="h-11 w-full cursor-pointer rounded-xl border border-line-2 bg-surface px-3 text-[15px] text-ink outline-none focus:border-ink/50 focus:ring-2 focus:ring-ink/10">
                        {caseItems.map((c) => <option key={c.reference} value={c.reference}>{t("resident.voice.start.caseOption", { ref: c.reference, child: c.child_name ?? "" })}</option>)}
                      </select>
                    </label>
                  ) : caseItems.length === 1 ? (
                    <p>{t("resident.voice.start.aboutCase", { ref: caseItems[0].reference })}</p>
                  ) : (
                    <p>{t("resident.voice.start.noCase")}</p>
                  )}
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-4">
                  <Button variant="civic" size="lg" icon={<Phone className="h-5 w-5" aria-hidden />} onClick={() => void v.start({ caseReference: selectedRef, language: callLang })}>
                    {t("resident.voice.start.cta", { language: LANGUAGES.find((l) => l.code === callLang)?.native ?? callLang })}
                  </Button>
                </div>
                <p className="mt-4 flex max-w-xl items-start gap-2 text-[13px] leading-relaxed text-muted">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-civic" aria-hidden />
                  {t("resident.voice.start.disclosure")}
                </p>
              </motion.div>
            ) : (
              <motion.div key="call" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {/* top bar: state, time, language, provider */}
                <div className="flex flex-wrap items-center gap-2 border-b border-line bg-stage-2/70 px-4 py-3 sm:px-6">
                  <span role="status" aria-live="polite" className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink">
                    <span className={cn("h-2 w-2 rounded-full", STATE_DOT[v.state])} aria-hidden />
                    {muted && phase === "live" ? t("resident.voice.state.muted") : t(`resident.voice.state.${v.state}`)}
                  </span>
                  <span className="num text-sm text-ink-2" aria-label={t("resident.voice.elapsed", { time: duration(elapsed) })}>{duration(elapsed)}</span>
                  <button type="button" onClick={() => setLangOpen(true)} disabled={!v.active}
                    className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border border-line-2 bg-surface px-2.5 py-1 text-xs text-ink-2 hover:bg-paper-2 disabled:cursor-default disabled:opacity-60"
                    aria-label={t("resident.voice.language.current", { language: language?.native ?? "" })}>
                    <Languages className="h-3.5 w-3.5" aria-hidden />
                    <span lang={language?.code}>{language?.native}</span>
                  </button>
                  <span className="ms-auto"><ProviderBadge provider={provider} /></span>
                </div>

                <div className="grid-lines flex flex-col gap-3 px-4 pb-4 pt-5 sm:flex-row sm:items-center sm:gap-6 sm:px-6">
                  <div className="min-w-0 sm:w-56 sm:shrink-0" aria-live="polite">
                    <p className="font-display text-2xl text-ink">
                      {phase === "ended" ? (transferred ? t("resident.voice.state.transferred") : t("resident.voice.state.ended"))
                        : muted ? t("resident.voice.state.muted") : t(`resident.voice.state.${v.state}`)}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {phase === "ended" ? t("resident.voice.hint.ended")
                        : muted ? t("resident.voice.hint.muted")
                        : elevenLive ? t("resident.voice.hint.elevenlabs")
                        : t(`resident.voice.hint.${v.state}`)}
                    </p>
                  </div>
                  <Waveform state={v.state} muted={muted && phase === "live"} className="min-w-0 flex-1 overflow-hidden" />
                </div>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-line bg-surface/70 px-4 py-3.5 sm:grid-cols-5 sm:px-6">
                  <Fact label={t("resident.voice.fact.case")}>{caseRef ?? t("resident.voice.fact.noCase")}</Fact>
                  <Fact label={t("resident.voice.fact.step")}>
                    {view?.current_node ? t("resident.voice.fact.stepValue", { step: t(`node.${view.current_node.key}`), state: t(`state.${view.current_node.state}`) }) : t("resident.voice.fact.noStep")}
                  </Fact>
                  <Fact label={t("resident.voice.fact.agent")}>
                    {subAgent ? t("resident.voice.fact.agentValue", {
                      agent: tx(t, `resident.voice.subAgent.${subAgent}`, subAgent),
                      stage: stage ? tx(t, `resident.voice.stage.${stage}`, stage) : t("resident.voice.stage.none"),
                    }) : "-"}
                  </Fact>
                  <Fact label={t("resident.voice.fact.verified")}>
                    <span className={cn("inline-flex items-start gap-1", v.call?.verified ? "text-civic" : "text-amber")}>
                      {v.call?.verified ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> : <Fingerprint className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />}
                      {v.call?.verified
                        ? (v.call.verification_method ? tx(t, `resident.voice.verify.${v.call.verification_method}`, v.call.verification_method) : t("resident.voice.fact.verifiedYes"))
                        : t("resident.voice.fact.verifiedNo")}
                    </span>
                  </Fact>
                  <Fact label={t("resident.voice.fact.consent")}>{consentText}</Fact>
                </dl>

                <Transcript lines={v.lines} thinking={v.state === "thinking"} />

                {v.last && v.last.tool_calls.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-4 py-2.5 sm:px-6">
                    <span className="me-1 text-[11px] text-muted">{t("resident.voice.tools")}</span>
                    {v.last.tool_calls.map((c, i) => (
                      <span key={`${c.name}-${i}`} title={c.error ?? undefined}
                        className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[11px]", c.ok ? "border-civic/30 bg-civic-soft text-civic" : "border-rose/40 bg-rose-soft text-rose")}>
                        {c.name}
                        {c.ok ? <Check className="h-3 w-3" aria-label={t("resident.voice.toolOk")} /> : <X className="h-3 w-3" aria-label={t("resident.voice.toolFailed")} />}
                      </span>
                    ))}
                  </div>
                )}

                {phase === "live" && (
                  <div className="space-y-4 border-t border-line bg-stage-2/50 px-4 py-4 sm:px-6">
                    <QuickReplies stage={stage} disabled={!canTalk} onSend={(text) => void v.send(text)} onStop={() => setStopOpen(true)} />

                    <form onSubmit={submit} className="flex items-center gap-2">
                      {!elevenLive && (
                        <button type="button" onClick={v.listen} disabled={!canTalk || !srSupported} aria-pressed={v.listening}
                          aria-label={v.listening ? t("resident.voice.mic.listening") : t("resident.voice.mic.tap")}
                          title={srSupported ? undefined : t("resident.voice.mic.unsupported")}
                          className={cn("relative grid h-12 w-12 shrink-0 cursor-pointer place-items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                            v.listening ? "bg-azure text-on-accent" : "bg-ink text-paper hover:bg-ink-2")}>
                          {v.listening && !reduce && <span className="absolute inset-0 animate-ping rounded-full bg-azure/40" aria-hidden />}
                          <Mic className="relative h-5 w-5" aria-hidden />
                        </button>
                      )}
                      <label className="sr-only" htmlFor="voice-text">{t("resident.voice.input.label")}</label>
                      <input id="voice-text" value={draft} onChange={(e) => setDraft(e.target.value)} disabled={!canTalk} autoComplete="off"
                        placeholder={muted ? t("resident.voice.hint.muted") : t("resident.voice.input.placeholder")}
                        className="h-12 min-w-0 flex-1 rounded-full border border-line-2 bg-surface px-4 text-[15px] text-ink outline-none placeholder:text-faint focus:border-ink/50 focus:ring-2 focus:ring-ink/10 disabled:opacity-50" />
                      <button type="submit" disabled={!canTalk || !draft.trim()} aria-label={t("resident.voice.input.send")}
                        className="grid h-12 w-12 shrink-0 cursor-pointer place-items-center rounded-full bg-civic text-on-accent transition-[background-color,transform] hover:bg-civic/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40">
                        <SendHorizontal className="h-5 w-5 rtl-flip" aria-hidden />
                      </button>
                    </form>
                    {!elevenLive && !srSupported && <p className="text-xs text-muted">{t("resident.voice.mic.unsupported")}</p>}

                    <div className={cn("grid gap-1 pt-1", showUaePass ? "grid-cols-3 sm:grid-cols-6" : "grid-cols-3 sm:grid-cols-5")}>
                      <Ctl icon={muted ? MicOff : Mic} label={muted ? t("resident.voice.ctl.unmute") : t("resident.voice.ctl.mute")} pressed={muted}
                        onClick={() => safe(v.setMuted(!muted))} disabled={!v.active} />
                      <Ctl icon={Languages} label={t("resident.voice.ctl.language")} onClick={() => setLangOpen(true)} disabled={!v.active || busy} />
                      <Ctl icon={Headset} label={t("resident.voice.ctl.human")} onClick={() => void act("human")} disabled={!v.active || busy} />
                      {showUaePass && <Ctl icon={Fingerprint} label={t("resident.voice.ctl.uaePass")} tone="accent" onClick={() => void act("uaePass")} disabled={busy} />}
                      <Ctl icon={PhoneOff} label={t("resident.voice.ctl.stop")} onClick={() => setStopOpen(true)} disabled={!v.active || busy} />
                      <Ctl icon={X} label={t("resident.voice.ctl.end")} tone="danger" onClick={() => void v.end()} disabled={v.state === "connecting" && !v.call} />
                    </div>
                    {showUaePass && <p className="text-xs text-muted">{t("resident.voice.uaePassHint")}</p>}
                  </div>
                )}

                {phase === "ended" && (
                  <motion.div initial={{ opacity: 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} className="border-t border-line bg-stage-2/50 px-4 py-5 sm:px-6">
                    <h2 className="font-display text-2xl text-ink">{transferred ? t("resident.voice.summary.transferred") : t("resident.voice.summary.title")}</h2>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                      <Fact label={t("resident.voice.summary.length")}>{duration(elapsed)}</Fact>
                      <Fact label={t("resident.voice.summary.language")}>{language?.native ?? "-"}</Fact>
                      <Fact label={t("resident.voice.fact.verified")}>{v.call?.verified ? t("resident.voice.fact.verifiedYes") : t("resident.voice.fact.verifiedNo")}</Fact>
                      <Fact label={t("resident.voice.summary.turns")}>{String(v.lines.length)}</Fact>
                    </dl>
                    {(finalCall.data?.outcome || finalCall.data?.summary) && (
                      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-2">{finalCall.data?.summary ?? finalCall.data?.outcome}</p>
                    )}
                    {transferred && <p className="mt-2 max-w-2xl text-sm text-muted">{t("resident.voice.summary.transferredHint")}</p>}
                    <div className="mt-5 flex flex-wrap gap-2">
                      {caseRef && <LinkButton to={`/app/cases/${caseRef}`} variant="primary">{t("resident.voice.summary.openCase", { ref: caseRef })}</LinkButton>}
                      <Button variant="secondary" onClick={v.reset}>{t("resident.voice.summary.again")}</Button>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>

        <motion.aside className="space-y-4" aria-label={t("resident.voice.aside")} initial={reduce ? false : "hidden"} animate="shown" variants={side}>
          <motion.div variants={rise}>
            <VoiceCaseBones loading={caseLoading}>
              {!caseLoading && <VoiceCaseCard view={view} />}
            </VoiceCaseBones>
          </motion.div>

          <motion.div variants={rise}>
            <Panel id="voice-service" title={t("resident.voice.service.title")}>
              <div className="space-y-3 text-sm">
                <p className="flex items-start gap-2 font-medium">
                  {simulated ? <Bot className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden /> : <AudioLines className="mt-0.5 h-4 w-4 shrink-0 text-civic" aria-hidden />}
                  {simulated ? t("resident.voice.provider.simulated") : t("resident.voice.provider.elevenlabs")}
                </p>
                {simulated && <p className="leading-relaxed text-muted">{config.data?.voice.note ?? t("resident.voice.service.simulatedHint")}</p>}
                {!simulated && config.data && (
                  <p className="text-muted">{t("resident.voice.service.models", { tts: config.data.voice.tts_model, stt: config.data.voice.stt_model })}</p>
                )}
                <div className="flex items-start gap-2 text-xs text-muted"><MockBadge compact /><span>{t("resident.voice.service.mock")}</span></div>
              </div>
              <div className="mt-4 border-t border-line pt-4">
                <Toggle checked={speak} onChange={setSpeak}
                  label={<span className="inline-flex items-center gap-2">{speak ? <Volume2 className="h-4 w-4" aria-hidden /> : <VolumeX className="h-4 w-4" aria-hidden />}{t("resident.settings.speak")}</span>}
                  description={t("resident.settings.speakHint")} />
              </div>
            </Panel>
          </motion.div>
        </motion.aside>
      </div>

      <LanguageDialog open={langOpen} onClose={() => setLangOpen(false)} value={v.call?.language ?? callLang} onChoose={(l) => void v.changeLanguage(l)} />
      <StopCallingDialog open={stopOpen} onClose={() => setStopOpen(false)} onConfirm={() => void confirmStop()} loading={stopping} />
    </div>
  );
}
