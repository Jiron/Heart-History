import { DAY_MS, startOfDay } from '@/domain/statistics';
import { getLocale, type Dictionary } from '@/i18n';

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(getLocale(), {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(getLocale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateShort(ts: number): string {
  return new Date(ts).toLocaleDateString(getLocale(), { day: 'numeric', month: 'short' });
}

/** "Today", "Yesterday", then the weekday for the past week, then a date. */
export function formatDayLabel(ts: number, t: Dictionary, now = Date.now()): string {
  const day = startOfDay(ts);
  const today = startOfDay(now);
  const diffDays = Math.round((today - day) / DAY_MS);

  if (diffDays === 0) return t.history.today;
  if (diffDays === 1) return t.history.yesterday;
  if (diffDays > 1 && diffDays < 7) {
    return new Date(ts).toLocaleDateString(getLocale(), { weekday: 'long' });
  }
  return formatDate(ts);
}

/** Compact "3h ago" style, for the most recent reading. */
export function formatRelative(ts: number, t: Dictionary, now = Date.now()): string {
  const diff = now - ts;
  if (diff < 0) return t.relative.justNow;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return t.relative.justNow;
  if (minutes < 60) return t.relative.minutes(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t.relative.hours(hours);
  const days = Math.floor(hours / 24);
  if (days === 1) return t.relative.yesterday;
  if (days < 30) return t.relative.days(days);
  const months = Math.floor(days / 30);
  if (months < 12) return t.relative.months(months);
  return t.relative.years(Math.floor(months / 12));
}

/** ISO-ish local date, used for date inputs and CSV. */
export function toISODate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toISODateTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${toISODate(ts)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parses "YYYY-MM-DD" as local midnight. Returns null when malformed. */
export function parseISODate(value: string): number | null {
  const match = value.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  if (d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d.getTime();
}
