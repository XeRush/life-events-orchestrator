import type {
  Analytics, ApprovalItem, AuditItem, AuthConfig, CallbackItem, CallView, CaseGraph, CaseListItem, CaseView, Consent, DemoStatus,
  DocumentCenter, EntityCatalogue, EntityRequestItem, EscalationItem, Impact, IntakeInput, KnowledgeDoc, Lang, NodeKey, NotificationItem,
  OfficerCaseDetail, OfficerStats, Organization, OutboxItem, Page, Readiness, ScenarioResult, Session, StartCallResult, TimelineEvent,
  TurnResult, User, Verification, VoiceConfig,
} from "../types/api";
import { get, patch, post, qs, request, upload } from "./client";

export const authApi = {
  config: () => get<AuthConfig>("/auth/config"),
  login: (email: string, password: string) => post<Session>("/auth/login", { email, password }),
  register: (body: { email: string; password: string; full_name: string; phone?: string; preferred_language: Lang }) =>
    post<Session & { verification_email_sent: boolean }>("/auth/register", body),
  logout: (refresh_token?: string) => post<null>("/auth/logout", { refresh_token }),
  me: () => get<User>("/auth/me"),
  updateMe: (body: { full_name?: string; phone?: string; preferred_language?: Lang }) => patch<User>("/auth/me", body),
  verifyEmail: (token: string) => post<{ verified: boolean; email: string }>("/auth/verify-email", { token }),
  resendVerification: () => post<{ sent: boolean }>("/auth/resend-verification"),
  forgot: (email: string) => post<{ accepted: boolean }>("/auth/forgot-password", { email }),
  reset: (token: string, password: string) => post<{ reset: boolean; email: string }>("/auth/reset-password", { token, password }),
  acceptInvite: (token: string, password: string, full_name?: string) => post<Session>("/auth/accept-invite", { token, password, full_name }),
  changePassword: (current_password: string, new_password: string) => post<{ changed: boolean; tokens: Session["tokens"] }>("/auth/change-password", { current_password, new_password }),
  devMailbox: (email: string) => get<{ to: string; subject: string; text: string; sent_at: string }[]>(`/dev/mailbox${qs({ email })}`),
};

export const casesApi = {
  list: (params: { status?: string; q?: string; limit?: number } = {}) => get<Page<CaseListItem>>(`/cases${qs(params)}`),
  create: (body: IntakeInput) => post<{ created: boolean; case: CaseView }>("/cases", body),
  get: (ref: string, lang?: Lang) => get<CaseView>(`/cases/${ref}${qs({ lang })}`),
  graph: (ref: string, lang?: Lang) => get<CaseGraph>(`/cases/${ref}/graph${qs({ lang })}`),
  impact: (ref: string, key: NodeKey) => get<Impact>(`/cases/${ref}/graph/impact/${key}`),
  timeline: (ref: string, limit = 200) => get<Page<TimelineEvent>>(`/cases/${ref}/timeline${qs({ limit })}`),
  documents: (ref: string, lang?: Lang) => get<DocumentCenter>(`/cases/${ref}/documents${qs({ lang })}`),
  uploadDocument: (ref: string, docType: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return upload<DocumentCenter>(`/cases/${ref}/documents/${docType}`, form);
  },
  verifyDocument: (ref: string, docType: string) => post<DocumentCenter>(`/cases/${ref}/documents/${docType}/verify`),
  setDocumentStatus: (ref: string, docType: string, status: string, note?: string) => patch<DocumentCenter>(`/cases/${ref}/documents/${docType}`, { status, note }),
  consents: (ref: string) => get<Consent[]>(`/cases/${ref}/consent`),
  setConsent: (ref: string, consent_type: Consent["consent_type"], granted: boolean) => post<Consent[]>(`/cases/${ref}/consent`, { consent_type, granted }),
  optOut: (ref: string) => post<CaseView>(`/cases/${ref}/opt-out`),
  optIn: (ref: string) => post<CaseView>(`/cases/${ref}/opt-in`),
  verification: (ref: string) => get<Verification[]>(`/cases/${ref}/verification`),
  callbacks: (ref: string) => get<CallbackItem[]>(`/cases/${ref}/callbacks`),
  requestCallback: (ref: string) => post<CallbackItem>(`/cases/${ref}/callbacks`),
  reportConsulate: (ref: string, body: { milestone: string; passport_number_present?: boolean; appointment_date?: string | null; notes?: string | null }) =>
    post<Record<string, unknown>>(`/cases/${ref}/consulate`, body),
  requests: (ref: string) => get<EntityRequestItem[]>(`/cases/${ref}/requests`),
  calls: (ref: string) => get<CallView[]>(`/cases/${ref}/calls`),
  events: (ref: string, limit = 50) => get<OutboxItem[]>(`/cases/${ref}/events${qs({ limit })}`),
};

