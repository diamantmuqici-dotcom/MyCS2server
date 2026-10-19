import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BRAND, RULES, RULES_VERSION, type PublicAnnouncement } from '@dardania/shared';
import { useConfig } from '../lib/config.js';
import { useServers } from '../lib/servers.js';
import { Icon } from '../components/Icon.js';
import { Badge, Card, EmptyState } from '../components/ui.js';
import { asset } from '../components/Logo.js';
import { formatDate } from '../lib/format.js';

const PRINCIPLES = [
  {
    icon: 'audit',
    title: 'Accurate history',
    body: 'Every punishment is stored as a case with the Discord and Steam names observed at that moment. Renames never rewrite the past.',
  },
  {
    icon: 'steam',
    title: 'Identity by SteamID64',
    body: 'Steam display names change constantly, so they are snapshots — the SteamID64 is the only identifier we link records to.',
  },
  {
    icon: 'pc',
    title: 'Documented PC checks',
    body: 'Checks are tracked as numbered cases with reasons, assignments and staff notes instead of informal Discord messages.',
  },
  {
    icon: 'shield',
    title: 'Owner-only dashboard',
    body: 'Moderation history is not public. The dashboard is restricted to an explicit Discord user-ID allowlist, not Discord roles.',
  },
];

function CopyConnect({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-secondary btn-small"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(`connect ${value}`);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        } catch {
          setCopied(false);
        }
      }}
    >
      <Icon name={copied ? 'check' : 'file'} size={14} />
      {copied ? 'Copied' : 'Copy connect'}
    </button>
  );
}

