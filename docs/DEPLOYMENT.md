# Deployment

This guide assumes Node.js 22.12+, a PostgreSQL 15+ database, and a Discord
application. Nothing below is automated for you: no live instance is included.

## 1. Discord application

1. Create an application at <https://discord.com/developers/applications>.
2. **Bot** → reset/copy the token (store it as a secret, never in Git).
3. **OAuth2** → add the redirect URL:
   `https://<api-host>/api/auth/discord/callback`.
4. Invite the bot with the scopes `bot` and `applications.commands`, and the
   permissions: Manage Roles, Manage Channels, Ban Members, Kick Members, Moderate
   Members, Manage Messages, Send Messages, Embed Links, Read Message History,
   View Audit Log.
5. Put the guild ID in `DISCORD_GUILD_ID`.
6. Run `/setup-server` as the guild owner to preview and create the layout, then
   `/post-rules` and `/post-server-info`.

## 2. Database

```bash
DATABASE_URL='postgres://user:pass@host:5432/dardania?sslmode=require' npm run db:migrate
```

The migration runner is idempotent. Back it up with `scripts/backup-db.sh`
(`pg_dump --format=custom`).

## 3. API

Environment (minimum):

```ini
NODE_ENV=production
DATABASE_URL=postgres://...
SESSION_SECRET=<48 random bytes>
SERVICE_TOKEN=<32 random bytes>
COOKIE_SECURE=true
ALLOW_DEV_LOGIN=false
DISCORD_CLIENT_ID=...
DISCORD_OAUTH_CLIENT_SECRET=...
DISCORD_OAUTH_REDIRECT_URI=https://api.example.com/api/auth/discord/callback
DISCORD_GUILD_ID=...
DASHBOARD_OWNER_DISCORD_IDS=...
WEB_ORIGIN=https://example.com
PUBLIC_DISCORD_INVITE_URL=https://discord.gg/...
PUBLIC_SERVERS=[{"label":"Dardania | Elite • Retake","connect":"cs.example.com:27015"}]
```

Start with `npm run start:api`. The process refuses to boot if the production
configuration is unsafe. Health check: `GET /api/health`.

To serve the SPA from the same origin: `npm run build`, set `SERVE_WEB=true` and
point `WEB_DIST_DIR` at `apps/web/dist`. The API then serves static files and
falls back to `index.html`.

## 4. Website

Any static host works. Build with:

```bash
VITE_BASE_PATH=/ npm run build -w @dardania/web
```

The SPA calls relative `/api/*` paths. Configure the host to proxy `/api` to the
API origin (Netlify/Vercel rewrite, Nginx `proxy_pass`, Cloudflare Worker). A CDN
alone cannot proxy the dashboard.

### GitHub Pages

`.github/workflows/deploy-pages.yml` builds the site with
`VITE_BASE_PATH=/<repo-name>/` and publishes `apps/web/dist`. Pages is static
only, so the dashboard needs an API on another origin plus a rewrite. For a
same-origin deployment, host the built SPA behind the API instead.

## 5. Bot

```ini
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
DISCORD_GUILD_ID=...
API_BASE_URL_INTERNAL=https://api.example.com
SERVICE_TOKEN=<same value as the API>
BOT_OUTBOX_PATH=./data/bot-outbox.jsonl
```

Start with `npm run start:bot`. The bot posts a heartbeat every 30 seconds; until
it does, the status page shows the bot as **unknown**, not "online".

Register slash commands once with `npm run register:commands` if the bot does not
do it at startup.

## 6. First-run checklist

- [ ] `/api/health` returns `200` and `/api/status` shows the database as operational.
- [ ] Dashboard login works for an allowlisted Discord ID and fails for anyone else.
- [ ] A test ban appears in the dashboard with the correct reference and moderator.
- [ ] Renaming the Steam account changes "current name" but not "name at event".
- [ ] Unbanning creates a second case and links it to the original.
- [ ] `/post-rules` renders both languages.
- [ ] Demo rows (`source = DEMO_SEED`) are removed.
- [ ] Backups run on a schedule and have been restored once in a staging database.