export const agentApi = {
  config: () => get<VoiceConfig>("/agent/config"),
  start: (body: { case_reference?: string | null; language?: Lang }) => post<StartCallResult>("/agent/calls", body),
  calls: () => get<CallView[]>("/agent/calls"),
  ringing: () => get<CallView[]>("/agent/calls/ringing"),
  call: (id: string) => get<CallView>(`/agent/calls/${id}`),
  answer: (id: string) => post<StartCallResult>(`/agent/calls/${id}/answer`),
  turn: (id: string, utterance: string) => post<TurnResult>(`/agent/calls/${id}/turn`, { utterance }),
  end: (id: string) => post<CallView>(`/agent/calls/${id}/end`),
  mute: (id: string, muted: boolean) => post<CallView>(`/agent/calls/${id}/mute`, { muted }),
  language: (id: string, language: Lang) => post<{ reply: string; call: CallView }>(`/agent/calls/${id}/language`, { language }),
  human: (id: string) => post<TurnResult>(`/agent/calls/${id}/human`),
  stopCalling: (id: string) => post<TurnResult>(`/agent/calls/${id}/stop-calling`),
  uaePass: (id: string) => post<TurnResult>(`/agent/calls/${id}/uae-pass`),
  pushTranscript: (id: string, messages: { role: "agent" | "user"; text: string }[], provider_conversation_id?: string) =>
    post<{ ok: boolean }>(`/agent/calls/${id}/transcript`, { messages, provider_conversation_id }),
  tts: async (text: string, language: Lang): Promise<Blob | null> => {
    try {
      const res = await request<Response>("/agent/tts", { method: "POST", json: { text, language } });
      return res instanceof Response ? await res.blob() : null;
    } catch {
      return null;
    }
  },
  /** Scribe v2 speech-to-text on the server (503 "stt_unavailable" when ElevenLabs is not configured). */
  stt: (audio: Blob, language: Lang) => {
    const form = new FormData();
    form.append("audio", audio, audio.type.includes("mp4") ? "speech.m4a" : "speech.webm");
    return upload<{ text: string; language: string | null }>(`/agent/stt${qs({ language })}`, form);
  },
  session: (id: string) => get<{ graph: string; current_node: string | null; sub_agent: string | null; steps: number; path: unknown[]; state: Record<string, unknown> }>(`/agent/sessions/${id}`),
  testDefinitions: () => get<{ name: string; success_condition: string }[]>("/agent/testing/definitions"),
  runTests: () => post<{ results: ScenarioResult[]; passed: number; total: number }>("/agent/testing/run"),
  syncDryRun: () => post<{ dry_run: boolean; configured: boolean; config: Record<string, unknown> }>("/agent/sync?dry_run=true"),
  /** Admin: create or update the ElevenLabs agent from code (needs ELEVENLABS_API_KEY on the server). */
  syncAgent: () => post<{ agent_id?: string; created?: boolean; knowledge_base?: unknown[] } & Record<string, unknown>>("/agent/sync?dry_run=false"),
  /** Admin: create the 10 guardrail scenarios in ElevenLabs Agent Testing and start a run (needs the key and agent id). */
  syncTests: () => post<{ created: number; test_ids: string[]; run: unknown }>("/agent/testing/sync"),
};

