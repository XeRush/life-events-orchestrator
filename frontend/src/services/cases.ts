import type {
  CaseGraph, CaseSummary, DashboardStats, DemoAction, EntityOps, LifeEventTemplate, Page, Passport, Snapshot, TimelineItem,
} from "../types";
import { get, post, request } from "./api";

export const casesApi = {
  list: () => get<Page<CaseSummary>>("/cases?limit=100"),
  detail: (ref: string) => get<CaseSummary>(`/cases/${ref}`),
  snapshot: (ref: string) => get<Snapshot>(`/cases/${ref}/snapshot`),
  graph: (ref: string) => get<CaseGraph>(`/cases/${ref}/graph`),
  passport: (ref: string) => get<Passport>(`/cases/${ref}/passport`),
  timeline: (ref: string, order: "asc" | "desc" = "asc") =>
    get<Page<TimelineItem>>(`/cases/${ref}/timeline?order=${order}&limit=200`),
  create: (body: Record<string, unknown>) => post<CaseSummary>("/cases", body),
  pause: (ref: string) => post<CaseSummary>(`/cases/${ref}/pause`),
  resume: (ref: string) => post<CaseSummary>(`/cases/${ref}/resume`),
  escalate: (ref: string) => post<CaseSummary>(`/cases/${ref}/escalate`),
  requestCallback: (ref: string, reason: string, when?: string) => post(`/cases/${ref}/callback`, { reason, when }),
  recordDocument: (ref: string, docType: string, name?: string) =>
    post(`/cases/${ref}/documents/record`, { doc_type: docType, name }),
  uploadDocument: (ref: string, docType: string, file: File) => {
    const form = new FormData();
    form.append("doc_type", docType);
    form.append("file", file);
    return request(`/cases/${ref}/documents`, { method: "POST", body: form });
  },
  templates: () => get<LifeEventTemplate[]>("/life-events"),
  lifeTimeline: () =>
    get<{ items: TimelineItem[]; total: number }>("/timeline?order=asc&limit=500"),
  dashboard: () => get<DashboardStats>("/dashboard/stats"),
  entities: () => get<EntityOps[]>("/entities"),
};

export const demoApi = {
  actions: () => get<DemoAction[]>("/demo/actions"),
  perform: (ref: string, action: string) =>
    post<{ result: Record<string, unknown>; snapshot: Snapshot }>(`/demo/cases/${ref}/actions/${action}`),
  reset: () => post<{ status: string }>("/demo/reset"),
};
