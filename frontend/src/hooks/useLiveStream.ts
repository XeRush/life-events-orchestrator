import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { API } from "../api/client";
import { useAuth } from "../stores/auth";

export interface LiveEvent { event_type: string; case_id: string | null; node_key: string | null; source: string; at: number }

/**
 * Server-Sent Events: GET /cases/{ref}/events/stream (one case) or /events/stream (everything the caller can see).
 * Each committed domain event refreshes the cached server state, so the graph, timeline, status cards and
 * notifications update without a reload. Bursts are coalesced; TanStack Query polling is the safety net.
 */
export function useLiveStream(ref?: string | null) {
  const qc = useQueryClient();
  const token = useAuth((s) => s.tokens?.access_token);
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!token) return;
    const url = ref ? `${API}/cases/${ref}/events/stream` : `${API}/events/stream`;
    const source = new EventSource(`${url}?access_token=${encodeURIComponent(token)}`);
    source.addEventListener("ready", () => setConnected(true));
    source.addEventListener("case", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as Omit<LiveEvent, "at">;
      setEvents((prev) => [{ ...data, at: Date.now() }, ...prev].slice(0, 30));
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => qc.invalidateQueries(), 300);
    });
    source.onerror = () => setConnected(false);
    return () => {
      source.close();
      window.clearTimeout(timer.current);
      setConnected(false);
    };
  }, [token, ref, qc]);

  return { connected, events, last: events[0] ?? null };
}
