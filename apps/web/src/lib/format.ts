export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  })} ${date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })} UTC`;
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return '—';
  const deltaSeconds = Math.round((timestamp - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const divisions: { limit: number; unit: Intl.RelativeTimeFormatUnit; divisor: number }[] = [
    { limit: 60, unit: 'second', divisor: 1 },
    { limit: 3600, unit: 'minute', divisor: 60 },
    { limit: 86400, unit: 'hour', divisor: 3600 },
    { limit: 604800, unit: 'day', divisor: 86400 },
    { limit: 2629800, unit: 'week', divisor: 604800 },
    { limit: 31557600, unit: 'month', divisor: 2629800 },
  ];
  for (const division of divisions) {
    if (Math.abs(deltaSeconds) < division.limit) {
      return formatter.format(Math.round(deltaSeconds / division.divisor), division.unit);
    }
  }
  return formatter.format(Math.round(deltaSeconds / 31557600), 'year');
}

export function humanize(value: string | null | undefined): string {
  if (!value) return '—';
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function truncate(value: string, max = 120): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function steamProfileLink(steamId64: string): string {
  return `https://steamcommunity.com/profiles/${steamId64}`;
}
