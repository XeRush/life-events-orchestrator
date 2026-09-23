import type { Conversation, TurnResult, VoiceConfig, VoiceSession } from "../types";
import { get, post } from "./api";

export const voiceApi = {
  config: () => get<VoiceConfig>("/voice/config"),
  start: (body: { mode?: "inbound" | "callback"; case_id?: string; callback_id?: string; language?: string }) =>
    post<VoiceSession>("/voice/sessions", body),
  turn: (id: string, utterance: string) => post<TurnResult>(`/voice/sessions/${id}/turn`, { utterance }),
  pushTranscript: (id: string, messages: { role: string; text: string }[], providerConversationId?: string) =>
    post<Conversation>(`/voice/sessions/${id}/transcript`, { messages, provider_conversation_id: providerConversationId }),
  end: (id: string) => post<Conversation>(`/voice/sessions/${id}/end`),
  conversations: () => get<Conversation[]>("/voice/conversations?limit=30"),
};
