import { describe, expect, it } from 'vitest';
import { AuditLogEvent, type Guild } from 'discord.js';
import { findAuditEntry } from '../../apps/bot/src/audit.js';

function guildWith(entries: unknown[]): Guild {
  return {
    fetchAuditLogs: async () => ({
      entries: { find: (predicate: (entry: unknown) => boolean) => entries.find(predicate) },
    }),
  } as unknown as Guild;
}

const targetId = '100000000000000101';

describe('audit log attribution', () => {
  it('returns the matching entry with a parsed executor', async () => {
    const now = Date.now();
    const guild = guildWith([
      {
        id: '900000000000000001',
        targetId,
        createdTimestamp: now,
        executor: {
          id: '100000000000000010',
          username: 'mod-user',
          globalName: 'Mod User',
          bot: false,
        },
      },
    ]);
    const match = await findAuditEntry(guild, 'ban', targetId, { attempts: 1 });
    expect(match).not.toBeNull();
    expect(match?.entryId).toBe('900000000000000001');
    expect(match?.executorId).toBe('100000000000000010');
    expect(match?.executorName).toBe('Mod User');
    expect(match?.executorIsBot).toBe(false);
  });

  it('never guesses when no audit entry matches', async () => {
    const match = await findAuditEntry(guildWith([]), 'ban', targetId, { attempts: 1 });
    expect(match).toBeNull();
  });

  it('ignores entries for a different target', async () => {
    const guild = guildWith([
      {
        id: '900000000000000002',
        targetId: '100000000000000999',
        createdTimestamp: Date.now(),
        executor: { id: '100000000000000010', username: 'mod-user' },
      },
    ]);
    expect(await findAuditEntry(guild, 'unban', targetId, { attempts: 1 })).toBeNull();
  });

  it('handles a partial executor with a null username', async () => {
    const guild = guildWith([
      {
        id: '900000000000000003',
        targetId,
        createdTimestamp: Date.now(),
        executor: { id: '100000000000000777', username: null, globalName: null },
      },
    ]);
    const match = await findAuditEntry(guild, 'kick', targetId, { attempts: 1 });
    expect(match?.executorName).toBeNull();
    expect(match?.action).toBe('kick');
  });

  it('uses the correct audit event type per action', async () => {
    const calls: AuditLogEvent[] = [];
    const guild = {
      fetchAuditLogs: async (options: { type: AuditLogEvent }) => {
        calls.push(options.type);
        return { entries: { find: () => undefined } };
      },
    } as unknown as Guild;
    await findAuditEntry(guild, 'ban', targetId, { attempts: 1 });
    await findAuditEntry(guild, 'unban', targetId, { attempts: 1 });
    await findAuditEntry(guild, 'kick', targetId, { attempts: 1 });
    expect(calls).toEqual([
      AuditLogEvent.MemberBanAdd,
      AuditLogEvent.MemberBanRemove,
      AuditLogEvent.MemberKick,
    ]);
  });
});
