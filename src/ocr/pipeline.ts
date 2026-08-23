import { connectedComponents, filterSegmentLike, rasterizeComponents } from './components';
import {
  bandComponents,
  boundsOfComponents,
  columnsOf,
  decodeBand,
  estimateAspect,
  glyphColumns,
  limitToRun,
  rowFromDigits,
  selectValueBlock,
  splitTallBand,
  toCandidate,
  type Band,
  type RowCandidate,
} from './layout';
import {
  adaptiveThreshold,
  boxBlur,
  crop,
  downscale,
  estimateStrokeWidth,
  grayFromRGBA,
  median,
  unionBox,
} from './raster';
import type {
  Box,
  Component,
  Gray,
  IconFlags,
  Mask,
  OcrField,
  OcrOptions,
  OcrResult,
  OcrWarning,
  RowResult,
} from './types';
import { DEFAULT_OCR_OPTIONS } from './types';

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

const EMPTY_ICONS: IconFlags = {
  average: null,
  memory: null,
  irregularHeartbeat: null,
  cuffFitOk: null,
  batteryLow: null,
  trafficLight: null,
};

/** Plausibility limits. Outside these a reading is almost certainly a misread. */
export const RANGES = {
  systolic: { min: 55, max: 260 },
  diastolic: { min: 25, max: 200 },
  pulse: { min: 30, max: 220 },
} as const;

/**
 * Threshold-window sizes to try, as multiples of the measured stroke width.
 *
 * The window size is the single most consequential parameter, because it trades
 * two failure modes against each other:
 *
 *   - **Too large** and the step edge at the LCD bezel grows a thick ink halo
 *     (roughly 0.28 x the window). Anything the halo touches — typically the
 *     small date row hugging the top of the panel — is absorbed into one giant
 *     component and lost.
 *   - **Too small** and the window fits inside a thick stroke, so the middle of
 *     each segment reads as "same as its surroundings" and drops out.
 *
 * There is no single value that is right for every photo, so the recogniser runs
 * several and keeps whichever produced the most coherent reading.
 */
const PASS_VARIANTS: readonly { windowScale: number; preBlur: number }[] = [
  { windowScale: 2.6, preBlur: 1 },
  { windowScale: 4.2, preBlur: 1 },
  { windowScale: 1.8, preBlur: 1 },
  // Last resorts for a dim, grainy photo: smooth harder before thresholding.
  { windowScale: 3.0, preBlur: 2 },
  { windowScale: 3.4, preBlur: 3 },
];

export function recognise(image: RgbaImage, options: OcrOptions = {}): OcrResult {
  const started = Date.now();
  const opts = { ...DEFAULT_OCR_OPTIONS, ...options };

  // ---- Shared preparation, done once across all passes ----------------------
  let gray = grayFromRGBA(image.data, image.width, image.height);
  let roiOffsetX = 0;
  let roiOffsetY = 0;

  if (options.roi) {
    const r = options.roi;
    const box: Box = {
      x: r.x * image.width,
      y: r.y * image.height,
      w: r.w * image.width,
      h: r.h * image.height,
    };
    roiOffsetX = Math.max(0, Math.floor(box.x));
    roiOffsetY = Math.max(0, Math.floor(box.y));
    gray = crop(gray, box);
  }

  const { image: work, scale } = downscale(gray, opts.maxWorkingDim);

  // A one-pixel blur costs little and stops JPEG ringing from fragmenting the
  // thin strokes of the small header glyphs into unusable specks.
  const smoothed = boxBlur(work, 1);

  // A first, deliberately generous threshold exists only to measure the stroke
  // width, which then sizes the windows of the real passes.
  const probeWindow = Math.max(15, Math.round(Math.min(work.w, work.h) / 8) | 1);
  const probeMask = adaptiveThreshold(smoothed, {
    window: probeWindow,
    threshold: opts.threshold,
    minContrast: opts.minContrast,
  });
  const strokeWidth = estimateStrokeWidth(probeMask);

  const ctx: PassContext = {
    work,
    smoothed,
    scale,
    roiOffsetX,
    roiOffsetY,
    strokeWidth,
    opts,
    debug: options.debug === true,
  };

  const blurCache = new Map<number, Gray>([[1, smoothed]]);
  const blurred = (radius: number): Gray => {
    let img = blurCache.get(radius);
    if (!img) {
      img = boxBlur(work, radius);
      blurCache.set(radius, img);
    }
    return img;
  };

  let best: OcrResult | null = null;
  let bestScore = -Infinity;

  for (const variant of PASS_VARIANTS) {
    const window = clampOdd(
      Math.round(strokeWidth * variant.windowScale),
      15,
      Math.max(15, Math.round(Math.min(work.w, work.h) / 6)),
    );
    ctx.smoothed = blurred(variant.preBlur);
    const result = runPass(ctx, window);
    const score = scoreResult(result);
    if (score > bestScore) {
      bestScore = score;
      best = result;
    }
    // A complete, self-consistent, high-confidence reading is not going to be
    // improved on by another pass.
    if (
      result.systolic !== null &&
      result.diastolic !== null &&
      result.pulse !== null &&
      result.systolic > result.diastolic &&
      result.confidence.overall > 0.75
    ) {
      break;
    }
  }

  const final = best ?? emptyResult(scale, [{ code: 'recognitionFailed' }]);
  final.elapsedMs = Date.now() - started;
  return final;
}

