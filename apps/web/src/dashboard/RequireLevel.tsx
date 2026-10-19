import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/session.js';
import { EmptyState, Loading } from '../components/ui.js';

const RANK: Record<string, number> = { PC_CHECKER: 1, CO_OWNER: 2, OWNER: 3 };

/** Route-level guard. The API enforces the same rules server-side. */
export function RequireLevel({
  level,
  children,
}: {
  level: 'PC_CHECKER' | 'CO_OWNER' | 'OWNER';
  children: ReactNode;
}) {
  const { session, loading } = useAuth();
  if (loading) return <Loading />;
  if (!session) {
    return (
      <EmptyState
        icon="shield"
        title="Sign in required"
        description="This page is limited to allowlisted staff accounts."
      />
    );
  }
  if (RANK[session.accessLevel] < RANK[level]) {
    return (
      <EmptyState
        icon="shield"
        title="Your access level cannot view this page"
        description={
          session.accessLevel === 'PC_CHECKER'
            ? 'PC Checker accounts can view PC-check cases only. Moderation history and identity data require Co-Owner access.'
            : 'This page requires Owner access.'
        }
        action={
          <Link className="btn btn-secondary btn-small" to="/dashboard">
            Back to overview
          </Link>
        }
      />
    );
  }
  return <>{children}</>;
}
