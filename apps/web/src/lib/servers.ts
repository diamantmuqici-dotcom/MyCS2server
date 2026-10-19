import type { PublicServerStateDto } from '@dardania/shared';
import { useApi } from './useApi.js';

export type ServerState = PublicServerStateDto;

export interface ServersResponse {
  servers: PublicServerStateDto[];
  checkedAt: string;
}

export function useServers(): {
  data: ServersResponse | null;
  loading: boolean;
  error: unknown;
  reload: () => void;
} {
  const { data, loading, error, reload } = useApi<ServersResponse>('/api/servers');
  return { data, loading, error, reload };
}
