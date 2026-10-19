import { createDb, migrate, recordBanEvent, recordUnbanEvent, listCases, getOverviewCounts, observeSteamProfile, ensureSteamAccount } from '@dardania/db';
import { nowIso } from '@dardania/shared';
import { join } from 'node:path';

const db = await createDb('sqlite::memory:');
const result = await migrate(db, join(process.cwd(), 'packages/db/migrations'));
console.log('migrations', result);
const now = nowIso();
await ensureSteamAccount(db, { steamId64: '76561198000000001', now });
await observeSteamProfile(db, { steamId64: '76561198000000001', displayName: 'PlayerOne', profileStatus: 'PUBLIC', source: 'TEST', checkedAt: now });
const ban = await recordBanEvent(db, {
  guildId: '123', targetDiscordUserId: '999', targetUsername: 'badguy', moderatorDiscordUserId: '111', moderatorName: 'mod',
  reason: 'cheats', occurredAt: now, source: 'BOT_COMMAND', attributionStatus: 'VERIFIED',
  steamId64: '76561198000000001', steamNameAtEvent: 'PlayerOne', dedupeKey: 'k1',
}, now);
console.log('ban', ban.case.caseRef, ban.case.steamAtEvent, ban.case.steamCurrent);
const dup = await recordBanEvent(db, {
  guildId: '123', targetDiscordUserId: '999', occurredAt: now, source: 'BOT_COMMAND', attributionStatus: 'VERIFIED', dedupeKey: 'k1',
}, now);
console.log('dup', dup.duplicate, dup.case.caseRef);
const unban = await recordUnbanEvent(db, {
  guildId: '123', targetDiscordUserId: '999', moderatorDiscordUserId: '112', moderatorName: 'mod2', reason: 'appeal',
  occurredAt: now, source: 'BOT_COMMAND', attributionStatus: 'VERIFIED', dedupeKey: 'u1',
}, now);
console.log('unban', unban.case.caseRef, unban.relatedCaseRef, unban.case.relatedCases);
await observeSteamProfile(db, { steamId64: '76561198000000001', displayName: 'ElitePlayer', profileStatus: 'PUBLIC', source: 'TEST', checkedAt: new Date(Date.now()+1000).toISOString() });
const list = await listCases(db, { guildId: '123' });
console.log('list', list.total, list.items.map(c => [c.caseRef, c.actionType, c.banStatus, c.steamAtEvent.name, c.steamCurrent?.displayName]));
console.log('stats', await getOverviewCounts(db, '123'));
await db.close();
