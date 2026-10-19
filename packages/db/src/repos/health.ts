import { parseJson, stringifyJson } from '../json.js';
import type { Db } from '../client.js';
import type { ServiceHealthRow } from '../rows.js';

export async function recordServiceHealth(
  db: Db,
  service: string,
  status: string,
  detail: Record<string, unknown> | null,
  now: string,
): Promise<void> {
  await db.run(
    `INSERT INTO service_health (service, status, last_seen_at, detail_json)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (service) DO UPDATE SET
       status = excluded.status,
       last_seen_at = excluded.last_seen_at,
       detail_json = excluded.detail_json`,
    [service, status, now, stringifyJson(detail)],
  );
}

export async function getServiceHealth(db: Db): Promise<ServiceHealthRow[]> {
  return db.all<ServiceHealthRow>('SELECT * FROM service_health');
}

export function serviceHealthDetail(row: ServiceHealthRow): Record<string, unknown> | null {
  return parseJson<Record<string, unknown> | null>(row.detail_json, null);
}
