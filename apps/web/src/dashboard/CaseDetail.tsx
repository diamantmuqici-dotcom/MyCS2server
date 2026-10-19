import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ATTRIBUTION_STATUSES,
  type AttributionStatus,
  type CaseCorrectionInput,
} from '@dardania/shared';
import type { ModerationCaseDetail } from '@dardania/shared';
import { useApi } from '../lib/useApi.js';
import { useMutation } from '../lib/session.js';
import { ApiError } from '../lib/api.js';
import { formatDateTime } from '../lib/format.js';
import { Alert, Button, EmptyState, ErrorPanel, Field, Loading } from '../components/ui.js';
import { AttributionBadge, BanStatusBadge, CaseStatusBadge, PageHeader } from './ui.js';
import { Icon } from '../components/Icon.js';
import { RequireLevel } from './RequireLevel.js';

function CorrectionForm({ caseRef, current }: { caseRef: string; current: ModerationCaseDetail }) {
  const mutate = useMutation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({
    correctionNote: '',
    reason: current.reason ?? '',
    moderatorDiscordUserId: current.moderator.discordUserId ?? '',
    moderatorName: current.moderator.nameAtEvent ?? '',
    steamId64: current.steamAtEvent?.steamId64 ?? '',
    steamNameAtEvent: current.steamAtEvent?.name ?? '',
    attributionStatus: current.attributionStatus as AttributionStatus,
  });

  const submit = async () => {
    setBusy(true);
    setError(null);
    setSuccess(false);
    const payload: CaseCorrectionInput = {
      correctionNote: form.correctionNote.trim(),
      reason: form.reason.trim() || undefined,
      attributionStatus: form.attributionStatus,
      moderatorDiscordUserId: form.moderatorDiscordUserId.trim() || null,
      moderatorName: form.moderatorName.trim() || null,
      steamId64: form.steamId64.trim() || null,
      steamNameAtEvent: form.steamNameAtEvent.trim() || null,
    };
    try {
      await mutate(`/api/dashboard/cases/${encodeURIComponent(caseRef)}`, {
        method: 'PATCH',
        body: payload,
      });
      setSuccess(true);
      setForm((currentForm) => ({ ...currentForm, correctionNote: '' }));
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'The correction could not be saved. No data was changed.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Correct this record</div>
          <div className="card-subtitle">
            Corrections are additive: the audit trail keeps the previous values and the reason.
          </div>
        </div>
        <Button variant="secondary" size="small" onClick={() => setOpen((value) => !value)}>
          {open ? 'Close form' : 'Open correction form'}
        </Button>
      </div>
      {success && (
        <Alert tone="success">
          <Icon name="check" size={16} /> Correction recorded. Reload the page to see the updated
          case.
        </Alert>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
      {open && (
        <div className="stack">
          <div className="form-grid">
            <Field
              label="Moderator Discord ID"
              htmlFor="fix-mod-id"
              hint="Leave empty when the audit log did not confirm a moderator."
            >
              <input
                id="fix-mod-id"
                className="input mono"
                value={form.moderatorDiscordUserId}
                onChange={(event) =>
                  setForm((value) => ({ ...value, moderatorDiscordUserId: event.target.value }))
                }
              />
            </Field>
            <Field label="Moderator name at event" htmlFor="fix-mod-name">
              <input
                id="fix-mod-name"
                className="input"
                value={form.moderatorName}
                onChange={(event) =>
                  setForm((value) => ({ ...value, moderatorName: event.target.value }))
                }
              />
            </Field>
            <Field label="SteamID64 at event" htmlFor="fix-steam-id">
              <input
                id="fix-steam-id"
                className="input mono"
                value={form.steamId64}
                onChange={(event) =>
                  setForm((value) => ({ ...value, steamId64: event.target.value }))
                }
              />
            </Field>
            <Field label="Steam name at event" htmlFor="fix-steam-name">
              <input
                id="fix-steam-name"
                className="input"
                value={form.steamNameAtEvent}
                onChange={(event) =>
                  setForm((value) => ({ ...value, steamNameAtEvent: event.target.value }))
                }
              />
            </Field>
            <Field label="Attribution status" htmlFor="fix-attribution">
              <select
                id="fix-attribution"
                className="select"
                value={form.attributionStatus}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    attributionStatus: event.target.value as AttributionStatus,
                  }))
                }
              >
                {ATTRIBUTION_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Reason" htmlFor="fix-reason">
            <textarea
              id="fix-reason"
              className="textarea"
              style={{ minHeight: 80 }}
              value={form.reason}
              onChange={(event) => setForm((value) => ({ ...value, reason: event.target.value }))}
            />
          </Field>
          <Field
            label="Correction note (required)"
            htmlFor="fix-note"
            hint="Minimum 5 characters. Explain what was wrong and why this correction is justified."
          >
            <textarea
              id="fix-note"
              className="textarea"
              value={form.correctionNote}
              onChange={(event) =>
                setForm((value) => ({ ...value, correctionNote: event.target.value }))
              }
            />
          </Field>
          <div className="row">
            <Button
              onClick={() => void submit()}
              disabled={busy || form.correctionNote.trim().length < 5}
            >
              {busy ? 'Saving…' : 'Save correction'}
            </Button>
          </div>
          <p className="field-hint">
            Historical Steam names are snapshots. Changing the snapshot here is only correct when
            the original value was recorded incorrectly — normal Steam renames must never be written
            back.
          </p>
        </div>
      )}
    </section>
  );
}

