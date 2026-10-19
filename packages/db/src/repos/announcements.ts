import { randomBytes, randomUUID } from 'node:crypto';
import type {
  AnnouncementCategory,
  AnnouncementDto,
  AnnouncementStatus,
  Paginated,
} from '@dardania/shared';
import type { Db } from '../client.js';
import { mapAnnouncement } from '../mappers.js';
import type { AnnouncementRow, CountRow } from '../rows.js';
import { enqueueDelivery } from './outbox.js';

export function slugify(input: string): string {
  return (
    input
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'announcement'
  );
}

export interface CreateAnnouncementInput {
  guildId: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  imageUrl?: string | null;
  authorDiscordId: string;
  authorName: string | null;
}

export async function createAnnouncement(
  db: Db,
  input: CreateAnnouncementInput,
  now: string,
): Promise<AnnouncementDto> {
  const id = randomUUID();
  const slug = `${slugify(input.title)}-${randomBytes(3).toString('hex')}`;
  await db.run(
    `INSERT INTO announcements
      (id, guild_id, slug, title, body, category, image_url, status, author_discord_id,
       author_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?)`,
    [
      id,
      input.guildId,
      slug,
      input.title,
      input.body,
      input.category,
      input.imageUrl ?? null,
      input.authorDiscordId,
      input.authorName,
      now,
      now,
    ],
  );
  const row = await db.get<AnnouncementRow>('SELECT * FROM announcements WHERE id = ?', [id]);
  if (!row) throw new Error('Failed to persist announcement');
  return mapAnnouncement(row);
}

export async function updateAnnouncement(
  db: Db,
  input: {
    id: string;
    guildId: string;
    title?: string;
    body?: string;
    category?: AnnouncementCategory;
    imageUrl?: string | null;
    status?: AnnouncementStatus;
  },
  now: string,
): Promise<AnnouncementDto | null> {
  const existing = await db.get<AnnouncementRow>(
    'SELECT * FROM announcements WHERE id = ? AND guild_id = ?',
    [input.id, input.guildId],
  );
  if (!existing) return null;
  const assignments: string[] = [];
  const params: (string | null)[] = [];
  if (input.title !== undefined) {
    assignments.push('title = ?');
    params.push(input.title);
  }
  if (input.body !== undefined) {
    assignments.push('body = ?');
    params.push(input.body);
  }
  if (input.category !== undefined) {
    assignments.push('category = ?');
    params.push(input.category);
  }
  if (input.imageUrl !== undefined) {
    assignments.push('image_url = ?');
    params.push(input.imageUrl);
  }
  if (input.status !== undefined) {
    assignments.push('status = ?');
    params.push(input.status);
  }
  if (assignments.length === 0) return mapAnnouncement(existing);
  assignments.push('updated_at = ?');
  params.push(now, input.id);
  await db.run(`UPDATE announcements SET ${assignments.join(', ')} WHERE id = ?`, params);
  const row = await db.get<AnnouncementRow>('SELECT * FROM announcements WHERE id = ?', [input.id]);
  return row ? mapAnnouncement(row) : null;
}

/**
 * Publishes an announcement and enqueues exactly one Discord delivery.
 * Re-publishing is idempotent: the outbox dedupe key prevents duplicates.
 */
export async function publishAnnouncement(
  db: Db,
  input: { id: string; guildId: string; actorDiscordId: string },
  now: string,
): Promise<{ announcement: AnnouncementDto; enqueued: boolean } | null> {
  return db.transaction(async (tx) => {
    const existing = await tx.get<AnnouncementRow>(
      'SELECT * FROM announcements WHERE id = ? AND guild_id = ?',
      [input.id, input.guildId],
    );
    if (!existing) return null;
    await tx.run(
      `UPDATE announcements
       SET status = 'PUBLISHED', published_at = COALESCE(published_at, ?), archived_at = NULL, updated_at = ?
       WHERE id = ?`,
      [now, now, input.id],
    );
    const enqueued = await enqueueDelivery(tx, {
      topic: 'DISCORD_ANNOUNCEMENT',
      dedupeKey: `announcement:${input.id}:discord`,
      payload: {
        announcementId: input.id,
        guildId: input.guildId,
        title: existing.title,
        body: existing.body,
        category: existing.category,
        imageUrl: existing.image_url,
        url: `/announcements/${existing.slug}`,
        publishedAt: existing.published_at ?? now,
      },
      now,
    });
    const row = await tx.get<AnnouncementRow>('SELECT * FROM announcements WHERE id = ?', [
      input.id,
    ]);
    if (!row) throw new Error('Announcement disappeared during publish');
    return { announcement: mapAnnouncement(row), enqueued };
  });
}

