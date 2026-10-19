# Dardania | Elite

A complete, self-hosted Counter-Strike 2 community platform: a public website, a
Discord moderation bot, a persistent backend API, and a private owner dashboard
built on Discord OAuth2 and an explicit user-ID allowlist.

The single non-negotiable design goal: **historical moderation records stay
accurate**. Discord usernames change, Steam display names change, bans are
lifted — but a case recorded last month must still show the name, the moderator,
and the reason that existed when it was recorded.

---

## What is in this repository

| App / package     | Purpose                                                                         |
| ----------------- | ------------------------------------------------------------------------------- |
| `apps/web`        | Public site + owner/co-owner dashboard (Vite, React 19, TypeScript)             |
| `apps/api`        | Fastify 5 backend: public API, internal bot API, OAuth2, dashboard API          |
| `apps/bot`        | discord.js v14 bot: 22 slash commands, audit-log reconciliation, durable outbox |
| `packages/shared` | Wire contracts, brand, bilingual rules, Steam helpers, env validation           |
| `packages/db`     | Portable SQL schema, migration runner, repositories for SQLite + PostgreSQL     |
| `scripts`         | Migration, demo seed, owner promotion, SQLite/PostgreSQL backup                 |
| `tests`           | Vitest suites for shared helpers, database invariants, API and bot logic        |

### Public website

- Home with honest server state, community copy, rules and announcements.
- Server status cards fed by a real A2S query. If a server does not answer, it is
  shown as **offline**, never as an estimated player count.
- Announcements list and detail, bilingual rulebook (EN/SQ), status page that
  distinguishes "no signal yet" from "outage".
- Responsive layout with the brand palette (navy `#06112F`, electric blue
  `#075BFF`, accent `#36A3FF`).

### Owner dashboard

- Owner, Co-Owner and scoped PC-Checker levels.
- Access is granted **only** by explicit Discord user ID — via environment
  allowlist or an audited database grant. Discord roles never grant access, and
  there is no frontend-only password or hidden URL.
- Discord OAuth2 login, HttpOnly session cookie, separate CSRF cookie echoed in
  the `x-csrf-token` header on every write, rate-limited login.
- Overview, case search, case detail with full audit trail, active bans, staff
  activity, Steam accounts with name history, PC checks, announcements, audit log,
  settings, access management and a security/health page.
- Every correction, grant, revoke and settings change is written to an
  append-only audit table.

### Discord bot

`/setup-server` previews and creates roles, categories and channels.
Moderation commands apply the Discord action and then record a case through the
API, with the moderator resolved from the audit log — if the audit log cannot
confirm who did it, the case is stored as **unknown**, never guessed.

```
setup-server  post-rules  announce  post-server-info  post-staff-announcement
ban  unban  kick  timeout  untimeout  warn  warnings  clear-warnings  purge
modlog  case  userinfo  serverinfo  staff-help
bans admin|user|steam|case
pc-check request|assign|status|note|close|history
steam link|profile
```

If the API is unreachable, moderation events are written to a local JSONL outbox
and retried; the bot reports the queue state instead of silently dropping history.

---

## Historical accuracy guarantees

These are enforced in code and covered by tests:

1. **Case snapshots are immutable.** `target_discord_username_at_event`,
   `moderator_name_at_event`, `steam_name_at_event` and
   `steam_profile_url_at_event` are written once. A later rename updates
   `steam_accounts.current_display_name` and appends to `steam_name_history`
   only.
2. **SteamID64 is the identity, names are labels.** Display names never identify
   an account. Vanity URLs must be resolved to a numeric ID.
3. **Unbans add, they never overwrite.** An unban creates a new case linked to
   the ban; the ban keeps its reason, moderator and snapshot, and only its current
   status becomes `LIFTED`.
4. **Unknown stays unknown.** When the Discord audit log does not identify the
   executor, `attribution_status = 'UNKNOWN'` and the moderator is `null`. The
   dashboard surfaces this instead of filling the gap.
5. **Corrections are additive.** An Owner correction writes a `case.corrected`
   audit event containing before/after values.
6. **Demo data is labelled.** Every seeded row uses `source = 'DEMO_SEED'` and
   the dashboard flags its presence.

---

## Quick start (development)

Requirements: Node.js **22.12+** (the project uses the built-in `node:sqlite`
driver), npm 10+.

```bash
git clone <this-repo>
cd MyCS2server
npm install
cp .env.example .env
# generate secrets and set them in .env:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
npm run db:migrate
npm run db:seed-demo        # optional, clearly-labelled demo rows
```

Run the API and the site in two terminals:

```bash
npm run dev:api             # http://localhost:8787
npm run dev:web             # http://localhost:5173  (/api proxied to the API)
```

To use the dashboard locally, set in `.env`:

```ini
ALLOW_DEV_LOGIN=true
DASHBOARD_OWNER_DISCORD_IDS=<your Discord user ID>
```

then open `/dashboard` and use the development login. `ALLOW_DEV_LOGIN` is
rejected in production; real logins use Discord OAuth2.