export const officerApi = {
  stats: () => get<OfficerStats>("/officer/stats"),
  cases: (params: { queue?: string; q?: string; limit?: number; offset?: number } = {}) => get<Page<CaseListItem>>(`/officer/cases${qs(params)}`),
  case: (ref: string) => get<OfficerCaseDetail>(`/officer/cases/${ref}`),
  approvals: () => get<ApprovalItem[]>("/officer/approvals"),
  approve: (id: string, note = "") => post<{ id: string; state: string }>(`/officer/approvals/${id}/approve`, { note }),
  reject: (id: string, reason: string) => post<{ id: string; state: string }>(`/officer/approvals/${id}/reject`, { reason }),
  requestDocuments: (ref: string, node_key: NodeKey, documents: string[], note = "") =>
    post<{ node_key: string; state: string }>(`/officer/cases/${ref}/request-documents`, { node_key, documents, note }),
  escalate: (ref: string, reason: string, note = "", node_key?: NodeKey | null) => post<EscalationItem>(`/officer/cases/${ref}/escalate`, { reason, note, node_key }),
  transfer: (ref: string, to_officer_id: string, note = "") => post<{ assigned_officer_id: string }>(`/officer/cases/${ref}/transfer`, { to_officer_id, note }),
  note: (ref: string, note: string, node_key?: NodeKey | null) => post<{ ok: boolean }>(`/officer/cases/${ref}/notes`, { note, node_key }),
  retry: (ref: string, key: NodeKey) => post<{ node_key: string; state: string }>(`/officer/cases/${ref}/nodes/${key}/retry`),
  prepare: (ref: string, key: NodeKey) => post<{ node_key: string; state: string }>(`/officer/cases/${ref}/nodes/${key}/prepare`),
  escalations: (includeResolved = false) => get<EscalationItem[]>(`/officer/escalations${qs({ include_resolved: includeResolved })}`),
  take: (id: string) => post<EscalationItem>(`/officer/escalations/${id}/take`),
  resolve: (id: string, resolution: string) => post<EscalationItem>(`/officer/escalations/${id}/resolve`, { resolution }),
  callbacks: () => get<CallbackItem[]>("/officer/callbacks"),
  audit: (params: { case?: string; action?: string; actor_type?: string; limit?: number; offset?: number } = {}) => get<Page<AuditItem>>(`/officer/audit${qs(params)}`),
  analytics: () => get<Analytics>("/officer/analytics"),
  officers: () => get<User[]>("/officers"),
};

export const adminApi = {
  users: (params: { role?: string; q?: string; limit?: number; offset?: number } = {}) => get<Page<User>>(`/users${qs(params)}`),
  provision: (body: { email: string; full_name: string; role: string; organization_id?: string | null; title?: string | null; phone?: string | null }) => post<User>("/users", body),
  updateUser: (id: string, body: { role?: string; is_active?: boolean; organization_id?: string | null; title?: string | null }) => patch<User>(`/users/${id}`, body),
  resendInvitation: (id: string) => post<{ sent: boolean }>(`/users/${id}/invitation`),
  organizations: () => get<Organization[]>("/organizations"),
  createOrganization: (body: { code: string; name: string; emirate: string; kind: string }) => post<Organization>("/organizations", body),
};

export const demoApi = {
  status: () => get<DemoStatus>("/demo"),
  act: (ref: string, key: NodeKey | string, action: string) => post<{ node: string; action: string; via: string }>(`/demo/cases/${ref}/nodes/${key}/${action}`),
  callback: (ref: string) => post<{ callback: CallbackItem | null }>(`/demo/cases/${ref}/callback`),
  escalate: (ref: string, reason: string) => post<{ escalation_id: string }>(`/demo/cases/${ref}/escalate`, { reason }),
  webhook: (ref: string) => post<{ webhook: Record<string, unknown>; signed: boolean }>(`/demo/cases/${ref}/webhook`),
  failure: (component: "government" | "kafka" | "elevenlabs", enabled: boolean, mode = "unavailable") => post<DemoStatus>("/demo/failures", { component, enabled, mode }),
  reset: () => post<{ reset: boolean; case: string }>("/demo/reset"),
  outbox: (status?: string) => get<OutboxItem[]>(`/demo/outbox${qs({ status })}`),
};

export const metaApi = {
  ready: () => request<Readiness>("/ready"),
  entities: () => get<EntityCatalogue>("/entities"),
  knowledge: () => get<KnowledgeDoc[]>("/knowledge"),
  notifications: (unread = false) => get<{ items: NotificationItem[]; total: number; unread: number }>(`/notifications${qs({ unread })}`),
  readNotification: (id: string) => post<NotificationItem>(`/notifications/${id}/read`),
  readAll: () => post<{ ok: boolean }>("/notifications/read-all"),
};
