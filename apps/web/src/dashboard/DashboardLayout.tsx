import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '../lib/session.js';
import { Logo } from '../components/Logo.js';
import { Icon } from '../components/Icon.js';
import { Loading } from '../components/ui.js';
import { Login } from './Login.js';

const HISTORY_LEVELS = ['OWNER', 'CO_OWNER'];

interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
  level?: 'PC_CHECKER' | 'CO_OWNER' | 'OWNER';
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Overview',
    items: [{ to: '/dashboard', label: 'Overview', icon: 'grid', end: true }],
  },
  {
    label: 'Moderation',
    items: [
      { to: '/dashboard/cases', label: 'Cases & history', icon: 'audit', level: 'CO_OWNER' },
      { to: '/dashboard/bans', label: 'Active bans', icon: 'ban', level: 'CO_OWNER' },
      { to: '/dashboard/audit', label: 'Audit trail', icon: 'file', level: 'CO_OWNER' },
    ],
  },
  {
    label: 'Community',
    items: [
      { to: '/dashboard/pc-checks', label: 'PC checks', icon: 'pc' },
      { to: '/dashboard/steam', label: 'Steam identity', icon: 'steam', level: 'CO_OWNER' },
      {
        to: '/dashboard/announcements',
        label: 'Announcements',
        icon: 'megaphone',
        level: 'CO_OWNER',
      },
      { to: '/dashboard/staff', label: 'Staff activity', icon: 'users', level: 'CO_OWNER' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/dashboard/system', label: 'Health & status', icon: 'info' },
      { to: '/dashboard/settings', label: 'Settings', icon: 'settings', level: 'CO_OWNER' },
      { to: '/dashboard/access', label: 'Access control', icon: 'key', level: 'OWNER' },
    ],
  },
];

function UserChip() {
  const { session, logout } = useAuth();
  if (!session) return null;
  const initials = (session.displayName ?? session.username).slice(0, 2).toUpperCase();
  return (
    <div className="row">
      <div className="user-chip">
        {session.avatarUrl ? (
          <img src={session.avatarUrl} alt="" width={32} height={32} />
        ) : (
          <span className="avatar-fallback" aria-hidden="true">
            {initials}
          </span>
        )}
        <span className="user-chip-meta">
          <strong>{session.displayName ?? session.username}</strong>
          <span>{session.accessLevel.replace('_', '-')}</span>
        </span>
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-small"
        onClick={() => void logout()}
        aria-label="Sign out"
      >
        <Icon name="logout" size={16} /> <span className="sr-only">Sign out</span>
      </button>
    </div>
  );
}

function Shell() {
  const { session, loading } = useAuth();
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();

  useEffect(() => setDrawer(false), [location.pathname]);

  useEffect(() => {
    document.title = session ? 'Staff dashboard · Dardania | Elite' : 'Sign in · Dardania | Elite';
  }, [session]);

  if (loading) {
    return (
      <div className="auth-shell">
        <Loading label="Verifying your dashboard session…" />
      </div>
    );
  }

  if (!session) {
    return (
      <>
        <header className="site-header">
          <div className="container row-between">
            <Logo />
            <Link className="btn btn-secondary btn-small" to="/">
              Back to website
            </Link>
          </div>
        </header>
        <main>
          <Login />
        </main>
      </>
    );
  }

  const canSeeHistory = HISTORY_LEVELS.includes(session.accessLevel);

  return (
    <div className="dash-shell">
      <aside className={`dash-sidebar ${drawer ? 'open' : ''}`} aria-label="Dashboard navigation">
        <Logo />
        <div className="note note-owner small">
          <div className="row-between">
            <strong>{session.accessLevel.replace('_', '-')}</strong>
            <span className="badge badge-success">Authenticated</span>
          </div>
          <div className="muted" style={{ marginTop: 4 }}>
            Access from the ID allowlist — not from Discord roles.
          </div>
        </div>
        <nav className="dash-nav">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="dash-nav-group">{group.label}</div>
              {group.items
                .filter(
                  (item) =>
                    !item.level ||
                    item.level === session.accessLevel ||
                    (item.level === 'CO_OWNER' && canSeeHistory),
                )
                .map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end ?? false}
                    className={({ isActive }) => (isActive ? 'active' : undefined)}
                  >
                    <Icon name={item.icon} size={17} />
                    {item.label}
                  </NavLink>
                ))}
            </div>
          ))}
        </nav>
        <Link to="/" className="btn btn-secondary btn-small">
          <Icon name="external" size={14} /> View public site
        </Link>
      </aside>

      {drawer && (
        <div className="drawer-backdrop" role="presentation" onClick={() => setDrawer(false)} />
      )}

      <div className="dash-main">
        <div className="dash-mobile-bar">
          <button
            type="button"
            className="menu-toggle"
            onClick={() => setDrawer(true)}
            aria-label="Open dashboard navigation"
          >
            <Icon name="menu" size={20} />
          </button>
          <Logo compact />
        </div>
        <div className="dash-topbar">
          <div className="row small muted">
            <Icon name="clock" size={14} />
            Session expires {new Date(session.sessionExpiresAt).toLocaleString()}
          </div>
          <UserChip />
        </div>
        <main className="dash-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function DashboardLayout() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
