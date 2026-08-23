import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { recognise } from '../src/ocr/pipeline';
import {
  LOAD_VARIANTS,
  loadAsDeviceWould,
  type PhotoExpectation,
} from '../tools/fixture-photo';

/**
 * The recogniser measured against actual photographs of the device.
 *
 * The synthetic suite covers the failure modes the renderer knows how to draw.
 * These cover the ones it does not: an LCD that fades across the panel, a shadow
 * lying diagonally over the glass, the moulded wordmark, and the panel border
 * thresholding as ink and bridging into the digits. `removeThinLines`,
 * `mergeBestRows`, the stroke-width refinement and the row-height model all came
 * from a photo here.
 *
 * ## Read several ways on purpose
 *
 * The phone hands the recogniser a resized, re-encoded copy of the photo, made
 * by a native pipeline this suite cannot reproduce exactly — and on photographs
 * this marginal, a grey level or two decides whether a segment reads as lit.
 * Fixing one preprocessing chain would test that chain's luck. Each photo is run
 * through all of them instead.
 *
 * The assertions are deliberately asymmetric, because the two failure modes are
 * not equally bad. Refusing a readable photo costs the user a manual entry.
 * Accepting a wrong blood pressure puts a number they did not measure into their
 * medical history, where nothing later will question it.
 */

const FIXTURE_DIR = join(process.cwd(), 'tools', 'fixtures');
const manifestPath = join(FIXTURE_DIR, 'expected.json');

const photos: PhotoExpectation[] = existsSync(manifestPath)
  ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as { photos: PhotoExpectation[] }).photos
  : [];

const available = photos.filter((p) => existsSync(join(FIXTURE_DIR, p.file)));

function readEveryWay(expected: PhotoExpectation) {
  return LOAD_VARIANTS.map((variant) => ({
    variant: variant.label,
    result: recognise(loadAsDeviceWould(join(FIXTURE_DIR, expected.file), variant.options)),
  }));
}

describe.skipIf(available.length === 0)('real photographs', () => {
  /**
   * The one assertion that must never be relaxed.
   *
   * Anything the app would have saved without the user retyping it has to be
   * what the display actually said — under every preprocessing chain, not just
   * the convenient one.
   */
  it('never accepts a blood pressure that is wrong', () => {
    for (const expected of available) {
      for (const { variant, result } of readEveryWay(expected)) {
        if (!result.ok) continue;
        const where = `${expected.file} [${variant}]`;
        expect(expected.accept, where).not.toBe(false);
        expect(result.systolic, where).toBe(expected.sys);
        expect(result.diastolic, where).toBe(expected.dia);
        // A pulse may be omitted, but a reported one has to be right.
        if (result.pulse !== null) expect(result.pulse, where).toBe(expected.pul);
      }
    }
  });

  it('refuses the power-on self test however it is preprocessed', () => {
    for (const expected of available.filter((p) => p.accept === false)) {
      for (const { variant, result } of readEveryWay(expected)) {
        expect(result.ok, `${expected.file} [${variant}]`).toBe(false);
      }
    }
  });

  for (const expected of available.filter((p) => p.accept !== false)) {
    it(`can read ${expected.file}`, () => {
      // Capability, not robustness: these three are genuinely hard photographs —
      // a fading stored-average screen, an LCD dimming across the panel, and one
      // with a hard shadow over the glass. Some preprocessing chains refuse them,
      // which is the correct answer when the segments are not resolvable. What
      // this checks is that the display is readable at all.
      const outcomes = readEveryWay(expected);
      const accepted = outcomes.filter((o) => o.result.ok);
      expect(accepted.length, `no chain read ${expected.file}`).toBeGreaterThan(0);
    });
  }

  it('flags the stored-average screen rather than logging it as a measurement', () => {
    const average = available.find((p) => p.average);
    if (!average) return;
    const { result } = readEveryWay(average)[0];
    expect(result.icons.average).toBe(true);
    expect(result.warnings.map((w) => w.code)).toContain('isAverage');
  });
});
