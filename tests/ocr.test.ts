import { describe, expect, it } from 'vitest';

import { recognise } from '../src/ocr/pipeline';
import { GLYPHS } from '../src/ocr/sevenSegment';
import { applyAugmentations, makeRng } from '../tools/augment';
import { PRESETS } from '../tools/presets';
import { renderDisplay, type DisplaySpec } from '../tools/render-display';

function photoOf(spec: DisplaySpec, preset: keyof typeof PRESETS, seed = 7) {
  const base = renderDisplay(spec);
  const img = applyAugmentations(base, PRESETS[preset], makeRng(seed));
  return { width: img.width, height: img.height, data: img.data };
}

const reading = (sys: number, dia: number, pul: number): DisplaySpec => ({
  sys,
  dia,
  pul,
  header: { mode: 'date', month: 8, day: 23 },
  icons: { memory: true, cuffOk: true, traffic: 1 },
});

describe('seven-segment glyph table', () => {
  it('maps every digit to a distinct segment pattern', () => {
    const digits = '0123456789'.split('');
    const patterns = new Map<string, number>();
    for (const [pattern, char] of GLYPHS) {
      if (digits.includes(char)) patterns.set(char, pattern);
    }
    expect([...patterns.keys()].sort()).toEqual(digits);
    expect(new Set(patterns.values()).size).toBe(10);
  });

  it('never assigns two characters the same pattern', () => {
    expect(new Set(GLYPHS.keys()).size).toBe(GLYPHS.size);
  });
});

describe('recogniser', () => {
  it('reads a clean display exactly', () => {
    const r = recognise(photoOf(reading(122, 79, 98), 'clean'));
    expect(r.systolic).toBe(122);
    expect(r.diastolic).toBe(79);
    expect(r.pulse).toBe(98);
    expect(r.ok).toBe(true);
  });

  it('reads every digit 0-9 in the systolic row', () => {
    // Each case puts a different digit in the tens position.
    const cases = [102, 112, 122, 132, 142, 152, 162, 172, 182, 192];
    for (const sys of cases) {
      const r = recognise(photoOf(reading(sys, 80, 70), 'clean'));
      expect(r.systolic, `systolic ${sys}`).toBe(sys);
    }
  });

  it('handles two-digit rows padded with blanks', () => {
    const r = recognise(photoOf(reading(99, 66, 59), 'clean'));
    expect([r.systolic, r.diastolic, r.pulse]).toEqual([99, 66, 59]);
  });

  it('reads a leading 1, which is right-aligned in its cell', () => {
    const r = recognise(photoOf(reading(111, 71, 61), 'clean'));
    expect([r.systolic, r.diastolic, r.pulse]).toEqual([111, 71, 61]);
  });

  it('survives perspective, glare, noise and JPEG artefacts', () => {
    for (const preset of ['typical', 'angled', 'hard', 'brutal'] as const) {
      const r = recognise(photoOf(reading(135, 88, 64), preset, 42));
      expect([r.systolic, r.diastolic], preset).toEqual([135, 88]);
    }
  });

  it('still reads a display the panel border has bridged into', () => {
    // `severe` was the negative fixture until the recogniser learned to sever
    // the border and to source each row from whichever pass resolved it best.
    const r = recognise(photoOf(reading(128, 84, 72), 'severe', 3));
    expect([r.systolic, r.diastolic]).toEqual([128, 84]);
  });

  it('omits a pulse it cannot stand behind rather than guessing one', () => {
    // Whenever a pulse is reported it must be right; being absent is allowed.
    for (const preset of ['typical', 'hard', 'brutal', 'severe'] as const) {
      for (let seed = 0; seed < 4; seed++) {
        const r = recognise(photoOf(reading(141, 90, 77), preset, seed));
        if (r.ok && r.pulse !== null) {
          expect(r.pulse, `${preset} seed ${seed}`).toBe(77);
        }
      }
    }
  });

  it('reports the device date as a hint when it is legible', () => {
    const r = recognise(photoOf(reading(122, 79, 98), 'clean'));
    expect(r.detectedDate).toEqual({ month: 8, day: 23 });
  });

  it('flags a stored average rather than treating it as a measurement', () => {
    const spec: DisplaySpec = {
      sys: 128,
      dia: 82,
      pul: 74,
      header: { mode: 'average' },
      icons: {},
    };
    const r = recognise(photoOf(spec, 'clean'));
    expect(r.icons.average).toBe(true);
    expect(r.warnings.map((w) => w.code)).toContain('isAverage');
  });

  it('rejects an error code instead of reading it as numbers', () => {
    const spec: DisplaySpec = {
      sys: null,
      dia: null,
      pul: null,
      header: { mode: 'none' },
      icons: {},
      errorCode: 2,
    };
    const r = recognise(photoOf(spec, 'clean'));
    expect(r.ok).toBe(false);
  });
});

describe('safety: never invent a reading', () => {
  it('refuses an unreadable photo', () => {
    // Glare covers the value block and the blur is wider than a segment, so a
    // person could not read this either. Anything accepted here is invented.
    for (let seed = 0; seed < 8; seed++) {
      const r = recognise(photoOf(reading(122, 79, 98), 'unreadable', seed));
      expect(r.ok, `seed ${seed}`).toBe(false);
    }
  });

  it('refuses a photo with no display in it at all', () => {
    const w = 400;
    const h = 600;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const v = 40 + ((i * 7919) % 11);
      data[i * 4] = v;
      data[i * 4 + 1] = v;
      data[i * 4 + 2] = v;
      data[i * 4 + 3] = 255;
    }
    const r = recognise({ width: w, height: h, data });
    expect(r.ok).toBe(false);
    expect(r.systolic).toBeNull();
  });

  it('accepts nothing it reads wrongly, across many conditions', () => {
    const cases = [
      [122, 79, 98],
      [107, 78, 98],
      [160, 100, 88],
      [99, 66, 59],
      [145, 95, 77],
      [111, 71, 61],
    ] as const;
    const presets = ['clean', 'typical', 'angled', 'dim', 'hard', 'brutal', 'severe'] as const;

    let accepted = 0;
    let falsePositives = 0;
    for (const preset of presets) {
      for (let i = 0; i < cases.length; i++) {
        const [sys, dia, pul] = cases[i];
        const r = recognise(photoOf(reading(sys, dia, pul), preset, 100 + i));
        if (!r.ok) continue;
        accepted++;
        if (r.systolic !== sys || r.diastolic !== dia) falsePositives++;
      }
    }
    // The whole point of the confidence model: anything accepted must be right.
    expect(falsePositives).toBe(0);
    // And it must still accept the large majority, or it would be useless.
    expect(accepted).toBeGreaterThan(presets.length * cases.length * 0.6);
  });
});
