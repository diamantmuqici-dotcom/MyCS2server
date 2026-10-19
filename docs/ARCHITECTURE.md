# Architecture

```
                         ┌────────────────────────────┐
  Player / visitor ─────▶│  apps/web (public site)     │
                         │  Vite + React 19            │
                         └─────────────┬──────────────┘
                                       │ /api (same origin or proxied)
                         ┌─────────────▼──────────────┐
  Owner / Co-Owner ─────▶│  apps/api (Fastify 5)       │
                         │  public · auth · dashboard  │
                         │  internal (bot)             │
                         └──────┬──────────────┬──────┘
                                │              │
                    ┌───────────▼───┐   ┌──────▼─────────────┐
                    │ PostgreSQL    │   │ Discord REST / A2S │
                    │ (SQLite in    │   │ Steam Web API      │
                    │  development) │   └────────────────────┘
                    └───────────────┘
                                ▲
                         ┌──────┴─────────────────────┐
                         │ apps/bot (discord.js v14)  │
                         └────────────────────────────┘
```

## Packages

### `packages/shared`

The only source of truth for contracts (`types.ts`), access levels
(`access.ts`), brand (`brand.ts`), bilingual rules (`rules.ts`), Steam parsing
(`steam.ts`), timestamps (`time.ts`) and environment validation (`env.ts`).

The package exposes `.` (runtime helpers and DTO types) and `./env`
(`loadApiEnv`, `loadBotEnv`). The split matters: the website must not pull
`node:crypto` into a browser bundle, so env loading is a separate entry point.

### `packages/db`

- `client.ts` — one `Db` interface over `node:sqlite` (development/tests) and
  `pg` (production). Placeholders are written as `?` and converted to `$n` for
  PostgreSQL. SQLite calls are serialised through a mutex because a transaction
  shares one connection.
- `migrations/` — numbered `.sql` files applied exactly once inside a
  transaction. Applied filenames are recorded in `schema_migrations`.
- `repos/` — every query lives in a repository; routes and commands never build
  SQL. Key invariants (immutable snapshots, linked unbans, append-only audit)
  are implemented here.

### `apps/api`

- `app.ts` — Fastify construction, security headers, request IDs, error handling.
- `auth/` — Discord OAuth2, session creation/rotation, CSRF, allowlist evaluation
  (`env` allowlist + database grants; roles are ignored).
- `guards.ts` — `history` and `owner` pre-handlers, plus the internal service
  token guard.
- `routes/public.ts` — `/api/health`, `/api/config`, `/api/servers`,
  `/api/status`, `/api/announcements`.
- `routes/auth.ts` — `/api/auth/discord`, `/callback`, `/dev-login`, `/me`,
  `/session-policy`, `/logout`.
- `routes/dashboard.ts` — the entire authenticated surface (see the route list in
  `SECURITY.md`).
- `routes/internal.ts` — bot-only endpoints, guarded by `x-service-token`:
  moderation events, warnings, PC checks, Steam lookups/link/refresh, heartbeat,
  guild config, announcement mirroring and the delivery outbox.
- `services/a2s.ts` — real UDP A2S query; failures are reported, never faked.

### `apps/bot`

- `commands.ts` — 22 slash commands, guild-only by design.
- `handlers/` — command implementations. Every action is validated against the
  configured staff roles **and** Discord permissions, then recorded through the
  API.
- `audit.ts` — resolves the executor from the Discord audit log. Missing or
  partial evidence produces `UNKNOWN` attribution.
- `local-outbox.ts` — durable JSONL queue for moderation events when the API is
  unavailable; `runtime.ts` retries on a timer and reports queue depth in the
  heartbeat.
- `runtime.ts` — also reconciles recent bans/kicks found in the audit log that the
  bot did not perform itself.

## Request flows

### Dashboard login

1. `GET /api/auth/discord` sets a signed `state` cookie and redirects to Discord.
2. Discord redirects to `/api/auth/discord/callback?code&state`.
3. The API exchanges the code, checks the state cookie, upserts the `users` row.
4. Access is resolved from `DASHBOARD_OWNER_DISCORD_IDS`,
   `DASHBOARD_CO_OWNER_DISCORD_IDS`, `DASHBOARD_PC_CHECKER_DISCORD_IDS` and active
   `dashboard_access` grants. A user with no grant receives 403 and an audit row.
5. A random session token is stored **hashed** in `sessions`; the raw token and a
   CSRF token are set as `HttpOnly` cookies.

### Moderation command

1. `/ban` checks hierarchy and permissions, confirms with the moderator, applies
   the Discord ban.
2. The bot looks up the audit-log entry for the executor.
3. It posts `/api/internal/moderation-events` with a `dedupeKey` and the Steam
   snapshot it observed.
4. The API writes the case, the ban event, the Steam snapshot and an audit row in
   one transaction. Retries with the same dedupe key return the original case.

### Unban

`/unban` creates a new case and sets `related_ban_case_id`; the original ban's
`status` becomes `LIFTED`, but its reason, moderator and Steam snapshot are not
touched. Both cases remain independently addressable by `DE-######` reference.

## Why SQLite and PostgreSQL

Development and tests use `node:sqlite`, which needs no service and keeps the test
suite fast and hermetic. Production uses PostgreSQL. The schema deliberately uses
only portable types (`TEXT`, `INTEGER`), ISO-8601 UTC strings and `ON CONFLICT`
syntax. The PostgreSQL adapter converts `?` placeholders and returns `bigint`
counters as strings, which the repositories normalise.
