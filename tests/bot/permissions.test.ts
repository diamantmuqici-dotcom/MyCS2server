import { describe, expect, it } from 'vitest';
import { PermissionFlagsBits, type Guild, type GuildMember } from 'discord.js';
import type { GuildSettingsDto } from '@dardania/shared';
import {
  canUseSetup,
  hasConfiguredRole,
  hierarchyProblem,
  isPcStaffMember,
  isStaffMember,
} from '../../apps/bot/src/permissions.js';

const ROLE_IDS = {
  owner: '200000000000000001',
  coOwner: '200000000000000002',
  administrator: '200000000000000003',
  headModerator: '200000000000000004',
  moderator: '200000000000000005',
  pcChecker: '200000000000000006',
};

function config(overrides: Partial<GuildSettingsDto> = {}): GuildSettingsDto {
  return {
    guildId: '100000000000000001',
    guildName: 'Dardania | Elite',
    roles: { ...ROLE_IDS },
    channels: {},
    features: {},
    updatedAt: null,
    updatedBy: null,
    ...overrides,
  };
}

interface MemberOptions {
  id?: string;
  roles?: string[];
  permissions?: bigint[];
  position?: number;
  bot?: boolean;
}

function member(options: MemberOptions = {}): GuildMember {
  const roleIds = new Set(options.roles ?? []);
  return {
    id: options.id ?? '100000000000000010',
    user: { bot: options.bot ?? false, id: options.id ?? '100000000000000010' },
    roles: {
      cache: {
        has: (id: string) => roleIds.has(id),
      },
      highest: { position: options.position ?? 10 },
    },
    permissions: {
      has: (flag: bigint) => (options.permissions ?? []).includes(flag),
    },
  } as unknown as GuildMember;
}

describe('bot permission checks', () => {
  it('recognises configured staff roles', () => {
    const staff = member({ roles: [ROLE_IDS.moderator] });
    expect(hasConfiguredRole(staff, config(), ['moderator'])).toBe(true);
    expect(isStaffMember(staff, config())).toBe(true);
  });

  it('does not treat an unrelated role as staff', () => {
    const regular = member({ roles: ['200000000000000099'] });
    expect(isStaffMember(regular, config())).toBe(false);
    expect(isPcStaffMember(regular, config())).toBe(false);
  });

  it('honours Discord moderation permissions as a fallback', () => {
    const admin = member({ permissions: [PermissionFlagsBits.Administrator] });
    expect(isStaffMember(admin, config())).toBe(true);
  });

  it('scopes PC checkers separately from moderators', () => {
    const pcChecker = member({ roles: [ROLE_IDS.pcChecker] });
    expect(isPcStaffMember(pcChecker, config())).toBe(true);
    expect(isStaffMember(pcChecker, config())).toBe(false);
  });

  it('fails closed when no configuration is available', () => {
    expect(isStaffMember(member({ roles: [ROLE_IDS.owner] }), null)).toBe(false);
  });

  it('restricts setup to the guild owner or an allowlisted owner/co-owner', () => {
    const guild = { ownerId: '100000000000000999' } as Guild;
    const regularAdmin = member({ permissions: [PermissionFlagsBits.ManageGuild] });
    expect(canUseSetup(guild, regularAdmin, config(), [], [])).toBe(false);
    expect(canUseSetup(guild, regularAdmin, config(), ['100000000000000010'], [])).toBe(true);
    const owner = member({ id: '100000000000000999' });
    expect(canUseSetup(guild, owner, config(), [], [])).toBe(true);
  });
});

describe('role hierarchy', () => {
  const guild = {
    ownerId: '100000000000000900',
    members: { me: { id: '100000000000000001' } },
  } as unknown as Guild;
  const bot = member({ id: '100000000000000001', position: 50 });

  it('blocks acting on the guild owner', () => {
    const actor = member({ id: '100000000000000010', position: 40 });
    const target = member({ id: '100000000000000900', position: 100 });
    expect(hierarchyProblem(guild, actor, target, bot, 'ban')).toMatch(/server owner/);
  });

  it('blocks acting on yourself', () => {
    const actor = member({ id: '100000000000000010', position: 40 });
    expect(hierarchyProblem(guild, actor, actor, bot, 'ban')).toMatch(/yourself/);
  });

  it('blocks equal or higher role targets', () => {
    const actor = member({ id: '100000000000000010', position: 20 });
    const target = member({ id: '100000000000000101', position: 20 });
    expect(hierarchyProblem(guild, actor, target, bot, 'kick')).toMatch(/hierarchy/);
  });

  it('requires the bot role to be above the target', () => {
    const actor = member({ id: '100000000000000010', position: 90 });
    const target = member({ id: '100000000000000101', position: 60 });
    const weakBot = member({ id: '100000000000000001', position: 30 });
    expect(hierarchyProblem(guild, actor, target, weakBot, 'timeout')).toMatch(/bot’s role/);
  });

  it('allows valid moderation targets', () => {
    const actor = member({ id: '100000000000000010', position: 40 });
    const target = member({ id: '100000000000000101', position: 10 });
    expect(hierarchyProblem(guild, actor, target, bot, 'warn')).toBeNull();
  });
});
