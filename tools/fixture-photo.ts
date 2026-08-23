/**
 * Loads a real photograph the way the phone would hand it to the recogniser.
 *
 * Shared by the real-photo benchmark and the test suite so both measure the
 * same thing. Skipping the downscale-and-re-encode would feed the recogniser a
 * cleaner image than the app ever sees.
 */

import { readFileSync } from 'node:fs';
import jpeg from 'jpeg-js';

/** Mirrors WORKING_MAX_DIM in src/services/scan.ts. */
export const WORKING_MAX_DIM = 1100;
/** Mirrors the `compress: 0.92` the device re-encodes at before decoding. */
export const DEVICE_JPEG_QUALITY = 92;

export interface Rgba {
  width: number;
  height: number;
  data: Uint8Array;
}

/** Box-filter downscale, matching what a native image resizer would do. */
export function areaResize(img: Rgba, factor: number): Rgba {
  const w = Math.max(1, Math.round(img.width * factor));
  const h = Math.max(1, Math.round(img.height * factor));
  const out = new Uint8Array(w * h * 4);
  const sx = img.width / w;
  const sy = img.height / h;

  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.min(img.height, Math.max(y0 + 1, Math.floor((y + 1) * sy)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.min(img.width, Math.max(x0 + 1, Math.floor((x + 1) * sx)));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const p = (yy * img.width + xx) * 4;
          r += img.data[p];
          g += img.data[p + 1];
          b += img.data[p + 2];
          n++;
        }
      }
      const d = (y * w + x) * 4;
      // Round rather than truncate: a native resizer rounds, and a consistent
      // one-least-significant-bit darkening is enough to move a threshold.
      out[d] = Math.round(r / n);
      out[d + 1] = Math.round(g / n);
      out[d + 2] = Math.round(b / n);
      out[d + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}

export interface LoadOptions {
  /** Skip the lossy JPEG round-trip, to measure what it costs. */
  reencode?: boolean;
  /** Longest side to resize to before handing over. */
  maxDim?: number;
}

export function loadAsDeviceWould(path: string, options: LoadOptions = {}): Rgba {
  const maxDim = options.maxDim ?? WORKING_MAX_DIM;
  const decoded = jpeg.decode(readFileSync(path), {
    useTArray: true,
    formatAsRGBA: true,
  });
  const source: Rgba = {
    width: decoded.width,
    height: decoded.height,
    data: decoded.data as Uint8Array,
  };

  const longest = Math.max(source.width, source.height);
  const shrunk = longest > maxDim ? areaResize(source, maxDim / longest) : source;

  if (options.reencode === false) return shrunk;

  const encoded = jpeg.encode(
    { width: shrunk.width, height: shrunk.height, data: shrunk.data },
    DEVICE_JPEG_QUALITY,
  );
  const round = jpeg.decode(encoded.data, { useTArray: true, formatAsRGBA: true });
  return {
    width: round.width,
    height: round.height,
    data: round.data as Uint8Array,
  };
}

export interface PhotoExpectation {
  file: string;
  sys?: number;
  dia?: number;
  pul?: number;
  date?: { month: number; day: number };
  average?: boolean;
  cuffFitOk?: boolean;
  /** Defaults to true. False means the recogniser must refuse this photo. */
  accept?: boolean;
  note?: string;
}
