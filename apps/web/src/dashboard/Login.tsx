import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SessionUserDto } from '@dardania/shared';
import { apiFetch, ApiError } from '../lib/api.js';
import { useAuth } from '../lib/session.js';
import { asset } from '../components/Logo.js';
import { Icon } from '../components/Icon.js';
import { Alert, Button, Field } from '../components/ui.js';

const ERROR_MESSAGES: Record<string, string> = {
  no_access:
    'That Discord account is not on the dashboard allowlist. Ask an Owner to add your Discord user ID — server roles alone do not grant access.',
  access_denied: 'Discord sign-in was cancelled before it completed.',
  oauth_failed: 'Discord rejected the sign-in attempt. Please try again.',
  state_mismatch: 'The sign-in session expired or was tampered with. Please start again.',
  invalid_state: 'The sign-in session expired. Please start again.',
};

interface AuthConfig {
  discordOAuthEnabled: boolean;
  devLoginEnabled: boolean;
  accessLevels: string[];
}

export function Login() {
  const { refresh } = useAuth();
  const [params] = useSearchParams();
  const errorCode = params.get('error');
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [devId, setDevId] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<AuthConfig>('/api/auth/config')
      .then(setConfig)
      .catch((error: unknown) => {
        setConfigError(
          error instanceof ApiError ? error.message : 'Could not read the authentication policy.',
        );
      });
  }, []);

  const devLogin = async () => {
    setBusy(true);
    setFormError(null);
    try {
      await apiFetch<{ sessionUser: SessionUserDto }>('/api/auth/dev-login', {
        method: 'POST',
        body: devId.trim() ? { discordUserId: devId.trim() } : {},
      });
      await refresh();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'Development sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="card auth-card card-glow">
        <img src={asset('brand/emblem-512.png')} alt="Dardania | Elite" width={96} height={96} />
        <div className="stack" style={{ gap: '0.4rem', alignItems: 'center' }}>
          <span className="eyebrow" style={{ justifyContent: 'center' }}>
            Private area
          </span>
          <h1 className="h2">Staff dashboard</h1>
          <p className="small muted">
            Moderation history, PC checks and announcements for Dardania | Elite. Access is granted
            only through an explicit Discord user-ID allowlist.
          </p>
        </div>

        {errorCode && (
          <Alert tone="danger">
            <Icon name="alert" size={16} />
            <span>{ERROR_MESSAGES[errorCode] ?? 'Sign-in failed. Please try again.'}</span>
          </Alert>
        )}
        {configError && <Alert tone="warning">{configError}</Alert>}
        {formError && <Alert tone="danger">{formError}</Alert>}

        {config?.discordOAuthEnabled && (
          <a className="btn btn-block" href="/api/auth/discord/login?redirect=/dashboard">
            <Icon name="users" size={16} /> Sign in with Discord
          </a>
        )}

        {config && !config.discordOAuthEnabled && (
          <Alert tone="warning">
            Discord OAuth2 is not configured on this deployment. Set{' '}
            <span className="mono">DISCORD_CLIENT_ID</span>,{' '}
            <span className="mono">DISCORD_OAUTH_CLIENT_SECRET</span> and the redirect URI to enable
            it.
          </Alert>
        )}

        {config?.devLoginEnabled && (
          <div className="stack" style={{ width: '100%', textAlign: 'left' }}>
            <div className="note">
              <strong>Local development only.</strong> Development login is disabled automatically
              in production. It only works for Discord IDs already on the allowlist.
            </div>
            <Field
              label="Allowlisted Discord user ID"
              htmlFor="dev-id"
              hint="Leave empty to use the first configured owner ID."
            >
              <input
                id="dev-id"
                className="input mono"
                inputMode="numeric"
                placeholder="123456789012345678"
                value={devId}
                onChange={(event) => setDevId(event.target.value)}
              />
            </Field>
            <Button onClick={() => void devLogin()} disabled={busy}>
              {busy ? 'Signing in…' : 'Continue in development mode'}
            </Button>
          </div>
        )}

        <div className="small muted">
          <Icon name="shield" size={14} /> Sessions use HttpOnly cookies, CSRF double-submit tokens
          and are rate limited. Discord roles never grant dashboard access.
        </div>
      </div>
    </div>
  );
}
