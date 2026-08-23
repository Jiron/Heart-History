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

interface Threshold {
  systolic: number;
  diastolic: number;
  category: BpCategory;
}

/**
 * Upper bounds, evaluated in order. The first row a reading fits under wins.
 *
 * The `home` scale shifts the hypertension threshold down to 135/85, which is
 * what self-measurement guidance uses: readings taken at home tend to run a few
 * mmHg below the same person's readings in a clinic.
 */
const SCALES: Record<ClassificationScale, Threshold[]> = {
  esh: [
    { systolic: 120, diastolic: 80, category: 'optimal' },
    { systolic: 130, diastolic: 85, category: 'normal' },
    { systolic: 140, diastolic: 90, category: 'highNormal' },
    { systolic: 160, diastolic: 100, category: 'grade1' },
    { systolic: 180, diastolic: 110, category: 'grade2' },
  ],
  home: [
    { systolic: 115, diastolic: 75, category: 'optimal' },
    { systolic: 125, diastolic: 80, category: 'normal' },
    { systolic: 135, diastolic: 85, category: 'highNormal' },
    { systolic: 155, diastolic: 95, category: 'grade1' },
    { systolic: 175, diastolic: 105, category: 'grade2' },
  ],
};

const LOW_THRESHOLD = { systolic: 90, diastolic: 60 };

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
  scale: ClassificationScale = 'esh',
): CategoryInfo {
  if (systolic < LOW_THRESHOLD.systolic || diastolic < LOW_THRESHOLD.diastolic) {
    return CATEGORIES.low;
  }

  const thresholds = SCALES[scale];
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
  thresholds: Threshold[],
  key: 'systolic' | 'diastolic',
): BpCategory {
  for (const t of thresholds) {
    if (value < t[key]) return t.category;
  }
  return 'grade3';
}

/**
 * True when the systolic alone is raised while the diastolic stays normal —
 * a pattern common with age that guidance names explicitly.
 */
export function isIsolatedSystolic(
  systolic: number,
  diastolic: number,
  scale: ClassificationScale = 'esh',
): boolean {
  const cut = scale === 'home' ? { s: 135, d: 85 } : { s: 140, d: 90 };
  return systolic >= cut.s && diastolic < cut.d;
}

/** Pulse pressure: the gap between the two numbers. */
export function pulsePressure(systolic: number, diastolic: number): number {
  return systolic - diastolic;
}

/** Mean arterial pressure, the time-weighted average across a cardiac cycle. */
export function meanArterialPressure(systolic: number, diastolic: number): number {
  return Math.round((systolic + 2 * diastolic) / 3);
}
