import { useState } from 'react';
import type { AuditEventDto, Paginated } from '@dardania/shared';
import { useApi } from '../lib/useApi.js';
import { buildQuery } from '../lib/api.js';
import { EmptyState, ErrorPanel, Field, Loading, Pagination } from '../components/ui.js';
import { formatDateTime } from '../lib/format.js';
import { PageHeader, RefreshButton } from './ui.js';
import { RequireLevel } from './RequireLevel.js';

export function AuditLog() {
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [entityType, setEntityType] = useState('');
  const [applied, setApplied] = useState({ action: '', actor: '', entityType: '' });
  const [page, setPage] = useState(1);

  const path = `/api/dashboard/audit-log${buildQuery({
    action: applied.action || undefined,
    actorDiscordId: applied.actor || undefined,
    entityType: applied.entityType || undefined,
    page,
    pageSize: 40,
  })}`;
  const { data, loading, error, reload } = useApi<Paginated<AuditEventDto>>(path);

  return (
    <RequireLevel level="CO_OWNER">
      <div className="stack" style={{ gap: '1.4rem' }}>
        <PageHeader
          title="Audit trail"
          description="Every privileged change: logins, corrections, grants, settings and moderation ingest."
          actions={<RefreshButton onClick={reload} busy={loading} />}
        />

        <form
          className="card"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setApplied({ action: action.trim(), actor: actor.trim(), entityType: entityType.trim() });
          }}
        >
          <div className="filter-bar">
            <Field label="Action" htmlFor="audit-action" hint="e.g. case.corrected">
              <input
                id="audit-action"
                className="input mono"
                value={action}
                onChange={(event) => setAction(event.target.value)}
                placeholder="action prefix"
              />
            </Field>
            <Field label="Actor Discord ID" htmlFor="audit-actor">
              <input
                id="audit-actor"
                className="input mono"
                value={actor}
                onChange={(event) => setActor(event.target.value)}
                placeholder="123456789012345678"
              />
            </Field>
            <Field label="Entity type" htmlFor="audit-entity">
              <input
                id="audit-entity"
                className="input mono"
                value={entityType}
                onChange={(event) => setEntityType(event.target.value)}
                placeholder="moderation_case"
              />
            </Field>
            <button className="btn" type="submit">
              Filter
            </button>
          </div>
        </form>

        {loading && !data && <Loading label="Loading audit trail…" />}
        {error && <ErrorPanel error={error} onRetry={reload} />}

        {data && (
          <>
            {data.items.length === 0 ? (
              <EmptyState
                icon="file"
                title="No audit events match"
                description="Audit entries are append-only and cannot be deleted from the dashboard."
              />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Action</th>
                      <th>Actor</th>
                      <th>Entity</th>
                      <th>Summary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((entry) => (
                      <tr key={entry.id}>
                        <td className="small muted" style={{ whiteSpace: 'nowrap' }}>
                          {formatDateTime(entry.createdAt)}
                        </td>
                        <td className="mono small">{entry.action}</td>
                        <td>
                          <span className="mono small">{entry.actorDiscordId ?? 'system'}</span>
                          <span className="cell-sub">{entry.actorType}</span>
                        </td>
                        <td className="small">
                          {entry.entityType ?? '—'}
                          {entry.entityId && <span className="cell-sub mono">{entry.entityId}</span>}
                        </td>
                        <td className="small" style={{ maxWidth: 420 }}>
                          {entry.summary}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              onPage={setPage}
              label="audit events"
            />
          </>
        )}
      </div>
    </RequireLevel>
  );
}
