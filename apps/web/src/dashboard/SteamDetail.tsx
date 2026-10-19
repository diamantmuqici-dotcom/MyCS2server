import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { SteamAccountDto } from '@dardania/shared';
import { useApi } from '../lib/useApi.js';
import { useMutation } from '../lib/session.js';
import { ApiError } from '../lib/api.js';
import { Alert, Button, EmptyState, ErrorPanel, Field, Loading } from '../components/ui.js';
import { formatDateTime, relativeTime } from '../lib/format.js';
import { PageHeader } from './ui.js';
import { Icon } from '../components/Icon.js';
import { RequireLevel } from './RequireLevel.js';

export function SteamDetail() {
  const { steamId64 = '' } = useParams();
  const { data, loading, error, reload } = useApi<{ account: SteamAccountDto }>(
    steamId64 ? `/api/dashboard/steam/${encodeURIComponent(steamId64)}` : null,
  );
  const mutate = useMutation();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [discordUserId, setDiscordUserId] = useState('');
  const [verification, setVerification] = useState<'VERIFIED' | 'UNVERIFIED'>('UNVERIFIED');

  const refresh = async () => {
    setBusy(true);
    setFeedback(null);
    setFailure(null);
    try {
      const result = await mutate<{
        status: string;
        error: string | null;
        displayName: string | null;
      }>(`/api/dashboard/steam/${encodeURIComponent(steamId64)}/refresh`, { method: 'POST' });
      setFeedback(
        result.status === 'OK'
          ? `Steam profile refreshed. Current name: ${result.displayName ?? 'private / unavailable'}.`
          : `Steam did not return a usable profile (${result.status}). ${result.error ?? ''} Historical names were not modified.`,
      );
      reload();
    } catch (caught) {
      setFailure(caught instanceof ApiError ? caught.message : 'The refresh request failed.');
    } finally {
      setBusy(false);
    }
  };

  const link = async () => {
    setBusy(true);
    setFeedback(null);
    setFailure(null);
    try {
      await mutate(`/api/dashboard/steam/link`, {
        method: 'POST',
        body: { steamId64, discordUserId: discordUserId.trim(), verification },
      });
      setFeedback(
        'Steam account linked to the Discord user. The link is recorded in the audit trail.',
      );
      setDiscordUserId('');
      reload();
    } catch (caught) {
      setFailure(caught instanceof ApiError ? caught.message : 'The link request failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <RequireLevel level="CO_OWNER">
      <div className="stack" style={{ gap: '1.4rem' }}>
        <Link to="/dashboard/steam" className="small" style={{ fontWeight: 700 }}>
          ← Steam identity
        </Link>
        {loading && !data && <Loading label="Loading Steam account…" />}
        {error &&
          (error.status === 404 ? (
            <EmptyState
              icon="steam"
              title="Account not observed"
              description="This SteamID64 has not been recorded by the bot or the dashboard yet."
            />
          ) : (
            <ErrorPanel error={error} onRetry={reload} />
          ))}

        {data && (
          <>
            <PageHeader
              title="Steam account"
              description={<span className="mono">{data.account.steamId64}</span>}
              actions={
                <div className="row">
                  <a
                    className="btn btn-secondary btn-small"
                    href={data.account.profileUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <Icon name="external" size={14} /> Steam profile
                  </a>
                  <Button size="small" onClick={() => void refresh()} disabled={busy}>
                    <Icon name="refresh" size={14} />{' '}
                    {busy ? 'Working…' : 'Refresh current profile'}
                  </Button>
                </div>
              }
            />

            {feedback && <Alert tone="success">{feedback}</Alert>}
            {failure && <Alert tone="danger">{failure}</Alert>}

            <div className="detail-grid">
              <section className="card">
                <div className="card-header">
                  <div className="card-title">Current state</div>
                  <span className="badge badge-warning">Separately refreshed</span>
                </div>
                <dl className="kv">
                  <dt>Current display name</dt>
                  <dd>{data.account.currentDisplayName ?? 'Unavailable'}</dd>
                  <dt>Profile status</dt>
                  <dd>{data.account.profileStatus}</dd>
                  <dt>First seen</dt>
                  <dd>{formatDateTime(data.account.firstSeenAt)}</dd>
                  <dt>Last checked</dt>
                  <dd>
                    {data.account.lastCheckedAt
                      ? `${formatDateTime(data.account.lastCheckedAt)} (${relativeTime(data.account.lastCheckedAt)})`
                      : 'Never'}
                  </dd>
                  <dt>Refresh failures</dt>
                  <dd>{data.account.refreshFailures}</dd>
                  {data.account.lastRefreshError && (
                    <>
                      <dt>Last error</dt>
                      <dd className="small text-danger">{data.account.lastRefreshError}</dd>
                    </>
                  )}
                  <dt>Linked Discord IDs</dt>
                  <dd className="mono small">
                    {data.account.linkedDiscordUserIds.length
                      ? data.account.linkedDiscordUserIds.join(', ')
                      : 'Not linked'}
                  </dd>
                  <dt>Moderation cases</dt>
                  <dd>{data.account.moderationCaseCount}</dd>
                </dl>
              </section>

              <section className="card">
                <div className="card-header">
                  <div className="card-title">Link a Discord user</div>
                </div>
                <div className="stack">
                  <Field
                    label="Discord user ID"
                    htmlFor="link-discord"
                    hint="Must be a 17–20 digit snowflake."
                  >
                    <input
                      id="link-discord"
                      className="input mono"
                      value={discordUserId}
                      onChange={(event) => setDiscordUserId(event.target.value)}
                      placeholder="123456789012345678"
                    />
                  </Field>
                  <Field label="Verification" htmlFor="link-verification">
                    <select
                      id="link-verification"
                      className="select"
                      value={verification}
                      onChange={(event) =>
                        setVerification(event.target.value as 'VERIFIED' | 'UNVERIFIED')
                      }
                    >
                      <option value="UNVERIFIED">Unverified — reported by staff/member</option>
                      <option value="VERIFIED">Verified — identity confirmed</option>
                    </select>
                  </Field>
                  <Button
                    onClick={() => void link()}
                    disabled={busy || !/^\d{17,20}$/.test(discordUserId.trim())}
                  >
                    Link account
                  </Button>
                  <p className="field-hint">
                    Linking does not rewrite past cases. A case keeps the Steam snapshot it was
                    created with.
                  </p>
                </div>
              </section>
            </div>

            <section className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Name history</div>
                  <div className="card-subtitle">
                    Each row is an observation window. Nothing is overwritten or deleted.
                  </div>
                </div>
              </div>
              {data.account.nameHistory.length === 0 ? (
                <p className="small muted">
                  No names observed yet. Refresh the profile to start tracking.
                </p>
              ) : (
                <div className="table-wrap">
                  <table className="data" style={{ minWidth: 640 }}>
                    <thead>
                      <tr>
                        <th>Display name</th>
                        <th>Previous name</th>
                        <th>First observed</th>
                        <th>Last observed</th>
                        <th>Source</th>
                        <th>Verification</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.account.nameHistory.map((row) => (
                        <tr key={row.id}>
                          <td className="cell-strong">{row.displayName}</td>
                          <td className="muted small">{row.previousDisplayName ?? '—'}</td>
                          <td className="small">{formatDateTime(row.firstObservedAt)}</td>
                          <td className="small">
                            {row.lastObservedAt ? formatDateTime(row.lastObservedAt) : 'Current'}
                          </td>
                          <td className="small mono">{row.source}</td>
                          <td>
                            <span
                              className={`badge badge-${row.verification === 'VERIFIED' ? 'success' : 'neutral'}`}
                            >
                              {row.verification}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </RequireLevel>
  );
}
