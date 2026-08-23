import type { Box, Gray, Mask } from './types';

/** ITU-R BT.601 luma. Cheap, and perceptually good enough for thresholding. */
export function grayFromRGBA(
  rgba: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number,
): Gray {
  const n = w * h;
  const out = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    // Integer approximation of 0.299R + 0.587G + 0.114B.
    out[i] = (rgba[p] * 77 + rgba[p + 1] * 150 + rgba[p + 2] * 29) >> 8;
  }
  return { w, h, data: out };
}

/**
 * Area-average downscale. Unlike nearest-neighbour this preserves thin strokes
 * as *gray* rather than dropping them, which matters for the small header digits.
 */
export function downscale(src: Gray, maxDim: number): { image: Gray; scale: number } {
  const longest = Math.max(src.w, src.h);
  if (longest <= maxDim) return { image: src, scale: 1 };

  const ratio = maxDim / longest;
  const dw = Math.max(1, Math.round(src.w * ratio));
  const dh = Math.max(1, Math.round(src.h * ratio));
  const out = new Uint8Array(dw * dh);
  const xr = src.w / dw;
  const yr = src.h / dh;

  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor(y * yr);
    const y1 = Math.min(src.h, Math.max(y0 + 1, Math.ceil((y + 1) * yr)));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor(x * xr);
      const x1 = Math.min(src.w, Math.max(x0 + 1, Math.ceil((x + 1) * xr)));
      let sum = 0;
      let count = 0;
      for (let yy = y0; yy < y1; yy++) {
        const row = yy * src.w;
        for (let xx = x0; xx < x1; xx++) {
          sum += src.data[row + xx];
          count++;
        }
      }
      out[y * dw + x] = (sum / count) | 0;
    }
  }
  // Report the *actual* scale, which may differ slightly after rounding.
  return { image: { w: dw, h: dh, data: out }, scale: dw / src.w };
}

/** Crop, clamped to image bounds. Returns a copy. */
export function crop(src: Gray, box: Box): Gray {
  const x0 = Math.max(0, Math.min(src.w - 1, Math.floor(box.x)));
  const y0 = Math.max(0, Math.min(src.h - 1, Math.floor(box.y)));
  const x1 = Math.max(x0 + 1, Math.min(src.w, Math.ceil(box.x + box.w)));
  const y1 = Math.max(y0 + 1, Math.min(src.h, Math.ceil(box.y + box.h)));
  const w = x1 - x0;
  const h = y1 - y0;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    out.set(src.data.subarray((y0 + y) * src.w + x0, (y0 + y) * src.w + x1), y * w);
  }
  return { w, h, data: out };
}

/**
 * Separable box blur with a running sum, O(n) regardless of radius.
 * Used both as a light denoise and as a local-background estimator.
 */
export function boxBlur(src: Gray, radius: number): Gray {
  if (radius < 1) return src;
  const { w, h } = src;
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  const win = radius * 2 + 1;

  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let x = -radius; x <= radius; x++) {
      sum += src.data[row + clampIndex(x, w)];
    }
    for (let x = 0; x < w; x++) {
      tmp[row + x] = (sum / win) | 0;
      sum -= src.data[row + clampIndex(x - radius, w)];
      sum += src.data[row + clampIndex(x + radius + 1, w)];
    }
  }

  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) {
      sum += tmp[clampIndex(y, h) * w + x];
    }
    for (let y = 0; y < h; y++) {
      out[y * w + x] = (sum / win) | 0;
      sum -= tmp[clampIndex(y - radius, h) * w + x];
      sum += tmp[clampIndex(y + radius + 1, h) * w + x];
    }
  }
  return { w, h, data: out };
}

function clampIndex(i: number, n: number): number {
  return i < 0 ? 0 : i >= n ? n - 1 : i;
}

/**
 * Summed-area table with one row/column of zero padding, so a rectangle sum is
 * four lookups with no bounds juggling. Int32 is safe up to ~8 megapixels of
 * 8-bit data (255 * 8.4e6 < 2^31).
 */
export function integralImage(src: Gray): Int32Array {
  const { w, h, data } = src;
  const iw = w + 1;
  const out = new Int32Array(iw * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    const srcRow = y * w;
    const dstRow = (y + 1) * iw;
    const prevRow = y * iw;
    for (let x = 0; x < w; x++) {
      rowSum += data[srcRow + x];
      out[dstRow + x + 1] = out[prevRow + x + 1] + rowSum;
    }
  }
  return out;
}

/** Sum over the half-open rectangle [x0,x1) x [y0,y1). Bounds are clamped. */
export function rectSum(
  integral: Int32Array,
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const iw = w + 1;
  const ax = x0 < 0 ? 0 : x0 > w ? w : x0;
  const ay = y0 < 0 ? 0 : y0 > h ? h : y0;
  const bx = x1 < 0 ? 0 : x1 > w ? w : x1;
  const by = y1 < 0 ? 0 : y1 > h ? h : y1;
  if (bx <= ax || by <= ay) return 0;
  return (
    integral[by * iw + bx] -
    integral[ay * iw + bx] -
    integral[by * iw + ax] +
    integral[ay * iw + ax]
  );
}

