import { z } from 'zod';
import {
  ACTION_TYPES,
  ACCESS_LEVELS,
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_STATUSES,
  ATTRIBUTION_STATUSES,
  BAN_STATUSES,
  CASE_STATUSES,
  PC_CHECK_OUTCOMES,
  PC_CHECK_STATUSES,
  isValidSteamId64,
} from '@dardania/shared';

export const discordIdSchema = z
  .string()
  .regex(/^\d{17,20}$/, 'Must be a numeric Discord snowflake (17-20 digits).');

export const steamId64Schema = z
  .string()
  .refine((value) => isValidSteamId64(value), 'Must be a valid SteamID64.');

const isoDateSchema = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Must be an ISO date or timestamp.');

const pageSchema = z.coerce.number().int().min(1).max(100000).default(1);
const pageSizeSchema = z.coerce.number().int().min(1).max(100).default(25);

export const moderationEventSchema = z.object({
  guildId: discordIdSchema,
  guildName: z.string().trim().max(120).optional(),
  actionType: z.enum(ACTION_TYPES),
  target: z.object({
    id: discordIdSchema,
    username: z.string().trim().max(120).optional(),
    globalName: z.string().trim().max(120).nullish(),
  }),
  moderator: z
    .object({
      id: discordIdSchema,
      name: z.string().trim().max(120).nullish(),
    })
    .nullish(),
  reason: z.string().trim().max(1000).nullish(),
  occurredAt: isoDateSchema,
  source: z.enum(['BOT_COMMAND', 'GATEWAY_AUDIT_LOG', 'RECONCILIATION']),
  dedupeKey: z.string().trim().min(4).max(200),
  auditEntryId: z.string().trim().max(64).nullish(),
  attributionStatus: z.enum(ATTRIBUTION_STATUSES).default('UNKNOWN'),
  attributionEvidence: z.record(z.string(), z.unknown()).nullish(),
  steamId64: steamId64Schema.nullish(),
  steamInput: z.string().trim().max(200).nullish(),
  channelMessageId: z.string().trim().max(64).nullish(),
  expiresAt: isoDateSchema.nullish(),
  banStatus: z.enum(BAN_STATUSES).optional(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
});

export const banSearchSchema = z.object({
  q: z.string().trim().max(200).optional(),
  targetDiscordId: z.string().trim().max(20).optional(),
  moderatorDiscordId: z.string().trim().max(20).optional(),
  steamId64: z.string().trim().max(20).optional(),
  caseRef: z.string().trim().max(32).optional(),
  actionType: z.enum(ACTION_TYPES).optional(),
  banStatus: z.enum(BAN_STATUSES).optional(),
  status: z.enum(CASE_STATUSES).optional(),
  dateFrom: z.string().trim().max(32).optional(),
  dateTo: z.string().trim().max(32).optional(),
  page: pageSchema,
  pageSize: pageSizeSchema,
  sort: z.enum(['occurred_at_desc', 'occurred_at_asc']).optional(),
});

export const dateRangeSchema = z.object({
  dateFrom: z.string().trim().max(32).optional(),
  dateTo: z.string().trim().max(32).optional(),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export const auditQuerySchema = z.object({
  action: z.string().trim().max(80).optional(),
  actorDiscordId: z.string().trim().max(20).optional(),
  entityType: z.string().trim().max(60).optional(),
  entityId: z.string().trim().max(64).optional(),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export const announcementFiltersSchema = z.object({
  q: z.string().trim().max(200).optional(),
  category: z.enum(ANNOUNCEMENT_CATEGORIES).optional(),
  status: z.enum(ANNOUNCEMENT_STATUSES).optional(),
  page: pageSchema,
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const announcementInputSchema = z.object({
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(10).max(8000),
  category: z.enum(ANNOUNCEMENT_CATEGORIES),
  imageUrl: z
    .string()
    .trim()
    .max(500)
    .url()
    .refine((value) => value.startsWith('https://') || value.startsWith('http://'), 'Must be a URL.')
    .nullish(),
});

export const announcementUpdateSchema = announcementInputSchema.partial().extend({
  status: z.enum(ANNOUNCEMENT_STATUSES).optional(),
});

export const settingsPatchSchema = z.object({
  roles: z.record(z.string().max(64), z.string().max(20).nullable()).optional(),
  channels: z.record(z.string().max(64), z.string().max(20).nullable()).optional(),
  features: z.record(z.string().max(64), z.boolean()).optional(),
});

export const accessGrantSchema = z.object({
  userId: discordIdSchema,
  level: z.enum(ACCESS_LEVELS),
  note: z.string().trim().max(300).nullish(),
});

export const caseCorrectionSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
  moderatorDiscordUserId: z.string().trim().max(20).nullable().optional(),
  moderatorName: z.string().trim().max(120).nullable().optional(),
  steamId64: steamId64Schema.nullable().optional(),
  steamNameAtEvent: z.string().trim().max(120).nullable().optional(),
  attributionStatus: z.enum(ATTRIBUTION_STATUSES).optional(),
  correctionNote: z.string().trim().min(5).max(500),
});

export const steamLinkSchema = z
  .object({
    steamId64: steamId64Schema.optional(),
    steamInput: z.string().trim().max(200).optional(),
    discordUserId: discordIdSchema,
    verification: z.enum(['VERIFIED', 'UNVERIFIED']).default('UNVERIFIED'),
  })
  .refine((value) => Boolean(value.steamId64 || value.steamInput), {
    message: 'Provide a SteamID64 or a Steam profile URL.',
  });

export const steamSearchSchema = z.object({
  q: z.string().trim().max(200).optional(),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export const pcCheckCreateSchema = z.object({
  targetDiscordUserId: discordIdSchema,
  steamId64: steamId64Schema.nullish(),
  steamInput: z.string().trim().max(200).nullish(),
  requestedBy: discordIdSchema.nullish(),
  assignedTo: discordIdSchema.nullish(),
  reason: z.string().trim().max(1000).nullish(),
  channelId: z.string().trim().max(32).nullish(),
  guildId: discordIdSchema.optional(),
});

export const pcCheckUpdateSchema = z.object({
  status: z.enum(PC_CHECK_STATUSES).optional(),
  outcome: z.enum(PC_CHECK_OUTCOMES).nullable().optional(),
  assignedTo: z.string().trim().max(20).nullable().optional(),
  reason: z.string().trim().max(1000).optional(),
  channelId: z.string().trim().max(32).nullable().optional(),
});

export const pcCheckQuerySchema = z.object({
  status: z.enum(PC_CHECK_STATUSES).optional(),
  targetDiscordUserId: z.string().trim().max(20).optional(),
  assignedTo: z.string().trim().max(20).optional(),
  q: z.string().trim().max(200).optional(),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export const pcNoteSchema = z.object({
  note: z.string().trim().min(2).max(2000),
  visibility: z.enum(['STAFF', 'OWNER']).default('STAFF'),
});

export const devLoginSchema = z.object({
  discordUserId: discordIdSchema.optional(),
});

export const heartbeatSchema = z.object({
  service: z.literal('bot'),
  status: z.enum(['operational', 'degraded', 'outage']).default('operational'),
  detail: z.record(z.string(), z.unknown()).nullish(),
});

export const deliveryResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().max(1000).nullish(),
  announcementId: z.string().uuid().nullish(),
  discordMessageId: z.string().max(64).nullish(),
  discordChannelId: z.string().max(64).nullish(),
});

export const internalCaseQuerySchema = banSearchSchema.omit({ page: true, pageSize: true }).extend({
  page: pageSchema,
  pageSize: pageSizeSchema,
  guildId: discordIdSchema,
});

export type ModerationEventPayload = z.infer<typeof moderationEventSchema>;
export type BanSearchPayload = z.infer<typeof banSearchSchema>;
export type AnnouncementInput = z.infer<typeof announcementInputSchema>;
export type PcCheckCreatePayload = z.infer<typeof pcCheckCreateSchema>;
export type PcCheckUpdatePayload = z.infer<typeof pcCheckUpdateSchema>;
