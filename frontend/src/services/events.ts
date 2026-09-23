import type { Callback, DomainEvent, Page } from "../types";
import { get, post } from "./api";

export const eventsApi = {
  list: (params: { case_id?: string; event_type?: string; limit?: number } = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v !== undefined && q.set(k, String(v)));
    return get<Page<DomainEvent>>(`/events?${q.toString()}`);
  },
};

export const callbacksApi = {
  list: (status?: string) => get<Callback[]>(`/callbacks${status ? `?status=${status}` : ""}`),
  execute: (id: string) => post<Callback>(`/callbacks/${id}/execute`),
};
