import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from './api.js';

export interface ApiState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
}

/** Small data hook: refetches when the path changes and exposes a reload trigger. */
export function useApi<T>(path: string | null): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(path));
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!path) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    apiFetch<T>(path, { signal: controller.signal })
      .then((result) => {
        if (!active) return;
        setData(result);
        setLoading(false);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        if ((caught as Error).name === 'AbortError') return;
        setError(
          caught instanceof ApiError
            ? caught
            : new ApiError('Unexpected error while loading data.', 0),
        );
        setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [path, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  return { data, error, loading, reload };
}
