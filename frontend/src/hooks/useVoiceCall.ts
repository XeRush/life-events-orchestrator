import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceState } from "../components/voice/Waveform";
import { voiceApi } from "../services/voice";
import { useUI } from "../stores/ui";
import type { TurnResult, VoiceSession } from "../types";

export interface Msg { role: "agent" | "user"; text: string }
type ToolCall = TurnResult["tool_calls"][number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpeechRecognition = any;

const estimateSpeech = (text: string) => Math.min(9000, 700 + text.split(/\s+/).length * 330);

/**
 * One hook, two transports behind the same UI:
 *  - "elevenlabs": the browser connects straight to ElevenLabs with a server-issued signed URL (no API key in the browser).
 *  - "simulated":  the backend dialog engine answers each utterance using the same tools as the ElevenLabs agent.
 */
export function useVoiceCall() {
  const qc = useQueryClient();
  const speak = useUI((s) => s.speakReplies);
  const toast = useUI((s) => s.toast);
  const [state, setState] = useState<VoiceState>("idle");
  const [session, setSession] = useState<VoiceSession | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [lastActions, setLastActions] = useState<ToolCall[]>([]);
  const [caseRef, setCaseRef] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const live = useRef<{ endSession: () => Promise<void>; sendUserMessage?: (t: string) => void } | null>(null);
  const recognizer = useRef<AnySpeechRecognition>(null);
  const timer = useRef<number | undefined>(undefined);
  const sessionRef = useRef<VoiceSession | null>(null);
  const messagesRef = useRef<Msg[]>([]);
  messagesRef.current = messages;

  const push = useCallback((m: Msg) => setMessages((prev) => [...prev, m]), []);

  const say = useCallback((text: string) => {
    window.clearTimeout(timer.current);
    setState("speaking");
    const done = () => setState((s) => (s === "speaking" ? "listening" : s));
    if (speak && "speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = useUI.getState().lang === "ar" ? "ar-SA" : "en-GB";
      u.onend = done;
      u.onerror = done;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } else {
      timer.current = window.setTimeout(done, estimateSpeech(text));
    }
  }, [speak]);

  const start = useCallback(async (opts: { mode?: "inbound" | "callback"; case_id?: string; callback_id?: string } = {}) => {
    setMessages([]); setLastActions([]);
    try {
      const s = await voiceApi.start({ ...opts, language: useUI.getState().lang });
      setSession(s); sessionRef.current = s; setCaseRef(s.case_reference);
      if (s.fallback_reason) toast("info", s.fallback_reason);
      if (s.provider === "elevenlabs" && s.signed_url) {
        setState("thinking");
        const { Conversation } = await import("@elevenlabs/client");
        // Options are passed as-is; the SDK validates them. Keys stay on the server.
        const conv = await (Conversation as unknown as { startSession: (o: Record<string, unknown>) => Promise<typeof live.current> }).startSession({
          signedUrl: s.signed_url,
          connectionType: "websocket",
          dynamicVariables: s.dynamic_variables,
          ...(s.first_message_override ? { overrides: { agent: { firstMessage: s.first_message_override } } } : {}),
          onConnect: () => setState("listening"),
          onDisconnect: () => setState("idle"),
          onMessage: (m: { message: string; role?: string; source?: string }) =>
            push({ role: (m.role ?? m.source) === "user" ? "user" : "agent", text: m.message }),
          onModeChange: (m: { mode: string }) => setState(m.mode === "speaking" ? "speaking" : "listening"),
          onError: (e: unknown) => toast("error", `Voice error: ${String((e as Error)?.message ?? e)}`),
        });
        live.current = conv;
      } else if (s.opening_message) {
        push({ role: "agent", text: s.opening_message });
        say(s.opening_message);
      }
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (e) {
      setState("idle");
      setSession(null);
      toast("error", (e as Error).message);
    }
  }, [push, say, qc, toast]);

  const send = useCallback(async (text: string) => {
    const s = sessionRef.current;
    if (!s || !text.trim()) return;
    push({ role: "user", text });
    if (s.provider === "elevenlabs") {
      live.current?.sendUserMessage?.(text);
      return;
    }
    setState("thinking");
    try {
      const r = await voiceApi.turn(s.conversation_id, text);
      push({ role: "agent", text: r.reply });
      if (r.tool_calls.length) setLastActions(r.tool_calls);
      if (r.case_reference) setCaseRef(r.case_reference);
      say(r.reply);
      qc.invalidateQueries();
    } catch (e) {
      setState("listening");
      toast("error", (e as Error).message);
    }
  }, [push, say, qc, toast]);

  const end = useCallback(async () => {
    const s = sessionRef.current;
    window.speechSynthesis?.cancel();
    window.clearTimeout(timer.current);
    recognizer.current?.stop?.();
    try {
      if (live.current) {
        await live.current.endSession();
        live.current = null;
        if (s) await voiceApi.pushTranscript(s.conversation_id, messagesRef.current);
      }
      if (s) await voiceApi.end(s.conversation_id);
    } catch (e) {
      toast("error", (e as Error).message);
    }
    setState("idle"); setSession(null); sessionRef.current = null;
    qc.invalidateQueries();
  }, [qc, toast]);

  const listen = useCallback(() => {
    const Ctor = (window as unknown as { SpeechRecognition?: AnySpeechRecognition; webkitSpeechRecognition?: AnySpeechRecognition });
    const SR = Ctor.SpeechRecognition ?? Ctor.webkitSpeechRecognition;
    if (!SR) { toast("info", "Speech recognition is not available in this browser - type instead."); return; }
    const rec = new SR();
    rec.lang = useUI.getState().lang === "ar" ? "ar-SA" : "en-GB";
    rec.interimResults = false;
    rec.onstart = () => { setListening(true); setState("listening"); };
    rec.onend = () => setListening(false);
    rec.onresult = (e: { results: { 0: { 0: { transcript: string } } } }) => send(e.results[0][0].transcript);
    recognizer.current = rec;
    rec.start();
  }, [send, toast]);

  useEffect(() => () => {
    window.speechSynthesis?.cancel();
    window.clearTimeout(timer.current);
    live.current?.endSession().catch(() => undefined);
  }, []);

  return { state, session, messages, lastActions, caseRef, listening, active: !!session, start, send, end, listen };
}
