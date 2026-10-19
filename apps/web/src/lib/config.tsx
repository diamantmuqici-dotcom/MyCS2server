import { createContext, useContext, type ReactNode } from 'react';
import type { PublicConfigDto } from '@dardania/shared';
import { useApi } from './useApi.js';
import type { ApiError } from './api.js';

interface ConfigState {
  config: PublicConfigDto | null;
  loading: boolean;
  error: ApiError | null;
  reload: () => void;
}

const ConfigContext = createContext<ConfigState>({
  config: null,
  loading: true,
  error: null,
  reload: () => undefined,
});

export function ConfigProvider({ children }: { children: ReactNode }) {
  const { data, loading, error, reload } = useApi<PublicConfigDto>('/api/config');
  return (
    <ConfigContext.Provider value={{ config: data, loading, error, reload }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig(): ConfigState {
  return useContext(ConfigContext);
}
