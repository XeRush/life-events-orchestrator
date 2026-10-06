// Types mirror the FastAPI responses (backend/app/api/v1/*). Server state lives in TanStack Query, never in Zustand.

export type Lang = "en" | "ar" | "hi" | "ur" | "ml" | "tl";
export type Role = "RESIDENT" | "OFFICER" | "ADMIN";

export type NodeKey = "BIRTH_CERTIFICATE" | "MOFA_ATTESTATION" | "CONSULATE_PASSPORT" | "RESIDENCE_VISA" | "EMIRATES_ID" | "INSURANCE";
export type NodeState =
  | "PENDING" | "READY" | "SUBMITTING" | "SUBMITTED" | "PROCESSING" | "CLEARED" | "BLOCKED" | "DOCUMENT_MISSING" | "STALLED"
  | "WAITING_FOR_PARENT" | "WAITING_FOR_HUMAN" | "REJECTED" | "COMPLETED";
export type Source = "AI_AGENT" | "GOVERNMENT_MOCK" | "PARENT_REPORTED" | "HUMAN_OFFICER" | "RESIDENT" | "SYSTEM";
export type CaseStatus = "INTAKE" | "ACTIVE" | "WAITING_FOR_PARENT" | "WAITING_FOR_HUMAN" | "ESCALATED" | "COMPLETED" | "CLOSED";
export type Risk = "LOW" | "MEDIUM" | "HIGH";
export type DocStatus = "REQUIRED" | "UPLOADED" | "VERIFIED" | "MISSING" | "EXPIRED" | "NOT_APPLICABLE";
export type CallbackStatus = "SCHEDULED" | "DIALING" | "COMPLETED" | "NO_ANSWER" | "FAILED" | "CANCELLED" | "BLOCKED_NO_CONSENT" | "SMS_ONLY";

export interface Page<T> { items: T[]; total: number; limit: number; offset: number }
export interface ApiErrorBody { error: { code: string; message: string; details?: unknown } }

// --- auth ---------------------------------------------------------------------------------------------
export interface User {
  id: string; email: string; full_name: string; title: string | null; role: Role; organization_id: string | null;
  organization_name: string | null; phone: string | null; preferred_language: Lang; is_active: boolean; email_verified: boolean;
  invitation_pending: boolean; last_login_at: string | null; created_at: string;
}
export interface Tokens { access_token: string; refresh_token: string; token_type: string; expires_in: number; expires_at: string }
export interface Session { user: User; tokens: Tokens }
export interface AuthConfig {
  require_email_verification: boolean; email_transport: string; dev_mailbox: boolean;
  demo_accounts: { email: string; role: Role }[]; password_rules: string;
}
export interface Organization { id: string; code: string; name: string; kind: string; emirate: string; is_active: boolean }