export async function archiveAnnouncement(
  db: Db,
  input: { id: string; guildId: string },
  now: string,
): Promise<AnnouncementDto | null> {
  await db.run(
    `UPDATE announcements SET status = 'ARCHIVED', archived_at = ?, updated_at = ?
     WHERE id = ? AND guild_id = ?`,
    [now, now, input.id, input.guildId],
  );
  const row = await db.get<AnnouncementRow>(
    'SELECT * FROM announcements WHERE id = ? AND guild_id = ?',
    [input.id, input.guildId],
  );
  return row ? mapAnnouncement(row) : null;
}

export async function getAnnouncementById(db: Db, id: string): Promise<AnnouncementDto | null> {
  const row = await db.get<AnnouncementRow>('SELECT * FROM announcements WHERE id = ?', [id]);
  return row ? mapAnnouncement(row) : null;
}

export async function getAnnouncementBySlug(db: Db, slug: string): Promise<AnnouncementDto | null> {
  const row = await db.get<AnnouncementRow>('SELECT * FROM announcements WHERE slug = ?', [slug]);
  return row ? mapAnnouncement(row) : null;
}

export interface AnnouncementFilters {
  guildId?: string;
  q?: string;
  category?: AnnouncementCategory;
  status?: AnnouncementStatus;
  page?: number;
  pageSize?: number;
}

function buildAnnouncementWhere(filters: AnnouncementFilters): {
  whereSql: string;
  params: (string | number)[];
} {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filters.guildId) {
    where.push('guild_id = ?');
    params.push(filters.guildId);
  }
  if (filters.category) {
    where.push('category = ?');
    params.push(filters.category);
  }
  if (filters.status) {
    where.push('status = ?');
    params.push(filters.status);
  }
  if (filters.q) {
    const like = `%${filters.q.replace(/[\\%_]/g, '\\$&').toLowerCase()}%`;
    where.push(`(lower(title) LIKE ? ESCAPE '\\' OR lower(body) LIKE ? ESCAPE '\\')`);
    params.push(like, like);
  }
  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
  };
}

export async function listAnnouncements(
  db: Db,
  filters: AnnouncementFilters,
): Promise<Paginated<AnnouncementDto>> {
  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const pageSize = Math.min(Math.max(Math.trunc(filters.pageSize ?? 20), 1), 100);
  const { whereSql, params } = buildAnnouncementWhere(filters);
  const totalRow = await db.get<CountRow>(
    `SELECT COUNT(*) AS total FROM announcements ${whereSql}`,
    params,
  );
  const rows = await db.all<AnnouncementRow>(
    `SELECT * FROM announcements ${whereSql}
     ORDER BY COALESCE(published_at, created_at) DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  const total = Number(totalRow?.total ?? 0);
  return {
    items: rows.map(mapAnnouncement),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Published announcements only — used by the public website. */
export async function listPublicAnnouncements(
  db: Db,
  filters: Omit<AnnouncementFilters, 'guildId' | 'status'> & { guildId?: string },
): Promise<Paginated<AnnouncementDto>> {
  return listAnnouncements(db, { ...filters, status: 'PUBLISHED' });
}

/** Records an announcement that was already posted to Discord by the bot. */
export async function recordExternallyPublishedAnnouncement(
  db: Db,
  input: {
    guildId: string;
    title: string;
    body: string;
    category: AnnouncementCategory;
    imageUrl?: string | null;
    authorDiscordId: string;
    authorName: string | null;
    discordMessageId: string;
    discordChannelId: string;
  },
  now: string,
): Promise<AnnouncementDto> {
  const id = randomUUID();
  const slug = `${slugify(input.title)}-${randomBytes(3).toString('hex')}`;
  await db.run(
    `INSERT INTO announcements
      (id, guild_id, slug, title, body, category, image_url, status, author_discord_id,
       author_name, created_at, updated_at, published_at, discord_message_id, discord_channel_id,
       discord_published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'PUBLISHED', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.guildId,
      slug,
      input.title,
      input.body,
      input.category,
      input.imageUrl ?? null,
      input.authorDiscordId,
      input.authorName,
      now,
      now,
      now,
      input.discordMessageId,
      input.discordChannelId,
      now,
    ],
  );
  const row = await db.get<AnnouncementRow>('SELECT * FROM announcements WHERE id = ?', [id]);
  if (!row) throw new Error('Failed to persist externally published announcement');
  return mapAnnouncement(row);
}