/** Ranks a pass by how complete and self-consistent its reading is. */
function scoreResult(r: OcrResult): number {
  let score = 0;
  if (r.systolic !== null) score += 100;
  if (r.diastolic !== null) score += 100;
  if (r.pulse !== null) score += 60;
  score += (r.confidence.systolic + r.confidence.diastolic + r.confidence.pulse) * 25;
  if (r.systolic !== null && r.diastolic !== null && r.systolic > r.diastolic) score += 80;
  if (r.detectedDate || r.detectedTime) score += 15;
  score -= r.warnings.length * 6;
  return score;
}

function clampOdd(value: number, min: number, max: number): number {
  const v = Math.max(min, Math.min(max, value));
  return v % 2 === 0 ? v + 1 : v;
}

interface PassContext {
  work: Gray;
  /** Mutated per pass so each variant can denoise differently. */
  smoothed: Gray;
  scale: number;
  roiOffsetX: number;
  roiOffsetY: number;
  strokeWidth: number;
  opts: typeof DEFAULT_OCR_OPTIONS & OcrOptions;
  debug: boolean;
}

function emptyResult(scale: number, warnings: OcrWarning[]): OcrResult {
  return {
    ok: false,
    systolic: null,
    diastolic: null,
    pulse: null,
    confidence: { overall: 0, systolic: 0, diastolic: 0, pulse: 0 },
    detectedDate: null,
    detectedTime: null,
    icons: { ...EMPTY_ICONS },
    rows: [],
    panel: null,
    scale,
    warnings,
    elapsedMs: 0,
  };
}