// --- cases --------------------------------------------------------------------------------------------
export interface Deadline { deadline_date: string | null; days_remaining: number | null; status: "ON_TRACK" | "AT_RISK" | "OVERDUE" | "COMPLETE"; legal_days: number; source: string }
export interface CaseView {
  id: string; reference: string; status: CaseStatus; risk: Risk; language: Lang; channel_mode: "VOICE" | "SMS_ONLY"; emirate: string;
  life_event_type: string; intake_channel: string; is_demo: boolean; created_at: string; last_activity_at: string | null; completed_at: string | null;
  child: { full_name_en: string; full_name_ar: string | null; date_of_birth: string; nationality: string; place_of_birth: string; sex: string | null } | null;
  parents: { role: string; full_name: string; nationality: string; emirates_id: string | null }[];
  resident: { id: string; full_name: string; phone: string | null; email: string | null } | null;
  assigned_officer: { id: string; full_name: string; title: string | null } | null;
  organization: { id: string; name: string; code: string } | null;
  deadline: Deadline;
  progress: { done: number; total: number; percent: number };
  current_node: { key: NodeKey; title: string; state: NodeState; entity_label: string } | null;
  attention_nodes: { key: NodeKey; title: string; state: NodeState; reason: string | null }[];
  next_action: { text: string; owner: "AGENT" | "PARENT" | "OFFICER" | "ENTITY" | "SYSTEM"; node_key: NodeKey } | null;
  outstanding_documents: { doc_type: string; title: string; status: DocStatus }[];
  consent: { callback: boolean; token_present: boolean; captured_at: string | null };
  opted_out: boolean; opted_out_at: string | null;
  passport: { fields_captured: number; re_entries: number };
  summary: string;
}
export interface CaseListItem {
  id: string; reference: string; status: CaseStatus; risk: Risk; child_name: string | null; resident_name: string | null;
  current_node: { key: NodeKey; title: string; state: NodeState } | null; progress: { done: number; total: number };
  deadline: Deadline; channel_mode: string; language: Lang; last_activity_at: string | null;
  sla: { due_at: string | null; breached: boolean }; officer_action: "RELEASE" | "REVIEW" | null; assigned_officer_id: string | null;
}
export interface GraphNode {
  id: string; case_id: string; key: NodeKey; title: string; entity: string; entity_label: string; type: "ENTITY_FILING" | "PARENT_REPORTED";
  state: NodeState; status: string; status_source: Source; dependencies: NodeKey[]; required_documents: string[]; form_fields: string[];
  form_field_labels?: string[];
  human_approval_required: boolean; approval_state: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | null;
  resident_present_required: boolean; resident_present_reason: string | null; submitted_at: string | null; updated_at: string;
  cleared_at: string | null; blocked_reason: string | null;
  sla: { hours: number | null; label: string; due_at: string | null; breached: boolean; source: string };
  next_action: string | null; next_action_owner: string | null; fee_note: string | null;
  parent_report: { reported_at: string; reported_by: string; reported_status: string; label: string; passport_number_present: boolean;
    appointment_date: string | null; notes: string | null; source: "PARENT_REPORTED"; history?: unknown[] } | null;
  lifeloop_does: string; parent_does: string; is_mock: boolean; attempts: number;
}
export interface CaseGraph { case_id: string; reference: string; source: string; projection: string; nodes: GraphNode[]; edges: { from: NodeKey; to: NodeKey; kind: string }[] }
export interface Impact { node_key: NodeKey; held_downstream: { key: NodeKey; state: NodeState; entity: string }[]; source: "neo4j" | "postgres" }
export interface TimelineEvent {
  id: string; event_type: string; title: string; description: string; source: Source; actor: string; actor_type: string; status: string | null;
  node_key: NodeKey | null; resident_present: boolean; i18n?: { key: string; params: Record<string, string> } | null; occurred_at: string;
}
export interface DocumentItem {
  id: string; doc_type: string; title: string; status: DocStatus; required: boolean; declared_available: boolean; source: Source;
  issued_by: string | null; node_key: NodeKey | null; file_name: string | null; mime_type: string | null; size_bytes: number | null;
  uploaded_at: string | null; verified_at: string | null; notes: string | null; expires_on: string | null; is_output: boolean;
}
export interface DocumentCenter { groups: Record<string, DocumentItem[]>; counts: Record<string, number>; disclaimer: string }
export interface Consent { id: string; consent_type: "CALLBACK" | "DATA_PROCESSING" | "SERVICE_FILING"; status: "GRANTED" | "REVOKED"; version: string; scope: string; source: string; language: string; token_present: boolean; captured_at: string; revoked_at: string | null }
export interface Verification { id: string; method: string; success: boolean; attempt_no: number; facts_checked: string[]; failure_reason: string | null; call_session_id: string | null; created_at: string }
export interface CallbackItem {
  id: string; case_id: string; case_reference: string | null; node_key: NodeKey | null; reason: string;
  reasons: { reason: string; node_key?: string; node_title?: string; entity?: string; detail?: string }[]; trigger_event: string; status: CallbackStatus;
  channel: string; language: Lang; consent_checked: boolean; scheduled_for: string; dialed_at: string | null; completed_at: string | null;
  duration_seconds: number | null; outcome: string | null; provider: string | null; call_session_id: string | null;
}
export interface EntityRequestItem {
  id: string; node_key: NodeKey | null; entity: string; entity_label: string; request_type: string; state: string; external_ref: string | null;
  fields_sent: string[]; released_at: string | null; submitted_at: string | null; attempts: number; error: string | null; is_mock: true;
  statuses: { status: string; detail: string; channel: string; received_at: string }[];
}
export interface OutboxItem { id: string; event_type: string; topic: string; status: string; node_key: string | null; actor: string; source: string; created_at: string; published_at: string | null; processed_at: string | null; attempts: number }
export interface IntakeInput {
  language: Lang; emirate: string; child_full_name_en: string; child_full_name_ar?: string | null; child_date_of_birth: string; child_sex?: "F" | "M" | null;
  place_of_birth: string; child_nationality: string; birth_notification_ref?: string | null; father_full_name?: string | null; father_nationality?: string | null;
  father_emirates_id?: string | null; mother_full_name?: string | null; mother_nationality?: string | null; mother_emirates_id?: string | null;
  marriage_certificate_attested?: boolean | null; phone?: string | null; consent_data_processing: boolean; consent_service_filing: boolean; consent_callback: boolean;
}

