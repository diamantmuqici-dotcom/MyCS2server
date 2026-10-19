import type { ReactNode } from 'react';
import type { AttributionStatus, BanStatus, CaseStatus, PcCheckStatus } from '@dardania/shared';
import { Badge } from '../components/ui.js';
import { Icon } from '../components/Icon.js';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="row-between" style={{ alignItems: 'flex-end', gap: '1rem' }}>
      <div>
        <h1 className="dash-page-title">{title}</h1>
        {description && <div className="dash-page-sub">{description}</div>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function RefreshButton({ onClick, busy }: { onClick: () => void; busy?: boolean }) {
  return (
    <button type="button" className="btn btn-secondary btn-small" onClick={onClick} disabled={busy}>
      <Icon name="refresh" size={14} /> {busy ? 'Refreshing…' : 'Refresh'}
    </button>
  );
}

const CASE_TONE: Record<CaseStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  ACTIVE: 'danger',
  LIFTED: 'success',
  COMPLETED: 'success',
  UNKNOWN: 'neutral',
};

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  const label = status === 'LIFTED' ? 'Lifted' : status === 'COMPLETED' ? 'Completed' : status;
  return <Badge tone={CASE_TONE[status]}>{label}</Badge>;
}

export function BanStatusBadge({ status }: { status: BanStatus | null }) {
  if (!status) return <span className="muted small">—</span>;
  if (status === 'ACTIVE') return <Badge tone="danger">Active ban</Badge>;
  if (status === 'LIFTED') return <Badge tone="success">Lifted</Badge>;
  return <Badge tone="warning">Unknown</Badge>;
}

export function AttributionBadge({ status }: { status: AttributionStatus }) {
  if (status === 'VERIFIED') return <Badge tone="success">Verified</Badge>;
  if (status === 'PARTIAL') return <Badge tone="warning">Partial</Badge>;
  return <Badge tone="neutral">Unattributed</Badge>;
}

const PC_TONE: Record<PcCheckStatus, 'success' | 'warning' | 'danger' | 'neutral' | 'blue'> = {
  REQUESTED: 'warning',
  ASSIGNED: 'blue',
  IN_PROGRESS: 'blue',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
};

export function PcStatusBadge({ status }: { status: PcCheckStatus }) {
  return <Badge tone={PC_TONE[status]}>{status.replace('_', ' ')}</Badge>;
}

export function SectionNote({ children }: { children: ReactNode }) {
  return <div className="note">{children}</div>;
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--muted)' }}
      >
        {children}
      </td>
    </tr>
  );
}
