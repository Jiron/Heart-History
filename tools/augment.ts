/**
 * Photo-realism augmentations applied to synthetic renders.
 *
 * Everything here is seeded and deterministic, so a failing fixture can be
 * reproduced exactly from its seed.
 */

import jpeg from 'jpeg-js';
import type { Rgba } from './render-display';

/** mulberry32 — small, fast, and good enough for fixture jitter. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneImage(img: Rgba): Rgba {
  return {
    width: img.width,
    height: img.height,
    data: new Uint8ClampedArray(img.data),
  };
}

/** Solves an n x n system by Gaussian elimination with partial pivoting. */
function solve(matrix: number[][], rhs: number[]): number[] | null {
  const n = rhs.length;
  const m = matrix.map((row, i) => [...row, rhs[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    if (Math.abs(m[pivot][col]) < 1e-10) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  // After full Gauss-Jordan elimination each row has a single non-zero
  // coefficient, on the diagonal, so the solution is a straight division.
  return m.map((row, i) => row[n] / row[i]);
}

type Pt = readonly [number, number];

/**
 * Homography mapping `from` onto `to`, returned as the 8 free coefficients of
 *   x' = (h0 x + h1 y + h2) / (h6 x + h7 y + 1)
 *   y' = (h3 x + h4 y + h5) / (h6 x + h7 y + 1)
 */
function homography(from: Pt[], to: Pt[]): number[] | null {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i];
    const [u, v] = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  return solve(A, b);
}

function bilinear(img: Rgba, x: number, y: number, out: number[]) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  for (let c = 0; c < 3; c++) {
    let acc = 0;
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const px = Math.min(img.width - 1, Math.max(0, x0 + dx));
        const py = Math.min(img.height - 1, Math.max(0, y0 + dy));
        const wgt = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
        acc += img.data[(py * img.width + px) * 4 + c] * wgt;
      }
    }
    out[c] = acc;
  }
}

/**
 * Warps the image as if photographed off-axis: each corner is nudged by up to
 * `amount` of the image size, and the result is resampled bilinearly.
 */
export function perspective(
  img: Rgba,
  amount: number,
  rng: () => number,
  backdrop: [number, number, number] = [24, 24, 28],
): Rgba {
  const { width: w, height: h } = img;
  const jitter = () => (rng() * 2 - 1) * amount;

  const dst: Pt[] = [
    [w * jitter(), h * jitter()],
    [w * (1 + jitter()), h * jitter()],
    [w * (1 + jitter()), h * (1 + jitter())],
    [w * jitter(), h * (1 + jitter())],
  ];
  const src: Pt[] = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];

  // Map destination coordinates back to source coordinates.
  const H = homography(dst, src);
  if (!H) return cloneImage(img);

  const out: Rgba = {
    width: w,
    height: h,
    data: new Uint8ClampedArray(w * h * 4),
  };
  const px: number[] = [0, 0, 0];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const denom = H[6] * x + H[7] * y + 1;
      const sx = (H[0] * x + H[1] * y + H[2]) / denom;
      const sy = (H[3] * x + H[4] * y + H[5]) / denom;
      const p = (y * w + x) * 4;
      if (sx < 0 || sy < 0 || sx >= w - 1 || sy >= h - 1) {
        out.data[p] = backdrop[0];
        out.data[p + 1] = backdrop[1];
        out.data[p + 2] = backdrop[2];
        out.data[p + 3] = 255;
        continue;
      }
      bilinear(img, sx, sy, px);
      out.data[p] = px[0];
      out.data[p + 1] = px[1];
      out.data[p + 2] = px[2];
      out.data[p + 3] = 255;
    }
  }
  return out;
}

/**
 * Linear illumination ramp across the frame, as from a window or a lamp.
 * Brightness runs from `1 - strength` at the dark corner to `1 + strength` at
 * the bright one, whatever the angle.
 */
export function lightingGradient(img: Rgba, strength: number, angleDeg: number): Rgba {
  const out = cloneImage(img);
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);

  // Normalise against the actual projection range of the frame's corners.
  // Projecting onto a direction with a negative component otherwise sends `t`
  // negative, which drove the multiplier towards zero and blacked out whole
  // regions rather than merely shading them.
  const corners = [
    0,
    img.width * dx,
    img.height * dy,
    img.width * dx + img.height * dy,
  ];
  const lo = Math.min(...corners);
  const hi = Math.max(...corners);
  const span = hi - lo || 1;

  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const t = (x * dx + y * dy - lo) / span;
      const factor = 1 + strength * (t - 0.5) * 2;
      const p = (y * img.width + x) * 4;
      out.data[p] *= factor;
      out.data[p + 1] *= factor;
      out.data[p + 2] *= factor;
    }
  }
  return out;
}

