import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PublicStatusDto } from '@dardania/shared';
import { useApi } from '../lib/useApi.js';
import { Badge, ErrorPanel, Loading } from '../components/ui.js';
import { formatDateTime, relativeTime } from '../lib/format.js';
import { Icon } from '../components/Icon.js';

const TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  operational: 'success',
  degraded: 'warning',
  outage: 'danger',
  unknown: 'neutral',
};

export function Status() {
  const { data, loading, error, reload } = useApi<PublicStatusDto>('/api/status');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    if (data) setLastUpdated(new Date());
  }, [data]);

  useEffect(() => {
    const timer = window.setInterval(reload, 60_000);
    return () => window.clearInterval(timer);
  }, [reload]);

  return (
    <section className="section">
      <div className="container-narrow stack-lg">
        <div className="section-head">
          <span className="eyebrow">Transparency</span>
          <h1 className="h1" style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)' }}>
            Service status
          </h1>
          <p className="lead">
            These values are read directly from the API, the database and the bot heartbeat. Nothing
            here is decorative uptime.
          </p>
        </div>

        {loading && !data && <Loading label="Checking services…" />}
        {error && !data && <ErrorPanel error={error} onRetry={reload} />}

        {data && (
          <>
            <div className="card row-between">
              <div className="row">
                <Badge tone={TONE[data.status] ?? 'neutral'} dot>
                  {data.status}
                </Badge>
                <span className="muted small">
                  Checked {formatDateTime(data.checkedAt)}
                  {lastUpdated ? ` · refreshed ${relativeTime(lastUpdated.toISOString())}` : ''}
                </span>
              </div>
              <button type="button" className="btn btn-secondary btn-small" onClick={reload}>
                <Icon name="refresh" size={14} /> Refresh
              </button>
            </div>

            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Services</div>
                  <div className="card-subtitle">
                    The bot reports a heartbeat every 30 seconds; a stale heartbeat is shown as
                    degraded.
                  </div>
                </div>
              </div>
              <div>
                {data.services.map((service) => (
                  <div className="status-row" key={service.service}>
                    <div className="row">
                      <Badge tone={TONE[service.status] ?? 'neutral'} dot>
                        {service.status}
                      </Badge>
                      <div>
                        <div className="cell-strong" style={{ textTransform: 'capitalize' }}>
                          {service.service}
                        </div>
                        <span className="cell-sub">{service.detail}</span>
                      </div>
                    </div>
                    <span className="small muted">
                      {service.lastSeenAt ? relativeTime(service.lastSeenAt) : 'No heartbeat yet'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h2 className="h3" style={{ marginBottom: '0.6rem' }}>
                What this page reports
              </h2>
              <ul className="prose">
                <li>
                  <strong>API</strong> — the Fastify backend answering this request (version{' '}
                  <span className="mono">{data.version}</span>).
                </li>
                <li>
                  <strong>Database</strong> — a real <span className="mono">SELECT 1</span> against
                  the moderation store.
                </li>
                <li>
                  <strong>Bot</strong> — the last authenticated heartbeat sent by the Discord bot.
                </li>
                <li>
                  <strong>Discord</strong> — derived from the bot&apos;s gateway state, not a guess.
                </li>
              </ul>
              <p className="small muted" style={{ marginTop: '0.8rem' }}>
                Historical uptime percentages are not published because they would require a
                long-term monitoring pipeline. We do not invent them. See the{' '}
                <Link to="/status">health endpoint</Link> response for the raw data.
              </p>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