function runPass(ctx: PassContext, window: number): OcrResult {
  const { work, smoothed, scale, opts } = ctx;
  const warnings: OcrWarning[] = [];

  const ink = adaptiveThreshold(smoothed, {
    window,
    threshold: opts.threshold,
    minContrast: opts.minContrast,
  });

  const { labels, components: allComponents } = connectedComponents(ink);
  const kept = filterSegmentLike(allComponents, {
    imageWidth: work.w,
    imageHeight: work.h,
  });

  const makeDebug = (components: Component[], bands: Box[], mask: Mask, glyphHeight: number) =>
    ctx.debug
      ? {
          width: work.w,
          height: work.h,
          strokeWidth: ctx.strokeWidth,
          glyphHeight,
          components,
          bands,
          inkMask: mask,
          gray: work,
        }
      : undefined;

  const fail = (reason: OcrWarning): OcrResult => {
    const r = emptyResult(scale, [...warnings, reason]);
    r.debug = makeDebug(kept, [], ink, 0);
    return r;
  };

  if (kept.length < 4) {
    return fail({ code: 'noContent' });
  }

  const fullMask = rasterizeComponents(ink, labels, kept);

  // ---- Bands and row candidates ---------------------------------------------
  const bands = repairBands(bandComponents(kept, ctx.strokeWidth), fullMask);
  const candidates: RowCandidate[] = [];
  bands.forEach((band, index) => {
    const candidate = toCandidate(band, glyphColumns(band, columnsOf(band)), 3, [index]);
    if (candidate) candidates.push(candidate);
  });

  // Also offer every adjacent pair as a single merged row. See RowCandidate.sources.
  for (let i = 0; i + 1 < bands.length; i++) {
    const a = bands[i];
    const b = bands[i + 1];
    const gap = b.box.y - (a.box.y + a.box.h);
    if (gap > Math.max(a.box.h, b.box.h) * 0.6) continue;
    const merged: Band = {
      box: unionBox(a.box, b.box),
      components: [...a.components, ...b.components],
    };
    const candidate = toCandidate(
      merged,
      glyphColumns(merged, columnsOf(merged)),
      3,
      [i, i + 1],
    );
    if (candidate) candidates.push(candidate);
  }

  if (candidates.length === 0) {
    return fail({ code: 'noDigits' });
  }

  // ---- Pick the systolic / diastolic / pulse block ---------------------------
  const block = selectValueBlock(candidates);
  if (block.length === 0) return fail({ code: 'noValueRows' });

  const aspect = estimateAspect(block);

  let xLeft = Infinity;
  let xRight = -Infinity;
  for (const row of block) {
    xLeft = Math.min(xLeft, row.left);
    xRight = Math.max(xRight, row.right);
  }
  const blockWidth = xRight - xLeft;
  const pad = Math.max(ctx.strokeWidth * 1.5, blockWidth * 0.06);

  // Everything outside the value block's own column is chrome: the left-hand
  // icon strip and the printed bezel labels. Dropping it before decoding keeps
  // the shear estimate and the probe windows honest.
  const inBlock = (c: Component) => {
    const cx = c.box.x + c.box.w / 2;
    return cx >= xLeft - pad && cx <= xRight + pad;
  };
  const blockComponents = kept.filter(inBlock);
  const blockMask = rasterizeComponents(ink, labels, blockComponents);

  // The three value rows are padded with blanks on the left, so they share one
  // right edge. Using the block's median edge — rather than each row's own —
  // keeps a stray mark beside a single row from shifting that row's cells.
  const sharedRight = median(block.map((r) => r.right));

  // ---- Decode the value rows -------------------------------------------------
  const rows: RowResult[] = [];
  const kinds: RowResult['kind'][] = ['systolic', 'diastolic', 'pulse'];

  block.forEach((candidate, index) => {
    const trimmed = candidate.band.components.filter(inBlock);
    if (trimmed.length === 0) return;
    const band: Band = { box: boundsOfComponents(trimmed), components: trimmed };
    const cols = limitToRun(
      glyphColumns(band, columnsOf(band)),
      band.box.h,
      aspect,
      3,
      sharedRight,
    );
    if (cols.length === 0) return;

    const { digits, glyphHeight } = decodeBand(blockMask, band, cols, {
      segmentOn: opts.segmentOn,
      segmentOff: opts.segmentOff,
      aspect,
    });
    if (digits.length === 0) return;

    const row = rowFromDigits(band, digits, glyphHeight);
    row.kind = kinds[index] ?? 'unknown';
    rows.push(row);
  });

  if (rows.length === 0) {
    return fail({ code: 'noDigitsRead' });
  }

  // ---- The small header row, if there is one ---------------------------------
  const blockTop = Math.min(...block.map((r) => r.band.box.y));
  const blockHeight = median(block.map((r) => r.height));
  const blockRight = sharedRight;
  const cellW = blockHeight * aspect;

  const headerCandidate = candidates
    .filter((c) => !block.includes(c))
    .filter((c) => c.band.box.y + c.band.box.h <= blockTop + blockHeight * 0.2)
    .filter((c) => c.height < blockHeight * 0.85 && c.height > blockHeight * 0.1)
    .filter((c) => Math.abs(c.right - blockRight) < cellW * 2.5)
    .sort((a, b) => b.band.box.y - a.band.box.y)[0];

  if (headerCandidate) {
    const trimmed = headerCandidate.band.components.filter((c) => {
      const cx = c.box.x + c.box.w / 2;
      return cx >= xLeft - cellW * 2 && cx <= xRight + pad;
    });
    if (trimmed.length > 0) {
      const band: Band = { box: boundsOfComponents(trimmed), components: trimmed };
      const cols = limitToRun(
        glyphColumns(band, columnsOf(band), { allowSeparators: true }),
        band.box.h,
        aspect,
        5,
        sharedRight,
      );
      if (cols.length > 0) {
        const headerMask = rasterizeComponents(ink, labels, trimmed);
        const { digits, glyphHeight } = decodeBand(headerMask, band, cols, {
          segmentOn: opts.segmentOn,
          segmentOff: opts.segmentOff,
          aspect,
        });
        if (digits.length > 0) {
          const row = rowFromDigits(band, digits, glyphHeight);
          row.kind = 'header';
          rows.unshift(row);
        }
      }
    }
  }

  // ---- Interpret -------------------------------------------------------------
  const errorRow = rows.find((r) => r.text.includes('E') && r.text.includes('r'));
  if (errorRow) {
    warnings.push({ code: 'errorCode' });
  }

  const sysRow = rows.find((r) => r.kind === 'systolic') ?? null;
  const diaRow = rows.find((r) => r.kind === 'diastolic') ?? null;
  const pulRow = rows.find((r) => r.kind === 'pulse') ?? null;

  const systolic = readValue(sysRow, RANGES.systolic, warnings, 'systolic');
  const diastolic = readValue(diaRow, RANGES.diastolic, warnings, 'diastolic');
  const pulse = readValue(pulRow, RANGES.pulse, warnings, 'pulse');

  let implausible = false;
  if (systolic !== null && diastolic !== null) {
    if (diastolic >= systolic) {
      warnings.push({ code: 'systolicNotAbove' });
      implausible = true;
    } else {
      // Pulse pressure outside this span is not something a home monitor
      // produces, so it is far likelier that a digit was misread.
      const pulsePressure = systolic - diastolic;
      if (pulsePressure < 15 || pulsePressure > 110) {
        warnings.push({ code: 'implausibleGap', gap: pulsePressure });
        implausible = true;
      }
    }
  }

  const header = parseHeader(rows.filter((r) => r.kind === 'header'));
  if (header.isAverage) {
    warnings.push({ code: 'isAverage' });
  }

  const valueBands = rows
    .filter((r) => r.kind !== 'header' && r.kind !== 'unknown')
    .map((r) => r.band);
  const panelWork = valueBands.length > 0 ? valueBands.reduce((a, b) => unionBox(a, b)) : null;
  const panel = panelWork
    ? {
        x: panelWork.x / scale + ctx.roiOffsetX,
        y: panelWork.y / scale + ctx.roiOffsetY,
        w: panelWork.w / scale,
        h: panelWork.h / scale,
      }
    : null;

  const valueRowsFound = rows.filter(
    (r) => r.kind === 'systolic' || r.kind === 'diastolic' || r.kind === 'pulse',
  ).length;
  if (valueRowsFound < 3) {
    warnings.push({ code: 'missingRows', found: valueRowsFound });
  }

  const confidence = {
    systolic: sysRow?.confidence ?? 0,
    diastolic: diaRow?.confidence ?? 0,
    pulse: pulRow?.confidence ?? 0,
    overall: 0,
  };
  const parts = [confidence.systolic, confidence.diastolic];
  if (pulse !== null) parts.push(confidence.pulse);
  confidence.overall = Math.min(...parts);

  // Any glyph that had to be snapped to the nearest legal pattern is a sign the
  // cell grid was slightly off, which tends to be wrong in ways segment probes
  // cannot see. Discount the whole reading rather than the single digit.
  const correctedDigits = rows
    .filter((r) => r.kind !== 'header')
    .reduce((n, r) => n + r.digits.filter((d) => d.corrected).length, 0);
  if (correctedDigits > 0) {
    confidence.overall *= Math.max(0.25, 1 - correctedDigits * 0.35);
  }
  if (valueRowsFound < 3) confidence.overall *= 0.75;
  if (implausible) confidence.overall = 0;
  if (errorRow) confidence.overall = 0;

  /*
   * Acceptance threshold.
   *
   * `ok` is what decides whether the app may pre-fill a reading without the user
   * checking it, so it is set well above "we produced some numbers". Recording a
   * plausible-looking but wrong blood pressure is worse than asking for another
   * photo, and a misread is rarely obvious to the person reviewing it.
   */
  const ok =
    systolic !== null &&
    diastolic !== null &&
    // All three rows must be visible.
    //
    // Rows are labelled by their position in the block, so with only two of them
    // there is no way to tell "systolic and diastolic" from "systolic and pulse":
    // a photo that clipped the diastolic row reads 154/70 just as confidently as
    // the real 154/92. Every row is legible or the reading gets checked by hand.
    valueRowsFound === 3 &&
    !errorRow &&
    !implausible &&
    confidence.overall >= 0.45;



  return {
    ok,
    systolic,
    diastolic,
    pulse,
    confidence,
    detectedDate: header.date,
    detectedTime: header.time,
    icons: { ...EMPTY_ICONS, average: header.isAverage ? true : null },
    rows,
    panel,
    scale,
    warnings,
    elapsedMs: 0,
    debug: makeDebug(blockComponents, rows.map((r) => r.band), blockMask, blockHeight),
  };
}

