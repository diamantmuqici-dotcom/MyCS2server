import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { BackendClient, IngestResult, ModerationEventPayload } from './api-client.js';
import { ApiError } from './api-client.js';

interface OutboxEntry {
  id: string;
  dedupeKey: string;
  payload: ModerationEventPayload;
  createdAt: string;
  attempts: number;
  lastError: string | null;
}

const MAX_ENTRIES = 5000;

/**
 * Durable local outbox for moderation events.
 *
 * If the backend is unreachable, events are written to disk and retried until
 * the backend confirms them. Entries are de-duplicated by `dedupeKey`, and the
 * file is written atomically so a crash cannot corrupt pending events.
 */
export class LocalIngestOutbox {
  private readonly filePath: string;
  private entries: OutboxEntry[] = [];
  private loaded = false;
  private flushing = false;

  constructor(
    filePath: string,
    private readonly client: BackendClient,
    private readonly log: (message: string, error?: unknown) => void = () => undefined,
  ) {
    this.filePath = resolve(filePath);
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      this.entries = Array.isArray(parsed) ? (parsed as OutboxEntry[]) : [];
    } catch {
      this.entries = [];
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(this.entries, null, 2), 'utf8');
    await rename(temporary, this.filePath);
  }

  async enqueue(payload: ModerationEventPayload): Promise<void> {
    await this.load();
    if (this.entries.some((entry) => entry.dedupeKey === payload.dedupeKey)) return;
    this.entries.push({
      id: randomUUID(),
      dedupeKey: payload.dedupeKey,
      payload,
      createdAt: new Date().toISOString(),
      attempts: 0,
      lastError: null,
    });
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES);
    }
    await this.persist();
  }

  get size(): number {
    return this.entries.length;
  }

  async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      await this.load();
      if (this.entries.length === 0) return;
      const remaining: OutboxEntry[] = [];
      for (const entry of this.entries) {
        try {
          await this.client.ingest(entry.payload);
        } catch (error) {
          if (error instanceof ApiError && error.permanent) {
            this.log(
              `Dropping moderation event ${entry.dedupeKey}: backend rejected it permanently (${error.message})`,
              error,
            );
            continue;
          }
          entry.attempts += 1;
          entry.lastError = error instanceof Error ? error.message : 'unknown error';
          remaining.push(entry);
        }
      }
      if (remaining.length !== this.entries.length) {
        this.entries = remaining;
        await this.persist();
      }
    } finally {
      this.flushing = false;
    }
  }

  /** Records an event through the API, falling back to the durable outbox. */
  async record(payload: ModerationEventPayload): Promise<{ queued: boolean; result: IngestResult | null }> {
    try {
      const result = await this.client.ingest(payload);
      return { queued: false, result };
    } catch (error) {
      if (error instanceof ApiError && error.permanent) throw error;
      await this.enqueue(payload);
      this.log(`Moderation event queued locally for retry: ${payload.dedupeKey}`, error);
      return { queued: true, result: null };
    }
  }
}
