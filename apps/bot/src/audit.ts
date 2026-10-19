import { AuditLogEvent, type Guild, type GuildAuditLogsEntry } from 'discord.js';

export type AuditedAction = 'ban' | 'unban' | 'kick';

const AUDIT_TYPE: Record<AuditedAction, AuditLogEvent> = {
  ban: AuditLogEvent.MemberBanAdd,
  unban: AuditLogEvent.MemberBanRemove,
  kick: AuditLogEvent.MemberKick,
};

export interface AuditMatch {
  entryId: string;
  executorId: string | null;
  executorName: string | null;
  executorIsBot: boolean;
  action: AuditedAction;
  createdAt: string;
}

function describeExecutor(
  executor: {
    id: string;
    username?: string | null;
    globalName?: string | null;
    bot?: boolean;
  } | null,
): {
  id: string | null;
  name: string | null;
  isBot: boolean;
} {
  if (!executor) return { id: null, name: null, isBot: false };
  return {
    id: executor.id,
    name: executor.globalName ?? executor.username ?? null,
    isBot: executor.bot ?? false,
  };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Finds the audit-log entry that belongs to a just-performed action.
 *
 * Audit log entries can lag behind gateway events by a few seconds, so the
 * lookup retries with backoff. Returning null is a valid outcome: attribution
 * is then recorded as UNKNOWN, never guessed.
 */
export async function findAuditEntry(
  guild: Guild,
  action: AuditedAction,
  targetId: string,
  options: { attempts?: number; windowMs?: number; toleranceMs?: number; near?: string } = {},
): Promise<AuditMatch | null> {
  const attempts = options.attempts ?? 4;
  const windowMs = options.windowMs ?? 20_000;
  const toleranceMs = options.toleranceMs ?? 5 * 60 * 1000;
  const reference = options.near ? new Date(options.near).getTime() : Date.now();
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const logs = await guild.fetchAuditLogs({ type: AUDIT_TYPE[action], limit: 25 });
      const entry = logs.entries.find((candidate: GuildAuditLogsEntry) => {
        if (!candidate.targetId || candidate.targetId !== targetId) return false;
        const delta = Math.abs(candidate.createdTimestamp - reference);
        return delta <= (options.near ? toleranceMs : windowMs);
      });
      if (entry) {
        const executor = describeExecutor(entry.executor);
        return {
          entryId: entry.id,
          executorId: executor.id,
          executorName: executor.name,
          executorIsBot: executor.isBot,
          action,
          createdAt: new Date(entry.createdTimestamp).toISOString(),
        };
      }
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts - 1) await sleep(400 * Math.pow(2, attempt));
  }
  if (lastError) {
    // Surface only to logs; attribution simply stays unknown.
    console.warn('[audit] audit log lookup failed', lastError);
  }
  return null;
}