// --- voice / agent -----------------------------------------------------------------------------------
export interface TranscriptLine { seq: number; role: "AGENT" | "RESIDENT" | "SYSTEM" | "OFFICER"; text: string; sub_agent: string | null; tool: string | null; is_disclosure: boolean; at: string }
export interface CallView {
  id: string; case_id: string | null; case_reference: string | null; direction: "INBOUND" | "OUTBOUND"; provider: "SIMULATED" | "ELEVENLABS";
  state: "RINGING" | "ACTIVE" | "ENDED" | "TRANSFERRED" | "FAILED"; language: Lang; sub_agent: string; verified: boolean; verification_method: string | null;
  muted: boolean; callback_id: string | null; started_at: string; ended_at: string | null; duration_seconds: number | null; outcome: string | null;
  summary: string | null; extracted_fields: Record<string, unknown>; disclosure_at: string | null;
  agent: { stage: string | null; current_node: string | null; steps: number }; transcript: TranscriptLine[];
}
export interface Transport { provider: "simulated" | "elevenlabs"; signed_url?: string; dynamic_variables?: Record<string, string>; first_message?: string; language?: string; fallback_reason?: string | null }
export interface StartCallResult { call: CallView; transport: Transport }
export interface TurnResult {
  reply: string; tool_calls: { name: string; ok: boolean; error?: string | null }[]; stage: string | null; sub_agent: string; ended: boolean;
  transferred: boolean; language: Lang; case_reference: string | null; verified: boolean;
}
export interface VoiceConfig {
  voice: { provider: "elevenlabs" | "simulated"; configured: boolean; healthy: boolean; simulated_failure: boolean; telephony: string; tts_model: string; stt_model: string; fallback: boolean; note: string | null };
  languages: { code: Lang; name: string; english_name: string; rtl: boolean }[];
  tools: { name: string; description: string; requires_case: boolean; requires_verified_caller: boolean }[];
  orchestrator_graph: { nodes: string[]; edges: [string, string][]; deterministic: boolean; llm_mutates_state: boolean };
  conversation_graph: { nodes: string[]; sub_agents: string[] };
}
export interface ScenarioResult { id: string; title: string; expectation: "PASS" | "FAIL"; passed: boolean; violations: string[]; system_check: string | null; transcript: { role: string; text: string }[] }