function ServerCards() {
  const { data, loading, error } = useServers();
  const servers = data?.servers ?? [];
  if (loading) {
    return (
      <div className="grid grid-2">
        {[0, 1].map((key) => (
          <div className="card" key={key}>
            <div className="skeleton" style={{ width: '45%', marginBottom: 12 }} />
            <div className="skeleton" style={{ width: '70%', height: '2rem' }} />
          </div>
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <EmptyState
        icon="alert"
        title="Server status is unavailable"
        description="The API could not be reached, so no live player counts are shown. Nothing is estimated or invented."
      />
    );
  }
  if (servers.length === 0) {
    return (
      <EmptyState
        icon="server"
        title="No servers are published yet"
        description="A server appears here only after it is configured in PUBLIC_SERVERS and the API can query it directly."
      />
    );
  }
  return (
    <div className="grid grid-2">
      {servers.map((server) => (
        <Card key={server.connect} className="card-hover">
          <div className="row-between" style={{ alignItems: 'flex-start' }}>
            <div>
              <div className="row" style={{ gap: '0.5rem' }}>
                <span
                  className={`badge ${server.status === 'ONLINE' ? 'badge-success' : server.status === 'OFFLINE' ? 'badge-danger' : 'badge-neutral'}`}
                >
                  <span className="dot" aria-hidden="true" />
                  {server.status === 'ONLINE'
                    ? 'Online'
                    : server.status === 'OFFLINE'
                      ? 'Offline'
                      : 'Unmonitored'}
                </span>
                {server.map ? <span className="small muted">Map: {server.map}</span> : null}
              </div>
              <h3 className="h3" style={{ marginTop: '0.6rem' }}>
                {server.label}
              </h3>
              <span className="small muted mono">{server.connect}</span>
            </div>
            <div className="center">
              <div className="stat-value" style={{ fontSize: '1.7rem' }}>
                {server.players !== null && server.maxPlayers !== null
                  ? `${server.players}/${server.maxPlayers}`
                  : '—'}
              </div>
              <span className="stat-label">Players</span>
            </div>
          </div>
          <div className="row" style={{ marginTop: '1rem' }}>
            <CopyConnect value={server.connect} />
            <a
              className="btn btn-ghost btn-small"
              href={`steam://connect/${server.connect}`}
              aria-label={`Open ${server.label} in Counter-Strike 2`}
            >
              Launch game
            </a>
          </div>
          {server.status === 'UNKNOWN' && (
            <p className="field-hint" style={{ marginTop: '0.6rem' }}>
              The API has not received a complete response from this server, so no player count is
              displayed.
            </p>
          )}
        </Card>
      ))}
    </div>
  );
}

function AnnouncementCard({ item }: { item: PublicAnnouncement }) {
  return (
    <Link to={`/announcements/${item.slug}`} className="card card-hover announcement-card">
      <div className="row-between">
        <Badge tone="blue">{item.category.replace('_', ' ')}</Badge>
        <span className="small muted">{formatDate(item.publishedAt)}</span>
      </div>
      <h3>{item.title}</h3>
      <p>{item.body.length > 160 ? `${item.body.slice(0, 157)}…` : item.body}</p>
      <span className="small" style={{ color: 'var(--accent)', fontWeight: 700 }}>
        Read announcement →
      </span>
    </Link>
  );
}

export function Home() {
  const { config, error } = useConfig();
  const preview = config?.announcements ?? [];

  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">
              {config?.brandName ?? BRAND.name} · {BRAND.game}
            </span>
            <h1 className="hero-title">
              <span>Dardania</span>
              <em>| Elite</em>
            </h1>
            <p className="lead">{BRAND.description}</p>
            <div className="hero-actions">
              {config?.discordInviteUrl ? (
                <a
                  className="btn"
                  href={config.discordInviteUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <Icon name="users" size={17} /> Join the Discord
                </a>
              ) : (
                <Link className="btn" to="/status">
                  <Icon name="info" size={17} /> Check service status
                </Link>
              )}
              <Link className="btn btn-secondary" to="/rules">
                <Icon name="audit" size={17} /> Read the rules
              </Link>
            </div>
            <div className="hero-meta">
              <div>
                <strong>{BRAND.game}</strong>
                Competitive community
              </div>
              <div>
                <strong>Rules v{RULES_VERSION}</strong>
                Published in English & Albanian
              </div>
              <div>
                <strong>0 invented stats</strong>
                Every number is queried live
              </div>
            </div>
          </div>
          <div className="hero-emblem">
            <img
              src={asset('brand/emblem-512.png')}
              alt="Dardania | Elite emblem"
              width={512}
              height={512}
            />
          </div>
        </div>
      </section>

      {error && (
        <div className="container">
          <div className="alert alert-warning" role="status">
            <Icon name="alert" size={18} />
            <span>
              The community configuration could not be loaded. Discord links and announcements may
              be missing until the API is reachable.
            </span>
          </div>
        </div>
      )}

      <section className="section">
        <div className="container stack-lg">
          <div className="row-between">
            <div className="section-head" style={{ marginBottom: 0 }}>
              <span className="eyebrow">Live servers</span>
              <h2 className="h2">Where the community plays</h2>
              <p className="lead">
                Player counts come from a direct A2S query to each configured server. If a server
                does not answer, the card says so instead of showing a number.
              </p>
            </div>
            <Link className="btn btn-secondary btn-small" to="/status">
              Service status <Icon name="chevronRight" size={14} />
            </Link>
          </div>
          <ServerCards />
        </div>
      </section>

      <section className="section-tight">
        <div className="container grid grid-4">
          {PRINCIPLES.map((item) => (
            <div className="card" key={item.title}>
              <div className="row" style={{ color: 'var(--accent)', marginBottom: '0.65rem' }}>
                <Icon name={item.icon} size={22} />
              </div>
              <h3 className="h3" style={{ fontSize: '1.05rem', marginBottom: '0.4rem' }}>
                {item.title}
              </h3>
              <p className="small muted">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="container stack-lg">
          <div className="row-between">
            <div className="section-head" style={{ marginBottom: 0 }}>
              <span className="eyebrow">Newsroom</span>
              <h2 className="h2">Latest announcements</h2>
              <p className="lead">
                Events, rule updates and roster news — published from the dashboard and mirrored to
                Discord.
              </p>
            </div>
            <Link className="btn btn-secondary btn-small" to="/announcements">
              All announcements <Icon name="chevronRight" size={14} />
            </Link>
          </div>
          {preview.length > 0 ? (
            <div className="grid grid-3">
              {preview.map((item) => (
                <AnnouncementCard key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon="megaphone"
              title="No announcements published yet"
              description="When staff publish an announcement from the dashboard it appears here and is delivered to the Discord announcements channel."
              action={
                <Link className="btn btn-secondary btn-small" to="/dashboard/announcements">
                  Open dashboard
                </Link>
              }
            />
          )}
        </div>
      </section>

      <section className="section-tight">
        <div className="container">
          <div className="card card-glow" style={{ padding: 'clamp(1.5rem, 4vw, 2.6rem)' }}>
            <div className="row-between" style={{ alignItems: 'center' }}>
              <div className="stack" style={{ maxWidth: '58ch' }}>
                <span className="eyebrow">The rulebook</span>
                <h2 className="h2">Clear rules, documented decisions</h2>
                <p className="muted">
                  Eight sections cover conduct, cheating, exploits, communication, accounts, PC
                  checks and appeals. Both language versions are published from the same source.
                </p>
                <div className="row">
                  <Link className="btn" to="/rules">
                    Read the rules
                  </Link>
                  <Link className="btn btn-secondary" to="/rules#moderation">
                    How appeals work
                  </Link>
                </div>
              </div>
              <div className="stack" style={{ minWidth: '220px' }}>
                {RULES.slice(0, 4).map((section) => (
                  <div className="status-row" key={section.id} style={{ padding: '0.55rem 0' }}>
                    <span className="small">{section.title.en}</span>
                    <Icon name="chevronRight" size={14} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container center stack" style={{ alignItems: 'center' }}>
          <span className="eyebrow" style={{ justifyContent: 'center' }}>
            Join Dardania | Elite
          </span>
          <h2 className="h2" style={{ maxWidth: '22ch' }}>
            A fair server starts with a fair community
          </h2>
          <p className="lead" style={{ textAlign: 'center' }}>
            Everyone plays by the same rules, and every decision is logged with a case reference you
            can appeal.
          </p>
          <div className="row" style={{ justifyContent: 'center' }}>
            {config?.discordInviteUrl ? (
              <a
                className="btn"
                href={config.discordInviteUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                Join the Discord <Icon name="external" size={15} />
              </a>
            ) : (
              <Link className="btn" to="/announcements">
                Read the latest news
              </Link>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
