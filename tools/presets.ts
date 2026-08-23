import type { AugmentProfile } from './augment';

/**
 * Augmentation profiles spanning ideal to genuinely unusable capture conditions.
 *
 * `unreadable` is a *negative* fixture: a human could not read it either, so the
 * recogniser is expected to refuse it. Returning `ok: false` there matters as
 * much as reading `typical` correctly — a health app that invents a plausible
 * blood-pressure number from a glare blob is worse than one that asks again.
 */
export const PRESETS: Record<string, AugmentProfile> = {
  clean: {
    perspective: 0, blurRadius: 0, blurPasses: 1, noiseSigma: 0,
    lighting: 0, lightingAngle: 0, glare: null, jpegQuality: 0,
  },
  typical: {
    perspective: 0.012, blurRadius: 1, blurPasses: 1, noiseSigma: 2.5,
    lighting: 0.14, lightingAngle: 35, glare: null, jpegQuality: 88,
  },
  angled: {
    perspective: 0.045, blurRadius: 1, blurPasses: 1, noiseSigma: 3,
    lighting: 0.22, lightingAngle: 160, glare: null, jpegQuality: 82,
  },
  dim: {
    perspective: 0.02, blurRadius: 2, blurPasses: 2, noiseSigma: 7,
    lighting: 0.3, lightingAngle: 250, glare: null, jpegQuality: 70,
  },
  hard: {
    perspective: 0.035, blurRadius: 2, blurPasses: 2, noiseSigma: 5,
    lighting: 0.3, lightingAngle: 110,
    // Glare sits on the empty left half of the panel, as a window reflection
    // usually does — bright, but not covering the values.
    glare: { cx: 0.28, cy: 0.32, rx: 0.18, ry: 0.14, strength: 0.5 },
    jpegQuality: 72,
  },
  brutal: {
    perspective: 0.055, blurRadius: 2, blurPasses: 2, noiseSigma: 8,
    lighting: 0.34, lightingAngle: 200,
    glare: { cx: 0.3, cy: 0.5, rx: 0.2, ry: 0.16, strength: 0.6 },
    jpegQuality: 60,
  },
  /**
   * Very hard, but the information is still there.
   *
   * This was `unreadable` until the recogniser learned to sever the panel border
   * and to take each row from whichever pass resolved it best; it now reads it
   * correctly almost every time. Keeping it under its own name preserves the
   * evidence that those changes were worth making.
   */
  severe: {
    perspective: 0.06, blurRadius: 4, blurPasses: 2, noiseSigma: 10,
    lighting: 0.45, lightingAngle: 200,
    glare: { cx: 0.52, cy: 0.42, rx: 0.32, ry: 0.26, strength: 0.75 },
    jpegQuality: 50,
  },
  /**
   * Genuinely beyond reading: the glare sits squarely over the value block and
   * the blur is wider than a segment, so the digits are not recoverable by any
   * means. Nothing here may ever be accepted.
   */
  unreadable: {
    perspective: 0.08, blurRadius: 8, blurPasses: 3, noiseSigma: 16,
    lighting: 0.6, lightingAngle: 200,
    glare: { cx: 0.62, cy: 0.45, rx: 0.42, ry: 0.34, strength: 0.95 },
    jpegQuality: 35,
  },
};
