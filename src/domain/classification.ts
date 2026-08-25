import type { ClassificationScale } from './types';

/**
 * Blood-pressure categories, ordered from lowest to highest severity.
 *
 * These follow the ESH/ESC classification, which is also what the Microlife
 * monitor's own traffic-light bar is built on — so the app agrees with the
 * device sitting next to it rather than quietly using a different scale.
 *
 * Nothing here is a diagnosis. A category is a description of one measurement,
 * and single readings vary widely; only a clinician reading a series can say
 * anything about a person's health.
 */
export type BpCategory =
  | 'low'
  | 'optimal'
  | 'normal'
  | 'highNormal'
  | 'grade1'
  | 'grade2'
  | 'grade3';

/**
 * A category carries no display text.
 *
 * Labels and descriptions live in the translation dictionaries and are looked up
 * by `key`, so the domain layer stays language-agnostic and a new language never
 * requires touching the classification rules.
 */
export interface CategoryInfo {
  key: BpCategory;
  /** 0 = lowest severity. Used for ordering and for the traffic-light band. */
  severity: number;
  /** Which of the three traffic-light bands this falls in, matching the device. */
  band: 'green' | 'amber' | 'red';
}

export const CATEGORIES: Record<BpCategory, CategoryInfo> = {
  low: {
    key: 'low',
    severity: 0,
    band: 'green',
  },
  optimal: {
    key: 'optimal',
    severity: 1,
    band: 'green',
  },
  normal: {
    key: 'normal',
    severity: 2,
    band: 'green',
  },
  highNormal: {
    key: 'highNormal',
    severity: 3,
    band: 'amber',
  },
  grade1: {
    key: 'grade1',
    severity: 4,
    band: 'red',
  },
  grade2: {
    key: 'grade2',
    severity: 5,
    band: 'red',
  },
  grade3: {
    key: 'grade3',
    severity: 6,
    band: 'red',
  },
};

/** A systolic/diastolic pair marking one boundary between categories. */
export interface Bound {
  systolic: number;
  diastolic: number;
}

/**
 * Where one category ends and the next begins.
 *
 * `low` is a floor: a reading under *either* of its numbers is low. The rest are
 * upper bounds, tested in order, and the first a reading fits under wins. There
 * is deliberately no bound for `grade3` — it is whatever is left above `grade2`,
 * so the scale cannot have a gap at the top however it is edited.
 */
export interface ThresholdSet {
  low: Bound;
  optimal: Bound;
  normal: Bound;
  highNormal: Bound;
  grade1: Bound;
  grade2: Bound;
}

/** The categories with an editable upper bound, in the order they are applied. */
export const BOUNDED: (keyof Omit<ThresholdSet, 'low'>)[] = [
  'optimal',
  'normal',
  'highNormal',
  'grade1',
  'grade2',
];

/**
 * The two published scales.
 *
 * `home` shifts the hypertension threshold down to 135/85, which is what
 * self-measurement guidance uses: readings taken at home tend to run a few mmHg
 * below the same person's readings in a clinic.
 */
export const PRESETS: Record<'esh' | 'home', ThresholdSet> = {
  esh: {
    low: { systolic: 90, diastolic: 60 },
    optimal: { systolic: 120, diastolic: 80 },
    normal: { systolic: 130, diastolic: 85 },
    highNormal: { systolic: 140, diastolic: 90 },
    grade1: { systolic: 160, diastolic: 100 },
    grade2: { systolic: 180, diastolic: 110 },
  },
  home: {
    low: { systolic: 90, diastolic: 60 },
    optimal: { systolic: 115, diastolic: 75 },
    normal: { systolic: 125, diastolic: 80 },
    highNormal: { systolic: 135, diastolic: 85 },
    grade1: { systolic: 155, diastolic: 95 },
    grade2: { systolic: 175, diastolic: 105 },
  },
};

export const DEFAULT_THRESHOLDS = PRESETS.esh;

/**
 * The thresholds a reading should be judged against.
 *
 * Every screen that shows a category resolves it through here rather than
 * carrying the scale name around, so a custom scale that is missing or
 * unusable degrades to the standard one in exactly one place instead of
 * differently on each screen.
 */
export function thresholdsFor(
  scale: ClassificationScale,
  custom: ThresholdSet | null,
): ThresholdSet {
  if (scale === 'custom') return custom && isUsable(custom) ? custom : PRESETS.esh;
  return PRESETS[scale] ?? PRESETS.esh;
}

/**
 * Whether a set can classify anything sensibly.
 *
 * The bounds have to rise. A set where `normal` sits below `optimal` has a
 * category no reading can ever land in, which would show up as a colour that
 * never appears rather than as an error — so it is rejected here, where the
 * editor can say so, rather than absorbed silently.
 */
