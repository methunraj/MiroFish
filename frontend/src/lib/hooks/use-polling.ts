"use client";
import { useEffect, useRef, useCallback, useState } from "react";

interface UsePollingOptions<T> {
  fetcher: () => Promise<T>;
  interval?: number;
  enabled?: boolean;
  onData?: (data: T) => void;
  onError?: (err: unknown) => void;
}

export function usePolling<T>({
  fetcher,
  interval = 3000,
  enabled = true,
  onData,
  onError,
}: UsePollingOptions<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mountedRef = useRef(true);
  const inflight = useRef(false);

  const poll = useCallback(async () => {
    if (!mountedRef.current || inflight.current) return;
    if (typeof document !== "undefined" && document.hidden) return;
    inflight.current = true;
    setLoading(true);
    try {
      const result = await fetcher();
      if (!mountedRef.current) return;
      setData(result);
      onData?.(result);
    } catch (err) {
      onError?.(err);
    } finally {
      inflight.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, [fetcher, onData, onError]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) return;
    poll();
    const safeInterval = Math.max(interval, 2000);
    timerRef.current = setInterval(poll, safeInterval);
    return () => {
      mountedRef.current = false;
      clearInterval(timerRef.current);
    };
  }, [poll, interval, enabled]);

  return { data, loading, refetch: poll };
}
