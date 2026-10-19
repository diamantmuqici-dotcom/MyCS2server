import { useMutation, useAuth } from './session.js';

/** Re-export so PC-check pages can share the CSRF-aware mutation helper. */
export { useMutation };

export function useSessionLevel(): string | null {
  const { session } = useAuth();
  return session?.accessLevel ?? null;
}
