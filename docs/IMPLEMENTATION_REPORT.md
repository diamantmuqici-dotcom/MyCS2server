# Implementation report

Date: 2026-10-19. This is a factual status report, not a marketing page.

## Delivered

| Area                                                                                                                   | Status                                | Where                                                             |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------- |
| Monorepo (npm workspaces, TypeScript, ESM)                                                                             | Done                                  | `apps/*`, `packages/*`                                            |
| Public website (home, servers, rules, announcements, status, 404)                                                      | Done                                  | `apps/web/src/pages`                                              |
| Owner dashboard (auth, overview, cases, bans, staff, Steam, PC checks, announcements, audit, settings, access, system) | Done                                  | `apps/web/src/dashboard`                                          |
| Fastify API + Zod validation + rate limits + security headers                                                          | Done                                  | `apps/api/src`                                                    |
| Discord OAuth2, HttpOnly cookie sessions, CSRF double-submit                                                           | Done                                  | `apps/api/src/auth`, `apps/web/src/lib/api.ts`                    |
| Explicit user-ID allowlist + audited database grants                                                                   | Done                                  | `packages/shared/src/env.ts`, `packages/db/src/repos/access.ts`   |
| Moderation case model with immutable snapshots                                                                         | Done                                  | `packages/db/migrations/001_initial_schema.sql`, `repos/cases.ts` |
| Steam identity tracking (current name vs snapshot, history, links)                                                     | Done                                  | `repos/steam.ts`, `services/steam.ts`                             |
| PC-check case workflow with staff notes                                                                                | Done                                  | `repos/pcChecks.ts`, `services/pcChecks.ts`                       |
| Announcements (draft → publish → Discord delivery outbox)                                                              | Done                                  | `services/announcements.ts`, `repos/outbox.ts`                    |
| Audit trail                                                                                                            | Done                                  | `repos/audit.ts` (insert/read only)                               |
| Discord bot with 22 commands, audit-log attribution, durable outbox                                                    | Done, not started here (no bot token) | `apps/bot/src`                                                    |
| Migrations for SQLite and PostgreSQL                                                                                   | Done (SQLite exercised)               | `packages/db/migrations`                                          |
| Tests (Vitest)                                                                                                         | 68 passing across 13 files            | `tests`                                                           |
| ESLint + Prettier + TypeScript                                                                                         | Clean                                 | root scripts                                                      |
| CI (typecheck, lint, format, test, build)                                                                              | Done                                  | `.github/workflows/ci.yml`                                        |
| GitHub Pages deploy                                                                                                    | Done (static site only)               | `.github/workflows/deploy-pages.yml`                              |
| Documentation                                                                                                          | Done                                  | `docs/`, `README.md`                                              |
| Docker / live hosting                                                                                                  | **Not provided**                      | —                                                                 |

## Verified in this environment

- `npm run db:migrate` applied `001_initial_schema.sql`, `002_indexes.sql`,
  `003_session_login_source.sql` to a fresh SQLite database.
- `npm run db:seed-demo` produced `DE-000001` … `DE-000003`, `PC-000001` and one
  announcement; all rows are `source = DEMO_SEED`.
- API started on `:8787`; `/api/health`, `/api/config`, `/api/servers`,
  `/api/status`, `/api/announcements` returned 200.
- Development login worked for an allowlisted ID; `/api/auth/me` reported
  `source: "dev"` and `accessLevel: "OWNER"`.
- Dashboard endpoints returned 200: overview, cases, case detail, active bans,
  staff, Steam accounts, Steam detail, PC checks, PC check detail, announcements,
  audit log, settings, access, health.
- `PATCH /api/dashboard/settings` without CSRF → 403; with `x-csrf-token` → 200.
- Case correction recorded a `case.correction_reason` audit entry and preserved
  the original event (verified by tests).
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` and
  `npm run build` all pass.
- The Vite dev server served the SPA and proxied `/api` to the backend.

## Not verified here (and why)

- **Discord OAuth2 end-to-end.** No Discord client ID/secret in this sandbox.
  The code path is implemented; only the development login was exercised.
- **The Discord bot process.** No bot token was available (the pasted token was
  never used in source or committed). Command definitions, permission guards,
  audit-log parsing and the outbox are unit-tested with mocks.
- **PostgreSQL.** No PostgreSQL server is available in this sandbox. The schema is
  written in a portable subset and the adapter is implemented, but CI here runs
  SQLite. Treat the first PostgreSQL deployment as a required validation step.
- **Steam Web API.** No `STEAM_API_KEY`. Without a key, current-name refresh is
  skipped and snapshots only contain the name supplied at event time.
- **A2S on a real server.** No CS2 server was reachable; the timeout path was
  verified and is reported honestly as offline.
- **Screenshots / browser rendering.** No headless browser is installed. The
  public home page is mounted in jsdom tests; visual review is pending.

## Before launch — required actions

1. **Rotate the Discord bot token.** A token was pasted into chat during the
   build. Reset it in the Discord developer portal and update the deployment
   secret. Do not reuse the pasted value anywhere.
2. **Remove demo data** (`source = 'DEMO_SEED'`) using the SQL in
   `docs/OPERATIONS.md`.
3. Configure the real Discord guild ID, owner/co-owner user IDs, OAuth redirect
   URL, and `PUBLIC_DISCORD_INVITE_URL`.
4. Add real server addresses to `PUBLIC_SERVERS` (the site will query them; it
   never invents player counts).
5. Run `/setup-server`, `/post-rules` and `/post-server-info` with the bot.
6. Configure PostgreSQL, run migrations, and test the app against it.
7. Set up scheduled backups and perform one restore drill.
8. Enable branch protection and require the CI workflow.

## Known limitations

- In-memory rate limiting (single process).
- A2S single-packet only (split/compressed replies reported as offline).
- Audit table immutability is enforced by the application, not by database
  triggers.
- GitHub Pages can host the public site but not the API-backed dashboard without a
  separate API origin and rewrite.
- No email notifications, payment integration or public player-statistics
  aggregation — these were out of scope.
