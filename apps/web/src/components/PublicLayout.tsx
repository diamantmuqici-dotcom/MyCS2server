import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { BRAND } from '@dardania/shared';
import { useConfig } from '../lib/config.js';
import { Logo, asset } from './Logo.js';
import { Icon } from './Icon.js';

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/announcements', label: 'Announcements' },
  { to: '/rules', label: 'Rules' },
  { to: '/status', label: 'Status' },
];

export function PublicLayout() {
  const { config } = useConfig();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="container">
          <Logo />
          <nav className="site-nav" aria-label="Primary">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => (isActive ? 'active' : undefined)}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="header-actions">
            {config?.discordInviteUrl ? (
              <a
                className="btn btn-small"
                href={config.discordInviteUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                Join Discord <Icon name="external" size={14} />
              </a>
            ) : (
              <Link className="btn btn-secondary btn-small" to="/status">
                Community status
              </Link>
            )}
            <Link className="btn btn-secondary btn-small" to="/dashboard">
              <Icon name="shield" size={15} /> Dashboard
            </Link>
            <button
              type="button"
              className="menu-toggle"
              aria-expanded={open}
              aria-controls="mobile-nav"
              aria-label={open ? 'Close menu' : 'Open menu'}
              onClick={() => setOpen((value) => !value)}
            >
              <Icon name={open ? 'close' : 'menu'} size={20} />
            </button>
          </div>
        </div>
        {open && (
          <nav className="mobile-nav" id="mobile-nav" aria-label="Mobile">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => (isActive ? 'active' : undefined)}
              >
                {item.label}
              </NavLink>
            ))}
            <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'active' : undefined)}>
              Owner dashboard
            </NavLink>
          </nav>
        )}
      </header>

      <main id="main">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="container">
          <div className="footer-grid">
            <div className="footer-col">
              <Link to="/" className="brand" style={{ marginBottom: '0.85rem' }}>
                <img src={asset('brand/emblem-512.png')} alt="" width={40} height={40} />
                <span className="brand-word">
                  <strong>DARDANIA | ELITE</strong>
                  <span>{BRAND.game}</span>
                </span>
              </Link>
              <p className="small muted" style={{ maxWidth: '32ch' }}>
                {BRAND.tagline} Community-run, transparent moderation, no pay-to-win.
              </p>
            </div>
            <div className="footer-col">
              <h4>Community</h4>
              {config?.discordInviteUrl ? (
                <a href={config.discordInviteUrl} target="_blank" rel="noreferrer noopener">
                  Discord server
                </a>
              ) : null}
              {config?.steamGroupUrl ? (
                <a href={config.steamGroupUrl} target="_blank" rel="noreferrer noopener">
                  Steam group
                </a>
              ) : null}
              <Link to="/announcements">Announcements</Link>
              <Link to="/status">Service status</Link>
            </div>
            <div className="footer-col">
              <h4>Resources</h4>
              <Link to="/rules">Community rules</Link>
              <Link to="/rules#pc-checks">PC checks</Link>
              <Link to="/rules#moderation">Appeals</Link>
              {config?.supportUrl ? (
                <a href={config.supportUrl} target="_blank" rel="noreferrer noopener">
                  Support
                </a>
              ) : null}
            </div>
            <div className="footer-col">
              <h4>Staff</h4>
              <Link to="/dashboard">Owner dashboard</Link>
              {config?.contactEmail ? <a href={`mailto:${config.contactEmail}`}>Contact</a> : null}
              <span className="small muted" style={{ display: 'block', paddingTop: '0.4rem' }}>
                Access is limited to an explicit Owner / Co-Owner ID allowlist.
              </span>
            </div>
          </div>
          <div className="footer-bottom">
            <span>
              © {new Date().getFullYear()} {BRAND.name}. Not affiliated with Valve Corporation.
            </span>
            <span>
              Rules v{config?.rulesVersion ?? BRAND.abbreviation} · Counter-Strike 2 is a trademark of
              Valve Corporation.
            </span>
          </div>
        </div>
      </footer>
    </>
  );
}
