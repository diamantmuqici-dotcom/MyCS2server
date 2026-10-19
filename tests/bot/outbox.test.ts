import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalIngestOutbox } from '../../apps/bot/src/local-outbox.js';
import {
  ApiError,
  type BackendClient,
  type ModerationEventPayload,
} from '../../apps/bot/src/api-client.js';

const payload: ModerationEventPayload = {
  guildId: '100000000000000001',
  actionType: 'BAN',
  target: { id: '100000000000000101', username: 'target' },
  moderator: { id: '100000000000000010', name: 'mod' },
  reason: 'test',
  occurredAt: '2026-10-19T06:00:00.000Z',
  source: 'BOT_COMMAND',
  dedupeKey: 'ban:cmd:1',
  attributionStatus: 'VERIFIED',
};

function client(behaviour: () => Promise<unknown>): BackendClient {
  return { ingest: behaviour } as unknown as BackendClient;
}

describe('durable moderation outbox', () => {
  let directory = '';

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'de-outbox-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('records immediately when the backend is available', async () => {
    const outbox = new LocalIngestOutbox(
      join(directory, 'outbox.jsonl'),
      client(async () => ({ caseRef: 'DE-000001', duplicate: false })),
    );
    const result = await outbox.record(payload);
    expect(result.queued).toBe(false);
    expect(result.result).toMatchObject({ caseRef: 'DE-000001' });
    expect(outbox.size).toBe(0);
  });

  it('queues events when the backend is unreachable and deduplicates retries', async () => {
    const outbox = new LocalIngestOutbox(
      join(directory, 'outbox.jsonl'),
      client(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );
    const first = await outbox.record(payload);
    const second = await outbox.record(payload);
    expect(first.queued).toBe(true);
    expect(second.queued).toBe(true);
    expect(outbox.size).toBe(1);

    const persisted = JSON.parse(await readFile(join(directory, 'outbox.jsonl'), 'utf8'));
    expect(persisted).toHaveLength(1);
    expect(persisted[0].dedupeKey).toBe('ban:cmd:1');
  });

  it('flushes queued events once the backend recovers', async () => {
    let online = false;
    const outbox = new LocalIngestOutbox(
      join(directory, 'outbox.jsonl'),
      client(async () => {
        if (!online) throw new Error('network down');
        return { caseRef: 'DE-000002' };
      }),
    );
    await outbox.record(payload);
    expect(outbox.size).toBe(1);
    online = true;
    await outbox.flush();
    expect(outbox.size).toBe(0);
  });

  it('keeps events when a retryable failure persists', async () => {
    const outbox = new LocalIngestOutbox(
      join(directory, 'outbox.jsonl'),
      client(async () => {
        throw new Error('timeout');
      }),
    );
    await outbox.record(payload);
    await outbox.flush();
    expect(outbox.size).toBe(1);
  });

  it('drops events the backend rejects permanently, but rethrows them to the caller', async () => {
    const outbox = new LocalIngestOutbox(
      join(directory, 'outbox.jsonl'),
      client(async () => {
        throw new ApiError('validation failed', 400, null);
      }),
    );
    await expect(outbox.record(payload)).rejects.toThrow(/validation failed/);
    expect(outbox.size).toBe(0);
  });
});
