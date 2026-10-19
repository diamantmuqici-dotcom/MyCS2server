import { Link } from 'react-router-dom';
import type { OverviewDto } from '@dardania/shared';
import { useApi } from '../lib/useApi.js';
import { formatDateTime, relativeTime } from '../lib/format.js';
import { ApiError } from '../lib/api.js';
import { Alert, EmptyState, ErrorPanel, Loading, StatCard } from '../components/ui.js';
import { PageHeader, RefreshButton, CaseStatusBadge } from './ui.js';
import { useAuth } from '../lib/session.js';
import { Icon } from '../components/Icon.js';

const HEALTH_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  operational: 'success',
  degraded: 'warning',
  outage: 'danger',
  unknown: 'neutral',
};

export function Overview() {
  const { session } = useAuth();
  const { data, loading, error, reload } = useApi<OverviewDto>('/api/dashboard/overview');

  return (
    <div className="stack" style={{ gap: '1.4rem' }}>
      <PageHeader
        title="Overview"
        description={
          <>
            Signed in as <strong>{session?.username}</strong> ·{' '}
            {session?.accessLevel.replace('_', '-')} access · guild{' '}
            <span className="mono">{session?.guildId || 'not configured'}</span>
          </>
        }
        actions={<RefreshButton onClick={reload} busy={loading} />}
      />

      {loading && !data && <Loading label="Loading moderation overview…" />}
      {error && <ErrorPanel error={error} onRetry={reload} />}

      {data && (
        <>
          {data.demoData && (
            <Alert tone="warning">
              <Icon name="alert" size={16} />
              <span>
                Demo seed data is present in this database (records with source{' '}
                <span className="mono">DEMO_SEED</span>). Numbers below include those records — do
                not present them as real moderation activity.
              </span>
            </Alert>
          )}

          <div className="grid grid-4">
            <StatCard label="Total cases" value={data.totals.cases} hint="All recorded actions" />
            <StatCard
              label="Active bans"
              value={data.totals.activeBans}
              tone={data.totals.activeBans > 0 ? 'danger' : undefined}
              hint={`${data.totals.banActions} ban actions recorded`}
            />
            <StatCard label="Unbans" value={data.totals.unbans} hint="Original bans retained" />
            <StatCard
              label="Unknown ban status"
              value={data.totals.unknownBanStatus}
              tone={data.totals.unknownBanStatus > 0 ? 'warning' : undefined}
              hint="Audit log could not confirm"
            />
            <StatCard label="Warnings" value={data.totals.warnings} hint="Warning records" />
            <StatCard
              label="Open PC checks"
              value={data.pcChecks.open}
              hint="Requested or in progress"
            />
            <StatCard label="PC checks completed" value={data.pcChecks.completed} />
            <StatCard
              label="Announcements"
              value={data.announcements.published}
              hint={`${data.announcements.drafts} draft${data.announcements.drafts === 1 ? '' : 's'}`}
            />
          </div>

          <div className="detail-grid">
            <section className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Recent cases</div>
                  <div className="card-subtitle">
                    Newest records first — identities are historical snapshots.
                  </div>
                </div>
                <Link className="btn btn-ghost btn-small" to="/dashboard/cases">
                  All cases <Icon name="chevronRight" size={14} />
                </Link>
              </div>
              {data.recentCases.length === 0 ? (
                <EmptyState
                  icon="audit"
                  title="No moderation cases recorded"
                  description="Cases appear here as soon as the bot records an action or the audit log is reconciled."
                />
              ) : (
                <div className="table-wrap">
                  <table className="data" style={{ minWidth: 560 }}>
                    <thead>
                      <tr>
                        <th>Case</th>
                        <th>Target</th>
                        <th>Action</th>
                        <th>Occurred</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentCases.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <Link className="mono" to={`/dashboard/cases/${item.caseRef}`}>
                              {item.caseRef}
                            </Link>
                          </td>
                          <td>
                            <span className="cell-strong">
                              {item.target.usernameAtEvent ?? item.target.discordUserId}
                            </span>
                            <span className="cell-sub mono">{item.target.discordUserId}</span>
                          </td>
                          <td>
                            <div className="row" style={{ gap: '0.35rem' }}>
                              <span className="badge badge-blue">{item.actionType}</span>
                              <CaseStatusBadge status={item.status} />
                            </div>
                          </td>
                          <td className="small muted">{relativeTime(item.occurredAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <div className="stack">
              <section className="card">
                <div className="card-header">
                  <div className="card-title">Service health</div>
                  <Link className="btn btn-ghost btn-small" to="/dashboard/system">
                    Details
                  </Link>
                </div>
                <div>
                  {data.health.map((service) => (
                    <div className="status-row" key={service.service}>
                      <div>
                        <div className="cell-strong" style={{ textTransform: 'capitalize' }}>
                          {service.service}
                        </div>
                        <span className="cell-sub">{service.detail}</span>
                      </div>
                      <span className={`badge badge-${HEALTH_TONE[service.status] ?? 'neutral'}`}>
                        {service.status}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="card">
                <div className="card-header">
                  <div className="card-title">Top moderators</div>
                  <Link className="btn btn-ghost btn-small" to="/dashboard/staff">
                    All staff
                  </Link>
                </div>
                {data.topModerators.length === 0 ? (
                  <p className="small muted">
                    No attributed moderation actions yet. Unattributed actions are reported in the
                    cases list instead of being assigned to staff.
                  </p>
                ) : (
                  <div className="stack" style={{ gap: '0.6rem' }}>
                    {data.topModerators.map((row) => (
                      <div className="row-between small" key={row.moderatorDiscordId ?? 'unknown'}>
                        <span>{row.moderatorName ?? row.moderatorDiscordId ?? 'Unattributed'}</span>
                        <span className="muted">
                          {row.banActions} bans · {row.totalActions} actions
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>

          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Historical coverage</div>
                <div className="card-subtitle">What this database can and cannot prove.</div>
              </div>
              <span className="badge badge-warning">
                <Icon name="warning" size={12} /> Read me
              </span>
            </div>
            <p className="small muted">{data.coverage.note}</p>
            {data.coverage.earliestRecordedAt && (
              <p className="small muted" style={{ marginTop: '0.5rem' }}>
                Earliest recorded action: {formatDateTime(data.coverage.earliestRecordedAt)}
              </p>
            )}
            <p className="small muted" style={{ marginTop: '0.5rem' }}>
              Cases whose moderator could not be confirmed by the Discord audit log are marked
              "unattributed" — the dashboard never guesses an identity.
            </p>
          </section>
        </>
      )}

      {error instanceof ApiError && error.status === 403 && (
        <Alert tone="warning">
          Your access level cannot read moderation history. PC Checker accounts are scoped to
          PC-check cases.
        </Alert>
      )}
    </div>
  );
}
