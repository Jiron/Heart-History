import type { Box, DigitResult, Mask } from './types';

/**
 * Segment bit assignment, canonical `a b c d e f g` order.
 *
 *      aaaa
 *     f    b
 *     f    b
 *      gggg
 *     e    c
 *     e    c
 *      dddd
 */
export const SEG_A = 1;
export const SEG_B = 2;
export const SEG_C = 4;
export const SEG_D = 8;
export const SEG_E = 16;
export const SEG_F = 32;
export const SEG_G = 64;

export const SEGMENT_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const;

/**
 * Probe windows in normalised cell space (0..1 across the glyph cell).
 *
 * Each window covers the *core* of a segment and deliberately stops short of the
 * junctions, so that a lit neighbour bleeding round a corner cannot register as
 * a false positive on an unlit segment.
 */
export const SEGMENT_WINDOWS: readonly (readonly [number, number, number, number])[] = [
  [0.30, 0.01, 0.70, 0.15], // a — top bar
  [0.79, 0.17, 0.99, 0.39], // b — upper right
  [0.79, 0.61, 0.99, 0.83], // c — lower right
  [0.30, 0.85, 0.70, 0.99], // d — bottom bar
  [0.01, 0.61, 0.21, 0.83], // e — lower left
  [0.01, 0.17, 0.21, 0.39], // f — upper left
  [0.30, 0.43, 0.70, 0.57], // g — middle bar
];

/** Seven-segment patterns the device can actually render. */
export const GLYPHS: ReadonlyMap<number, string> = new Map<number, string>([
  [SEG_A | SEG_B | SEG_C | SEG_D | SEG_E | SEG_F, '0'],
  [SEG_B | SEG_C, '1'],
  [SEG_A | SEG_B | SEG_G | SEG_E | SEG_D, '2'],
  [SEG_A | SEG_B | SEG_C | SEG_D | SEG_G, '3'],
  [SEG_F | SEG_G | SEG_B | SEG_C, '4'],
  [SEG_A | SEG_F | SEG_G | SEG_C | SEG_D, '5'],
  [SEG_A | SEG_F | SEG_G | SEG_E | SEG_C | SEG_D, '6'],
  [SEG_A | SEG_B | SEG_C, '7'],
  [SEG_A | SEG_B | SEG_C | SEG_D | SEG_E | SEG_F | SEG_G, '8'],
  [SEG_A | SEG_B | SEG_C | SEG_D | SEG_F | SEG_G, '9'],
  // Letters the BP B1 Classic can display.
  [SEG_A | SEG_B | SEG_C | SEG_E | SEG_F | SEG_G, 'A'], // stored-average marker
  [SEG_A | SEG_D | SEG_E | SEG_F | SEG_G, 'E'], // "Err"
  [SEG_E | SEG_G, 'r'],
  [SEG_A | SEG_B | SEG_E | SEG_F | SEG_G, 'P'],
  [SEG_B | SEG_C | SEG_E | SEG_F | SEG_G, 'H'],
  [SEG_D | SEG_E | SEG_F, 'L'],
  [SEG_C | SEG_D | SEG_E | SEG_G, 'o'],
  // A lone middle bar is the date separator, e.g. "8-23".
  [SEG_G, '-'],
  [0, ' '],
]);

/** Reverse lookup, used when snapping a near-miss pattern to the closest glyph. */
const GLYPH_PATTERNS: readonly number[] = Array.from(GLYPHS.keys());

export interface ProbeOptions {
  /** Coverage at or above which a segment counts as lit. */
  segmentOn: number;
  /** Coverage at or below which a segment counts as unlit. */
  segmentOff: number;
  /**
   * Multiplier applied to raw coverage before thresholding. Set by the caller
   * from the row's own statistics so that a blurred or thin-stroked photo does
   * not read as "all segments off".
   */
  gain?: number;
}

