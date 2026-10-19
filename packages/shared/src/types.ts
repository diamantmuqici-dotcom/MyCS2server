import type {
  AccessLevel,
  ActionType,
  AnnouncementCategory,
  AnnouncementStatus,
  AttributionStatus,
  BanStatus,
  CaseStatus,
  PcCheckOutcome,
  PcCheckStatus,
  RecordSource,
} from './access.js';

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface DiscordIdentity {
  discordUserId: string;
  usernameAtEvent: string | null;
  displayNameAtEvent: string | null;
}

export interface ModeratorIdentity {
  discordUserId: string | null;
  nameAtEvent: string | null;
}

export interface SteamSnapshot {
  steamId64: string | null;
  /** Immutable snapshot taken when the case was recorded. */
  name: string | null;
  profileUrl: string | null;
  nameSource: string | null;
}

export interface SteamCurrent {
  steamId64: string;
  /** Latest observed public name. Never written back into `SteamSnapshot`. */
  displayName: string | null;
  profileUrl: string;
  profileStatus: 'PUBLIC' | 'PRIVATE' | 'UNKNOWN' | 'UNAVAILABLE';
  lastCheckedAt: string | null;
}

export interface CaseRelation {
  id: string;
  caseRef: string;
  actionType: ActionType;
  occurredAt: string;
  status: CaseStatus;
}

export interface ModerationEventDto {
  id: string;
  kind: 'BAN' | 'UNBAN';
  occurredAt: string;
  recordedAt: string;
  moderator: ModeratorIdentity;
  reason: string | null;
  source: RecordSource | string;
  attributionStatus: AttributionStatus;
  steamNameAtEvent: string | null;
  relatedCaseRef: string | null;
}

export interface ModerationCaseDto {
  id: string;
  caseRef: string;
  caseNumber: number;
  guildId: string;
  actionType: ActionType;
  status: CaseStatus;
  banStatus: BanStatus | null;
  target: DiscordIdentity;
  moderator: ModeratorIdentity;
  reason: string | null;
  occurredAt: string;
  recordedAt: string;
  source: RecordSource | string;
  attributionStatus: AttributionStatus;
  attributionEvidence: Record<string, unknown> | null;
  steamAtEvent: SteamSnapshot;
  steamCurrent: SteamCurrent | null;
  expiresAt: string | null;
  relatedCases: CaseRelation[];
  createdAt: string;
  updatedAt: string;
}

export interface ModerationCaseDetail extends ModerationCaseDto {
  events: ModerationEventDto[];
  auditTrail: AuditEventDto[];
  discordMessageId: string | null;
  metadata: Record<string, unknown> | null;
}

export interface SteamNameHistoryDto {
  id: string;
  steamId64: string;
  previousDisplayName: string | null;
  displayName: string;
  firstObservedAt: string;
  lastObservedAt: string | null;
  source: string;
  verification: string;
}

export interface SteamAccountDto {
  steamId64: string;
  profileUrl: string;
  firstSeenAt: string;
  lastCheckedAt: string | null;
  currentDisplayName: string | null;
  currentAvatarUrl: string | null;
  profileStatus: string;
  refreshFailures: number;
  lastRefreshError: string | null;
  nameHistory: SteamNameHistoryDto[];
  linkedDiscordUserIds: string[];
  moderationCaseCount: number;
}

export interface PcCheckNoteDto {
  id: string;
  authorDiscordId: string;
  authorNameAtEvent: string | null;
  note: string;
  visibility: 'STAFF' | 'OWNER';
  createdAt: string;
}

export interface PcCheckDto {
  id: string;
  caseRef: string;
  guildId: string;
  targetDiscordUserId: string;
  steamId64: string | null;
  steamNameAtEvent: string | null;
  requestedBy: string | null;
  assignedTo: string | null;
  reason: string | null;
  status: PcCheckStatus;
  outcome: PcCheckOutcome | null;
  channelId: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  notes?: PcCheckNoteDto[];
}

