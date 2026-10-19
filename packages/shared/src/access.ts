/** Dashboard access levels. Deliberately NOT derived from Discord roles. */
export const ACCESS_LEVELS = ['OWNER', 'CO_OWNER', 'PC_CHECKER'] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

const RANK: Record<AccessLevel, number> = {
  PC_CHECKER: 1,
  CO_OWNER: 2,
  OWNER: 3,
};

export function isAccessLevel(value: unknown): value is AccessLevel {
  return typeof value === 'string' && (ACCESS_LEVELS as readonly string[]).includes(value);
}

export function levelRank(level: AccessLevel): number {
  return RANK[level];
}

/** Returns true when `level` grants at least `required`. */
export function satisfies(level: AccessLevel, required: AccessLevel): boolean {
  return RANK[level] >= RANK[required];
}

/** Levels permitted to read the complete moderation history. */
export const FULL_HISTORY_LEVELS: readonly AccessLevel[] = ['OWNER', 'CO_OWNER'];

export const ACTION_TYPES = [
  'BAN',
  'UNBAN',
  'KICK',
  'TIMEOUT',
  'UNTIMEOUT',
  'WARN',
  'WARN_CLEAR',
  'PURGE',
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const CASE_STATUSES = ['ACTIVE', 'LIFTED', 'COMPLETED', 'UNKNOWN'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const BAN_STATUSES = ['ACTIVE', 'LIFTED', 'UNKNOWN'] as const;
export type BanStatus = (typeof BAN_STATUSES)[number];

export const ATTRIBUTION_STATUSES = ['VERIFIED', 'PARTIAL', 'UNKNOWN'] as const;
export type AttributionStatus = (typeof ATTRIBUTION_STATUSES)[number];

export const RECORD_SOURCES = [
  'BOT_COMMAND',
  'GATEWAY_AUDIT_LOG',
  'RECONCILIATION',
  'DASHBOARD',
  'DEMO_SEED',
] as const;
export type RecordSource = (typeof RECORD_SOURCES)[number];

export const PC_CHECK_STATUSES = [
  'REQUESTED',
  'ASSIGNED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const;
export type PcCheckStatus = (typeof PC_CHECK_STATUSES)[number];

export const PC_CHECK_OUTCOMES = [
  'CLEAN',
  'SUSPICIOUS',
  'CHEATING_CONFIRMED',
  'INCONCLUSIVE',
] as const;
export type PcCheckOutcome = (typeof PC_CHECK_OUTCOMES)[number];

export const ANNOUNCEMENT_CATEGORIES = [
  'GENERAL',
  'EVENT',
  'MAINTENANCE',
  'ROSTER',
  'RULE_UPDATE',
  'PUNISHMENT',
] as const;
export type AnnouncementCategory = (typeof ANNOUNCEMENT_CATEGORIES)[number];

export const ANNOUNCEMENT_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];
