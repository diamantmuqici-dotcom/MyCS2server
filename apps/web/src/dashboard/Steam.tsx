import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Paginated, SteamAccountDto } from '@dardania/shared';
import { useApi } from '../lib/useApi.js';
import { buildQuery } from '../lib/api.js';
import { EmptyState, ErrorPanel, Field, Loading, Pagination } from '../components/ui.js';
import { formatDateTime, relativeTime } from '../lib/format.js';
import { PageHeader, RefreshButton } from './ui.js';
import { RequireLevel } from './RequireLevel.js';

export function SteamPage() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const path = `/api/dashboard/steam${buildQuery({ q: query || undefined, page, pageSize: 25 })}`;
  const { data, loading, error, reload } = useApi<Paginated<SteamAccountDto>>(path);

  return (
    <RequireLevel level="CO_OWNER">
      <div className="stack" style={{ gap: '1.4rem' }}>
        <PageHeader
          title="Steam identity"
          description="Steam accounts are keyed by SteamID64. Display names are observations with a first-seen timestamp, never identifiers."
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
              label="Search Steam accounts"
              htmlFor="steam-search"
              hint="SteamID64, current or historical name, or linked Discord ID"
            >
              <input
                id="steam-search"
                className="input"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="7656119… or a player name"
              />
            </Field>
            <button className="btn" type="submit">
              Search
            </button>
          </div>
        </form>

        {loading && !data && <Loading label="Loading Steam accounts…" />}
        {error && <ErrorPanel error={error} onRetry={reload} />}

        {data && (
          <>
            {data.items.length === 0 ? (
              <EmptyState
                icon="steam"
                title={query ? 'No Steam account matches that search' : 'No Steam accounts tracked yet'}
                description="Accounts are created when the bot resolves a Steam profile during a moderation action, PC check or /steam link."
              />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Steam account</th>
                      <th>Current name</th>
                      <th>Profile</th>
                      <th>Linked Discord</th>
                      <th>Moderation cases</th>
                      <th>Last checked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((account) => (
                      <tr key={account.steamId64}>
                        <td>
                          <Link
                            className="mono cell-strong"
                            to={`/dashboard/steam/${account.steamId64}`}
                          >
                            {account.steamId64}
                          </Link>
                          <span className="cell-sub">{account.nameHistory.length} name observations</span>
                        </td>
                        <td>{account.currentDisplayName ?? 'Unavailable'}</td>
                        <td>
                          <span className={`badge badge-${account.profileStatus === 'PUBLIC' ? 'success' : account.profileStatus === 'PRIVATE' ? 'warning' : 'neutral'}`}>
                            {account.profileStatus}
                          </span>
                        </td>
                        <td className="small mono">
                          {account.linkedDiscordUserIds.length > 0
                            ? account.linkedDiscordUserIds.join(', ')
                            : 'Not linked'}
                        </td>
                        <td>{account.moderationCaseCount}</td>
                        <td className="small muted">
                          {account.lastCheckedAt ? relativeTime(account.lastCheckedAt) : 'Never'}
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
              label="Steam accounts"
            />
          </>
        )}

        <div className="note">
          <strong>Why names are separate from identity:</strong> a Steam display name can be changed at
          any time, so writing the latest name back into an old case would falsify the record. The
          dashboard shows the event snapshot and the current observation side by side, and keeps a
          timestamped name history instead of overwriting anything.
        </div>
        {data && data.items.length > 0 && (
          <p className="small muted">
            Oldest visible observation: {formatDateTime(data.items[data.items.length - 1]?.firstSeenAt)}
          </p>
        )}
      </div>
    </RequireLevel>
  );
}
