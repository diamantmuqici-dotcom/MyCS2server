import type { ServiceHealthDto } from '@dardania/shared';
import { useApi } from '../lib/useApi.js';
import { Alert, Loading, StatCard, ErrorPanel } from '../components/ui.js';
import { formatDateTime, relativeTime } from '../lib/format.js';
import { PageHeader, RefreshButton } from './ui.js';
import { Icon } from '../components/Icon.js';
import { useAuth } from '../lib/session.js';

interface HealthResponse {
  services: ServiceHealthDto[];
  generatedAt: string;
}

interface SessionPolicy {
  ttlHours: number;
  cookieSecure: boolean;
}

interface AuthConfig {
  discordOAuthEnabled: boolean;
  devLoginEnabled: boolean;
  accessLevels: string[];
}

const TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  operational: 'success',
  degraded: 'warning',
  outage: 'danger',
  unknown: 'neutral',
};

export function System() {
  const { session } = useAuth();
  const health = useApi<HealthResponse>('/api/dashboard/health');
  const policy = useApi<SessionPolicy>('/api/auth/session-policy');
  const authConfig = useApi<AuthConfig>('/api/auth/config');

  const failing = health.data?.services.filter((service) => service.status === 'outage') ?? [];

  return (
    <div className="stack" style={{ gap: '1.4rem' }}>
      <PageHeader
        title="Health & security"
        description="Live service state and the session policy actually enforced by the API."
        actions={<RefreshButton onClick={health.reload} busy={health.loading} />}
      />

      {health.loading && !health.data && <Loading label="Loading health data…" />}
      {health.error && <ErrorPanel error={health.error} onRetry={health.reload} />}

      {health.data && (
        <>
          {failing.length > 0 ? (
            <Alert tone="danger">
              <Icon name="alert" size={16} /> {failing.length} service(s) reporting an outage:{' '}
              {failing.map((service) => service.service).join(', ')}.
            </Alert>
          ) : (
            <Alert tone="success">
              <Icon name="check" size={16} /> No service is reporting an outage.
            </Alert>
          )}
          <div className="table-wrap">
            <table className="data" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Status</th>
                  <th>Detail</th>
                  <th>Last signal</th>
                </tr>
              </thead>
              <tbody>
                {health.data.services.map((service) => (
                  <tr key={service.service}>
                    <td className="cell-strong" style={{ textTransform: 'capitalize' }}>
                      {service.service}
                    </td>
                    <td>
                      <span className={`badge badge-${TONE[service.status] ?? 'neutral'}`}>
                        {service.status}
                      </span>
                    </td>
                    <td className="small muted">{service.detail}</td>
                    <td className="small muted">
                      {service.lastSeenAt
                        ? `${relativeTime(service.lastSeenAt)} (${formatDateTime(service.lastSeenAt)})`
                        : 'Never'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">
            Health snapshot generated {formatDateTime(health.data.generatedAt)}. The Discord row
            reflects the bot heartbeat, not a direct gateway probe from the API.
          </p>
        </>
      )}

      <div className="grid grid-3">
        <StatCard
          label="Session lifetime"
          value={policy.data ? `${policy.data.ttlHours}h` : '—'}
          hint="Enforced by the API on every session lookup."
        />
        <StatCard
          label="Cookie security"
          value={policy.data ? (policy.data.cookieSecure ? 'Secure' : 'Development') : '—'}
          hint={
            policy.data?.cookieSecure
              ? 'HTTPS-only HttpOnly cookies.'
              : 'COOKIE_SECURE=false — local development only.'
          }
        />
        <StatCard
          label="CSRF protection"
          value="Enabled"
          hint="Double-submit token required for every state-changing request."
        />
        <StatCard
          label="Discord OAuth2"
          value={
            authConfig.data
              ? authConfig.data.discordOAuthEnabled
                ? 'Ready'
                : 'Not configured'
              : '—'
          }
          hint="Client ID and secret must both be present."
        />
        <StatCard
          label="Development login"
          value={authConfig.data ? (authConfig.data.devLoginEnabled ? 'Enabled' : 'Disabled') : '—'}
          hint="Must be disabled in production; the API refuses to start otherwise."
        />
        <StatCard
          label="Your access"
          value={session?.accessLevel.replace('_', '-') ?? '—'}
          hint="From the explicit allowlist, not Discord roles."
        />
      </div>

      <section className="card">
        <div className="card-header">
          <div className="card-title">Security model in one paragraph</div>
        </div>
        <p className="prose">
          Dashboard sessions are created only after Discord OAuth2 (or the development login, which
          is refused in production) verifies an identity that is either on the environment allowlist
          or has an active database grant. Session tokens are random, hashed at rest and delivered
          in HttpOnly SameSite=Lax cookies; a second cookie provides a CSRF token that must be
          echoed in the <span className="mono">x-csrf-token</span> header for writes. Every login,
          denial, correction, grant, revoke and settings change is written to an append-only audit
          trail.
        </p>
      </section>
    </div>
  );
}
