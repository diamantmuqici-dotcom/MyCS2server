import {
  nowIso,
  type ApiEnv,
  type AuditEventDto,
  type DashboardAccessDto,
  type GuildSettingsDto,
  type ModerationCaseDetail,
  type ModerationCaseDto,
  type OverviewDto,
  type Paginated,
  type StaffActivityRow,
} from '@dardania/shared';
import {
  getCaseDetail,
  getGuild,
  getGuildConfiguration,
  getOverviewCounts,
  getStaffActivity,
  getUsersByIds,
  listAuditEvents,
  listCases,
  mergeGuildConfiguration,
  recordAuditEvent,
  type CaseFilters,
  type Db,
} from '@dardania/db';
import { badRequest, notFound } from '../errors.js';
import { buildHealth } from './health.js';

export class DashboardService {
  constructor(
    private readonly db: Db,
    private readonly env: ApiEnv,
    private readonly now: () => string = nowIso,
  ) {}

  get guildId(): string {
    return this.env.discord.guildId;
  }

  private assertGuildConfigured(): void {
    if (!this.guildId) {
      throw badRequest(
        'DISCORD_GUILD_ID is not configured on the backend. Set it to your server ID to use the dashboard.',
      );
    }
  }

  async overview(): Promise<OverviewDto> {
    this.assertGuildConfigured();
    const now = this.now();
    const [counts, recent, staff, health] = await Promise.all([
      getOverviewCounts(this.db, this.guildId),
      listCases(this.db, { guildId: this.guildId, pageSize: 8 }),
      getStaffActivity(this.db, this.guildId, 5),
      buildHealth(this.db, now),
    ]);
    const coverageNote = counts.earliestRecordedAt
      ? `Records captured by Dardania | Elite begin at ${counts.earliestRecordedAt}. ` +
        'Actions performed before this timestamp are not in the database and must be reviewed in Discord audit logs.'
      : 'No moderation records have been captured yet. Historical coverage begins with the first recorded action.';
    return {
      generatedAt: now,
      totals: {
        cases: counts.cases,
        banActions: counts.banActions,
        activeBans: counts.activeBans,
        unbans: counts.unbans,
        unknownBanStatus: counts.unknownBanStatus,
        warnings: counts.warnings,
      },
      recentCases: recent.items,
      topModerators: staff,
      pcChecks: {
        open: counts.pcOpen,
        completed: counts.pcCompleted,
        total: counts.pcTotal,
      },
      announcements: {
        published: counts.announcementsPublished,
        drafts: counts.announcementsDrafts,
      },
      health,
      coverage: { earliestRecordedAt: counts.earliestRecordedAt, note: coverageNote },
      demoData: counts.demoData,
    };
  }

  async listCases(
    filters: Omit<CaseFilters, 'guildId'>,
  ): Promise<Paginated<ModerationCaseDto>> {
    this.assertGuildConfigured();
    return listCases(this.db, { ...filters, guildId: this.guildId });
  }

  async caseDetail(idOrRef: string): Promise<ModerationCaseDetail> {
    this.assertGuildConfigured();
    const detail = await getCaseDetail(this.db, this.guildId, idOrRef);
    if (!detail) throw notFound('Moderation case not found.');
    return detail;
  }

  async staffActivity(): Promise<StaffActivityRow[]> {
    this.assertGuildConfigured();
    const rows = await getStaffActivity(this.db, this.guildId, 100);
    const users = await getUsersByIds(
      this.db,
      rows.map((row) => row.moderatorDiscordId).filter((id): id is string => Boolean(id)),
    );
    const nameMap = new Map(users.map((user) => [user.id, user.global_name ?? user.username]));
    return rows.map((row) => ({
      ...row,
      moderatorName: row.moderatorName ?? nameMap.get(row.moderatorDiscordId ?? '') ?? null,
    }));
  }

  async auditLog(filters: {
    action?: string;
    actorDiscordId?: string;
    entityType?: string;
    entityId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<Paginated<AuditEventDto>> {
    this.assertGuildConfigured();
    return listAuditEvents(this.db, { ...filters, guildId: this.guildId });
  }

  async settings(): Promise<GuildSettingsDto> {
    this.assertGuildConfigured();
    const [guild, configuration] = await Promise.all([
      getGuild(this.db, this.guildId),
      getGuildConfiguration(this.db, this.guildId),
    ]);
    return {
      guildId: this.guildId,
      guildName: guild?.name ?? null,
      roles: configuration.config.roles,
      channels: configuration.config.channels,
      features: configuration.config.features,
      updatedAt: configuration.updatedAt,
      updatedBy: configuration.updatedBy,
    };
  }

  async updateSettings(
    patch: {
      roles?: Record<string, string | null>;
      channels?: Record<string, string | null>;
      features?: Record<string, boolean>;
    },
    actorDiscordId: string,
  ): Promise<GuildSettingsDto> {
    this.assertGuildConfigured();
    const idPattern = /^\d{17,20}$/;
    for (const [key, value] of Object.entries(patch.roles ?? {})) {
      if (value !== null && !idPattern.test(value)) {
        throw badRequest(`Role "${key}" must be a numeric Discord role ID or null.`);
      }
    }
    for (const [key, value] of Object.entries(patch.channels ?? {})) {
      if (value !== null && !idPattern.test(value)) {
        throw badRequest(`Channel "${key}" must be a numeric Discord channel ID or null.`);
      }
    }
    const before = await this.settings();
    const merged = await mergeGuildConfiguration(
      this.db,
      this.guildId,
      patch,
      actorDiscordId,
      this.now(),
    );
    await recordAuditEvent(
      this.db,
      {
        guildId: this.guildId,
        actorDiscordId,
        actorType: 'USER',
        action: 'settings.updated',
        entityType: 'guild_configuration',
        entityId: this.guildId,
        summary: 'Dashboard settings were updated.',
        before: { roles: before.roles, channels: before.channels, features: before.features },
        after: merged,
      },
      this.now(),
    );
    return this.settings();
  }

  async accessList(includeHistory: boolean): Promise<DashboardAccessDto[]> {
    this.assertGuildConfigured();
    const { listActiveAccess, listAccessHistory } = await import('@dardania/db');
    return includeHistory
      ? listAccessHistory(this.db, this.guildId)
      : listActiveAccess(this.db, this.guildId);
  }
}
