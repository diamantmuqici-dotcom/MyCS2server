import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ModerationCaseDto, Paginated } from '@dardania/shared';
import { useApi } from '../lib/useApi.js';
import { buildQuery } from '../lib/api.js';
import { EmptyState, ErrorPanel, Field, Loading, Pagination } from '../components/ui.js';
import { formatDateTime, relativeTime } from '../lib/format.js';
import { AttributionBadge, EmptyRow, PageHeader, RefreshButton } from './ui.js';
import { RequireLevel } from './RequireLevel.js';

export function Bans() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const path = `/api/dashboard/bans/active${buildQuery({ q: query || undefined, page, pageSize: 25 })}`;
  const { data, loading, error, reload } = useApi<Paginated<ModerationCaseDto>>(path);

  return (
    <RequireLevel level="CO_OWNER">
      <div className="stack" style={{ gap: '1.4rem' }}>
        <PageHeader
          title="Active bans"
          description="Bans whose ban status is currently ACTIVE. Lifting a ban keeps the original record and adds an unban."
          actions={<RefreshButton onClick={reload} busy={loading} />}
        />

        <form
          className="card"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setQuery(search.trim());
          }}
        >
          <div className="filter-bar">
            <Field
              label="Search active bans"
              htmlFor="ban-search"
              hint="Username, Discord ID or reason"
            >
              <input
                id="ban-search"
                className="input"
                type="search"
                value={search}
                placeholder="Search…"
                onChange={(event) => setSearch(event.target.value)}
              />
            </Field>
            <button className="btn" type="submit">
              Search
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setSearch('');
                setQuery('');
                setPage(1);
              }}
            >
              Clear
            </button>
          </div>
        </form>

        {loading && !data && <Loading label="Loading active bans…" />}
        {error && <ErrorPanel error={error} onRetry={reload} />}

        {data && (
          <>
            {data.items.length === 0 ? (
              <EmptyState
                icon="check"
                title="No active bans"
                description="There are no cases with an ACTIVE ban status right now. A lifted ban stays in the case history with status LIFTED."
              />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Case</th>
                      <th>Banned member</th>
                      <th>Reason</th>
                      <th>Moderator</th>
                      <th>Banned</th>
                      <th>Expires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <Link
                            className="mono cell-strong"
                            to={`/dashboard/cases/${item.caseRef}`}
                          >
                            {item.caseRef}
                          </Link>
                        </td>
                        <td>
                          <span className="cell-strong">
                            {item.target.usernameAtEvent ?? 'Unknown'}
                          </span>
                          <span className="cell-sub mono">{item.target.discordUserId}</span>
                        </td>
                        <td style={{ maxWidth: 320 }} className="small">
                          {item.reason ?? '—'}
                        </td>
                        <td>
                          {item.moderator.nameAtEvent ?? 'Unconfirmed'}
                          <span className="cell-sub">
                            <AttributionBadge status={item.attributionStatus} />
                          </span>
                        </td>
                        <td className="small muted">{formatDateTime(item.occurredAt)}</td>
                        <td className="small muted">
                          {item.expiresAt ? relativeTime(item.expiresAt) : 'Permanent'}
                        </td>
                      </tr>
                    ))}
                    {data.items.length === 0 && <EmptyRow colSpan={6}>No records</EmptyRow>}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              onPage={setPage}
              label="active bans"
            />
          </>
        )}
      </div>
    </RequireLevel>
  );
}
