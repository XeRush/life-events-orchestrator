import {
  Activity, AudioLines, BookOpen, Database, FlaskConical, Landmark, MemoryStick, MessageSquareText, Network, PhoneCall, PhoneOutgoing,
  Radio, Share2, ShieldCheck, UserRound, UserRoundCheck, Waypoints, Webhook, Workflow, Wrench, type LucideIcon,
} from "lucide-react";
import type { MessageKey } from "../../i18n";

/**
 * The LifeLoop architecture as data: one source for the animated desktop diagram, the stacked mobile layout and the
 * text alternative. Coordinates are in a fixed 1140-wide canvas that is scaled to fit. Every edge is labelled with
 * what flows and in which direction; numbered dots mark where personal data crosses a boundary (Idea Canvas box L).
 */

export const CANVAS = { w: 1140, h: 1384 };

export type ZoneId = "channel" | "platform" | "institution";
export type EdgeKind = "voice" | "data" | "human" | "fallback" | "test" | "cache";
export type BadgeTone = "mock" | "auth" | "human" | "projection" | "fallback" | "readonly" | "gate";

export interface Zone { id: ZoneId; index: string; title: MessageKey; sub: MessageKey; y: number; h: number }
export interface ArchNode {
  id: string; zone: ZoneId; x: number; y: number; w: number; h: number; icon: LucideIcon; title: MessageKey; detail: MessageKey;
  badge?: { label: MessageKey; tone: BadgeTone }; dashed?: boolean; variant?: "agent" | "voice" | "adapters";
}
export interface ArchEdge {
  id: string; from: string; to: string; points: [number, number][]; label: MessageKey; kind: EdgeKind; both?: boolean; dashed?: boolean; pd?: number;
  at: { x: number; y: number; anchor?: "start" | "middle" | "end"; rotate?: boolean };
}
export interface PdDot { n: number; x: number; y: number; where: MessageKey; what: MessageKey; guard: MessageKey }

export const ZONES: Zone[] = [
  { id: "channel", index: "01", title: "landing.arch.zone.channel", sub: "landing.arch.zone.channelSub", y: 40, h: 160 },
  { id: "platform", index: "02", title: "landing.arch.zone.platform", sub: "landing.arch.zone.platformSub", y: 216, h: 500 },
  { id: "institution", index: "03", title: "landing.arch.zone.institution", sub: "landing.arch.zone.institutionSub", y: 732, h: 644 },
];

const C1 = 40, C2 = 430, C3 = 820, CW = 260;