Run the bot (requires `DISCORD_TOKEN` and `SERVICE_TOKEN`):

```bash
npm run dev:bot
```

### Useful scripts

| Command                            | What it does                                           |
| ---------------------------------- | ------------------------------------------------------ |
| `npm run typecheck`                | TypeScript for every workspace                         |
| `npm run lint`                     | ESLint (flat config, type-aware rules)                 |
| `npm run format:check`             | Prettier check                                         |
| `npm test`                         | All Vitest suites (in-memory SQLite)                   |
| `npm run test:coverage`            | Coverage report                                        |
| `npm run build`                    | Production build of the website                        |
| `npm run db:migrate`               | Apply pending migrations                               |
| `npm run db:seed-demo`             | Insert labelled demo data (refuses in production)      |
| `npm run db:promote-owner -- <id>` | Grant dashboard access from the CLI                    |
| `scripts/backup-db.sh`             | Consistent SQLite or PostgreSQL backup into `backups/` |

---

## Configuration

All configuration lives in environment variables; `.env.example` documents every
key. Nothing secret is ever committed, and `.gitignore` excludes `.env`, SQLite
files, logs and backups.

Production requires, at minimum:

```ini
NODE_ENV=production
DATABASE_URL=postgres://...
SESSION_SECRET=<32+ random characters>
SERVICE_TOKEN=<24+ random characters>
COOKIE_SECURE=true
ALLOW_DEV_LOGIN=false
DISCORD_CLIENT_ID=...
DISCORD_OAUTH_CLIENT_SECRET=...
DISCORD_OAUTH_REDIRECT_URI=https://api.example.com/api/auth/discord/callback
DASHBOARD_OWNER_DISCORD_IDS=<your numeric Discord user ID>
DISCORD_GUILD_ID=<your guild ID>
WEB_ORIGIN=https://example.com
PUBLIC_DISCORD_INVITE_URL=https://discord.gg/...
```

`loadApiEnv()` refuses to start when a production configuration is unsafe
(missing secret, dev login enabled, insecure cookie, non-PostgreSQL database).

### Steam tracking

Without `STEAM_API_KEY`, Steam profiles are still tracked when a moderator
supplies a name at the time of the action, but names are never refreshed. With a
key, `/steam link`, `/steam profile` and the dashboard refresh current names
while leaving case snapshots untouched. Private or unreachable profiles are
reported as `PRIVATE`/`UNKNOWN`; the last confirmed name is never erased.

---

## Deployment

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for a full walkthrough.

Short version:

1. Provision PostgreSQL and run `npm run db:migrate`.
2. Deploy the API (any Node 22 host; `npm run start:api`). Either let it serve the
   built SPA (`SERVE_WEB=true`) or host the SPA separately and proxy `/api`.
3. Run the bot as a separate process (`npm run start:bot`).
4. Set the Discord OAuth redirect to
   `https://<api-host>/api/auth/discord/callback`.
5. Add the repository variables/secrets for the GitHub Actions workflows.

GitHub Actions:

- `ci.yml` — typecheck, lint, formatting, tests and production build on every
  push and pull request.
- `deploy-pages.yml` — publishes the public site to GitHub Pages. GitHub Pages
  only hosts static files, so the dashboard requires the API to be deployed
  separately and `VITE_API_BASE_URL`/proxy routing to be configured.

---

## Honest limitations

- **No live deployment is included.** This repository contains runnable code and
  CI configuration, not a hosted instance. Server cards show `unknown`/`offline`
  until a real CS2 server is configured in `PUBLIC_SERVERS`.
- **Discord and Steam credentials are not provided.** OAuth, bot commands and
  live Steam refresh require your own application credentials.
- **Demo rows are synthetic.** They are labelled `DEMO_SEED` and must be removed
  before launch; see `docs/OPERATIONS.md`.
- **A2S is single-packet.** Servers that reply with split/compressed A2S_INFO
  packets are reported as offline with the reason in the detail field rather than
  being guessed.
- **PostgreSQL is the production target but CI runs SQLite.** SQL is written in a
  portable dialect and covered by PostgreSQL-oriented code paths, but the test
  suite here uses in-memory SQLite because CI cannot provision a database
  service in this environment.

---

## Security notes

- Dashboard access is allowlist-only (environment IDs + audited database grants).
- Session tokens are random, hashed at rest, and delivered in `HttpOnly`,
  `SameSite=Lax` cookies; CSRF uses a double-submit token.
- The internal bot API requires `x-service-token`, compared in constant time.
- Rate limits protect login and all write endpoints.
- Never paste a bot token into chat or commit it: if a token has ever been
  exposed, reset it in the Discord developer portal and update the deployment
  secret.

See [`docs/SECURITY.md`](docs/SECURITY.md) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## License / ownership

Private community project. PlisatCS and other regional communities were used as
product inspiration only; no proprietary code, branding or assets were copied.
The `Dardania | Elite` name, palette and logo files in `apps/web/public/brand`
belong to the project owner.
