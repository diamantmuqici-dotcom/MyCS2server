import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon } from './Icon.js';
import type { ApiError } from '../lib/api.js';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'primary',
  size,
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: 'small';
}) {
  const classes = [
    'btn',
    variant === 'secondary' ? 'btn-secondary' : '',
    variant === 'ghost' ? 'btn-ghost' : '',
    variant === 'danger' ? 'btn-danger' : '',
    size === 'small' ? 'btn-small' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = '',
  glow = false,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <section className={`card ${glow ? 'card-glow' : ''} ${className}`}>
      {(title || actions) && (
        <div className="card-header">
          <div>
            {title && <div className="card-title">{title}</div>}
            {subtitle && <div className="card-subtitle">{subtitle}</div>}
          </div>
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

const TONES: Record<string, string> = {
  neutral: 'badge-neutral',
  blue: 'badge-blue',
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
};

export function Badge({
  tone = 'neutral',
  children,
  dot = false,
}: {
  tone?: keyof typeof TONES;
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span className={`badge ${TONES[tone] ?? TONES.neutral}`}>
      {dot && <span className="dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'success' | 'warning' | 'danger';
}) {
  return (
    <div className="card stat-card">
      <span className="stat-label">{label}</span>
      <span className="stat-value" style={tone ? { color: `var(--${tone})` } : undefined}>
        {value}
      </span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon = 'info',
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: string;
}) {
  return (
    <div className="empty">
      <Icon name={icon} size={26} />
      <strong>{title}</strong>
      {description && <span className="small">{description}</span>}
      {action}
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading-block" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorPanel({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  const forbidden = error.status === 403;
  const unauthorized = error.status === 401;
  return (
    <div className="alert alert-danger" role="alert">
      <Icon name="alert" size={18} />
      <div className="stack" style={{ gap: '0.4rem' }}>
        <span>
          {unauthorized
            ? 'Your session is not authorised for this data.'
            : forbidden
              ? 'You do not have permission to view this data.'
              : error.message}
        </span>
        {onRetry && (
          <button type="button" className="btn-link" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  onPage,
  label = 'records',
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (page: number) => void;
  label?: string;
}) {
  return (
    <div className="pagination">
      <span>
        Page {page} of {Math.max(1, totalPages)} • {total} {label}
      </span>
      <div className="pagination-controls">
        <Button
          variant="secondary"
          size="small"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <Icon name="chevronLeft" size={15} /> Prev
        </Button>
        <Button
          variant="secondary"
          size="small"
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          Next <Icon name="chevronRight" size={15} />
        </Button>
      </div>
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  actions,
  labelledBy = 'modal-title',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal fade-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        ref={ref}
      >
        <h2 className="modal-title" id={labelledBy}>
          {title}
        </h2>
        <div className="stack">{children}</div>
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>
  );
}

export function ConfirmButton({
  label,
  confirmLabel = 'Confirm',
  description,
  onConfirm,
  variant = 'danger',
  size,
  disabled,
}: {
  label: ReactNode;
  confirmLabel?: string;
  description: ReactNode;
  onConfirm: () => Promise<void> | void;
  variant?: Variant;
  size?: 'small';
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)} disabled={disabled || busy}>
        {label}
      </Button>
      {open && (
        <Modal
          title="Confirm action"
          onClose={() => !busy && setOpen(false)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant={variant}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onConfirm();
                  } finally {
                    setBusy(false);
                    setOpen(false);
                  }
                }}
              >
                {busy ? 'Working…' : confirmLabel}
              </Button>
            </>
          }
        >
          <div className="muted">{description}</div>
        </Modal>
      )}
    </>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

export function Alert({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'danger' | 'success' | 'warning';
  children: ReactNode;
}) {
  const className =
    tone === 'danger'
      ? 'alert alert-danger'
      : tone === 'success'
        ? 'alert alert-success'
        : tone === 'warning'
          ? 'alert alert-warning'
          : 'alert';
  return (
    <div className={className} role="status">
      {children}
    </div>
  );
}