export const NODES: ArchNode[] = [
  // 01 caller & channel
  { id: "sms", zone: "channel", x: C1, y: 88, w: CW, h: 80, icon: MessageSquareText, title: "landing.arch.node.sms", detail: "landing.arch.node.smsDetail", dashed: true, badge: { label: "landing.arch.badge.fallback", tone: "fallback" } },
  { id: "resident", zone: "channel", x: C2, y: 88, w: CW, h: 80, icon: UserRound, title: "landing.arch.node.resident", detail: "landing.arch.node.residentDetail" },
  { id: "telephony", zone: "channel", x: C3, y: 88, w: CW, h: 80, icon: PhoneCall, title: "landing.arch.node.telephony", detail: "landing.arch.node.telephonyDetail" },
  // 02 ElevenLabs platform
  { id: "kb", zone: "platform", x: C1, y: 264, w: CW, h: 100, icon: BookOpen, title: "landing.arch.node.kb", detail: "landing.arch.node.kbDetail", badge: { label: "landing.arch.badge.readonly", tone: "readonly" } },
  { id: "testing", zone: "platform", x: C1, y: 404, w: CW, h: 100, icon: FlaskConical, title: "landing.arch.node.testing", detail: "landing.arch.node.testingDetail", badge: { label: "landing.arch.badge.gate", tone: "gate" } },
  { id: "agent", zone: "platform", x: C2, y: 264, w: CW, h: 240, icon: Workflow, title: "landing.arch.node.agent", detail: "landing.arch.node.agentDetail", variant: "agent" },
  { id: "voice", zone: "platform", x: C3, y: 264, w: CW, h: 112, icon: AudioLines, title: "landing.arch.node.stt", detail: "landing.arch.node.sttDetail", variant: "voice" },
  { id: "postcall", zone: "platform", x: C3, y: 416, w: CW, h: 88, icon: Webhook, title: "landing.arch.node.postcall", detail: "landing.arch.node.postcallDetail" },
  { id: "tools", zone: "platform", x: C2, y: 588, w: CW, h: 92, icon: Wrench, title: "landing.arch.node.tools", detail: "landing.arch.node.toolsDetail" },
  // 03 institution systems
  { id: "langfuse", zone: "institution", x: C1, y: 784, w: CW, h: 80, icon: Activity, title: "landing.arch.node.langfuse", detail: "landing.arch.node.langfuseDetail" },
  { id: "langgraph", zone: "institution", x: C2, y: 784, w: CW, h: 80, icon: Network, title: "landing.arch.node.langgraph", detail: "landing.arch.node.langgraphDetail" },
  { id: "webhooks", zone: "institution", x: C3, y: 784, w: CW, h: 80, icon: ShieldCheck, title: "landing.arch.node.webhooks", detail: "landing.arch.node.webhooksDetail" },
  { id: "officer", zone: "institution", x: C1, y: 928, w: CW, h: 96, icon: UserRoundCheck, title: "landing.arch.node.officer", detail: "landing.arch.node.officerDetail", badge: { label: "landing.arch.badge.human", tone: "human" } },
  { id: "orchestrator", zone: "institution", x: C2, y: 928, w: CW, h: 96, icon: Waypoints, title: "landing.arch.node.orchestrator", detail: "landing.arch.node.orchestratorDetail" },
  { id: "redis", zone: "institution", x: C3, y: 928, w: CW, h: 80, icon: MemoryStick, title: "landing.arch.node.redis", detail: "landing.arch.node.redisDetail" },
  { id: "neo4j", zone: "institution", x: C1, y: 1088, w: CW, h: 88, icon: Share2, title: "landing.arch.node.neo4j", detail: "landing.arch.node.neo4jDetail", badge: { label: "landing.arch.badge.projection", tone: "projection" } },
  { id: "postgres", zone: "institution", x: C2, y: 1088, w: CW, h: 88, icon: Database, title: "landing.arch.node.postgres", detail: "landing.arch.node.postgresDetail", badge: { label: "landing.arch.badge.authoritative", tone: "auth" } },
  { id: "kafka", zone: "institution", x: C3, y: 1088, w: CW, h: 88, icon: Radio, title: "landing.arch.node.kafka", detail: "landing.arch.node.kafkaDetail" },
  { id: "callbacks", zone: "institution", x: C1, y: 1240, w: CW, h: 96, icon: PhoneOutgoing, title: "landing.arch.node.callbacks", detail: "landing.arch.node.callbacksDetail" },
  { id: "adapters", zone: "institution", x: C2, y: 1240, w: 650, h: 120, icon: Landmark, title: "landing.arch.node.adapters", detail: "landing.arch.node.adaptersDetail", variant: "adapters", badge: { label: "landing.arch.badge.mock", tone: "mock" } },
];

