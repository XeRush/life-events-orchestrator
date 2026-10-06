import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { adminApi, agentApi, authApi, casesApi, demoApi, metaApi, officerApi } from "../api";
import { useLang } from "../i18n";
import { useAuth } from "../stores/auth";
import { useUI } from "../stores/ui";

const signedIn = () => !!useAuth.getState().tokens;

// --- resident / case -----------------------------------------------------------------------------------
export const useAuthConfig = () => useQuery({ queryKey: ["auth-config"], queryFn: authApi.config, staleTime: 60_000 });
export const useMe = () => useQuery({ queryKey: ["me"], queryFn: authApi.me, enabled: signedIn() });
export const useMyCases = () => useQuery({ queryKey: ["cases"], queryFn: () => casesApi.list({ limit: 50 }), enabled: signedIn() });
export const useCase = (ref?: string) => {
  const lang = useLang();
  return useQuery({ queryKey: ["case", ref, lang], queryFn: () => casesApi.get(ref!, lang), enabled: !!ref, refetchInterval: 30_000 });
};
export const useGraph = (ref?: string) => {
  const lang = useLang();
  return useQuery({ queryKey: ["graph", ref, lang], queryFn: () => casesApi.graph(ref!, lang), enabled: !!ref, refetchInterval: 30_000 });
};
export const useImpact = (ref?: string, key?: string) =>
  useQuery({ queryKey: ["impact", ref, key], queryFn: () => casesApi.impact(ref!, key as never), enabled: !!ref && !!key });
export const useTimeline = (ref?: string) => useQuery({ queryKey: ["timeline", ref], queryFn: () => casesApi.timeline(ref!), enabled: !!ref });
export const useDocuments = (ref?: string) => {
  const lang = useLang();
  return useQuery({ queryKey: ["documents", ref, lang], queryFn: () => casesApi.documents(ref!, lang), enabled: !!ref });
};
export const useConsents = (ref?: string) => useQuery({ queryKey: ["consents", ref], queryFn: () => casesApi.consents(ref!), enabled: !!ref });
export const useCaseCallbacks = (ref?: string) => useQuery({ queryKey: ["callbacks", ref], queryFn: () => casesApi.callbacks(ref!), enabled: !!ref });
export const useCaseCalls = (ref?: string) => useQuery({ queryKey: ["calls", ref], queryFn: () => casesApi.calls(ref!), enabled: !!ref });
export const useCaseRequests = (ref?: string) => useQuery({ queryKey: ["requests", ref], queryFn: () => casesApi.requests(ref!), enabled: !!ref });
export const useCaseEvents = (ref?: string) => useQuery({ queryKey: ["events", ref], queryFn: () => casesApi.events(ref!), enabled: !!ref });
export const useVerification = (ref?: string) => useQuery({ queryKey: ["verification", ref], queryFn: () => casesApi.verification(ref!), enabled: !!ref });
export const useNotifications = () => useQuery({ queryKey: ["notifications"], queryFn: () => metaApi.notifications(), enabled: signedIn(), refetchInterval: 20_000 });
export const useAgentConfig = () => useQuery({ queryKey: ["agent-config"], queryFn: agentApi.config, enabled: signedIn(), staleTime: 30_000 });
export const useMyCalls = () => useQuery({ queryKey: ["my-calls"], queryFn: agentApi.calls, enabled: signedIn() });
export const useRinging = (enabled: boolean) =>
  useQuery({ queryKey: ["ringing"], queryFn: agentApi.ringing, enabled: enabled && signedIn(), refetchInterval: 4000 });
export const useKnowledge = () => useQuery({ queryKey: ["knowledge"], queryFn: metaApi.knowledge, enabled: signedIn(), staleTime: 300_000 });
export const useEntities = () => useQuery({ queryKey: ["entities"], queryFn: metaApi.entities, enabled: signedIn(), staleTime: 30_000 });
export const useReady = () => useQuery({ queryKey: ["ready"], queryFn: metaApi.ready, refetchInterval: 10_000 });

// --- officer / admin / demo -----------------------------------------------------------------------------
export const useOfficerStats = () => useQuery({ queryKey: ["officer", "stats"], queryFn: officerApi.stats, refetchInterval: 15_000 });
export const useOfficerCases = (queue: string, q?: string) =>
  useQuery({ queryKey: ["officer", "cases", queue, q], queryFn: () => officerApi.cases({ queue, q, limit: 100 }) });
export const useOfficerCase = (ref?: string) => useQuery({ queryKey: ["officer", "case", ref], queryFn: () => officerApi.case(ref!), enabled: !!ref });
export const useApprovals = () => useQuery({ queryKey: ["officer", "approvals"], queryFn: officerApi.approvals });
export const useEscalations = (includeResolved = false) =>
  useQuery({ queryKey: ["officer", "escalations", includeResolved], queryFn: () => officerApi.escalations(includeResolved) });
export const useOfficerCallbacks = () => useQuery({ queryKey: ["officer", "callbacks"], queryFn: officerApi.callbacks });
export const useAudit = (params: { case?: string; action?: string; actor_type?: string; limit?: number; offset?: number }) =>
  useQuery({ queryKey: ["officer", "audit", params], queryFn: () => officerApi.audit(params) });
export const useAnalytics = () => useQuery({ queryKey: ["officer", "analytics"], queryFn: officerApi.analytics });
export const useOfficers = () => useQuery({ queryKey: ["officers"], queryFn: officerApi.officers, staleTime: 60_000 });
export const useUsers = (params: { role?: string; q?: string }) => useQuery({ queryKey: ["users", params], queryFn: () => adminApi.users({ ...params, limit: 100 }) });
export const useOrganizations = () => useQuery({ queryKey: ["organizations"], queryFn: adminApi.organizations, staleTime: 60_000 });
export const useDemoStatus = () => useQuery({ queryKey: ["demo"], queryFn: demoApi.status, refetchInterval: 4000 });

/**
 * Mutation helper: runs an API action, toasts success/failure, and refreshes server state.
 * By default every query is invalidated - SSE also triggers refreshes, so the UI converges either way.
 */
export function useAction<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>, opts: { success?: string | ((r: TResult) => string); invalidate?: QueryKey[] } = {}) {
  const qc = useQueryClient();
  const toast = useUI((s) => s.toast);
  return useMutation({
    mutationFn: fn,
    onSuccess: (result) => {
      const msg = typeof opts.success === "function" ? opts.success(result) : opts.success;
      if (msg) toast("success", msg);
      if (opts.invalidate) opts.invalidate.forEach((key) => qc.invalidateQueries({ queryKey: key }));
      else qc.invalidateQueries();
    },
    onError: (e: Error) => toast("error", e.message),
  });
}
