import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  PC_CHECK_OUTCOMES,
  PC_CHECK_STATUSES,
  type PcCheckDto,
  type PcCheckNoteDto,
  type PcCheckOutcome,
  type PcCheckStatus,
} from '@dardania/shared';
import { useApi } from '../lib/useApi.js';
import { useMutation, useSessionLevel } from '../lib/pcHelpers.js';
import { ApiError } from '../lib/api.js';
import { Alert, Button, EmptyState, ErrorPanel, Field, Loading } from '../components/ui.js';
import { formatDateTime } from '../lib/format.js';
import { PageHeader, PcStatusBadge } from './ui.js';
import { RequireLevel } from './RequireLevel.js';

interface PcDetailResponse {
  pcCheck: PcCheckDto & { notes: PcCheckNoteDto[]; targetName: string | null };
}

export function PcCheckDetail() {
  const { ref = '' } = useParams();
  const { data, loading, error, reload } = useApi<PcDetailResponse>(
    ref ? `/api/dashboard/pc-checks/${encodeURIComponent(ref)}` : null,
  );
  const mutate = useMutation();
  const level = useSessionLevel();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [status, setStatus] = useState<PcCheckStatus | ''>('');
  const [outcome, setOutcome] = useState<PcCheckOutcome | ''>('');
  const [assignedTo, setAssignedTo] = useState('');
  const [note, setNote] = useState('');
  const [visibility, setVisibility] = useState<'STAFF' | 'OWNER'>('STAFF');

  const update = async () => {
    setBusy(true);
    setFailure(null);
    setFeedback(null);
    try {
      await mutate(`/api/dashboard/pc-checks/${encodeURIComponent(ref)}`, {
        method: 'PATCH',
        body: {
          ...(status ? { status } : {}),
          ...(outcome ? { outcome } : {}),
          ...(assignedTo.trim() ? { assignedTo: assignedTo.trim() } : {}),
        },
      });
      setFeedback('PC-check case updated. The change is in the audit trail.');
      setStatus('');
      setOutcome('');
      setAssignedTo('');
      reload();
    } catch (caught) {
      setFailure(caught instanceof ApiError ? caught.message : 'The update failed.');
    } finally {
      setBusy(false);
    }
  };

  const addNote = async () => {
    setBusy(true);
    setFailure(null);
    setFeedback(null);
    try {
      await mutate(`/api/dashboard/pc-checks/${encodeURIComponent(ref)}/notes`, {
        method: 'POST',
        body: { note: note.trim(), visibility },
      });
      setFeedback('Note added.');
      setNote('');
      reload();
    } catch (caught) {
      setFailure(caught instanceof ApiError ? caught.message : 'The note could not be added.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <RequireLevel level="PC_CHECKER">
      <div className="stack" style={{ gap: '1.4rem' }}>
        <Link to="/dashboard/pc-checks" className="small" style={{ fontWeight: 700 }}>
          ← All PC checks
        </Link>
        {loading && !data && <Loading label="Loading PC-check case…" />}
        {error &&
          (error.status === 404 ? (
            <EmptyState icon="pc" title="PC-check case not found" />
          ) : (
            <ErrorPanel error={error} onRetry={reload} />
          ))}

        {data && (
          <>
            <PageHeader
              title={`PC check ${data.pcCheck.caseRef}`}
              description={
                <div className="row" style={{ gap: '0.4rem', marginTop: 6 }}>
                  <PcStatusBadge status={data.pcCheck.status} />
                  {data.pcCheck.outcome && (
                    <span className="badge badge-warning">
                      {data.pcCheck.outcome.replace('_', ' ')}
                    </span>
                  )}
                </div>
              }
              actions={
                <Button variant="secondary" size="small" onClick={reload}>
                  Refresh
                </Button>
              }
            />

            {feedback && <Alert tone="success">{feedback}</Alert>}
            {failure && <Alert tone="danger">{failure}</Alert>}

            <div className="detail-grid">
              <section className="card">
                <div className="card-header">
                  <div className="card-title">Case details</div>
                </div>
                <dl className="kv">
                  <dt>Target Discord ID</dt>
                  <dd className="mono">{data.pcCheck.targetDiscordUserId}</dd>
                  <dt>Target name</dt>
                  <dd>{data.pcCheck.targetName ?? 'Unknown'}</dd>
                  <dt>SteamID64</dt>
                  <dd className="mono">{data.pcCheck.steamId64 ?? 'Not recorded'}</dd>
                  <dt>Steam name at event</dt>
                  <dd>{data.pcCheck.steamNameAtEvent ?? 'Not recorded'}</dd>
                  <dt>Requested by</dt>
                  <dd className="mono">{data.pcCheck.requestedBy ?? '—'}</dd>
                  <dt>Assigned to</dt>
                  <dd className="mono">{data.pcCheck.assignedTo ?? 'Unassigned'}</dd>
                  <dt>Channel</dt>
                  <dd className="mono">{data.pcCheck.channelId ?? '—'}</dd>
                  <dt>Created</dt>
                  <dd>{formatDateTime(data.pcCheck.createdAt)}</dd>
                  <dt>Closed</dt>
                  <dd>{data.pcCheck.closedAt ? formatDateTime(data.pcCheck.closedAt) : 'Open'}</dd>
                  <dt>Reason</dt>
                  <dd className="small">{data.pcCheck.reason ?? 'No reason recorded'}</dd>
                </dl>
              </section>

              <section className="card">
                <div className="card-header">
                  <div className="card-title">Update case</div>
                </div>
                <div className="stack">
                  <Field label="Status" htmlFor="pc-update-status">
                    <select
                      id="pc-update-status"
                      className="select"
                      value={status}
                      onChange={(event) => setStatus(event.target.value as PcCheckStatus | '')}
                    >
                      <option value="">Keep current ({data.pcCheck.status})</option>
                      {PC_CHECK_STATUSES.map((item) => (
                        <option key={item} value={item}>
                          {item.replace('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Outcome" htmlFor="pc-update-outcome">
                    <select
                      id="pc-update-outcome"
                      className="select"
                      value={outcome}
                      onChange={(event) => setOutcome(event.target.value as PcCheckOutcome | '')}
                    >
                      <option value="">Keep current ({data.pcCheck.outcome ?? 'none'})</option>
                      {PC_CHECK_OUTCOMES.map((item) => (
                        <option key={item} value={item}>
                          {item.replace('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Assign to Discord ID" htmlFor="pc-update-assignee">
                    <input
                      id="pc-update-assignee"
                      className="input mono"
                      value={assignedTo}
                      onChange={(event) => setAssignedTo(event.target.value)}
                      placeholder={data.pcCheck.assignedTo ?? '123456789012345678'}
                    />
                  </Field>
                  <Button
                    onClick={() => void update()}
                    disabled={busy || (!status && !outcome && !assignedTo.trim())}
                  >
                    {busy ? 'Saving…' : 'Save update'}
                  </Button>
                </div>
              </section>
            </div>

            <section className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Staff notes</div>
                  <div className="card-subtitle">
                    {level === 'OWNER'
                      ? 'Owner visibility notes are hidden from PC Checker accounts.'
                      : 'Owner-only notes are not shown for your access level.'}
                  </div>
                </div>
              </div>
              {data.pcCheck.notes.length === 0 ? (
                <p className="small muted">No notes recorded.</p>
              ) : (
                <div className="timeline">
                  {data.pcCheck.notes.map((item) => (
                    <div className="timeline-item" key={item.id}>
                      <strong>{item.note}</strong>
                      <span>
                        {item.authorNameAtEvent ?? item.authorDiscordId} ·{' '}
                        {formatDateTime(item.createdAt)} · {item.visibility.toLowerCase()}{' '}
                        visibility
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="stack" style={{ marginTop: '1.2rem' }}>
                <Field label="Add a note" htmlFor="pc-note">
                  <textarea
                    id="pc-note"
                    className="textarea"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="What was checked, what was found, and what evidence exists."
                  />
                </Field>
                {level === 'OWNER' && (
                  <Field label="Visibility" htmlFor="pc-note-visibility">
                    <select
                      id="pc-note-visibility"
                      className="select"
                      value={visibility}
                      onChange={(event) => setVisibility(event.target.value as 'STAFF' | 'OWNER')}
                    >
                      <option value="STAFF">STAFF — visible to all PC-check staff</option>
                      <option value="OWNER">OWNER — restricted to Owners and Co-Owners</option>
                    </select>
                  </Field>
                )}
                <Button onClick={() => void addNote()} disabled={busy || note.trim().length < 2}>
                  {busy ? 'Saving…' : 'Add note'}
                </Button>
              </div>
            </section>
          </>
        )}
      </div>
    </RequireLevel>
  );
}