export const EDGES: ArchEdge[] = [
  { id: "e1", from: "resident", to: "telephony", points: [[690, 116], [820, 116]], label: "landing.arch.edge.e1", kind: "voice", at: { x: 755, y: 107 } },
  { id: "e2", from: "telephony", to: "resident", points: [[820, 142], [690, 142]], label: "landing.arch.edge.e2", kind: "voice", at: { x: 755, y: 160 } },
  { id: "e3", from: "sms", to: "resident", points: [[300, 128], [430, 128]], label: "landing.arch.edge.e3", kind: "fallback", dashed: true, at: { x: 365, y: 119 } },
  { id: "e4", from: "telephony", to: "voice", points: [[900, 168], [900, 264]], label: "landing.arch.edge.e4", kind: "voice", pd: 1, at: { x: 912, y: 244, anchor: "start" } },
  { id: "e5", from: "voice", to: "telephony", points: [[1080, 348], [1110, 348], [1110, 142], [1080, 142]], label: "landing.arch.edge.e5", kind: "voice", at: { x: 1126, y: 245, rotate: true } },
  { id: "e6", from: "voice", to: "agent", points: [[820, 292], [690, 292]], label: "landing.arch.edge.e6", kind: "data", at: { x: 755, y: 283 } },
  { id: "e7", from: "agent", to: "voice", points: [[690, 348], [820, 348]], label: "landing.arch.edge.e7", kind: "data", at: { x: 755, y: 366 } },
  { id: "e8", from: "kb", to: "agent", points: [[300, 314], [430, 314]], label: "landing.arch.edge.e8", kind: "data", at: { x: 365, y: 305 } },
  { id: "e9", from: "testing", to: "agent", points: [[300, 454], [430, 454]], label: "landing.arch.edge.e9", kind: "test", dashed: true, at: { x: 365, y: 445 } },
  { id: "e10", from: "agent", to: "postcall", points: [[690, 460], [820, 460]], label: "landing.arch.edge.e10", kind: "data", at: { x: 755, y: 451 } },
  { id: "e11", from: "agent", to: "tools", points: [[560, 504], [560, 588]], label: "landing.arch.edge.e11", kind: "data", at: { x: 572, y: 550, anchor: "start" } },
  { id: "e12", from: "tools", to: "langgraph", points: [[560, 680], [560, 784]], label: "landing.arch.edge.e12", kind: "data", pd: 2, at: { x: 574, y: 760, anchor: "start" } },
  { id: "e13", from: "postcall", to: "webhooks", points: [[950, 504], [950, 784]], label: "landing.arch.edge.e13", kind: "data", pd: 3, at: { x: 962, y: 610, anchor: "start" } },
  { id: "e14", from: "langgraph", to: "langfuse", points: [[430, 824], [300, 824]], label: "landing.arch.edge.e14", kind: "cache", at: { x: 365, y: 815 } },
  { id: "e15", from: "langgraph", to: "orchestrator", points: [[560, 864], [560, 928]], label: "landing.arch.edge.e15", kind: "data", at: { x: 548, y: 900, anchor: "end" } },
  { id: "e16", from: "webhooks", to: "orchestrator", points: [[880, 864], [880, 896], [650, 896], [650, 928]], label: "landing.arch.edge.e16", kind: "data", at: { x: 892, y: 884, anchor: "start" } },
  { id: "e17", from: "officer", to: "orchestrator", points: [[300, 976], [430, 976]], label: "landing.arch.edge.e17", kind: "human", at: { x: 365, y: 967 } },
  { id: "e18", from: "orchestrator", to: "redis", points: [[690, 968], [820, 968]], label: "landing.arch.edge.e18", kind: "cache", both: true, at: { x: 755, y: 959 } },
  { id: "e19", from: "orchestrator", to: "postgres", points: [[560, 1024], [560, 1088]], label: "landing.arch.edge.e19", kind: "data", at: { x: 548, y: 1060, anchor: "end" } },
  { id: "e20", from: "postgres", to: "neo4j", points: [[430, 1132], [300, 1132]], label: "landing.arch.edge.e20", kind: "cache", at: { x: 365, y: 1123 } },
  { id: "e21", from: "neo4j", to: "officer", points: [[170, 1088], [170, 1024]], label: "landing.arch.edge.e21", kind: "cache", at: { x: 182, y: 1060, anchor: "start" } },
  { id: "e22", from: "postgres", to: "kafka", points: [[690, 1116], [820, 1116]], label: "landing.arch.edge.e22", kind: "data", at: { x: 755, y: 1107 } },
  { id: "e23", from: "kafka", to: "orchestrator", points: [[860, 1088], [860, 1056], [660, 1056], [660, 1024]], label: "landing.arch.edge.e23", kind: "data", at: { x: 760, y: 1047 } },
  { id: "e24", from: "kafka", to: "adapters", points: [[930, 1176], [930, 1240]], label: "landing.arch.edge.e24", kind: "data", pd: 4, at: { x: 918, y: 1203, anchor: "end" } },
  { id: "e25", from: "adapters", to: "kafka", points: [[1000, 1240], [1000, 1176]], label: "landing.arch.edge.e25", kind: "data", at: { x: 1012, y: 1203, anchor: "start" } },
  { id: "e26", from: "kafka", to: "callbacks", points: [[820, 1160], [760, 1160], [760, 1208], [170, 1208], [170, 1240]], label: "landing.arch.edge.e26", kind: "data", at: { x: 470, y: 1200 } },
  { id: "e27", from: "callbacks", to: "telephony", points: [[40, 1288], [16, 1288], [16, 20], [1010, 20], [1010, 88]], label: "landing.arch.edge.e27", kind: "voice", pd: 5, at: { x: 520, y: 14 } },
];

export const PD_DOTS: PdDot[] = [
  { n: 1, x: 900, y: 208, where: "landing.arch.pd.1.where", what: "landing.arch.pd.1.what", guard: "landing.arch.pd.1.guard" },
  { n: 2, x: 560, y: 724, where: "landing.arch.pd.2.where", what: "landing.arch.pd.2.what", guard: "landing.arch.pd.2.guard" },
  { n: 3, x: 950, y: 724, where: "landing.arch.pd.3.where", what: "landing.arch.pd.3.what", guard: "landing.arch.pd.3.guard" },
  { n: 4, x: 930, y: 1224, where: "landing.arch.pd.4.where", what: "landing.arch.pd.4.what", guard: "landing.arch.pd.4.guard" },
  { n: 5, x: 1010, y: 40, where: "landing.arch.pd.5.where", what: "landing.arch.pd.5.what", guard: "landing.arch.pd.5.guard" },
];

