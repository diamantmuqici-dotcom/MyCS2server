import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PC_CHECK_STATUSES,
  type Paginated,
  type PcCheckDto,
  type PcCheckStatus,
} from '@dardania/shared';
import { useApi } from '../lib/useApi.js';
import { buildQuery } from '../lib/api.js';
import { EmptyState, ErrorPanel, Field, Loading, Pagination } from '../components/ui.js';
import { formatDateTime, relativeTime } from '../lib/format.js';
import { PageHeader, PcStatusBadge, RefreshButton } from './ui.js';
import { useAuth } from '../lib/session.js';
import { RequireLevel } from './RequireLevel.js';

export function PcChecks() {
  const { session } = useAuth();
  const [status, setStatus] = useState<PcCheckStatus | ''>('');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [page, setPage] = useState(1);
  const path = `/api/dashboard/pc-checks${buildQuery({
    status: status || undefined,
    q: applied || undefined,
    page,
    pageSize: 25,
  })}`;
  const { data, loading, error, reload } = useApi<Paginated<PcCheckDto>>(path);

  return (
    <RequireLevel level="PC_CHECKER">
      <div className="stack" style={{ gap: '1.4rem' }}>
        <PageHeader
          title="PC checks"
          description="Numbered PC-check cases with reasons, assignments and audit-logged staff notes."
          actions={<RefreshButton onClick={reload} busy={loading} />}
        />

        {session?.accessLevel === 'PC_CHECKER' && (
          <div className="note">
            You have scoped PC Checker access. Owner-only notes and moderation history are not
            visible for this account.
          </div>
        )}

        <form
          className="card"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setApplied(search.trim());
          }}
        >
          <div className="filter-bar">
            <Field label="Status" htmlFor="pc-status">
              <select
                id="pc-status"
                className="select"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as PcCheckStatus | '');
                  setPage(1);
                }}
              >
                <option value="">All statuses</option>
                {PC_CHECK_STATUSES.map((item) => (
                  <option key={item} value={item}>
                    {item.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Search" htmlFor="pc-q" hint="Case ref, Discord ID or reason">
              <input
                id="pc-q"
                className="input"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="PC-000123"
              />
            </Field>
            <button className="btn" type="submit">
              Apply
            </button>
          </div>
        </form>

        {loading && !data && <Loading label="Loading PC checks…" />}
        {error && <ErrorPanel error={error} onRetry={reload} />}

        {data && (
          <>
            {data.items.length === 0 ? (
              <EmptyState
                icon="pc"
                title="No PC-check cases match"
                description="PC checks are created from Discord with /pc-check request, then managed here and in Discord."
              />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Case</th>
                      <th>Target</th>
                      <th>Status</th>
                      <th>Outcome</th>
                      <th>Assigned to</th>
                      <th>Steam name at event</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <Link
                            className="mono cell-strong"
                            to={`/dashboard/pc-checks/${item.caseRef}`}
                          >
                            {item.caseRef}
                          </Link>
                        </td>
                        <td>
                          <span className="mono small">{item.targetDiscordUserId}</span>
                        </td>
                        <td>
                          <PcStatusBadge status={item.status} />
                        </td>
                        <td>
                          {item.outcome ? (
                            <span
                              className={`badge badge-${item.outcome === 'CLEAN' ? 'success' : item.outcome === 'CHEATING_CONFIRMED' ? 'danger' : 'warning'}`}
                            >
                              {item.outcome.replace('_', ' ')}
                            </span>
                          ) : (
                            <span className="muted small">—</span>
                          )}
                        </td>
                        <td className="mono small">{item.assignedTo ?? 'Unassigned'}</td>
                        <td className="small">{item.steamNameAtEvent ?? 'Not recorded'}</td>
                        <td className="small muted">
                          {formatDateTime(item.createdAt)}
                          <span className="cell-sub">{relativeTime(item.createdAt)}</span>
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
              label="PC checks"
            />
          </>
        )}
      </div>
    </RequireLevel>
  );
}
