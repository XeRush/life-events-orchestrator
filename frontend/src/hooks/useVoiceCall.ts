import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { agentApi } from "../api";
import { useAgentConfig } from "./queries";
import { useUI } from "../stores/ui";
import type { CallView, Lang, TranscriptLine, Transport, TurnResult } from "../types/api";

export type AgentState = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "ended";

const SPEECH_LANG: Record<Lang, string> = { en: "en-GB", ar: "ar-AE", hi: "hi-IN", ur: "ur-PK", ml: "ml-IN", tl: "fil-PH" };
const estimate = (text: string) => Math.min(9000, 700 + text.split(/\s+/).length * 320);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecognition = any;
interface LiveConversation { endSession: () => Promise<void>; sendUserMessage?: (t: string) => void; setMicMuted?: (m: boolean) => void }

/**
 * One hook, two transports behind the same UI:
 *  - "elevenlabs": the browser talks to the ElevenLabs agent with a server-issued signed URL (no API key in the browser);
 *    the agent calls LifeLoop's scoped tools; the post-call webhook writes the outcome back into the case.
 *  - "simulated": every utterance goes to the backend dialog graph, which uses the same tools and guardrails.
 * Speech in the simulated console: with ElevenLabs configured on the server, the mic records and Scribe v2 transcribes
 * (/agent/stt) and replies are spoken by Eleven v3 (/agent/tts); otherwise the browser's own recognition and voice are
 * used. A server voice that fails once is not retried for the rest of the page session.
 */
