import type { StaffActivityRow } from '@dardania/shared';
import { useApi } from '../lib/useApi.js';
import { EmptyState, ErrorPanel, Loading } from '../components/ui.js';
import { formatDateTime, relativeTime } from '../lib/format.js';
import { PageHeader, RefreshButton } from './ui.js';
import { RequireLevel } from './RequireLevel.js';

export function Staff() {
  const { data, loading, error, reload } = useApi<{ items: StaffActivityRow[] }>(
    '/api/dashboard/staff',
  );

  return (
    <RequireLevel level="CO_OWNER">
      <div className="stack" style={{ gap: '1.4rem' }}>
        <PageHeader
          title="Staff activity"
          description="Actions grouped by moderator, derived only from attributed cases. Unattributed actions are excluded rather than guessed."
          actions={<RefreshButton onClick={reload} busy={loading} />}
        />
        {loading && !data && <Loading label="Loading staff activity…" />}
        {error && <ErrorPanel error={error} onRetry={reload} />}
        {data && (
          data.items.length === 0 ? (
            <EmptyState
              icon="users"
              title="No attributed actions yet"
              description="Staff activity appears once the bot has recorded actions with a moderator confirmed by the Discord audit log."
            />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Moderator</th>
                    <th>Total actions</th>
                    <th>Bans</th>
                    <th>Unbans</th>
                    <th>Warnings</th>
                    <th>PC checks assigned</th>
                    <th>PC checks closed</th>
                    <th>Last action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr key={row.moderatorDiscordId ?? 'unknown'}>
                      <td>
                        <span className="cell-strong">
                          {row.moderatorName ?? row.moderatorDiscordId ?? 'Unattributed'}
                        </span>
                        {row.moderatorDiscordId && (
                          <span className="cell-sub mono">{row.moderatorDiscordId}</span>
                        )}
                      </td>
                      <td>{row.totalActions}</td>
                      <td>{row.banActions}</td>
                      <td>{row.unbanActions}</td>
                      <td>{row.warningsIssued}</td>
                      <td>{row.pcChecksAssigned}</td>
                      <td>{row.pcChecksClosed}</td>
                      <td className="small muted">
                        {row.lastActionAt ? (
                          <>
                            {formatDateTime(row.lastActionAt)}
                            <span className="cell-sub">{relativeTime(row.lastActionAt)}</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </RequireLevel>
  );
}