/** "Follow one call": each step highlights the nodes and edges involved, with a caption. */
export const TRACE: { nodes: string[]; edges: string[]; caption: MessageKey }[] = [
  { nodes: ["resident", "telephony"], edges: ["e1"], caption: "landing.arch.trace.1" },
  { nodes: ["telephony", "voice"], edges: ["e4"], caption: "landing.arch.trace.2" },
  { nodes: ["voice", "agent"], edges: ["e6"], caption: "landing.arch.trace.3" },
  { nodes: ["kb", "agent", "voice", "telephony"], edges: ["e8", "e7", "e5", "e2"], caption: "landing.arch.trace.4" },
  { nodes: ["agent", "tools", "langgraph"], edges: ["e11", "e12"], caption: "landing.arch.trace.5" },
  { nodes: ["langgraph", "orchestrator", "postgres", "redis", "langfuse"], edges: ["e15", "e19", "e18", "e14"], caption: "landing.arch.trace.6" },
  { nodes: ["neo4j", "officer", "orchestrator"], edges: ["e20", "e21", "e17"], caption: "landing.arch.trace.7" },
  { nodes: ["postgres", "kafka", "adapters"], edges: ["e22", "e24"], caption: "landing.arch.trace.8" },
  { nodes: ["adapters", "kafka", "orchestrator"], edges: ["e25", "e23"], caption: "landing.arch.trace.9" },
  { nodes: ["kafka", "callbacks", "telephony", "resident"], edges: ["e26", "e27", "e2"], caption: "landing.arch.trace.10" },
  { nodes: ["agent", "postcall", "webhooks", "orchestrator"], edges: ["e10", "e13", "e16"], caption: "landing.arch.trace.11" },
];

export const ADAPTER_CHIPS: { label: MessageKey; service: MessageKey; noApi?: boolean }[] = [
  { label: "landing.flow.entity.dha", service: "node.BIRTH_CERTIFICATE" },
  { label: "landing.flow.entity.mofa", service: "node.MOFA_ATTESTATION" },
  { label: "landing.flow.entity.gdrfa", service: "landing.arch.adapter.visaEid" },
  { label: "landing.flow.entity.insurer", service: "node.INSURANCE" },
  { label: "landing.flow.entity.consulate", service: "landing.arch.adapter.noApi", noApi: true },
];

export const KAFKA_TOPICS = [
  "lifeloop.case.events", "lifeloop.entity.requests", "lifeloop.entity.status", "lifeloop.case.callbacks",
  "lifeloop.agent.events", "lifeloop.notifications", "lifeloop.audit",
];

/** Rounded orthogonal path through the given points. */
export function roundedPath(points: [number, number][], radius = 12): string {
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const d1 = Math.hypot(x1 - x0, y1 - y0);
    const d2 = Math.hypot(x2 - x1, y2 - y1);
    const r = Math.min(radius, d1 / 2, d2 / 2);
    const ax = x1 - ((x1 - x0) / d1) * r;
    const ay = y1 - ((y1 - y0) / d1) * r;
    const bx = x1 + ((x2 - x1) / d2) * r;
    const by = y1 + ((y2 - y1) / d2) * r;
    d += ` L ${ax} ${ay} Q ${x1} ${y1} ${bx} ${by}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${last[0]} ${last[1]}`;
}

/** Theme tokens (CSS variables), so every arrow, swatch and dot flips with the light/dark theme. */
export const EDGE_COLOR: Record<EdgeKind, string> = {
  voice: "var(--color-azure)",
  data: "var(--color-civic)",
  human: "var(--color-violet)",
  fallback: "var(--color-amber)",
  test: "var(--color-ink-2)",
  cache: "var(--color-muted)",
};

export const nodeById = (id: string) => NODES.find((n) => n.id === id)!;

/** For hover: each node, its direct neighbours and the edges between them. */
export const LINKS: Record<string, { nodes: string[]; edges: string[] }> = Object.fromEntries(
  NODES.map((n) => {
    const edges = EDGES.filter((e) => e.from === n.id || e.to === n.id);
    return [n.id, { nodes: [n.id, ...edges.map((e) => (e.from === n.id ? e.to : e.from))], edges: edges.map((e) => e.id) }];
  }),
);

/** Edges in reading order (by where they start, top to bottom), for the scroll-drawn reveal. */
export const EDGE_ORDER = [...EDGES].sort((a, b) => a.points[0][1] - b.points[0][1] || a.points[0][0] - b.points[0][0]).map((e) => e.id);