/** A soft bright ellipse, as from a reflection on the LCD's plastic window. */
export function glare(
  img: Rgba,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  strength: number,
): Rgba {
  const out = cloneImage(img);
  const x0 = Math.max(0, Math.floor(cx - rx));
  const x1 = Math.min(img.width, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry));
  const y1 = Math.min(img.height, Math.ceil(cy + ry));

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      const d = nx * nx + ny * ny;
      if (d >= 1) continue;
      const falloff = (1 - d) ** 2 * strength;
      const p = (y * img.width + x) * 4;
      for (let c = 0; c < 3; c++) {
        out.data[p + c] = out.data[p + c] + (255 - out.data[p + c]) * falloff;
      }
    }
  }
  return out;
}

/** Separable box blur, repeated to approximate a Gaussian. */
export function blur(img: Rgba, radius: number, passes = 2): Rgba {
  if (radius < 1) return cloneImage(img);
  let current = cloneImage(img);
  for (let pass = 0; pass < passes; pass++) {
    current = blurPass(current, radius);
  }
  return current;
}

function blurPass(img: Rgba, radius: number): Rgba {
  const { width: w, height: h } = img;
  const tmp = new Uint8ClampedArray(w * h * 4);
  const out = new Uint8ClampedArray(w * h * 4);
  const win = radius * 2 + 1;

  for (let y = 0; y < h; y++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let x = -radius; x <= radius; x++) {
        sum += img.data[(y * w + clamp(x, w)) * 4 + c];
      }
      for (let x = 0; x < w; x++) {
        tmp[(y * w + x) * 4 + c] = sum / win;
        sum -= img.data[(y * w + clamp(x - radius, w)) * 4 + c];
        sum += img.data[(y * w + clamp(x + radius + 1, w)) * 4 + c];
      }
    }
  }
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let y = -radius; y <= radius; y++) {
        sum += tmp[(clamp(y, h) * w + x) * 4 + c];
      }
      for (let y = 0; y < h; y++) {
        out[(y * w + x) * 4 + c] = sum / win;
        sum -= tmp[(clamp(y - radius, h) * w + x) * 4 + c];
        sum += tmp[(clamp(y + radius + 1, h) * w + x) * 4 + c];
      }
    }
  }
  for (let i = 3; i < out.length; i += 4) out[i] = 255;
  return { width: w, height: h, data: out };
}

function clamp(i: number, n: number): number {
  return i < 0 ? 0 : i >= n ? n - 1 : i;
}

/** Additive sensor noise. */
export function noise(img: Rgba, sigma: number, rng: () => number): Rgba {
  const out = cloneImage(img);
  for (let i = 0; i < out.data.length; i += 4) {
    // Box-Muller, one sample shared across channels plus a small per-channel term.
    const u = Math.max(1e-6, rng());
    const v = rng();
    const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sigma;
    for (let c = 0; c < 3; c++) {
      out.data[i + c] = out.data[i + c] + g + (rng() - 0.5) * sigma;
    }
  }
  return out;
}

/** Encode and decode through JPEG to introduce real compression artefacts. */
export function jpegRoundTrip(img: Rgba, quality: number): Rgba {
  const encoded = jpeg.encode(
    { data: Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length), width: img.width, height: img.height },
    quality,
  );
  const decoded = jpeg.decode(encoded.data, { useTArray: true, formatAsRGBA: true });
  return {
    width: decoded.width,
    height: decoded.height,
    data: new Uint8ClampedArray(decoded.data.buffer, decoded.data.byteOffset, decoded.data.length),
  };
}

export interface AugmentProfile {
  perspective: number;
  blurRadius: number;
  blurPasses: number;
  noiseSigma: number;
  lighting: number;
  lightingAngle: number;
  glare: { cx: number; cy: number; rx: number; ry: number; strength: number } | null;
  jpegQuality: number;
}

export function applyAugmentations(
  img: Rgba,
  profile: AugmentProfile,
  rng: () => number,
  backdrop: [number, number, number] = [24, 24, 28],
): Rgba {
  let out = img;
  if (profile.perspective > 0) out = perspective(out, profile.perspective, rng, backdrop);
  if (profile.lighting !== 0) out = lightingGradient(out, profile.lighting, profile.lightingAngle);
  if (profile.glare) {
    const g = profile.glare;
    out = glare(out, g.cx * out.width, g.cy * out.height, g.rx * out.width, g.ry * out.height, g.strength);
  }
  if (profile.blurRadius >= 1) out = blur(out, profile.blurRadius, profile.blurPasses);
  if (profile.noiseSigma > 0) out = noise(out, profile.noiseSigma, rng);
  if (profile.jpegQuality > 0 && profile.jpegQuality < 100) {
    out = jpegRoundTrip(out, profile.jpegQuality);
  }
  return out;
}
