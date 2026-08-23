import { classify, type BpCategory, type CategoryInfo } from './classification';
import type { ClassificationScale, Reading } from './types';

// ---------------------------------------------------------------------------
// Date ranges
// ---------------------------------------------------------------------------

export type RangeKey = '7d' | '30d' | '90d' | '1y' | 'all' | 'custom';

export interface DateRange {
  key: RangeKey;
  label: string;
  /** Inclusive lower bound, or null for "everything". */
  since: number | null;
  /** Exclusive upper bound, or null for "up to now". */
  until: number | null;
}

export const RANGE_PRESETS: { key: Exclude<RangeKey, 'custom'>; label: string; days: number | null }[] =
  [
    { key: '7d', label: 'Week', days: 7 },
    { key: '30d', label: 'Month', days: 30 },
    { key: '90d', label: '3 months', days: 90 },
    { key: '1y', label: 'Year', days: 365 },
    { key: 'all', label: 'All', days: null },
  ];

export function presetRange(key: Exclude<RangeKey, 'custom'>, now = Date.now()): DateRange {
  const preset = RANGE_PRESETS.find((p) => p.key === key) ?? RANGE_PRESETS[1];
  if (preset.days === null) {
    return { key, label: preset.label, since: null, until: null };
  }
  // Count back to the start of the day, so "Week" means seven whole days rather
  // than a window that slides through the current one.
  const start = startOfDay(now) - (preset.days - 1) * DAY_MS;
  return { key, label: preset.label, since: start, until: null };
}

export function customRange(from: number, to: number): DateRange {
  const since = startOfDay(Math.min(from, to));
  const until = startOfDay(Math.max(from, to)) + DAY_MS;
  return { key: 'custom', label: 'Custom', since, until };
}