/**
 * Split any band that is far taller than its peers, then re-check. Two rounds is
 * plenty: a single icon can bridge at most one pair of neighbouring rows.
 */
function repairBands(bands: Band[], mask: Mask): Band[] {
  let current = bands;
  for (let round = 0; round < 2; round++) {
    const heights = current.map((b) => b.box.h).filter((h) => h > 0);
    if (heights.length === 0) return current;
    const expected = median(heights);
    if (expected <= 0) return current;

    const next: Band[] = [];
    let changed = false;
    for (const band of current) {
      const pieces = splitTallBand(band, mask, expected);
      if (pieces.length > 1) changed = true;
      next.push(...pieces);
    }
    current = next;
    if (!changed) break;
  }
  return current.sort((a, b) => a.box.y - b.box.y);
}

function readValue(
  row: RowResult | null,
  range: { min: number; max: number },
  warnings: OcrWarning[],
  field: OcrField,
): number | null {
  if (!row || row.value === null) return null;
  // Every value this device can show is two or three digits wide. A single
  // digit means the row was clipped or a stray mark was read as a number.
  if (row.digits.filter((d) => d.value !== null).length < 2) {
    warnings.push({ code: 'partialRow', field });
    return null;
  }
  if (row.value < range.min || row.value > range.max) {
    warnings.push({
      code: 'implausibleValue',
      field,
      value: row.value,
      min: range.min,
      max: range.max,
    });
    return null;
  }
  return row.value;
}