const MAX_RECORDING_MS = 15000;
const hasRecorder = () => typeof window !== "undefined" && "MediaRecorder" in window && !!navigator.mediaDevices?.getUserMedia;
const hasBrowserRecognition = () => typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
export function useVoiceCall() {
  const qc = useQueryClient();
  const toast = useUI((s) => s.toast);
  const speakReplies = useUI((s) => s.speakReplies);
  const [state, setState] = useState<AgentState>("idle");
  const [call, setCall] = useState<CallView | null>(null);
  const [transport, setTransport] = useState<Transport | null>(null);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [last, setLast] = useState<TurnResult | null>(null);
  const [listening, setListening] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const live = useRef<LiveConversation | null>(null);
  const recognizer = useRef<AnyRecognition>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const callRef = useRef<CallView | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const recorder = useRef<MediaRecorder | null>(null);
  const serverDown = useRef({ tts: false, stt: false });
  callRef.current = call;
  const voice = useAgentConfig().data?.voice;
  const serverVoice = !!voice?.configured && !voice.simulated_failure;
  const serverVoiceRef = useRef(serverVoice);
  serverVoiceRef.current = serverVoice;
  const useServerStt = serverVoice && !serverDown.current.stt && hasRecorder();
  const canListen = useServerStt || hasBrowserRecognition();

  useEffect(() => {
    if (!call || call.state !== "ACTIVE") return;
    const started = new Date(call.started_at).getTime();
    const id = window.setInterval(() => setElapsed(Math.max(0, Math.round((Date.now() - started) / 1000))), 1000);
    return () => window.clearInterval(id);
  }, [call]);

  const push = useCallback((role: TranscriptLine["role"], text: string, extra: Partial<TranscriptLine> = {}) => {
    setLines((prev) => [...prev, { seq: prev.length + 1, role, text, sub_agent: null, tool: null, is_disclosure: false, at: new Date().toISOString(), ...extra }]);
  }, []);

  const say = useCallback(async (text: string, lang: Lang) => {
    window.clearTimeout(timer.current);
    setState("speaking");
    const done = () => setState((s) => (s === "speaking" ? "listening" : s));
    if (!speakReplies) {
      timer.current = window.setTimeout(done, estimate(text) / 3);
      return;
    }
    // Eleven v3 on the server when ElevenLabs is configured; otherwise straight to the browser's voice.
    const blob = serverVoiceRef.current && !serverDown.current.tts ? await agentApi.tts(text, lang) : null;
    if (serverVoiceRef.current && !blob) serverDown.current.tts = true;
    if (blob) {
      audio.current?.pause();
      const el = new Audio(URL.createObjectURL(blob));
      audio.current = el;
      el.onended = done;
      el.onerror = done;
      el.play().catch(done);
      return;
    }
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = SPEECH_LANG[lang];
      u.onend = done;
      u.onerror = done;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } else {
      timer.current = globalThis.setTimeout(done, estimate(text)) as unknown as number;
    }
  }, [speakReplies]);

  const connect = useCallback(async (view: CallView, t: Transport) => {
    setCall(view);
    setTransport(t);
    setLines(view.transcript);
    if (t.fallback_reason) toast("info", t.fallback_reason);
    if (t.provider === "elevenlabs" && t.signed_url) {
      setState("connecting");
      try {
        const { Conversation } = await import("@elevenlabs/client");
        const conv = await (Conversation as unknown as { startSession: (o: Record<string, unknown>) => Promise<LiveConversation> }).startSession({
          signedUrl: t.signed_url,
          connectionType: "websocket",
          dynamicVariables: t.dynamic_variables,
          overrides: { agent: { language: t.language, firstMessage: t.first_message } },
          onConnect: () => setState("listening"),
          onDisconnect: () => setState("ended"),
          onMessage: (m: { message: string; source?: string; role?: string }) => {
            const role = (m.role ?? m.source) === "user" ? "RESIDENT" : "AGENT";
            push(role, m.message);
            agentApi.pushTranscript(view.id, [{ role: role === "RESIDENT" ? "user" : "agent", text: m.message }]).catch(() => undefined);
          },
          onModeChange: (m: { mode: string }) => setState(m.mode === "speaking" ? "speaking" : "listening"),
          onError: (e: unknown) => toast("error", `Voice: ${String((e as Error)?.message ?? e)}`),
        });
        live.current = conv;
      } catch (e) {
        toast("error", `ElevenLabs session failed - ${(e as Error).message}`);
        setState("ended");
      }
      return;
    }
    const opening = view.transcript.filter((l) => l.role === "AGENT").map((l) => l.text).join(" ");
    if (opening) await say(opening, view.language);
    else setState("listening");
  }, [push, say, toast]);

  const start = useCallback(async (opts: { caseReference?: string | null; language: Lang }) => {
    setLines([]); setLast(null); setElapsed(0); setState("connecting");
    try {
      const r = await agentApi.start({ case_reference: opts.caseReference ?? null, language: opts.language });
      await connect(r.call, r.transport);
      qc.invalidateQueries({ queryKey: ["my-calls"] });
    } catch (e) {
      setState("idle");
      toast("error", (e as Error).message);
    }
  }, [connect, qc, toast]);

  const answer = useCallback(async (callId: string) => {
    setLines([]); setLast(null); setElapsed(0); setState("connecting");
    try {
      const r = await agentApi.answer(callId);
      await connect(r.call, r.transport);
      qc.invalidateQueries({ queryKey: ["ringing"] });
    } catch (e) {
      setState("idle");
      toast("error", (e as Error).message);
    }
  }, [connect, qc, toast]);

  const apply = useCallback(async (r: TurnResult) => {
    setLast(r);
    push("AGENT", r.reply, { sub_agent: r.sub_agent, tool: r.tool_calls.map((x) => x.name).join(", ") || null });
    setCall((c) => (c ? { ...c, language: r.language, verified: r.verified, case_reference: r.case_reference ?? c.case_reference, state: r.ended ? (r.transferred ? "TRANSFERRED" : "ENDED") : c.state } : c));
    await say(r.reply, r.language);
    if (r.ended) setState("ended");
    qc.invalidateQueries();
  }, [push, say, qc]);

  const send = useCallback(async (text: string) => {
    const c = callRef.current;
    if (!c || !text.trim()) return;
    if (live.current) {
      live.current.sendUserMessage?.(text);
      push("RESIDENT", text);
      return;
    }
    push("RESIDENT", text);
    setState("thinking");
    try {
      await apply(await agentApi.turn(c.id, text));
    } catch (e) {
      setState("listening");
      toast("error", (e as Error).message);
    }
  }, [apply, push, toast]);

  const action = useCallback(async (kind: "human" | "stop" | "uaePass") => {
    const c = callRef.current;
    if (!c) return;
    setState("thinking");
    try {
      const fn = { human: agentApi.human, stop: agentApi.stopCalling, uaePass: agentApi.uaePass }[kind];
      push("RESIDENT", { human: "I'd like to speak to a person.", stop: "Stop calling.", uaePass: "UAE Pass" }[kind]);
      await apply(await fn(c.id));
    } catch (e) {
      setState("listening");
      toast("error", (e as Error).message);
    }
  }, [apply, push, toast]);

  const setMuted = useCallback(async (muted: boolean) => {
    const c = callRef.current;
    if (!c) return;
    live.current?.setMicMuted?.(muted);
    if (muted) {
      recognizer.current?.stop?.();
      if (recorder.current?.state === "recording") recorder.current.stop();
    }
    const view = await agentApi.mute(c.id, muted);
    setCall((prev) => (prev ? { ...prev, muted: view.muted } : prev));
  }, []);

  const changeLanguage = useCallback(async (lang: Lang) => {
    const c = callRef.current;
    if (!c) return;
    try {
      const r = await agentApi.language(c.id, lang);
      setCall((prev) => (prev ? { ...prev, language: lang } : prev));
      push("AGENT", r.reply);
      await say(r.reply, lang);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }, [push, say, toast]);

  const end = useCallback(async () => {
    const c = callRef.current;
    window.speechSynthesis?.cancel();
    audio.current?.pause();
    recognizer.current?.stop?.();
    if (recorder.current?.state === "recording") recorder.current.stop();
    window.clearTimeout(timer.current);
    try {
      if (live.current) {
        await live.current.endSession();
        live.current = null;
      }
      if (c && (c.state === "ACTIVE" || c.state === "RINGING")) await agentApi.end(c.id);
    } catch (e) {
      toast("error", (e as Error).message);
    }
    setState("ended");
    setCall((prev) => (prev ? { ...prev, state: prev.state === "TRANSFERRED" ? "TRANSFERRED" : "ENDED" } : prev));
    qc.invalidateQueries();
  }, [qc, toast]);

  const reset = useCallback(() => {
    setCall(null); setTransport(null); setLines([]); setLast(null); setState("idle"); setElapsed(0);
  }, []);

  /** Scribe v2 path: tap to start recording, tap again (or wait 15 s) to stop; the audio is transcribed on the server. */
  const recordForServer = useCallback(async () => {
    if (recorder.current?.state === "recording") {
      recorder.current.stop();
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast("error", "Microphone access was blocked - allow it in the browser, or type instead.");
      return;
    }
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    let cap: number | undefined;
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstart = () => { setListening(true); setState("listening"); };
    rec.onstop = async () => {
      window.clearTimeout(cap);
      stream.getTracks().forEach((track) => track.stop());
      setListening(false);
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      if (blob.size < 1500) return; // a tap with no speech
      setState("thinking");
      try {
        const r = await agentApi.stt(blob, callRef.current?.language ?? "en");
        if (r.text.trim()) await send(r.text);
        else { setState("listening"); toast("info", "I didn't catch that - try again, or type."); }
      } catch (e) {
        serverDown.current.stt = true;
        setState("listening");
        toast("error", `${(e as Error).message} Using the browser's speech recognition instead.`);
      }
    };
    recorder.current = rec;
    rec.start();
    cap = window.setTimeout(() => { if (rec.state === "recording") rec.stop(); }, MAX_RECORDING_MS);
  }, [send, toast]);

  const listen = useCallback(() => {
    if (useServerStt) {
      void recordForServer();
      return;
    }
    const c = callRef.current;
    const w = window as unknown as { SpeechRecognition?: AnyRecognition; webkitSpeechRecognition?: AnyRecognition };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) {
      toast("info", "Speech recognition is not available in this browser - type instead.");
      return;
    }
    const rec = new SR();
    rec.lang = SPEECH_LANG[c?.language ?? "en"];
    rec.interimResults = false;
    rec.onstart = () => { setListening(true); setState("listening"); };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.onresult = (e: { results: { 0: { 0: { transcript: string } } } }) => send(e.results[0][0].transcript);
    recognizer.current = rec;
    rec.start();
  }, [send, toast, useServerStt, recordForServer]);

  useEffect(() => () => {
    window.speechSynthesis?.cancel();
    audio.current?.pause();
    window.clearTimeout(timer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
    live.current?.endSession().catch(() => undefined);
  }, []);

  return {
    state, call, transport, lines, last, listening, elapsed, active: !!call && (call.state === "ACTIVE"), canListen,
    stt: useServerStt ? "scribe" as const : "browser" as const,
    start, answer, send, end, reset, listen, setMuted, changeLanguage,
    requestHuman: () => action("human"), stopCalling: () => action("stop"), uaePass: () => action("uaePass"),
  };
}
