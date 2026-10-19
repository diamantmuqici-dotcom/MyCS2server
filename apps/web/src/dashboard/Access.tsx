import { useState } from 'react';
import type { AccessLevel, DashboardAccessDto } from '@dardania/shared';
import { useApi } from '../lib/useApi.js';
import { useMutation } from '../lib/session.js';
import { buildQuery, ApiError } from '../lib/api.js';
import { Alert, Button, EmptyState, ErrorPanel, Field, Loading } from '../components/ui.js';
import { formatDateTime } from '../lib/format.js';
import { PageHeader, RefreshButton } from './ui.js';
import { RequireLevel } from './RequireLevel.js';
import { ConfirmButton } from '../components/ui.js';

export function Access() {
  const [history, setHistory] = useState(false);
  const { data, loading, error, reload } = useApi<{ items: DashboardAccessDto[] }>(
    `/api/dashboard/access${buildQuery({ history: history ? '1' : '0' })}`,
  );
  const mutate = useMutation();
  const [userId, setUserId] = useState('');
  const [level, setLevel] = useState<AccessLevel>('PC_CHECKER');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const grant = async () => {
    setBusy(true);
    setFeedback(null);
    setFailure(null);
    try {
      await mutate('/api/dashboard/access', {
        method: 'POST',
        body: { userId: userId.trim(), level, note: note.trim() || null },
      });
      setFeedback(`${level.replace('_', '-')} access granted to ${userId.trim()}.`);
      setUserId('');
      setNote('');
      reload();
    } catch (caught) {
      setFailure(caught instanceof ApiError ? caught.message : 'The grant failed.');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (entry: DashboardAccessDto) => {
    setFeedback(null);
    setFailure(null);
    try {
      await mutate(`/api/dashboard/access/${encodeURIComponent(entry.userDiscordId)}`, {
        method: 'DELETE',
      });
      setFeedback(`Access revoked for ${entry.userDiscordId}.`);
      reload();
    } catch (caught) {
      setFailure(caught instanceof ApiError ? caught.message : 'The revoke failed.');
    }
  };

  return (
    <RequireLevel level="OWNER">
      <div className="stack" style={{ gap: '1.4rem' }}>
        <PageHeader
          title="Access control"
          description="Owner-only. Environment allowlists (DASHBOARD_OWNER_DISCORD_IDS, DASHBOARD_CO_OWNER_DISCORD_IDS) always apply and cannot be removed here."
          actions={<RefreshButton onClick={reload} busy={loading} />}
        />

        <div className="note note-owner">
          <strong>Discord roles never grant dashboard access.</strong> Only explicit Discord user IDs —
          from the environment allowlist or the grants below — can sign in and read moderation history.
        </div>

        {feedback && <Alert tone="success">{feedback}</Alert>}
        {failure && <Alert tone="danger">{failure}</Alert>}

        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Grant access</div>
              <div className="card-subtitle">
                PC_CHECKER: PC checks only · CO_OWNER: full history · OWNER: everything, including this page.
              </div>
            </div>
          </div>
          <div className="form-grid">
            <Field label="Discord user ID" htmlFor="grant-user" hint="17–20 digits">
              <input
                id="grant-user"
                className="input mono"
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                placeholder="123456789012345678"
              />
            </Field>
            <Field label="Level" htmlFor="grant-level">
              <select
                id="grant-level"
                className="select"
                value={level}
                onChange={(event) => setLevel(event.target.value as AccessLevel)}
              >
                <option value="PC_CHECKER">PC_CHECKER</option>
                <option value="CO_OWNER">CO_OWNER</option>
                <option value="OWNER">OWNER</option>
              </select>
            </Field>
            <Field label="Note" htmlFor="grant-note" hint="Why access is needed (max 300 chars)">
              <input
                id="grant-note"
                className="input"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
          </div>
          <div className="row" style={{ marginTop: '1rem' }}>
            <Button onClick={() => void grant()} disabled={busy || !/^\d{17,20}$/.test(userId.trim())}>
              {busy ? 'Granting…' : 'Grant access'}
            </Button>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Dashboard grants</div>
              <div className="card-subtitle">Database grants, with full history available.</div>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={history}
                onChange={(event) => setHistory(event.target.checked)}
              />
              Include revoked grants
            </label>
          </div>
          {loading && !data && <Loading label="Loading access grants…" />}
          {error && <ErrorPanel error={error} onRetry={reload} />}
          {data &&
            (data.items.length === 0 ? (
              <EmptyState
                icon="key"
                title="No database grants"
                description="Only the environment allowlist is active. Grants created here are audited and can be revoked without a redeploy."
              />
            ) : (
              <div className="table-wrap">
                <table className="data" style={{ minWidth: 640 }}>
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Level</th>
                      <th>Granted</th>
                      <th>Granted by</th>
                      <th>Note</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((entry) => (
                      <tr key={entry.id}>
                        <td className="mono">{entry.userDiscordId}</td>
                        <td>
                          <span className="badge badge-blue">{entry.level.replace('_', '-')}</span>
                        </td>
                        <td className="small">{formatDateTime(entry.grantedAt)}</td>
                        <td className="mono small">{entry.grantedBy ?? 'system'}</td>
                        <td className="small muted">{entry.note ?? '—'}</td>
                        <td>
                          {entry.revokedAt ? (
                            <span className="badge badge-neutral">
                              Revoked {formatDateTime(entry.revokedAt)}
                            </span>
                          ) : (
                            <span className="badge badge-success">Active</span>
                          )}
                        </td>
                        <td>
                          {!entry.revokedAt && (
                            <ConfirmButton
                              size="small"
                              variant="secondary"
                              label="Revoke"
                              confirmLabel="Revoke access"
                              description={
                                <>
                                  Revoke dashboard access for{' '}
                                  <span className="mono">{entry.userDiscordId}</span>? Existing sessions
                                  are destroyed on their next request. This is recorded in the audit
                                  trail.
                                </>
                              }
                              onConfirm={async () => {
                                await revoke(entry);
                              }}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
        </section>
      </div>
    </RequireLevel>
  );
}