// --- officer -------------------------------------------------------------------------------------------
export interface OfficerStats { pending_approval: number; blocked: number; stalled: number; escalations: number; active_cases: number }
export interface ApprovalItem { id: string; case_reference: string; node_key: NodeKey; node_title: string; entity_label: string; summary: string; fields: { name: string; label: string; value: unknown }[]; requested_at: string; risk: Risk; deadline: Deadline }
export interface EscalationItem { id: string; case_id: string; case_reference: string | null; node_key: NodeKey | null; reason: string; reason_label: string; status: "OPEN" | "IN_PROGRESS" | "RESOLVED"; warm_transfer: boolean; summary: string; opened_by: string; assigned_officer: { id: string; full_name: string } | null; opened_at: string; resolved_at: string | null; resolution: string | null }
export interface AuditItem { id: string; occurred_at: string; actor: string; actor_type: string; action: string; case_reference?: string | null; node_key: string | null; source: Source; result: string; trace_id: string | null; request_id?: string | null; details?: Record<string, unknown> }
export interface OfficerCaseDetail {
  case: CaseView; graph: CaseGraph; timeline: TimelineEvent[]; documents: DocumentCenter; calls: CallView[]; consents: Consent[];
  opt_outs: { active: boolean; source: string; reason: string; created_at: string }[]; verification: Verification[]; entity_requests: EntityRequestItem[];
  approvals: { id: string; node_key: NodeKey | null; node_title: string | null; state: string; summary: string; fields: { name: string; label: string; value: unknown }[]; requested_at: string; requested_by: string; decided_at: string | null; decided_by: string | null; reason: string | null }[];
  reviews: { decision: string; node_key: string | null; notes: string; officer: string; created_at: string }[];
  escalations: EscalationItem[]; callbacks: CallbackItem[]; audit: AuditItem[];
  orchestrator: { runs: { at: string; trigger: string; node: string | null; path: string[]; actions: string[] }[]; steps: number };
  extracted_fields: Record<string, Record<string, unknown>>;
}
export interface Analytics {
  label: string;
  kpis: { id: string; label: string; baseline: number; target: number; target_note: string; measured_by: string; source: string; measured: number }[];
  cases: { total: number; by_status: Record<string, number>; by_risk: Record<string, number> };
  nodes: { by_state: Record<string, number>; by_key_state: Record<string, Record<string, number>> };
  avg_hours_to_clear: Record<string, number>; callbacks: Record<string, number>; escalations: Record<string, number>;
  approvals_pending: number; opt_outs: number; calls: number; verification: { attempts: number; succeeded: number };
  bottlenecks: { source: string; items: { key: string; entity: string; state: string; cases: number; held_downstream?: number }[] };
}
export interface EntityCatalogue {
  label: string;
  entities: { adapter: string; entity: string; label: string; service: string; request_type: string; is_mock: boolean; has_api: boolean; has_status_feed: boolean; required_fields: string[]; required_documents: string[]; sla: string; published_fee: string | null; fee_source: string | null; notes: string; failure_mode: string | null }[];
}
export interface Readiness {
  status: string; environment: string; demo_mode: boolean;
  dependencies: Record<string, { healthy?: boolean; mode?: string; fallback?: boolean; [k: string]: unknown }>;
  workers: { running: boolean; workers?: Record<string, { last_beat_seconds_ago: number }> };
}
export interface DemoStatus {
  demo_mode: boolean; controls: Record<NodeKey, string[]>; failures: { government: Record<string, string>; kafka: boolean; elevenlabs: boolean };
  label: string; outbox: Record<string, number>; broker: { mode: string; healthy: boolean; simulated_failure: boolean; fallback: boolean; last_error: string | null };
  recent_events: { event_type: string; topic: string; status: string; created_at: string; attempts: number; error: string | null }[];
  mock_sms: { to: string; body: string; at: string }[];
}
export interface NotificationItem { id: string; case_id: string | null; channel: "IN_APP" | "SMS" | "EMAIL" | "VOICE"; title: string; body: string; link: string | null; status: string; provider: string; is_mock: boolean; created_at: string; sent_at: string | null; read_at: string | null }
export interface KnowledgeDoc { id: string; title: string; entity: string; source: string; body: string; fees: { label: string; amount: string; source: string }[] }