export interface AnnouncementDto {
  id: string;
  guildId: string;
  slug: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  imageUrl: string | null;
  status: AnnouncementStatus;
  authorDiscordId: string | null;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  archivedAt: string | null;
  discordMessageId: string | null;
  discordChannelId: string | null;
}

export interface AuditEventDto {
  id: string;
  guildId: string | null;
  actorDiscordId: string | null;
  actorType: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  summary: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

export interface StaffActivityRow {
  moderatorDiscordId: string | null;
  moderatorName: string | null;
  totalActions: number;
  banActions: number;
  unbanActions: number;
  warningsIssued: number;
  pcChecksAssigned: number;
  pcChecksClosed: number;
  lastActionAt: string | null;
}

export interface ServiceHealthDto {
  service: 'api' | 'database' | 'bot' | 'discord';
  status: 'operational' | 'degraded' | 'outage' | 'unknown';
  lastSeenAt: string | null;
  detail: string;
}

export interface OverviewDto {
  generatedAt: string;
  totals: {
    cases: number;
    banActions: number;
    activeBans: number;
    unbans: number;
    unknownBanStatus: number;
    warnings: number;
  };
  recentCases: ModerationCaseDto[];
  topModerators: StaffActivityRow[];
  pcChecks: { open: number; completed: number; total: number };
  announcements: { published: number; drafts: number };
  health: ServiceHealthDto[];
  coverage: { earliestRecordedAt: string | null; note: string };
  demoData: boolean;
}

export interface GuildSettingsDto {
  guildId: string;
  guildName: string | null;
  roles: Record<string, string | null>;
  channels: Record<string, string | null>;
  features: Record<string, boolean>;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface DashboardAccessDto {
  id: string;
  guildId: string;
  userDiscordId: string;
  level: AccessLevel;
  grantedBy: string;
  grantedAt: string;
  revokedAt: string | null;
  note: string | null;
}

export interface SessionUserDto {
  discordUserId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  accessLevel: AccessLevel;
  guildId: string;
  source: 'oauth' | 'allowlist' | 'dev';
  sessionExpiresAt: string;
  csrfToken: string;
}

export interface BanSearchQuery {
  q?: string;
  targetDiscordId?: string;
  moderatorDiscordId?: string;
  steamId64?: string;
  caseRef?: string;
  actionType?: ActionType;
  banStatus?: BanStatus;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
  sort?: 'occurred_at_desc' | 'occurred_at_asc';
}

export interface PublicAnnouncement {
  id: string;
  slug: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  imageUrl: string | null;
  publishedAt: string;
  authorName: string | null;
}

export interface PublicConfigDto {
  brandName: string;
  discordInviteUrl: string | null;
  supportUrl: string | null;
  contactEmail: string | null;
  steamGroupUrl: string | null;
  servers: { label: string; connect: string }[];
  team: { name: string; role: string; note?: string }[];
  announcements: PublicAnnouncement[];
  rulesVersion: string;
}

export interface PublicStatusDto {
  status: 'operational' | 'degraded' | 'outage';
  checkedAt: string;
  services: ServiceHealthDto[];
  botConnected: boolean;
  databaseConnected: boolean;
  version: string;
}

/** Fields an Owner/Co-Owner may correct on a moderation case. */
export interface CaseCorrectionInput {
  reason?: string;
  moderatorDiscordUserId?: string | null;
  moderatorName?: string | null;
  steamId64?: string | null;
  steamNameAtEvent?: string | null;
  attributionStatus?: AttributionStatus;
  correctionNote: string;
}

/** Fields the dashboard may update on a PC-check case. */
export interface PcCheckUpdateInput {
  status?: PcCheckStatus;
  outcome?: PcCheckOutcome | null;
  assignedTo?: string | null;
  reason?: string;
}

/** Result of a real A2S_INFO query against a configured server. */
export interface PublicServerStateDto {
  label: string;
  connect: string;
  status: 'ONLINE' | 'OFFLINE' | 'UNKNOWN';
  players: number | null;
  maxPlayers: number | null;
  map: string | null;
  bots: number | null;
  pingMs: number | null;
  lastCheckedAt: string | null;
  detail: string | null;
}
