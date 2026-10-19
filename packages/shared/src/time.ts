/** All persisted timestamps are UTC ISO-8601 strings. */
export function nowIso(): string {
  return new Date().toISOString();
}

export function toIso(value: Date | string | number): string {
  return new Date(value).toISOString();
}

export function addSeconds(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
}

export function addHours(iso: string, hours: number): string {
  return addSeconds(iso, hours * 3600);
}

export function isPast(iso: string, reference: Date = new Date()): boolean {
  return new Date(iso).getTime() <= reference.getTime();
}

export function formatUtc(iso: string | null | undefined): string {
  if (!iso) return '—';
  return `${iso.replace('T', ' ').replace(/\.\d{3}Z$/, '')} UTC`;
}

/** Discord relative timestamp, e.g. <t:1700000000:R>. */
export function discordTimestamp(iso: string, style: 'f' | 'F' | 'R' | 'd' | 'D' | 't' | 'T' = 'f'): string {
  return `<t:${Math.floor(new Date(iso).getTime() / 1000)}:${style}>`;
}