export function isUsable(set: ThresholdSet): boolean {
  return problemWith(set) === null;
}

/** The first thing wrong with a set, as a `{ field, after }` pair, or null. */
export function problemWith(
  set: ThresholdSet,
): { field: keyof ThresholdSet; column: 'systolic' | 'diastolic'; after: keyof ThresholdSet } | null {
  const order: (keyof ThresholdSet)[] = ['low', ...BOUNDED];
  for (const column of ['systolic', 'diastolic'] as const) {
    for (let i = 1; i < order.length; i += 1) {
      const previous = set[order[i - 1]][column];
      const current = set[order[i]][column];
      if (!Number.isFinite(current) || current <= previous) {
        return { field: order[i], column, after: order[i - 1] };
      }
    }
  }
  return null;
}

/**
 * Categorise a single reading.
 *
 * Systolic and diastolic are graded independently and the **worse** of the two
 * decides the result — a reading of 125/95 is grade 1, not normal, because the
 * diastolic alone puts it there.
 */
export function classify(
  systolic: number,
  diastolic: number,
  thresholds: ThresholdSet = DEFAULT_THRESHOLDS,
): CategoryInfo {
  if (systolic < thresholds.low.systolic || diastolic < thresholds.low.diastolic) {
    return CATEGORIES.low;
  }

  const systolicCategory = gradeOne(systolic, thresholds, 'systolic');
  const diastolicCategory = gradeOne(diastolic, thresholds, 'diastolic');

  const worse =
    CATEGORIES[systolicCategory].severity >= CATEGORIES[diastolicCategory].severity
      ? systolicCategory
      : diastolicCategory;
  return CATEGORIES[worse];
}

function gradeOne(
  value: number,
  thresholds: ThresholdSet,
  column: 'systolic' | 'diastolic',
): BpCategory {
  for (const key of BOUNDED) {
    if (value < thresholds[key][column]) return key;
  }
  return 'grade3';
}

/**
 * The inclusive span of readings that land in a category, for display.
 *
 * Derived from the thresholds rather than written out, so an edited scale
 * describes itself correctly instead of showing the numbers it used to have.
 * `null` at either end means open: nothing below `low`, nothing above `grade3`.
 */
export function spanOf(
  category: BpCategory,
  thresholds: ThresholdSet,
  column: 'systolic' | 'diastolic',
): { from: number | null; to: number | null } {
  if (category === 'low') return { from: null, to: thresholds.low[column] - 1 };
  if (category === 'grade3') return { from: thresholds.grade2[column], to: null };
  const index = BOUNDED.indexOf(category as (typeof BOUNDED)[number]);
  const lower = index === 0 ? thresholds.low[column] : thresholds[BOUNDED[index - 1]][column];
  return { from: lower, to: thresholds[category][column] - 1 };
}

/**
 * True when the systolic alone is raised while the diastolic stays normal —
 * a pattern common with age that guidance names explicitly.
 */
export function isIsolatedSystolic(
  systolic: number,
  diastolic: number,
  thresholds: ThresholdSet = DEFAULT_THRESHOLDS,
): boolean {
  return systolic >= thresholds.highNormal.systolic && diastolic < thresholds.highNormal.diastolic;
}

/** Pulse pressure: the gap between the two numbers. */
export function pulsePressure(systolic: number, diastolic: number): number {
  return systolic - diastolic;
}

/** Mean arterial pressure, the time-weighted average across a cardiac cycle. */
export function meanArterialPressure(systolic: number, diastolic: number): number {
  return Math.round((systolic + 2 * diastolic) / 3);
}

/**
 * Reads a stored custom scale, or nothing.
 *
 * Settings are strings in SQLite, so this is where a hand-edited or
 * older-version value gets turned away. Anything that is not a complete,
 * usable set is treated as absent — `thresholdsFor` then falls back to the
 * standard scale, which is always safe to classify against.
 */
export function parseThresholds(raw: string | null): ThresholdSet | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<keyof ThresholdSet, Partial<Bound>>>;
    const out = {} as ThresholdSet;
    for (const key of ['low', ...BOUNDED] as (keyof ThresholdSet)[]) {
      const bound = parsed[key];
      const systolic = Number(bound?.systolic);
      const diastolic = Number(bound?.diastolic);
      if (!Number.isFinite(systolic) || !Number.isFinite(diastolic)) return null;
      out[key] = { systolic: Math.round(systolic), diastolic: Math.round(diastolic) };
    }
    return isUsable(out) ? out : null;
  } catch {
    return null;
  }
}
