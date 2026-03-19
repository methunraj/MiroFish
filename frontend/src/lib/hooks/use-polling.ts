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
  interval = 2000,
  enabled = true,
  onData,
  onError,
}: UsePollingOptions<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mountedRef = useRef(true);

  const poll = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoading(true);
    try {
      const result = await fetcher();
      if (!mountedRef.current) return;
      setData(result);
      onData?.(result);
    } catch (err) {
      onError?.(err);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [fetcher, onData, onError]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) return;
    poll();
    timerRef.current = setInterval(poll, interval);
    return () => {
      mountedRef.current = false;
      clearInterval(timerRef.current);
    };
  }, [poll, interval, enabled]);

  return { data, loading, refetch: poll };
}
