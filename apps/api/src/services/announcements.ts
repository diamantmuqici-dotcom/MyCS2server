import {
  nowIso,
  type AnnouncementDto,
  type Paginated,
  type PublicAnnouncement,
} from '@dardania/shared';
import {
  archiveAnnouncement,
  createAnnouncement,
  getAnnouncementById,
  getAnnouncementBySlug,
  getUsersByIds,
  listAnnouncements,
  publishAnnouncement,
  recordAuditEvent,
  updateAnnouncement,
  type AnnouncementFilters,
  type Db,
} from '@dardania/db';
import { badRequest, notFound } from '../errors.js';

export class AnnouncementService {
  constructor(
    private readonly db: Db,
    private readonly guildId: string,
    private readonly now: () => string = nowIso,
  ) {}

  private assertGuild(): string {
    if (!this.guildId) {
      throw badRequest('DISCORD_GUILD_ID is not configured on the backend.');
    }
    return this.guildId;
  }

  async listPublic(filters: {
    q?: string;
    category?: AnnouncementFilters['category'];
    page?: number;
    pageSize?: number;
  }): Promise<Paginated<PublicAnnouncement>> {
    if (!this.guildId) {
      return { items: [], page: 1, pageSize: filters.pageSize ?? 20, total: 0, totalPages: 1 };
    }
    const result = await listAnnouncements(this.db, {
      guildId: this.guildId,
      status: 'PUBLISHED',
      q: filters.q,
      category: filters.category,
      page: filters.page,
      pageSize: filters.pageSize,
    });
    const items: PublicAnnouncement[] = result.items.map((announcement) => ({
      id: announcement.id,
      slug: announcement.slug,
      title: announcement.title,
      body: announcement.body,
      category: announcement.category,
      imageUrl: announcement.imageUrl,
      publishedAt: announcement.publishedAt ?? announcement.createdAt,
      authorName: announcement.authorName,
    }));
    return { ...result, items };
  }

  async publicBySlug(slug: string): Promise<PublicAnnouncement> {
    if (!this.guildId) throw notFound('Announcement not found.');
    const announcement = await getAnnouncementBySlug(this.db, slug);
    if (!announcement || announcement.status !== 'PUBLISHED' || announcement.guildId !== this.guildId) {
      throw notFound('Announcement not found.');
    }
    return {
      id: announcement.id,
      slug: announcement.slug,
      title: announcement.title,
      body: announcement.body,
      category: announcement.category,
      imageUrl: announcement.imageUrl,
      publishedAt: announcement.publishedAt ?? announcement.createdAt,
      authorName: announcement.authorName,
    };
  }

  async getById(id: string): Promise<AnnouncementDto> {
    const announcement = await getAnnouncementById(this.db, id);
    if (!announcement) throw notFound('Announcement not found.');
    return announcement;
  }

  async listAdmin(filters: {
    q?: string;
    category?: AnnouncementFilters['category'];
    status?: AnnouncementFilters['status'];
    page?: number;
    pageSize?: number;
  }): Promise<Paginated<AnnouncementDto>> {
    return listAnnouncements(this.db, { ...filters, guildId: this.assertGuild() });
  }

  async resolveAuthorNames(items: AnnouncementDto[]): Promise<Map<string, string>> {
    const ids = [
      ...new Set(items.map((item) => item.authorDiscordId).filter((id): id is string => Boolean(id))),
    ];
    const users = await getUsersByIds(this.db, ids);
    return new Map(users.map((user) => [user.id, user.global_name ?? user.username]));
  }

  async create(
    input: {
      title: string;
      body: string;
      category: AnnouncementDto['category'];
      imageUrl?: string | null;
    },
    actor: { discordUserId: string; name: string | null },
  ): Promise<AnnouncementDto> {
    const created = await createAnnouncement(
      this.db,
      {
        guildId: this.assertGuild(),
        title: input.title,
        body: input.body,
        category: input.category,
        imageUrl: input.imageUrl ?? null,
        authorDiscordId: actor.discordUserId,
        authorName: actor.name,
      },
      this.now(),
    );
    await recordAuditEvent(
      this.db,
      {
        guildId: this.guildId,
        actorDiscordId: actor.discordUserId,
        actorType: 'USER',
        action: 'announcement.created',
        entityType: 'announcement',
        entityId: created.id,
        summary: `Announcement "${created.title}" created as a draft.`,
        after: { title: created.title, category: created.category, slug: created.slug },
      },
      this.now(),
    );
    return created;
  }

  async update(
    id: string,
    patch: {
      title?: string;
      body?: string;
      category?: AnnouncementDto['category'];
      imageUrl?: string | null;
      status?: AnnouncementDto['status'];
    },
    actorDiscordId: string,
  ): Promise<AnnouncementDto> {
    const before = await this.getById(id);
    if (before.guildId !== this.guildId) throw notFound('Announcement not found.');
    const updated = await updateAnnouncement(
      this.db,
      { id, guildId: this.assertGuild(), ...patch },
      this.now(),
    );
    if (!updated) throw notFound('Announcement not found.');
    await recordAuditEvent(
      this.db,
      {
        guildId: this.guildId,
        actorDiscordId,
        actorType: 'USER',
        action: 'announcement.updated',
        entityType: 'announcement',
        entityId: id,
        summary: `Announcement "${updated.title}" updated.`,
        before: { title: before.title, body: before.body, category: before.category },
        after: { title: updated.title, body: updated.body, category: updated.category },
      },
      this.now(),
    );
    return updated;
  }

  async publish(
    id: string,
    actorDiscordId: string,
  ): Promise<{ announcement: AnnouncementDto; enqueued: boolean }> {
    const result = await publishAnnouncement(
      this.db,
      { id, guildId: this.assertGuild(), actorDiscordId },
      this.now(),
    );
    if (!result) throw notFound('Announcement not found.');
    await recordAuditEvent(
      this.db,
      {
        guildId: this.guildId,
        actorDiscordId,
        actorType: 'USER',
        action: 'announcement.published',
        entityType: 'announcement',
        entityId: id,
        summary: `Announcement "${result.announcement.title}" published.`,
        after: {
          enqueuedForDiscord: result.enqueued,
          publishedAt: result.announcement.publishedAt,
        },
      },
      this.now(),
    );
    return result;
  }

  async archive(id: string, actorDiscordId: string): Promise<AnnouncementDto> {
    const archived = await archiveAnnouncement(
      this.db,
      { id, guildId: this.assertGuild() },
      this.now(),
    );
    if (!archived) throw notFound('Announcement not found.');
    await recordAuditEvent(
      this.db,
      {
        guildId: this.guildId,
        actorDiscordId,
        actorType: 'USER',
        action: 'announcement.archived',
        entityType: 'announcement',
        entityId: id,
        summary: `Announcement "${archived.title}" archived.`,
      },
      this.now(),
    );
    return archived;
  }
}