export const DAY_MS = 86_400_000;

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function inRange(reading: Reading, range: DateRange): boolean {
  if (range.since !== null && reading.measuredAt < range.since) return false;
  if (range.until !== null && reading.measuredAt >= range.until) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

export interface Summary {
  count: number;
  systolic: SeriesStats;
  diastolic: SeriesStats;
  pulse: SeriesStats | null;
  /** Category of the *average* reading, not the average of the categories. */
  averageCategory: CategoryInfo | null;
  distribution: { category: BpCategory; count: number; share: number }[];
  irregularCount: number;
  /** First and last measurement in the set. */
  from: number | null;
  to: number | null;
}

export interface SeriesStats {
  mean: number;
  min: number;
  max: number;
  /** Population standard deviation. */
  sd: number;
}

function seriesStats(values: number[]): SeriesStats {
  if (values.length === 0) return { mean: 0, min: 0, max: 0, sd: 0 };
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const mean = sum / values.length;
  let variance = 0;
  for (const v of values) variance += (v - mean) ** 2;
  return {
    mean: Math.round(mean * 10) / 10,
    min,
    max,
    sd: Math.round(Math.sqrt(variance / values.length) * 10) / 10,
  };
}

export function summarise(
  readings: Reading[],
  scale: ClassificationScale = 'esh',
): Summary {
  if (readings.length === 0) {
    const empty = { mean: 0, min: 0, max: 0, sd: 0 };
    return {
      count: 0,
      systolic: empty,
      diastolic: empty,
      pulse: null,
      averageCategory: null,
      distribution: [],
      irregularCount: 0,
      from: null,
      to: null,
    };
  }

  const systolic = seriesStats(readings.map((r) => r.systolic));
  const diastolic = seriesStats(readings.map((r) => r.diastolic));
  const pulses = readings.map((r) => r.pulse).filter((p): p is number => p !== null);

  const counts = new Map<BpCategory, number>();
  for (const r of readings) {
    const c = classify(r.systolic, r.diastolic, scale).key;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }

  const times = readings.map((r) => r.measuredAt);

  return {
    count: readings.length,
    systolic,
    diastolic,
    pulse: pulses.length > 0 ? seriesStats(pulses) : null,
    averageCategory: classify(Math.round(systolic.mean), Math.round(diastolic.mean), scale),
    distribution: [...counts.entries()]
      .map(([category, count]) => ({
        category,
        count,
        share: count / readings.length,
      }))
      .sort((a, b) => b.count - a.count),
    irregularCount: readings.filter((r) => r.irregularHeartbeat).length,
    from: Math.min(...times),
    to: Math.max(...times),
  };
}

// ---------------------------------------------------------------------------
// Morning / evening averages
// ---------------------------------------------------------------------------

export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night';

export function dayPart(ts: number): DayPart {
  const hour = new Date(ts).getHours();
  if (hour < 5) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  if (hour < 23) return 'evening';
  return 'night';
}

export interface DayPartAverage {
  part: DayPart;
  count: number;
  systolic: number;
  diastolic: number;
}

export function averagesByDayPart(readings: Reading[]): DayPartAverage[] {
  const buckets = new Map<DayPart, Reading[]>();
  for (const r of readings) {
    const part = dayPart(r.measuredAt);
    const list = buckets.get(part);
    if (list) list.push(r);
    else buckets.set(part, [r]);
  }
  const order: DayPart[] = ['morning', 'afternoon', 'evening', 'night'];
  return order
    .filter((p) => buckets.has(p))
    .map((part) => {
      const list = buckets.get(part)!;
      return {
        part,
        count: list.length,
        systolic: Math.round(list.reduce((s, r) => s + r.systolic, 0) / list.length),
        diastolic: Math.round(list.reduce((s, r) => s + r.diastolic, 0) / list.length),
      };
    });
}

/**
 * The seven-day morning-and-evening average that home-monitoring guidance asks
 * for: measurements taken over a week, morning and evening, averaged together.
 * Returns null until there is enough data for the number to mean anything.
 */
export function sevenDayAverage(
  readings: Reading[],
  now = Date.now(),
): { systolic: number; diastolic: number; count: number; days: number } | null {
  const since = startOfDay(now) - 6 * DAY_MS;
  const window = readings.filter(
    (r) => r.measuredAt >= since && ['morning', 'evening'].includes(dayPart(r.measuredAt)),
  );
  if (window.length < 4) return null;
  const days = new Set(window.map((r) => startOfDay(r.measuredAt))).size;
  return {
    systolic: Math.round(window.reduce((s, r) => s + r.systolic, 0) / window.length),
    diastolic: Math.round(window.reduce((s, r) => s + r.diastolic, 0) / window.length),
    count: window.length,
    days,
  };
}

// ---------------------------------------------------------------------------
// Trend
// ---------------------------------------------------------------------------

export interface Trend {
  /** Change in mmHg per week. Negative means falling. */
  systolicPerWeek: number;
  diastolicPerWeek: number;
  /** How well a straight line fits, 0..1. Low values mean "too scattered to say". */
  fit: number;
  direction: 'rising' | 'falling' | 'steady';
}

/**
 * Least-squares slope over time.
 *
 * The `fit` (r-squared) is reported alongside so the UI can stay quiet when the
 * data is too noisy to support a claim. Blood pressure varies a lot between
 * measurements, and a confident-sounding "trending up" drawn through a scatter
 * of unrelated points would be worse than saying nothing.
 */
export function trendOf(readings: Reading[]): Trend | null {
  if (readings.length < 4) return null;
  const sorted = [...readings].sort((a, b) => a.measuredAt - b.measuredAt);
  const span = sorted[sorted.length - 1].measuredAt - sorted[0].measuredAt;
  if (span < DAY_MS) return null;

  const weeks = sorted.map((r) => (r.measuredAt - sorted[0].measuredAt) / (7 * DAY_MS));
  const sys = regression(weeks, sorted.map((r) => r.systolic));
  const dia = regression(weeks, sorted.map((r) => r.diastolic));

  const systolicPerWeek = Math.round(sys.slope * 10) / 10;
  const fit = Math.max(sys.r2, dia.r2);

  let direction: Trend['direction'] = 'steady';
  if (fit >= 0.25 && Math.abs(systolicPerWeek) >= 0.8) {
    direction = systolicPerWeek > 0 ? 'rising' : 'falling';
  }

  return {
    systolicPerWeek,
    diastolicPerWeek: Math.round(dia.slope * 10) / 10,
    fit: Math.round(fit * 100) / 100,
    direction,
  };
}

function regression(xs: number[], ys: number[]): { slope: number; r2: number } {
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return { slope: 0, r2: 0 };
  const slope = sxy / sxx;
  const r2 = (sxy * sxy) / (sxx * syy);
  return { slope, r2 };
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

export interface DayGroup {
  day: number;
  readings: Reading[];
}

/** Groups into calendar days, newest first, for the history list. */
export function groupByDay(readings: Reading[]): DayGroup[] {
  const map = new Map<number, Reading[]>();
  for (const r of readings) {
    const day = startOfDay(r.measuredAt);
    const list = map.get(day);
    if (list) list.push(r);
    else map.set(day, [r]);
  }
  return [...map.entries()]
    .map(([day, list]) => ({
      day,
      readings: list.sort((a, b) => b.measuredAt - a.measuredAt),
    }))
    .sort((a, b) => b.day - a.day);
}

/**
 * Collapses readings into one point per bucket, so a year of data does not try
 * to draw thousands of marks on a phone-width chart.
 */
export interface Bucket {
  start: number;
  systolic: number;
  diastolic: number;
  pulse: number | null;
  count: number;
}

export function bucketise(readings: Reading[], bucketMs: number): Bucket[] {
  if (readings.length === 0) return [];
  const map = new Map<number, Reading[]>();
  for (const r of readings) {
    const key = Math.floor(r.measuredAt / bucketMs) * bucketMs;
    const list = map.get(key);
    if (list) list.push(r);
    else map.set(key, [r]);
  }
  return [...map.entries()]
    .map(([start, list]) => {
      const pulses = list.map((r) => r.pulse).filter((p): p is number => p !== null);
      return {
        start,
        systolic: list.reduce((s, r) => s + r.systolic, 0) / list.length,
        diastolic: list.reduce((s, r) => s + r.diastolic, 0) / list.length,
        pulse: pulses.length ? pulses.reduce((a, b) => a + b, 0) / pulses.length : null,
        count: list.length,
      };
    })
    .sort((a, b) => a.start - b.start);
}

/** Picks a bucket size that keeps a chart under roughly `target` marks. */
export function chooseBucket(span: number, target = 60): number {
  const candidates = [
    DAY_MS / 24,
    DAY_MS / 4,
    DAY_MS,
    DAY_MS * 3,
    DAY_MS * 7,
    DAY_MS * 14,
    DAY_MS * 30,
  ];
  for (const c of candidates) {
    if (span / c <= target) return c;
  }
  return candidates[candidates.length - 1];
}
