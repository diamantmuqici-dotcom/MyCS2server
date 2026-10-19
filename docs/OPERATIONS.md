# Operations runbook

## Daily / weekly

- Check `/api/status` and the dashboard **System** page: the bot and Discord rows
  must be recent. An old heartbeat is rendered as `unknown`.
- Review the dashboard **Audit** page for unexpected grants, denials or
  corrections.
- Confirm the backup job produced a file. Backups are gitignored.

## Backups

```bash
DATABASE_URL=postgres://... scripts/backup-db.sh
# SQLite development database:
DATABASE_URL=sqlite:./data/dev.sqlite scripts/backup-db.sh
```

SQLite backups use `VACUUM INTO`, so they are consistent while the API is running.
PostgreSQL backups use `pg_dump --format=custom`; restore with `pg_restore`.

Suggested schedule: hourly for PostgreSQL, daily for SQLite, 30-day retention.
Test a restore into a scratch database at least once per quarter.

## Migrations

1. Add a new numbered file to `packages/db/migrations` (e.g.
   `004_add_appeal_notes.sql`).
2. Never edit an applied migration: the runner records filenames, and local
   checksums in development will catch accidental edits immediately.
3. Test against a copy of production data before deploying.
4. `npm run db:migrate` on deploy. Migrations run in a transaction.

## Removing demo data before launch

The demo seed writes rows with `source = 'DEMO_SEED'`, one announcement and a few
`DEMO_SEED` Steam observations. Remove them with SQL (write the statement first,
run it inside a transaction, and take a backup):

```sql
BEGIN;
DELETE FROM integration_outbox WHERE dedupe_key LIKE 'announcement:%';
DELETE FROM pc_check_notes WHERE pc_check_id IN (SELECT id FROM pc_check_cases WHERE reason LIKE 'DEMO DATA%');
DELETE FROM pc_check_cases WHERE reason LIKE 'DEMO DATA%';
DELETE FROM warnings WHERE case_id IN (SELECT id FROM moderation_cases WHERE source = 'DEMO_SEED');
DELETE FROM ban_events WHERE source = 'DEMO_SEED';
DELETE FROM unban_events WHERE source = 'DEMO_SEED';
DELETE FROM moderation_cases WHERE source = 'DEMO_SEED';
DELETE FROM announcements WHERE title LIKE 'Demo announcement%';
DELETE FROM audit_events WHERE summary LIKE '%demo%';
DELETE FROM steam_name_history WHERE source = 'DEMO_SEED';
DELETE FROM steam_accounts WHERE first_seen_at IS NOT NULL
  AND steam_id64 IN ('76561198000000001', '76561198000000002');
UPDATE service_health SET status = 'unknown',
  detail_json = '{"detail":"Reset after removing demo data."}'
  WHERE service IN ('bot', 'discord');
COMMIT;
```

Then confirm the dashboard no longer shows the demo banner.

## Bot outages

The bot writes moderation events to `data/bot-outbox.jsonl` when the API is
unreachable and flushes them automatically. Inspect the queue depth in
`/api/status` (bot heartbeat detail) or by counting lines in the file. Do not
delete the file while the bot is running; stop the bot, investigate, and restart.

## Suspected token leak

1. Discord developer portal → Bot → Reset Token.
2. Update the deployment secret, restart the bot.
3. Rotate `SERVICE_TOKEN` in the API and bot together; restart both.
4. Rotate `SESSION_SECRET` to invalidate all dashboard sessions.
5. Review `audit_events` for logins from unexpected actors.

## Common problems

| Symptom                             | Cause / fix                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------- |
| Dashboard returns 403 for the owner | The ID is not in the allowlist or active grants; check the exact snowflake. |
| Login redirect fails                | `DISCORD_OAUTH_REDIRECT_URI` does not match the developer portal exactly.   |
| Server cards show offline           | The server is unreachable, or it answers with split/compressed A2S packets. |
| Bot shows `unknown`                 | No heartbeat within 5 minutes; check the bot process and `SERVICE_TOKEN`.   |
| `ALLOW_DEV_LOGIN` error at boot     | Production refuses development login; set it to `false`.                    |