/** Raw ink coverage of each segment window, before any thresholding. */
export function probeCoverage(mask: Mask, cell: Box): number[] {
  const coverage: number[] = new Array(7).fill(0);

  for (let s = 0; s < 7; s++) {
    const [fx0, fy0, fx1, fy1] = SEGMENT_WINDOWS[s];
    const x0 = cell.x + fx0 * cell.w;
    const x1 = cell.x + fx1 * cell.w;
    const y0 = cell.y + fy0 * cell.h;
    const y1 = cell.y + fy1 * cell.h;

    // Roughly one sample per pixel, floored at a 2x2 grid so that tiny header
    // glyphs still produce a usable ratio, and capped so a huge close-up photo
    // does not turn a cheap probe into a hot loop.
    const nx = Math.max(2, Math.min(24, Math.round(x1 - x0)));
    const ny = Math.max(2, Math.min(24, Math.round(y1 - y0)));

    let hits = 0;
    let total = 0;
    for (let iy = 0; iy < ny; iy++) {
      const y = y0 + ((iy + 0.5) / ny) * (y1 - y0);
      for (let ix = 0; ix < nx; ix++) {
        const x = x0 + ((ix + 0.5) / nx) * (x1 - x0);
        const px = Math.round(x);
        const py = Math.round(y);
        total++;
        if (px < 0 || py < 0 || px >= mask.w || py >= mask.h) continue;
        if (mask.data[py * mask.w + px]) hits++;
      }
    }
    coverage[s] = total > 0 ? hits / total : 0;
  }
  return coverage;
}

/**
 * Turn a cell into a character.
 *
 * Confidence is the *weakest* segment decision, measured as distance from the
 * undecided band between `segmentOff` and `segmentOn`. That is deliberately
 * pessimistic: one ambiguous segment is enough to turn a 3 into a 9, so the
 * digit should not claim more certainty than its shakiest bit.
 */
export function decodeCell(mask: Mask, cell: Box, opts: ProbeOptions): DigitResult {
  const gain = opts.gain ?? 1;
  const raw = probeCoverage(mask, cell);
  const coverage = raw.map((c) => Math.min(1, c * gain));

  const mid = (opts.segmentOn + opts.segmentOff) / 2;
  const halfBand = Math.max(0.01, (opts.segmentOn - opts.segmentOff) / 2);

  let pattern = 0;
  const segments: boolean[] = new Array(7).fill(false);
  const certainty: number[] = new Array(7).fill(0);

  for (let s = 0; s < 7; s++) {
    const on = coverage[s] >= mid;
    segments[s] = on;
    if (on) pattern |= 1 << s;
    certainty[s] = Math.min(1, Math.abs(coverage[s] - mid) / halfBand);
  }

  let char = GLYPHS.get(pattern);
  let corrected = false;

  /*
   * Confidence is the *separation* between the weakest lit segment and the
   * strongest unlit one.
   *
   * Distance-from-threshold alone is not enough, because it saturates: if the
   * cell is in the wrong place, every probe can still land decisively on ink or
   * decisively on background, and the digit reads as a confident — but wrong —
   * value. Separation asks a different question: are the two populations
   * actually distinguishable in this photo? A well-resolved glyph has lit
   * segments near 1 and unlit ones near 0; a smeared or misaligned one has
   * everything bunched in the middle, and that collapses the score even though
   * each individual probe looked decisive.
   */
  let minLit = 1;
  let maxUnlit = 0;
  for (let s = 0; s < 7; s++) {
    if (segments[s]) minLit = Math.min(minLit, coverage[s]);
    else maxUnlit = Math.max(maxUnlit, coverage[s]);
  }
  const separation = minLit - maxUnlit;
  let confidence = Math.min(
    Math.min(...certainty),
    clamp01(separation / 0.5),
  );

  if (char === undefined) {
    // Flip the single least-certain segment and see whether that lands on a real
    // glyph. This recovers the common failure where one segment sits right on
    // the threshold because of glare or a slightly misaligned cell.
    const order = certainty
      .map((c, i) => ({ c, i }))
      .sort((a, b) => a.c - b.c);

    for (const { i } of order) {
      const flipped = pattern ^ (1 << i);
      const candidate = GLYPHS.get(flipped);
      if (candidate !== undefined) {
        char = candidate;
        pattern = flipped;
        segments[i] = !segments[i];
        corrected = true;
        break;
      }
    }
  }

  if (char === undefined) {
    // Still nothing: fall back to the nearest glyph by Hamming distance.
    let best = -1;
    let bestDist = Infinity;
    for (const p of GLYPH_PATTERNS) {
      const d = popcount(p ^ pattern);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    if (best >= 0 && bestDist <= 2) {
      char = GLYPHS.get(best)!;
      corrected = true;
      confidence *= 0.35;
    } else {
      char = '?';
      confidence = 0;
    }
  } else if (corrected) {
    confidence = Math.max(0, confidence) * 0.55;
  }

  const value = char >= '0' && char <= '9' ? char.charCodeAt(0) - 48 : null;

  return {
    char,
    value,
    cell: { ...cell },
    coverage,
    segments,
    confidence: clamp01(confidence),
    corrected,
  };
}

function popcount(n: number): number {
  let count = 0;
  let v = n;
  while (v) {
    v &= v - 1;
    count++;
  }
  return count;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