interface HeaderInfo {
  date: { month: number; day: number } | null;
  time: { hour: number; minute: number } | null;
  isAverage: boolean;
}

/**
 * Read the small row above the values.
 *
 * The device alternates this field between a date (`M-D`) and a clock (`H:MM`),
 * and shows `A` instead when displaying a stored average. Because it alternates,
 * the value is only ever reported as a *hint* — readings are ordered by when the
 * photo was taken, never by whatever the device happened to be showing.
 */
function parseHeader(rows: RowResult[]): HeaderInfo {
  const result: HeaderInfo = { date: null, time: null, isAverage: false };

  for (const row of rows) {
    const text = row.text.replace(/\s+/g, '');
    if (text.includes('A')) result.isAverage = true;

    const dateMatch = text.match(/(\d{1,2})-(\d{1,2})/);
    if (dateMatch) {
      const month = parseInt(dateMatch[1], 10);
      const day = parseInt(dateMatch[2], 10);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        result.date = { month, day };
        continue;
      }
    }

    const timeMatch = text.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      const hour = parseInt(timeMatch[1], 10);
      const minute = parseInt(timeMatch[2], 10);
      if (hour <= 23 && minute <= 59) result.time = { hour, minute };
    }
  }
  return result;
}

export { boundsOfComponents };
export type { Band, Gray, Mask };
