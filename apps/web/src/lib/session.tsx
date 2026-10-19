import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { SessionUserDto } from '@dardania/shared';
import { apiFetch, ApiError } from './api.js';

interface AuthState {
  session: SessionUserDto | null;
  loading: boolean;
  error: ApiError | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  session: null,
  loading: true,
  error: null,
  refresh: async () => undefined,
  logout: async () => undefined,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionUserDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch<{ sessionUser: SessionUserDto }>('/api/auth/me');
      setSession(result.sessionUser);
      setError(null);
    } catch (caught) {
      const apiError =
        caught instanceof ApiError
          ? caught
          : new ApiError('Could not verify the dashboard session.', 0);
      // 401 simply means "not signed in" — it is not an application error.
      setSession(null);
      setError(apiError.status === 401 || apiError.status === 403 ? null : apiError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await apiFetch<void>('/api/auth/logout', {
        method: 'POST',
        csrfToken: session?.csrfToken,
      });
    } catch {
      /* Clearing local state is still correct if the request fails. */
    }
    setSession(null);
  }, [session?.csrfToken]);

  return (
    <AuthContext.Provider value={{ session, loading, error, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

/** Returns a CSRF-aware mutation helper bound to the current session. */
export function useMutation(): <T>(
  path: string,
  options: { method?: 'POST' | 'PATCH' | 'DELETE'; body?: unknown },
) => Promise<T> {
  const { session, refresh } = useAuth();
  return useCallback(
    async <T,>(
      path: string,
      options: { method?: 'POST' | 'PATCH' | 'DELETE'; body?: unknown },
    ): Promise<T> => {
      try {
        return await apiFetch<T>(path, {
          method: options.method ?? 'POST',
          body: options.body,
          csrfToken: session?.csrfToken,
        });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await refresh();
        }
        throw error;
      }
    },
    [session?.csrfToken, refresh],
  );
}
