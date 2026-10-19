import { useEffect, useMemo, useState } from 'react';
import type { GuildSettingsDto } from '@dardania/shared';
import { useApi } from '../lib/useApi.js';
import { useMutation, useAuth } from '../lib/session.js';
import { ApiError } from '../lib/api.js';
import { Alert, Button, ErrorPanel, Field, Loading } from '../components/ui.js';
import { PageHeader } from './ui.js';
import { RequireLevel } from './RequireLevel.js';

const ROLE_KEYS = ['owner', 'coOwner', 'administrator', 'headModerator', 'moderator', 'pcChecker'];
const CHANNEL_KEYS = [
  'welcome',
  'rules',
  'announcements',
  'serverInformation',
  'roles',
  'general',
  'cs2Chat',
  'lookingForTeam',
  'steamProfiles',
  'pcCheck1',
  'pcCheck2',
  'pcCheck3',
  'support',
  'pcCheckRequests',
  'staffChat',
  'staffAnnouncements',
  'staffNotes',
  'modLogs',
  'banLogs',
  'memberLogs',
  'messageLogs',
  'roleLogs',
  'pcCheckLogs',
  'botLogs',
];

export function Settings() {
  const { session } = useAuth();
  const { data, loading, error, reload } = useApi<{ settings: GuildSettingsDto }>(
    '/api/dashboard/settings',
  );
  const mutate = useMutation();
  const [roles, setRoles] = useState<Record<string, string | null>>({});
  const [channels, setChannels] = useState<Record<string, string | null>>({});
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [newFeature, setNewFeature] = useState('');

  useEffect(() => {
    if (data) {
      setRoles(data.settings.roles);
      setChannels(data.settings.channels);
      setFeatures(data.settings.features);
    }
  }, [data]);

  const isOwner = session?.accessLevel === 'OWNER';
  const roleEntries = useMemo(
    () =>
      [...new Set([...ROLE_KEYS, ...Object.keys(roles)])]
        .filter((key) => key in roles || ROLE_KEYS.includes(key))
        .map((key) => [key, roles[key] ?? ''] as const),
    [roles],
  );
  const channelEntries = useMemo(
    () =>
      [...new Set([...CHANNEL_KEYS, ...Object.keys(channels)])]
        .filter((key) => key in channels || CHANNEL_KEYS.includes(key))
        .map((key) => [key, channels[key] ?? ''] as const),
    [channels],
  );

  const save = async () => {
    setBusy(true);
    setFeedback(null);
    setFailure(null);
    const clean = (map: Record<string, string | null>): Record<string, string | null> =>
      Object.fromEntries(Object.entries(map).map(([key, value]) => [key, value?.trim() || null]));
    try {
      await mutate('/api/dashboard/settings', {
        method: 'PATCH',
        body: { roles: clean(roles), channels: clean(channels), features },
      });
      setFeedback('Settings saved. The bot picks up the new configuration within 60 seconds.');
      reload();
    } catch (caught) {
      setFailure(caught instanceof ApiError ? caught.message : 'Settings could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <RequireLevel level="CO_OWNER">
      <div className="stack" style={{ gap: '1.4rem' }}>
        <PageHeader
          title="Discord configuration"
          description="Role and channel IDs used by the bot. Run /setup in Discord to create the structure, then verify the IDs here."
          actions={
            isOwner ? (
              <Button onClick={() => void save()} disabled={busy}>
                {busy ? 'Saving…' : 'Save settings'}
              </Button>
            ) : (
              <span className="badge badge-warning">Read-only — Owner access required to save</span>
            )
          }
        />

        {!isOwner && (
          <div className="note">
            You can review the configuration, but only an Owner can change it. The API rejects
            writes from Co-Owner sessions.
          </div>
        )}
        {feedback && <Alert tone="success">{feedback}</Alert>}
        {failure && <Alert tone="danger">{failure}</Alert>}

        {loading && !data && <Loading label="Loading configuration…" />}
        {error && <ErrorPanel error={error} onRetry={reload} />}

        {data && (
          <>
            <section className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Guild</div>
                  <div className="card-subtitle">
                    {data.settings.guildName ?? 'Name not synced'} ·{' '}
                    <span className="mono">{data.settings.guildId}</span>
                  </div>
                </div>
                <span className="small muted">
                  {data.settings.updatedAt
                    ? `Updated ${new Date(data.settings.updatedAt).toLocaleString()}`
                    : 'Never updated from the dashboard'}
                </span>
              </div>
              <p className="small muted">
                The guild ID is fixed by the backend environment (
                <span className="mono">DISCORD_GUILD_ID</span>
                ). It is not editable here.
              </p>
            </section>

            <section className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Roles</div>
                  <div className="card-subtitle">
                    Role IDs used for permission checks. These roles never grant dashboard access.
                  </div>
                </div>
              </div>
              <div className="form-grid">
                {roleEntries.map(([key, value]) => (
                  <Field key={key} label={key} htmlFor={`role-${key}`}>
                    <input
                      id={`role-${key}`}
                      className="input mono"
                      value={value}
                      disabled={!isOwner}
                      placeholder="role ID or empty"
                      onChange={(event) =>
                        setRoles((current) => ({ ...current, [key]: event.target.value }))
                      }
                    />
                  </Field>
                ))}
              </div>
              {isOwner && (
                <div className="row" style={{ marginTop: '1rem' }}>
                  <Field label="Add custom role key" htmlFor="role-new">
                    <input
                      id="role-new"
                      className="input"
                      placeholder="e.g. eventHost"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          const key = (event.target as HTMLInputElement).value.trim();
                          if (key) {
                            setRoles((current) => ({ ...current, [key]: current[key] ?? '' }));
                            (event.target as HTMLInputElement).value = '';
                          }
                        }
                      }}
                    />
                  </Field>
                </div>
              )}
            </section>

            <section className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Channels</div>
                  <div className="card-subtitle">
                    Log and feature channels. Announcements are delivered to the{' '}
                    <span className="mono">announcements</span> channel.
                  </div>
                </div>
              </div>
              <div className="form-grid">
                {channelEntries.map(([key, value]) => (
                  <Field key={key} label={key} htmlFor={`channel-${key}`}>
                    <input
                      id={`channel-${key}`}
                      className="input mono"
                      value={value}
                      disabled={!isOwner}
                      placeholder="channel ID or empty"
                      onChange={(event) =>
                        setChannels((current) => ({ ...current, [key]: event.target.value }))
                      }
                    />
                  </Field>
                ))}
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Feature flags</div>
                  <div className="card-subtitle">
                    Stored per guild. The bot reads them from the same configuration endpoint.
                  </div>
                </div>
              </div>
              {Object.keys(features).length === 0 ? (
                <p className="small muted">No feature flags configured.</p>
              ) : (
                <div className="stack" style={{ gap: '0.5rem' }}>
                  {Object.entries(features).map(([key, value]) => (
                    <label className="checkbox" key={key}>
                      <input
                        type="checkbox"
                        checked={value}
                        disabled={!isOwner}
                        onChange={(event) =>
                          setFeatures((current) => ({ ...current, [key]: event.target.checked }))
                        }
                      />
                      <span className="mono">{key}</span>
                    </label>
                  ))}
                </div>
              )}
              {isOwner && (
                <div className="row" style={{ marginTop: '0.9rem' }}>
                  <input
                    className="input"
                    style={{ maxWidth: 240 }}
                    placeholder="new feature key"
                    value={newFeature}
                    onChange={(event) => setNewFeature(event.target.value)}
                  />
                  <Button
                    variant="secondary"
                    size="small"
                    disabled={!newFeature.trim()}
                    onClick={() => {
                      const key = newFeature.trim();
                      if (key) setFeatures((current) => ({ ...current, [key]: false }));
                      setNewFeature('');
                    }}
                  >
                    Add flag
                  </Button>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </RequireLevel>
  );
}
