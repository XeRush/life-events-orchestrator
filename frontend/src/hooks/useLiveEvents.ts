import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { API } from "../services/api";
import { useAuth } from "../stores/auth";

/**
 * Subscribes to the backend's Server-Sent-Events stream. Every committed domain event
 * (TASK_COMPLETED, TASK_DELAYED, DOCUMENT_REQUIRED, CALLBACK_REQUIRED, WORKFLOW_REPLANNED, ...) invalidates
 * the cached server state, so the UI updates without a refresh. Polling in queries.ts is the safety net.
 */
export function useLiveEvents() {
  const qc = useQueryClient();
  const token = useAuth((s) => s.tokens?.access_token);
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<{ event_type: string; at: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!token) return;
    const source = new EventSource(`${API}/events/stream?access_token=${encodeURIComponent(token)}`);
    source.addEventListener("ready", () => setConnected(true));
    source.addEventListener("domain", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { event_type: string };
      setLastEvent({ event_type: data.event_type, at: Date.now() });
      window.clearTimeout(timer.current); // coalesce bursts (one action emits many events)
      timer.current = window.setTimeout(() => qc.invalidateQueries(), 250);
    });
    source.onerror = () => setConnected(false);
    return () => {
      source.close();
      window.clearTimeout(timer.current);
      setConnected(false);
    };
  }, [token, qc]);

  return { connected, lastEvent };
}
