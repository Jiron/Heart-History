import { describe, expect, it } from 'vitest';

import {
  classify,
  isIsolatedSystolic,
  isUsable,
  parseThresholds,
  PRESETS,
  problemWith,
  spanOf,
  thresholdsFor,
  type ThresholdSet,
} from '../src/domain/classification';

/**
 * The classification rules, and the editable scale that now feeds them.
 *
 * The colour on a reading is the one piece of interpretation this app offers,
 * so the boundaries have to be exact — and since the boundaries can now be
 * edited, two further things have to hold: what the table *says* has to match
 * what `classify` actually does, and a scale that cannot classify has to be
 * turned away rather than absorbed.
 */

describe('classify', () => {
  it('places each category on the right side of its boundary', () => {
    // The upper bound belongs to the next category up, so 119/79 is optimal
    // and 120/80 is not.
    expect(classify(119, 79).key).toBe('optimal');
    expect(classify(120, 80).key).toBe('normal');
    expect(classify(129, 84).key).toBe('normal');
    expect(classify(130, 85).key).toBe('highNormal');
    expect(classify(139, 89).key).toBe('highNormal');
    expect(classify(140, 90).key).toBe('grade1');
    expect(classify(159, 99).key).toBe('grade1');
    expect(classify(160, 100).key).toBe('grade2');
    expect(classify(179, 109).key).toBe('grade2');
    expect(classify(180, 110).key).toBe('grade3');
  });

  it('takes the worse of the two numbers', () => {
    // 125 alone is normal; 95 alone is grade 1. The reading is grade 1.
    expect(classify(125, 95).key).toBe('grade1');
    expect(classify(185, 70).key).toBe('grade3');
  });

  it('calls a reading low when either number is under the floor', () => {
    expect(classify(88, 70).key).toBe('low');
    expect(classify(110, 55).key).toBe('low');
    expect(classify(90, 60).key).toBe('optimal');
  });

  it('uses the home scale when it is the one given', () => {
    // 137/88 is high-normal on the clinic scale and grade 1 at home.
    expect(classify(137, 88, PRESETS.esh).key).toBe('highNormal');
    expect(classify(137, 88, PRESETS.home).key).toBe('grade1');
  });
});

describe('spanOf', () => {
  /**
   * The ranges screen prints these, and a reading has to land in the category
   * whose printed span contains it. They are derived from the same numbers
   * `classify` reads, which is the point -- an edited scale describes itself.
   */
  it('describes a span that classify agrees with', () => {
    for (const scale of [PRESETS.esh, PRESETS.home]) {
      for (const column of ['systolic', 'diastolic'] as const) {
        for (const key of ['optimal', 'normal', 'highNormal', 'grade1', 'grade2'] as const) {
          const { from, to } = spanOf(key, scale, column);
          expect(from).not.toBeNull();
          expect(to).not.toBeNull();
          const other = column === 'systolic' ? 'diastolic' : 'systolic';
          const safe = scale[key][other] - 1;
          const at = (value: number) =>
            column === 'systolic' ? classify(value, safe, scale) : classify(safe, value, scale);
          // Both ends of the printed span, graded with the other number held
          // just inside the same category, land in that category.
          expect(at(from!).key).toBe(key);
          expect(at(to!).key).toBe(key);
        }
      }
    }
  });

  it('leaves the ends of the scale open', () => {
    expect(spanOf('low', PRESETS.esh, 'systolic')).toEqual({ from: null, to: 89 });
    expect(spanOf('grade3', PRESETS.esh, 'diastolic')).toEqual({ from: 110, to: null });
  });
});

describe('a custom scale', () => {
  const custom: ThresholdSet = {
    low: { systolic: 95, diastolic: 65 },
    optimal: { systolic: 115, diastolic: 75 },
    normal: { systolic: 125, diastolic: 82 },
    highNormal: { systolic: 132, diastolic: 86 },
    grade1: { systolic: 150, diastolic: 95 },
    grade2: { systolic: 170, diastolic: 105 },
  };

  it('is used when it is selected and usable', () => {
    expect(thresholdsFor('custom', custom)).toBe(custom);
    expect(classify(128, 84, thresholdsFor('custom', custom)).key).toBe('highNormal');
  });

  it('falls back to the standard scale rather than failing', () => {
    // Selected but never edited, and selected but broken. Neither can be
    // allowed to leave a reading uncategorised: the colour is on every screen.
    expect(thresholdsFor('custom', null)).toBe(PRESETS.esh);
    const broken = { ...custom, grade1: { systolic: 100, diastolic: 95 } };
    expect(thresholdsFor('custom', broken)).toBe(PRESETS.esh);
  });

  it('rejects a set whose boundaries do not rise', () => {
    expect(isUsable(custom)).toBe(true);

    const flat = { ...custom, normal: { systolic: 115, diastolic: 82 } };
    expect(problemWith(flat)).toEqual({
      field: 'normal',
      column: 'systolic',
      after: 'optimal',
    });

    // A category that no reading can reach is the failure being prevented:
    // nothing is below 115 and above 115, so "normal" would never appear.
    expect(isUsable(flat)).toBe(false);
  });

  it('reports the first thing wrong, systolic before diastolic', () => {
    const both = {
      ...custom,
      normal: { systolic: 110, diastolic: 70 },
    };
    expect(problemWith(both)?.column).toBe('systolic');
  });
});

describe('parseThresholds', () => {
  /**
   * Settings are text in SQLite, so this is the boundary where a value written
   * by an older build, a hand edit or a corrupted row has to be turned away.
   */
  it('reads back what was written', () => {
    expect(parseThresholds(JSON.stringify(PRESETS.home))).toEqual(PRESETS.home);
  });

  it('returns nothing for anything it cannot use', () => {
    expect(parseThresholds(null)).toBeNull();
    expect(parseThresholds('')).toBeNull();
    expect(parseThresholds('not json')).toBeNull();
    expect(parseThresholds('{}')).toBeNull();
    // A complete set with one boundary missing is still unusable.
    const { grade2, ...missing } = PRESETS.esh;
    expect(parseThresholds(JSON.stringify(missing))).toBeNull();
    // Complete, parseable, and it would produce an unreachable category.
    expect(
      parseThresholds(JSON.stringify({ ...PRESETS.esh, grade1: { systolic: 100, diastolic: 90 } })),
    ).toBeNull();
  });

  it('rounds rather than keeping fractions', () => {
    const written = { ...PRESETS.esh, normal: { systolic: 130.4, diastolic: 84.6 } };
    expect(parseThresholds(JSON.stringify(written))?.normal).toEqual({
      systolic: 130,
      diastolic: 85,
    });
  });
});

describe('isIsolatedSystolic', () => {
  it('follows the scale it is given', () => {
    expect(isIsolatedSystolic(145, 85, PRESETS.esh)).toBe(true);
    expect(isIsolatedSystolic(145, 95, PRESETS.esh)).toBe(false);
    // 136/84 is not isolated systolic on the clinic scale and is at home.
    expect(isIsolatedSystolic(136, 84, PRESETS.esh)).toBe(false);
    expect(isIsolatedSystolic(136, 84, PRESETS.home)).toBe(true);
  });
});
