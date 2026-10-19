import { levelRank, type AccessLevel, type SessionUserDto } from '@dardania/shared';
import { getActiveAccess, type Db } from '@dardania/db';
import type { ApiEnv } from '@dardania/shared';

export interface ResolvedAccess {
  level: AccessLevel;
  source: 'allowlist' | 'database';
}

/**
 * Dashboard access policy — completely independent of Discord server roles.
 *
 * Precedence: explicit environment allowlists first (owner > co-owner > pc
 * checker), then active database grants. The highest level wins.
 */
export async function resolveAccess(
  db: Db,
  env: ApiEnv,
  discordUserId: string,
): Promise<ResolvedAccess | null> {
  const candidates: ResolvedAccess[] = [];
  if (env.owners.includes(discordUserId)) candidates.push({ level: 'OWNER', source: 'allowlist' });
  if (env.coOwners.includes(discordUserId))
    candidates.push({ level: 'CO_OWNER', source: 'allowlist' });
  if (env.pcCheckers.includes(discordUserId))
    candidates.push({ level: 'PC_CHECKER', source: 'allowlist' });

  if (env.discord.guildId) {
    const stored = await getActiveAccess(db, env.discord.guildId, discordUserId);
    if (stored) candidates.push({ level: stored.level, source: 'database' });
  }
  if (candidates.length === 0) return null;
  return candidates.reduce((best, candidate) =>
    levelRank(candidate.level) > levelRank(best.level) ? candidate : best,
  );
}

export function avatarUrl(discordUserId: string, avatarHash: string | null): string | null {
  if (!avatarHash) return null;
  const extension = avatarHash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${discordUserId}/${avatarHash}.${extension}?size=128`;
}

export function toSessionUser(input: {
  discordUserId: string;
  username: string;
  displayName: string | null;
  avatarHash: string | null;
  accessLevel: AccessLevel;
  guildId: string;
  source: SessionUserDto['source'];
  sessionExpiresAt: string;
  csrfToken: string;
}): SessionUserDto {
  return {
    discordUserId: input.discordUserId,
    username: input.username,
    displayName: input.displayName,
    avatarUrl: avatarUrl(input.discordUserId, input.avatarHash),
    accessLevel: input.accessLevel,
    guildId: input.guildId,
    source: input.source,
    sessionExpiresAt: input.sessionExpiresAt,
    csrfToken: input.csrfToken,
  };
}