/**
 * Bradley-Roth adaptive threshold with an extra *absolute* contrast floor.
 *
 * The absolute floor is what makes this usable on hand-held photos of a device
 * sitting on a dark table: in a uniformly dark region the local mean is dark
 * too, so a purely relative test would turn sensor noise into ink. Requiring the
 * pixel to also sit `minContrast` gray levels below its neighbourhood kills that
 * entirely, while the LCD's ~70-level digit-vs-background gap sails through.
 */
export function adaptiveThreshold(
  src: Gray,
  opts: { window?: number; threshold?: number; minContrast?: number } = {},
): Mask {
  const { w, h, data } = src;
  const window = opts.window ?? Math.max(15, Math.round(Math.min(w, h) / 8) | 1);
  const t = opts.threshold ?? 0.14;
  const minContrast = opts.minContrast ?? 10;
  const r = Math.max(1, window >> 1);

  const integral = integralImage(src);
  const out = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    const ay = Math.max(0, y - r);
    const by = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const ax = Math.max(0, x - r);
      const bx = Math.min(w, x + r + 1);
      const area = (bx - ax) * (by - ay);
      const mean = rectSum(integral, w, h, ax, ay, bx, by) / area;
      const v = data[y * w + x];
      if (v < mean * (1 - t) && mean - v >= minContrast) out[y * w + x] = 1;
    }
  }
  return { w, h, data: out };
}

/**
 * Median thickness of ink runs, estimated from both scan directions.
 *
 * A horizontal scanline crossing a *vertical* segment yields a run equal to the
 * stroke thickness; a scanline lying *along* a horizontal segment yields a long
 * run. Because a segment is far longer than it is thick, short runs dominate the
 * population and the median lands on the thickness. Taking the min of the two
 * directions guards against glyphs that are unusually wide or tall.
 */
export function estimateStrokeWidth(mask: Mask): number {
  const hm = median(collectRuns(mask, 'h'));
  const vm = median(collectRuns(mask, 'v'));
  const candidates = [hm, vm].filter((v) => v > 0);
  if (candidates.length === 0) return 2;
  return Math.max(1, Math.min(...candidates));
}

function collectRuns(mask: Mask, dir: 'h' | 'v'): number[] {
  const { w, h, data } = mask;
  const runs: number[] = [];
  const maxRun = Math.max(4, Math.round((dir === 'h' ? w : h) / 6));
  // Single-pixel runs are sensor speckle, not strokes. Counting them drags the
  // median down towards 1 on a noisy photo, which then sizes the threshold
  // window far too small and produces yet more speckle on the next pass.
  const minRun = 2;
  const outer = dir === 'h' ? h : w;
  const inner = dir === 'h' ? w : h;
  // Sample every other line; the median is stable long before we read them all.
  const step = outer > 400 ? 2 : 1;
  for (let o = 0; o < outer; o += step) {
    let run = 0;
    for (let i = 0; i < inner; i++) {
      const idx = dir === 'h' ? o * w + i : i * w + o;
      if (data[idx]) {
        run++;
      } else if (run > 0) {
        if (run >= minRun && run <= maxRun) runs.push(run);
        run = 0;
      }
    }
    if (run >= minRun && run <= maxRun) runs.push(run);
  }
  return runs;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = Float64Array.from(values).sort();
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = Float64Array.from(values).sort();
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round((sorted.length - 1) * p)),
  );
  return sorted[idx];
}

/** Ink pixel count inside a rectangle. Bounds are clamped. */
export function maskRectCount(
  mask: Mask,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const { w, h, data } = mask;
  const ax = Math.max(0, Math.floor(x0));
  const ay = Math.max(0, Math.floor(y0));
  const bx = Math.min(w, Math.ceil(x1));
  const by = Math.min(h, Math.ceil(y1));
  let count = 0;
  for (let y = ay; y < by; y++) {
    const row = y * w;
    for (let x = ax; x < bx; x++) count += data[row + x];
  }
  return count;
}

export function intersectBox(a: Box, b: Box): Box | null {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function unionBox(a: Box, b: Box): Box {
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x + a.w, b.x + b.w);
  const y1 = Math.max(a.y + a.h, b.y + b.h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Fraction of the shorter box's vertical extent that lies within the other's. */
export function verticalOverlap(a: Box, b: Box): number {
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  if (bottom <= top) return 0;
  return (bottom - top) / Math.min(a.h, b.h);
}

/** Fraction of the narrower box's horizontal extent that lies within the other's. */
export function horizontalOverlap(a: Box, b: Box): number {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.w, b.x + b.w);
  if (right <= left) return 0;
  return (right - left) / Math.min(a.w, b.w);
}
