export type Role = "RESIDENT" | "OPERATOR" | "GOVERNMENT_ENTITY" | "ADMIN";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  phone: string | null;
  preferred_language: "en" | "ar";
}

export interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export type TaskStatus =
  | "PENDING"
  | "READY"
  | "SUBMITTED"
  | "PROCESSING"
  | "COMPLETED"
  | "BLOCKED"
  | "WAITING_FOR_RESIDENT"
  | "WAITING_FOR_ENTITY"
  | "REJECTED"
  | "FAILED"
  | "CANCELLED";

export type CaseStatus = "PENDING_CONSENT" | "IN_PROGRESS" | "PAUSED" | "ESCALATED" | "COMPLETED" | "CANCELLED";

export interface CaseSummary {
  id: string;
  reference: string;
  title: string;
  event_type: string;
  status: CaseStatus;
  event_date: string | null;
  created_at: string;
  updated_at: string;
  participants: { role: string; name?: string; relationship?: string }[];
  preferences: Record<string, string>;
  progress: { completed: number; total: number; percent: number };
  current_stage: string | null;
  resident_action_required: boolean;
  waiting_on: "resident" | "authority" | "none";
  summary: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface GraphNode {
  id: string;
  key: string;
  name: string;
  description: string;
  status: TaskStatus;
  is_system: boolean;
  layer: number;
  dependencies: string[];
  replanned: boolean;
  entity: { code: string; name: string } | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
  required_documents: { type: string; name: string }[];
  resident_action: string | null;
  status_reason: string | null;
  external_ref: string | null;
}

export interface CaseGraph {
  case_id: string;
  case_reference: string;
  nodes: GraphNode[];
  edges: { from: string; to: string }[];
}

export interface TimelineItem {
  id: string;
  case_id: string;
  case_reference?: string;
  case_title?: string;
  life_event?: string;
  event_type: string;
  category: string;
  title: string;
  description: string;
  occurred_at: string;
}

export interface Snapshot {
  reference: string;
  status: CaseStatus;
  progress: { completed: number; total: number; percent: number };
  stages: { key: string; name: string; status: TaskStatus; entity: string | null; resident_action: string | null }[];
  current_stage: string | null;
  pending_actions: { task: string; action: string; documents: { type: string; name: string }[] }[];
  summary: string;
}

export interface Callback {
  id: string;
  case_id: string;
  case_reference: string | null;
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "SKIPPED" | "CANCELLED";
  reason: string;
  trigger_event_type: string;
  scheduled_for: string;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  outcome: string | null;
  provider: string | null;
  language: string;
  conversation_id: string | null;
  attempts: number;
  payload: { updates?: { kind: string; text: string }[]; script?: string };
}

export interface DomainEvent {
  id: string;
  event_type: string;
  case_id: string | null;
  task_id: string | null;
  actor: string;
  actor_type: string;
  old_state: string | null;
  new_state: string | null;
  metadata: Record<string, unknown>;
  source: string;
  created_at: string;
}

export interface ConsentRecord {
  consent_type: string;
  status: string;
  version: string;
  scope: string;
  source: string;
  captured_at: string;
}

export interface Passport {
  identity: { resident_reference: string; name: string; email: string };
  event: { type: string; title: string; event_date: string | null; reference: string };
  participants: { role: string; name?: string; relationship?: string }[];
  consents: ConsentRecord[];
  preferences: Record<string, string>;
  documents: { id: string; doc_type: string; name: string; status: string; verification_status: string; uploaded_at: string | null }[];
  services: Snapshot["stages"];
  state: { status: CaseStatus; progress: Snapshot["progress"]; summary: string; current_stage: string | null };
  recent_timeline: { title: string; description: string; occurred_at: string; category: string }[];
  conversations: { id: string; channel: string; provider: string; started_at: string; duration_seconds: number | null; turns: number }[];
}

export interface DashboardStats {
  counts: {
    active_cases: number;
    completed_cases: number;
    waiting_for_resident: number;
    in_progress: number;
    entity_processing: number;
    callbacks_scheduled: number;
    callbacks_completed: number;
    escalated: number;
  };
  service_completion_percent: number;
  services: { completed: number; total: number };
  active_cases: {
    id: string;
    reference: string;
    title: string;
    event_type: string;
    status: CaseStatus;
    progress: Snapshot["progress"];
    current_stage: string | null;
    waiting_on: "resident" | "authority" | "none";
    resident_action_required: boolean;
    summary: string;
  }[];
  recent_timeline: (TimelineItem & { case_reference: string })[];
  upcoming_actions: { case_reference: string; task: string; action: string }[];
  recent_callbacks: { id: string; case_reference: string; status: string; reason: string; scheduled_for: string; duration_seconds: number | null }[];
}

export interface EntityOps {
  id: string;
  code: string;
  slug: string;
  name: string;
  description: string;
  incoming: number;
  processing: number;
  completed: number;
  delayed: number;
  rejected: number;
  waiting_for_resident: number;
  total: number;
  avg_processing_hours: number | null;
  configured_avg_hours: number;
  services: { code: string; name: string; description: string; typical_days: number }[];
  recent_events: { id: string; event_type: string; task_name: string | null; new_state: string | null; at: string; case_reference: string | null }[];
}

export interface Conversation {
  id: string;
  case_id: string | null;
  callback_id: string | null;
  channel: string;
  status: string;
  provider: string;
  language: string;
  transcript: { role: "agent" | "user"; text: string; at?: string; tools?: string[] }[];
  summary: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
}

export interface VoiceSession {
  conversation_id: string;
  provider: "elevenlabs" | "simulated";
  language: string;
  case_reference: string | null;
  signed_url: string | null;
  opening_message: string | null;
  first_message_override: string | null;
  fallback_reason: string | null;
  dynamic_variables: Record<string, string>;
}

export interface VoiceConfig {
  provider: "elevenlabs" | "simulated";
  elevenlabs_configured: boolean;
  outbound_telephony_configured: boolean;
  note: string | null;
}

export interface TurnResult {
  reply: string;
  tool_calls: { name: string; ok: boolean; args: Record<string, unknown> }[];
  stage: string;
  case_reference: string | null;
}

export interface DemoAction {
  action: string;
  label: string;
  actor: string;
}

export interface LifeEventTemplate {
  code: string;
  name: string;
  case_title: string;
  description: string;
  icon: string;
  is_configured: boolean;
  service_count: number;
}