export function CaseDetail() {
  const { ref = '' } = useParams();
  const { data, loading, error, reload } = useApi<{ case: ModerationCaseDetail }>(
    ref ? `/api/dashboard/cases/${encodeURIComponent(ref)}` : null,
  );

  useEffect(() => {
    document.title = `${ref} · Moderation case · Dardania | Elite`;
  }, [ref]);

  return (
    <RequireLevel level="CO_OWNER">
      <div className="stack" style={{ gap: '1.4rem' }}>
        <Link to="/dashboard/cases" className="small" style={{ fontWeight: 700 }}>
          ← All cases
        </Link>
        {loading && !data && <Loading label="Loading case…" />}
        {error &&
          (error.status === 404 ? (
            <EmptyState
              icon="search"
              title="Case not found"
              description="The reference may be wrong, or the case belongs to a different guild."
              action={
                <Link className="btn btn-secondary btn-small" to="/dashboard/cases">
                  Back to cases
                </Link>
              }
            />
          ) : (
            <ErrorPanel error={error} onRetry={reload} />
          ))}

        {data && (
          <>
            <PageHeader
              title={`Case ${data.case.caseRef}`}
              description={
                <div className="row" style={{ gap: '0.4rem', marginTop: 6 }}>
                  <span className="badge badge-blue">{data.case.actionType}</span>
                  <CaseStatusBadge status={data.case.status} />
                  <BanStatusBadge status={data.case.banStatus} />
                  <AttributionBadge status={data.case.attributionStatus} />
                </div>
              }
              actions={
                <button type="button" className="btn btn-secondary btn-small" onClick={reload}>
                  <Icon name="refresh" size={14} /> Refresh
                </button>
              }
            />

            <div className="detail-grid">
              <section className="card">
                <div className="card-header">
                  <div className="card-title">Target identity at the time of the action</div>
                  <span className="badge badge-neutral">Immutable snapshot</span>
                </div>
                <dl className="kv">
                  <dt>Discord ID</dt>
                  <dd className="mono">{data.case.target.discordUserId}</dd>
                  <dt>Username at event</dt>
                  <dd>{data.case.target.usernameAtEvent ?? 'Not captured'}</dd>
                  <dt>Display name at event</dt>
                  <dd>{data.case.target.displayNameAtEvent ?? 'Not captured'}</dd>
                  <dt>SteamID64</dt>
                  <dd className="mono">{data.case.steamAtEvent?.steamId64 ?? 'Not recorded'}</dd>
                  <dt>Steam name at event</dt>
                  <dd>{data.case.steamAtEvent?.name ?? 'Not recorded'}</dd>
                  <dt>Attribution evidence</dt>
                  <dd className="small muted">
                    {data.case.attributionEvidence
                      ? JSON.stringify(data.case.attributionEvidence)
                      : 'No evidence stored'}
                  </dd>
                </dl>
              </section>

              <section className="card">
                <div className="card-header">
                  <div className="card-title">Moderator</div>
                  <AttributionBadge status={data.case.attributionStatus} />
                </div>
                <dl className="kv">
                  <dt>Discord ID</dt>
                  <dd className="mono">{data.case.moderator.discordUserId ?? 'Unconfirmed'}</dd>
                  <dt>Name at event</dt>
                  <dd>{data.case.moderator.nameAtEvent ?? 'Unconfirmed'}</dd>
                  <dt>Source</dt>
                  <dd>{data.case.source}</dd>
                  <dt>Recorded</dt>
                  <dd>{formatDateTime(data.case.recordedAt)}</dd>
                  <dt>Occurred</dt>
                  <dd>{formatDateTime(data.case.occurredAt)}</dd>
                  <dt>Expires</dt>
                  <dd>
                    {data.case.expiresAt ? formatDateTime(data.case.expiresAt) : 'Permanent / n/a'}
                  </dd>
                </dl>
                {data.case.attributionStatus === 'UNKNOWN' && (
                  <p className="field-hint" style={{ marginTop: '0.7rem' }}>
                    The moderator was not confirmed by the Discord audit log. The bot retries
                    attribution automatically; an unknown moderator is never replaced with a guess.
                  </p>
                )}
              </section>
            </div>

            <section className="card">
              <div className="card-header">
                <div className="card-title">Reason</div>
              </div>
              <p className="prose" style={{ whiteSpace: 'pre-wrap' }}>
                {data.case.reason ?? 'No reason was recorded.'}
              </p>
            </section>

            <div className="detail-grid">
              <section className="card">
                <div className="card-header">
                  <div className="card-title">Current Steam state</div>
                  <span className="badge badge-warning">Separately refreshed</span>
                </div>
                {data.case.steamCurrent ? (
                  <dl className="kv">
                    <dt>Current display name</dt>
                    <dd>{data.case.steamCurrent.displayName ?? 'Unavailable'}</dd>
                    <dt>Profile status</dt>
                    <dd>{data.case.steamCurrent.profileStatus}</dd>
                    <dt>Last checked</dt>
                    <dd>{formatDateTime(data.case.steamCurrent.lastCheckedAt)}</dd>
                    <dt>Profile</dt>
                    <dd>
                      <a
                        href={data.case.steamCurrent.profileUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        steamcommunity.com <Icon name="external" size={12} />
                      </a>
                    </dd>
                  </dl>
                ) : (
                  <p className="small muted">
                    No live Steam account is linked to this case. The historical snapshot above is
                    the only Steam identity evidence.
                  </p>
                )}
                <p className="field-hint" style={{ marginTop: '0.7rem' }}>
                  This value is refreshed from Steam and never overwrites the snapshot on the left.
                </p>
              </section>

              <section className="card">
                <div className="card-header">
                  <div className="card-title">Related cases</div>
                </div>
                {data.case.relatedCases.length === 0 ? (
                  <p className="small muted">No linked ban, unban or warning cases.</p>
                ) : (
                  <div className="timeline">
                    {data.case.relatedCases.map((relation) => (
                      <div className="timeline-item" key={relation.id}>
                        <strong>
                          <Link className="mono" to={`/dashboard/cases/${relation.caseRef}`}>
                            {relation.caseRef}
                          </Link>{' '}
                          · {relation.actionType}
                        </strong>
                        <span>
                          {formatDateTime(relation.occurredAt)} · {relation.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <section className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Event timeline</div>
                  <div className="card-subtitle">
                    Ban and unban events tied to this case, in recorded order.
                  </div>
                </div>
              </div>
              {data.case.events.length === 0 ? (
                <p className="small muted">No separate events were linked to this case.</p>
              ) : (
                <div className="timeline">
                  {data.case.events.map((event) => (
                    <div className="timeline-item" key={event.id}>
                      <strong>{event.kind}</strong>
                      <span>
                        {formatDateTime(event.occurredAt)} ·{' '}
                        {event.moderator.nameAtEvent ?? 'Moderator unconfirmed'} ·{' '}
                        {event.attributionStatus}
                      </span>
                      {event.reason && <span>{event.reason}</span>}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Audit trail</div>
                  <div className="card-subtitle">
                    Who changed what, including every correction to this record.
                  </div>
                </div>
              </div>
              {data.case.auditTrail.length === 0 ? (
                <p className="small muted">No audit entries for this case.</p>
              ) : (
                <div className="timeline">
                  {data.case.auditTrail.map((entry) => (
                    <div className="timeline-item" key={entry.id}>
                      <strong>{entry.summary}</strong>
                      <span>
                        {formatDateTime(entry.createdAt)} · {entry.action} ·{' '}
                        {entry.actorDiscordId ?? 'system'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <CorrectionForm caseRef={data.case.caseRef} current={data.case} />
          </>
        )}
      </div>
    </RequireLevel>
  );
}
