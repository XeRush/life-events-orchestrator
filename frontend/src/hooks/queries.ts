import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { callbacksApi, eventsApi } from "../services/events";
import { casesApi, demoApi } from "../services/cases";
import { voiceApi } from "../services/voice";
import { useAuth } from "../stores/auth";
import { useUI } from "../stores/ui";

/** Server state lives in TanStack Query. A 6s refetch is the fallback if the live SSE stream is unavailable. */
const LIVE = { refetchInterval: 6000, refetchOnWindowFocus: true } as const;

export const useCases = () => useQuery({ queryKey: ["cases"], queryFn: casesApi.list, ...LIVE });
export const useCase = (ref: string) => useQuery({ queryKey: ["case", ref], queryFn: () => casesApi.detail(ref), ...LIVE });
export const useSnapshot = (ref?: string | null) =>
  useQuery({ queryKey: ["snapshot", ref], queryFn: () => casesApi.snapshot(ref!), enabled: !!ref, ...LIVE });
export const useGraph = (ref: string) => useQuery({ queryKey: ["graph", ref], queryFn: () => casesApi.graph(ref), ...LIVE });
export const usePassport = (ref: string) => useQuery({ queryKey: ["passport", ref], queryFn: () => casesApi.passport(ref), ...LIVE });
export const useCaseTimeline = (ref: string) =>
  useQuery({ queryKey: ["timeline", ref], queryFn: () => casesApi.timeline(ref), ...LIVE });
export const useLifeTimeline = () => useQuery({ queryKey: ["life-timeline"], queryFn: casesApi.lifeTimeline, ...LIVE });
export const useDashboard = () => useQuery({ queryKey: ["dashboard"], queryFn: casesApi.dashboard, ...LIVE });
export const useTemplates = () => useQuery({ queryKey: ["templates"], queryFn: casesApi.templates, staleTime: 60_000 });
export const useEntities = () => {
  const role = useAuth((s) => s.user?.role);
  return useQuery({ queryKey: ["entities"], queryFn: casesApi.entities, enabled: role === "ADMIN" || role === "OPERATOR", ...LIVE });
};
export const useCallbacks = () => useQuery({ queryKey: ["callbacks"], queryFn: () => callbacksApi.list(), ...LIVE });
export const useEvents = (caseRef?: string) =>
  useQuery({ queryKey: ["events", caseRef], queryFn: () => eventsApi.list({ case_id: caseRef, limit: 40 }), ...LIVE });
export const useConversations = () => useQuery({ queryKey: ["conversations"], queryFn: voiceApi.conversations, ...LIVE });
export const useVoiceConfig = () => useQuery({ queryKey: ["voice-config"], queryFn: voiceApi.config, staleTime: 60_000 });
export const useDemoActions = () => {
  const role = useAuth((s) => s.user?.role);
  return useQuery({ queryKey: ["demo-actions"], queryFn: demoApi.actions, enabled: role === "ADMIN" || role === "OPERATOR", retry: false, staleTime: 60_000 });
};

export function useInvalidateAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

export function useDemoAction(caseRef: string | undefined) {
  const invalidate = useInvalidateAll();
  const toast = useUI((s) => s.toast);
  return useMutation({
    mutationFn: (action: string) => demoApi.perform(caseRef!, action),
    onSuccess: () => {
      invalidate();
    },
    onError: (e: Error) => toast("error", e.message),
  });
}

export function useCaseAction(ref: string, kind: "pause" | "resume" | "escalate") {
  const invalidate = useInvalidateAll();
  const toast = useUI((s) => s.toast);
  return useMutation({
    mutationFn: () => casesApi[kind](ref),
    onSuccess: () => {
      invalidate();
      toast("success", kind === "pause" ? "Case paused" : kind === "resume" ? "Case resumed" : "A human officer has been asked to review this case");
    },
    onError: (e: Error) => toast("error", e.message),
  });
}
