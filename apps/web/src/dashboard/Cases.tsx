import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ACTION_TYPES,
  BAN_STATUSES,
  CASE_STATUSES,
  type ActionType,
  type BanStatus,
  type CaseStatus,
  type ModerationCaseDto,
  type Paginated,
} from '@dardania/shared';
import { useApi } from '../lib/useApi.js';
import { buildQuery } from '../lib/api.js';
import { EmptyState, ErrorPanel, Field, Loading, Pagination } from '../components/ui.js';
import { formatDateTime } from '../lib/format.js';
import {
  AttributionBadge,
  BanStatusBadge,
  CaseStatusBadge,
  PageHeader,
  RefreshButton,
} from './ui.js';
import { RequireLevel } from './RequireLevel.js';

interface Filters {
  q: string;
  actionType: ActionType | '';
  banStatus: BanStatus | '';
  status: CaseStatus | '';
  dateFrom: string;
  dateTo: string;
  page: number;
  pageSize: number;
}

const INITIAL: Filters = {
  q: '',
  actionType: '',
  banStatus: '',
  status: '',
  dateFrom: '',
  dateTo: '',
  page: 1,
  pageSize: 25,
};

export function Cases() {
  const [filters, setFilters] = useState<Filters>(INITIAL);
  const [editing, setEditing] = useState<Filters>(INITIAL);
  const path = `/api/dashboard/cases${buildQuery({
    q: editing.q || undefined,
    actionType: editing.actionType || undefined,
    banStatus: editing.banStatus || undefined,
    status: editing.status || undefined,
    dateFrom: editing.dateFrom || undefined,
    dateTo: editing.dateTo || undefined,
    page: editing.page,
    pageSize: editing.pageSize,
  })}`;
  const { data, loading, error, reload } = useApi<Paginated<ModerationCaseDto>>(path);

  const update = (patch: Partial<Filters>) => setFilters((current) => ({ ...current, ...patch }));

  return (
    <RequireLevel level="CO_OWNER">
      <div className="stack" style={{ gap: '1.4rem' }}>
        <PageHeader
          title="Cases & moderation history"
          description="Every action the bot recorded, with the identity observed at that moment."
          actions={<RefreshButton onClick={reload} busy={loading} />}
        />

        <form
          className="card"
          onSubmit={(event) => {
            event.preventDefault();
            setEditing({ ...filters, page: 1 });
          }}
        >
          <div className="filter-bar">
            <Field label="Search" htmlFor="case-q" hint="Username, reason, case ref">
              <input
                id="case-q"
                className="input"
                type="search"
                value={filters.q}
                onChange={(event) => update({ q: event.target.value })}
                placeholder="e.g. DE-000123 or cheater"
              />
            </Field>
            <Field label="Action" htmlFor="case-action">
              <select
                id="case-action"
                className="select"
                value={filters.actionType}
                onChange={(event) => update({ actionType: event.target.value as ActionType | '' })}
              >
                <option value="">All actions</option>
                {ACTION_TYPES.map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ban status" htmlFor="case-ban">
              <select
                id="case-ban"
                className="select"
                value={filters.banStatus}
                onChange={(event) => update({ banStatus: event.target.value as BanStatus | '' })}
              >
                <option value="">Any ban status</option>
                {BAN_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Case status" htmlFor="case-status">
              <select
                id="case-status"
                className="select"
                value={filters.status}
                onChange={(event) => update({ status: event.target.value as CaseStatus | '' })}
              >
                <option value="">Any status</option>
                {CASE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="From (UTC)" htmlFor="case-from">
              <input
                id="case-from"
                className="input"
                type="date"
                value={filters.dateFrom}
                onChange={(event) => update({ dateFrom: event.target.value })}
              />
            </Field>
            <Field label="To (UTC)" htmlFor="case-to">
              <input
                id="case-to"
                className="input"
                type="date"
                value={filters.dateTo}
                onChange={(event) => update({ dateTo: event.target.value })}
              />
            </Field>
          </div>
          <div className="row" style={{ marginTop: '1rem' }}>
            <button className="btn" type="submit">
              Apply filters
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => {
                setFilters(INITIAL);
                setEditing(INITIAL);
              }}
            >
              Reset
            </button>
            <Field label="# per page" htmlFor="case-size">
              <select
                id="case-size"
                className="select"
                value={filters.pageSize}
                onChange={(event) => {
                  const pageSize = Number(event.target.value);
                  update({ pageSize });
                  setEditing((current) => ({ ...current, pageSize, page: 1 }));
                }}
              >
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </form>

        {loading && !data && <Loading label="Loading cases…" />}
        {error && <ErrorPanel error={error} onRetry={reload} />}

        {data && (
          <>
            {data.items.length === 0 ? (
              <EmptyState
                icon="search"
                title="No cases match these filters"
                description="Moderation records are never deleted when a ban is lifted — they remain searchable with a LIFTED status."
              />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Case</th>
                      <th>Target at event</th>
                      <th>Action</th>
                      <th>Status</th>
                      <th>Steam name at event</th>
                      <th>Moderator</th>
                      <th>Occurred</th>
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
                          <span className="cell-sub">{formatDateTime(item.recordedAt)}</span>
                        </td>
                        <td>
                          <span className="cell-strong">
                            {item.target.usernameAtEvent ?? 'Unknown'}
                          </span>
                          <span className="cell-sub mono">{item.target.discordUserId}</span>
                        </td>
                        <td>
                          <span className="badge badge-blue">{item.actionType}</span>
                        </td>
                        <td>
                          <div className="stack" style={{ gap: 4 }}>
                            <CaseStatusBadge status={item.status} />
                            <BanStatusBadge status={item.banStatus} />
                          </div>
                        </td>
                        <td>
                          {item.steamAtEvent?.name ? (
                            <>
                              <span>{item.steamAtEvent.name}</span>
                              {item.steamCurrent?.displayName &&
                                item.steamCurrent.displayName !== item.steamAtEvent.name && (
                                  <span className="cell-sub">
                                    now: {item.steamCurrent.displayName}
                                  </span>
                                )}
                            </>
                          ) : (
                            <span className="muted small">Not recorded</span>
                          )}
                        </td>
                        <td>
                          {item.moderator.nameAtEvent ?? (
                            <span className="muted small">Unconfirmed</span>
                          )}
                          <span className="cell-sub">
                            <AttributionBadge status={item.attributionStatus} />
                          </span>
                        </td>
                        <td className="small muted">{formatDateTime(item.occurredAt)}</td>
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
              onPage={(page) => {
                setFilters((current) => ({ ...current, page }));
                setEditing((current) => ({ ...current, page }));
              }}
              label="cases"
            />
          </>
        )}
      </div>
    </RequireLevel>
  );
}
