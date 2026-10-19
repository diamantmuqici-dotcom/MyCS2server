# Security model

## Dashboard access

- Access is granted by **explicit Discord user ID only**:
  - `DASHBOARD_OWNER_DISCORD_IDS`
  - `DASHBOARD_CO_OWNER_DISCORD_IDS`
  - `DASHBOARD_PC_CHECKER_DISCORD_IDS`
  - or an active row in `dashboard_access`, created by an Owner in the dashboard
    or by `npm run db:promote-owner`.
- Discord roles are never consulted for dashboard access. A `@Owner` role without
  an allowlist entry cannot log in, and the tests assert this.
- `PC_CHECKER` may view and annotate PC checks only; moderation history endpoints
  require `CO_OWNER` or `OWNER`.
- Environment allowlist entries cannot be revoked through the API — changing them
  requires a deployment. This prevents an owner from accidentally locking out the
  configured superuser.
- Unknown Discord IDs are rejected with `403` and the denial is audited.

## Sessions and CSRF

- Session tokens are 32 random bytes, stored as a SHA-256 hash. A database leak
  does not yield usable cookies.
- Cookies: `de_session` (HttpOnly, SameSite=Lax, `Secure` when `COOKIE_SECURE`),
  `de_csrf` (readable by the SPA).
- Every `POST`, `PATCH`, `PUT`, `DELETE` requires `x-csrf-token` matching the
  session's CSRF token. Missing or wrong tokens return `403`.
- Sessions expire after `SESSION_TTL_HOURS` (max 72). Logout revokes the row.
- Login endpoints are rate limited per IP hash.

## Service-to-service authentication

The bot calls `/api/internal/*` with `x-service-token`. Comparison is
constant-time. The token is never exposed to the browser. If it is missing in
production, the API refuses to start.

## Input handling

- Every request body and query string is parsed with Zod schemas
  (`apps/api/src/schemas.ts`). Unknown keys are stripped.
- Case references are validated against `DE-\d{6}` / `PC-\d{6}` patterns.
- Discord IDs must be numeric snowflakes; usernames are rejected by configuration
  parsers.
- SQL is parameterised everywhere; the only string interpolation is a generated
  placeholder list for `IN (...)` clauses.
- Security headers (CSP, frame-ancestors, nosniff, referrer policy, HSTS in
  production) are set in `app.ts`.
- IP addresses are hashed before storage in audit rows.

## Audit trail

`audit_events` is append-only by construction: `repos/audit.ts` exposes only
insert and read helpers, and there is no UPDATE/DELETE path for the table
anywhere in the codebase. Events include logins, denials, case corrections,
grants/revocations, settings changes, announcement publication and PC-check
changes.

## Secrets

- `.env` is gitignored; `.env.example` contains blank values.
- Bot token and OAuth secret are read from environment variables only.
- Logs never print secret values; `describeApiEnv()` lists which features are
  configured, not their contents.
- If a Discord bot token is ever pasted into a chat, ticket, screenshot or commit,
  reset it immediately in the Discord developer portal.

## Known limitations

- Rate limiting is in-memory per process. Behind multiple API instances, use a
  shared store (Redis) or enforce limits at the proxy.
- Discord OAuth2 scopes are `identify` and `guilds`; the guild membership check is
  performed against the configured guild ID.
- The audit log is immutable to the application, not to a database administrator.
