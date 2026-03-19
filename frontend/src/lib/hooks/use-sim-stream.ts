"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface SimEvent {
  id?: number;
  sim_id?: string;
  event_type: string;
  agent_id?: string;
  agent_name?: string;
  agent_portrait?: string;
  data?: Record<string, any>;
  phase?: string;
  created_at?: string;
  type?: string; // heartbeat, error, stream_end
}

export function useSimStream(simId: string | null, enabled = true) {
  const [events, setEvents] = useState<SimEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [ended, setEnded] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  const clearEvents = useCallback(() => setEvents([]), []);

  useEffect(() => {
    if (!simId || !enabled) return;

    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001";
    const url = `${baseUrl}/api/sim/${simId}/stream`;
    const source = new EventSource(url);
    sourceRef.current = source;

    source.onopen = () => setConnected(true);

    source.onmessage = (e) => {
      try {
        const event: SimEvent = JSON.parse(e.data);
        if (event.type === "heartbeat") return;
        if (event.type === "stream_end") {
          setEnded(true);
          source.close();
          return;
        }
        if (event.type === "error") return;
        setEvents((prev) => [...prev.slice(-500), event]);
      } catch {
        // ignore parse errors
      }
    };

    source.onerror = () => {
      setConnected(false);
    };

    return () => {
      source.close();
      sourceRef.current = null;
      setConnected(false);
    };
  }, [simId, enabled]);

  return { events, connected, ended, clearEvents };
}
