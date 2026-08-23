import {
  connectedComponents,
  filterSegmentLike,
  rasterizeComponents,
  removeThinLines,
} from './components';
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
  OcrDebugArtifacts,
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
interface PassVariant {
  windowScale: number;
  preBlur: number;
  /** Overrides the default relative-darkness requirement for this pass. */
  threshold?: number;
  /** Strip long thin lines — usually the LCD border — before labelling. */
  deline?: boolean;
}

const PASS_VARIANTS: readonly PassVariant[] = [
  { windowScale: 2.6, preBlur: 1 },
  { windowScale: 4.2, preBlur: 1 },
  { windowScale: 1.8, preBlur: 1 },
  // The same two window sizes again with the panel border cut out. On a photo
  // where the border thresholds as ink these are the only passes that can read
  // the right-hand segments at all; on one where it does not they are
  // near-duplicates of the first two and simply lose on score.
  { windowScale: 2.6, preBlur: 1, deline: true },
  { windowScale: 4.2, preBlur: 1, deline: true },
  /*
   * A deliberately over-sensitive pass.
   *
   * An LCD photographed off-axis does not fade evenly: on a real photo of this
   * device one half of a digit sat 80 grey levels below its background while the
   * other half of the *same* digit sat only 20 below. At the default
   * sensitivity half of a segment crosses the threshold and half does not, so
   * the digit does not disappear — it changes value.
   *
   * Asking only for "5% darker than local mean" recovers those segments, and
   * also lets grain through, which is why it is an extra pass judged against the
   * others rather than a change to the default.
   */
  { windowScale: 3.4, preBlur: 1, threshold: 0.05 },
  { windowScale: 3.4, preBlur: 1, threshold: 0.05, deline: true },
  // Last resorts for a dim, grainy photo: smooth harder before thresholding.
  { windowScale: 3.0, preBlur: 2 },
  { windowScale: 3.4, preBlur: 3 },
  // Heavy smoothing *and* no panel border: the combination that reads a
  // low-contrast photo with a hard shadow lying across the display.
  { windowScale: 3.4, preBlur: 3, deline: true },
];

/**
 * Floor a pulse row must clear before its value is reported at all.
 *
 * Set above the acceptance threshold for the reading as a whole, because there
 * is no cost to omitting a pulse and a real cost to recording a wrong one.
 */
const PULSE_MIN_CONFIDENCE = 0.5;

/**
 * How much less legible than the pressure rows a pulse row may be.
 *
 * An absolute floor alone is not enough, because a misread is not always an
 * *uncertain* read: when the panel border swallows a segment the probe lands
 * decisively on background and the wrong digit comes back well resolved. What
 * gives it away is the comparison — a display whose systolic and diastolic rows
 * both read perfectly has no reason to produce a middling pulse, so a pulse row
 * markedly worse than its neighbours is evidence about that row specifically
 * rather than about the photo.
 */
const PULSE_RELATIVE_CONFIDENCE = 0.75;

/**
 * Segment thickness as a fraction of glyph height, for a seven-segment face.
 *
 * Displays vary a little either side of this, but the threshold-window ladder
 * spans a wide enough range that being 20% out costs nothing.
 */
const SEGMENT_THICKNESS_RATIO = 0.16;

/** Median glyph height of the value rows, ignoring the small header row. */
function valueGlyphHeight(result: OcrResult | null): number {
  if (!result) return 0;
  const heights = result.rows
    .filter((r) => r.kind !== 'header' && r.kind !== 'unknown' && r.digits.length > 0)
    .map((r) => r.glyphHeight)
    .filter((h) => h > 0);
  return heights.length > 0 ? median(heights) : 0;
}

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

  const { image: downscaled, scale } = downscale(gray, opts.maxWorkingDim);

  // A first, deliberately generous threshold exists only to measure the stroke
  // width and the glyph slant, which then size and straighten the real passes.
  const probe = (img: Gray): Mask =>
    adaptiveThreshold(img, {
      window: Math.max(15, Math.round(Math.min(img.w, img.h) / 8) | 1),
      threshold: opts.threshold,
      minContrast: opts.minContrast,
    });

  // A one-pixel blur costs little and stops JPEG ringing from fragmenting the
  // thin strokes of the small header glyphs into unusable specks.
  const work = downscaled;
  const smoothed = boxBlur(work, 1);
  const strokeWidth = estimateStrokeWidth(probe(smoothed));

  const ctx: PassContext = {
    work,
    smoothed,
    scale,
    roiOffsetX,
    roiOffsetY,
    strokeWidth,
    threshold: opts.threshold,
    deline: false,
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

  const attempts: OcrResult[] = [];

  /** Runs the whole variant ladder at one assumed stroke width. */
  const ladder = (stroke: number): OcrResult | null => {
    let localBest: OcrResult | null = null;
    let localScore = -Infinity;
    ctx.strokeWidth = stroke;

    for (const variant of PASS_VARIANTS) {
      const window = clampOdd(
        Math.round(stroke * variant.windowScale),
        15,
        Math.max(15, Math.round(Math.min(work.w, work.h) / 6)),
      );
      ctx.smoothed = blurred(variant.preBlur);
      ctx.threshold = variant.threshold ?? opts.threshold;
      ctx.deline = variant.deline === true;
      const result = runPass(ctx, window);
      attempts.push(result);
      const score = scoreResult(result);
      if (score > localScore) {
        localScore = score;
        localBest = result;
      }
      // A complete, self-consistent, high-confidence reading is not going to be
      // improved on by another pass.
      if (isConclusive(result)) return localBest;
    }
    return localBest;
  };

  const first = ladder(strokeWidth);

  /*
   * Re-run once at the stroke width the digits themselves imply.
   *
   * `estimateStrokeWidth` takes the median run length over the whole photo, and
   * a photo of this device contains far more thin ink than thick: the moulded
   * "microlife" logo, the SYS/DIA/PUL bezel labels, the tiny date row. On a
   * frame where the panel is only half the picture the median lands nearer the
   * *labels* than the values — measured at ~10px against a true segment
   * thickness of ~20 — and every threshold window is then sized for a stroke
   * twice as thin as the one being read.
   *
   * That failure is quiet and vicious. A window narrower than the segment fits
   * *inside* it, so the segment's interior reads as "no different from its
   * surroundings" and only its outline survives. The digit does not vanish; it
   * turns into a different digit, and 79 is read as 75.
   *
   * The way out is that the first pass does not need to read the digits
   * correctly to find *where* they are — banding survives a bad threshold. Once
   * a glyph height is known, the segment thickness follows from the geometry of
   * a seven-segment face, and the ladder can be run again properly sized. Only
   * one refinement is allowed, and it only replaces the first result if it
   * genuinely scores better.
   */
  const impliedStroke = valueGlyphHeight(first) * SEGMENT_THICKNESS_RATIO;
  if (
    !isConclusive(first) &&
    impliedStroke >= 2 &&
    (impliedStroke > strokeWidth * 1.3 || impliedStroke < strokeWidth * 0.7)
  ) {
    ladder(Math.round(impliedStroke));
  }

  /*
   * Assemble the reading row by row, taking each row from whichever pass read it
   * best.
   *
   * A single pass has one threshold window and one sensitivity, and a real
   * photograph does not have one contrast. The same shot can show the systolic
   * row crisp and the pulse row washed out, so the parameters that resolve the
   * top of the panel are not the ones that resolve the bottom. Insisting that
   * one pass read all three rows turns a solvable problem into a search for a
   * corner of parameter space that may not exist — and the ladder would have to
   * grow combinatorially to keep finding it.
   *
   * The rows are independent measurements of independent parts of the image, so
   * they can be sourced independently. What keeps that honest is that a row is
   * only allowed to replace another if it describes the *same piece of the
   * photo* — same position, same size, same right edge — and only if it is more
   * confident. See `rowsDescribeSameThing`.
   */
  let best = pickBest(attempts);
  if (best) {
    const merged = mergeBestRows(best, attempts);
    if (merged) {
      const remerged = interpret(merged, ctx, scale, best.debug);
      if (scoreResult(remerged) > scoreResult(best)) best = remerged;
    }
  }

  const final = best ?? emptyResult(scale, [{ code: 'recognitionFailed' }]);
  final.elapsedMs = Date.now() - started;
  return final;
}

/**
 * A reading good enough that no further pass could improve on it: all three rows
 * present, physiologically ordered, and resolved with room to spare. Used both
 * to stop the ladder early and to skip the refinement ladder entirely, which is
 * most of what keeps a well-lit photo fast.
 */
function isConclusive(r: OcrResult | null): boolean {
  return (
    r !== null &&
    r.systolic !== null &&
    r.diastolic !== null &&
    r.pulse !== null &&
    r.systolic > r.diastolic &&
    r.confidence.overall > 0.75
  );
}

/** The highest-scoring pass, or null if nothing was attempted. */
function pickBest(attempts: OcrResult[]): OcrResult | null {
  let best: OcrResult | null = null;
  let bestScore = -Infinity;
  for (const attempt of attempts) {
    const score = scoreResult(attempt);
    if (score > bestScore) {
      bestScore = score;
      best = attempt;
    }
  }
  return best;
}

/**
 * Whether two decoded rows are looking at the same part of the display.
 *
 * Without this the merge could graft the diastolic row of one pass onto the
 * pulse row of another whenever a pass mis-segmented the block, which would
 * invent a reading from two unrelated halves of the image. Position, height and
 * right edge all have to agree; the right edge matters most, because the value
 * rows are the only right-aligned thing on the panel.
 */
function rowsDescribeSameThing(a: RowResult, b: RowResult): boolean {
  const overlap =
    Math.min(a.band.y + a.band.h, b.band.y + b.band.h) - Math.max(a.band.y, b.band.y);
  if (overlap <= 0) return false;

  const smaller = Math.min(a.band.h, b.band.h);
  if (smaller <= 0) return false;
  if (overlap < smaller * 0.6) return false;
  if (Math.max(a.band.h, b.band.h) / smaller > 1.35) return false;

  const rightEdgeShift = Math.abs(a.band.x + a.band.w - (b.band.x + b.band.w));
  return rightEdgeShift <= smaller * 0.5;
}

/**
 * For each value row, the most confident reading any pass produced of that same
 * row. Returns null when no pass improved on the winning one.
 */
function mergeBestRows(base: OcrResult, attempts: OcrResult[]): RowResult[] | null {
  const merged: RowResult[] = [];
  const header = base.rows.find((r) => r.kind === 'header');
  if (header) merged.push(header);

  let improved = false;
  for (const kind of ['systolic', 'diastolic', 'pulse'] as const) {
    const anchor = base.rows.find((r) => r.kind === kind);
    if (!anchor) continue;

    let winner = anchor;
    for (const attempt of attempts) {
      if (attempt === base) continue;
      for (const candidate of attempt.rows) {
        if (candidate.kind !== kind) continue;
        if (candidate.confidence <= winner.confidence) continue;
        if (!rowsDescribeSameThing(anchor, candidate)) continue;
        winner = candidate;
      }
    }
    if (winner !== anchor) improved = true;
    merged.push(winner);
  }

  return improved ? merged : null;
}

/**
 * Ranks a pass by how complete, self-consistent *and* well-resolved its reading
 * is.
 *
 * Confidence multiplies each field's worth rather than being added to it. When
 * it was additive, a pass that filled all three rows with noise outscored one
 * that read two rows perfectly and admitted it could not see the third — the
 * completeness bonus alone was larger than the entire confidence term. The
 * ladder then chose the wrong mask, and because that mask was internally
 * consistent the wrongness survived all the way to the acceptance check.
 *
 * A field read with no confidence is still worth something: it locates the row
 * even when it cannot resolve the digits. It is not worth as much as a field
 * that is actually legible.
 */
function scoreResult(r: OcrResult): number {
  const field = (value: number | null, confidence: number, weight: number) =>
    value === null ? 0 : weight * (0.2 + 0.8 * confidence);

  let score =
    field(r.systolic, r.confidence.systolic, 100) +
    field(r.diastolic, r.confidence.diastolic, 100) +
    field(r.pulse, r.confidence.pulse, 70);

  // Systolic above diastolic is the one relationship physiology guarantees, so
  // it is strong evidence the rows were assigned correctly — but only as strong
  // as the two readings it relates.
  if (r.systolic !== null && r.diastolic !== null && r.systolic > r.diastolic) {
    score += 60 * Math.min(r.confidence.systolic, r.confidence.diastolic);
  }
  if (r.detectedDate || r.detectedTime) score += 10;
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
  // NOTE: `smoothed` and `strokeWidth` are reassigned as the ladder runs.
  scale: number;
  roiOffsetX: number;
  roiOffsetY: number;
  strokeWidth: number;
  /** Relative-darkness requirement for the current pass. */
  threshold: number;
  /** Whether the current pass strips long thin lines before labelling. */
  deline: boolean;
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
  // Only the early-exit paths below report anything; the real warnings are
  // raised in `interpret`.
  const warnings: OcrWarning[] = [];

  const thresholded = adaptiveThreshold(smoothed, {
    window,
    threshold: ctx.threshold,
    minContrast: opts.minContrast,
  });
  // Optionally sever the LCD's own border, which when it thresholds as ink
  // bridges every digit it touches into one unusable component. It is a pass
  // variant rather than a default because a photo where the border stays light
  // does not need it, and every filter that can rescue a glyph can also trim
  // one. See removeThinLines.
  const ink = ctx.deline ? removeThinLines(thresholded) : thresholded;

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
  // stray ink out of the probe windows.
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

  return interpret(
    rows,
    ctx,
    scale,
    makeDebug(blockComponents, bands.map((b) => b.box), blockMask, blockHeight),
  );
}
/**
 * Turns a set of decoded rows into a reading: values, plausibility checks,
 * confidence and the acceptance decision.
 *
 * Separate from `runPass` because it is applied twice — once per pass, and once
 * more over the rows merged from every pass. See `mergeBestRows`.
 */
function interpret(
  rows: RowResult[],
  ctx: PassContext,
  scale: number,
  debug: OcrDebugArtifacts | undefined,
): OcrResult {
  const warnings: OcrWarning[] = [];
  const errorRow = rows.find((r) => r.text.includes('E') && r.text.includes('r'));
  if (errorRow) {
    warnings.push({ code: 'errorCode' });
  }

  const sysRow = rows.find((r) => r.kind === 'systolic') ?? null;
  const diaRow = rows.find((r) => r.kind === 'diastolic') ?? null;
  const pulRow = rows.find((r) => r.kind === 'pulse') ?? null;

  const systolic = readValue(sysRow, RANGES.systolic, warnings, 'systolic');
  const diastolic = readValue(diaRow, RANGES.diastolic, warnings, 'diastolic');
  let pulse = readValue(pulRow, RANGES.pulse, warnings, 'pulse');

  /*
   * A pulse the recogniser cannot stand behind is dropped, not reported.
   *
   * Pulse sits at the bottom of the panel in the smallest digits, which is
   * exactly where a photo runs out of contrast first — on real photographs it is
   * the row that fails while the two pressure rows are still perfectly legible.
   * Reporting a shaky pulse would mean either recording a wrong number or, since
   * overall confidence is the weakest field, throwing away a good blood-pressure
   * reading to avoid it.
   *
   * Neither is necessary. Pulse is optional in a reading; blood pressure is the
   * measurement. Dropping it here does not weaken the row-identification
   * guarantee, which depends on three rows being *located* rather than on all
   * three being readable.
   */
  if (pulse !== null && pulRow !== null) {
    const pressureConfidence = Math.min(
      sysRow?.confidence ?? 0,
      diaRow?.confidence ?? 0,
    );
    const required = Math.max(
      PULSE_MIN_CONFIDENCE,
      pressureConfidence * PULSE_RELATIVE_CONFIDENCE,
    );
    if (pulRow.confidence < required) {
      pulse = null;
      warnings.push({ code: 'pulseUnreadable' });
    }
  }

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

  /*
   * Any glyph that had to be snapped to the nearest legal pattern is a sign the
   * cell grid was slightly off, which tends to be wrong in ways segment probes
   * cannot see. Discount the whole reading rather than the single digit.
   *
   * Only rows that actually contributed a number count. A pulse row that was
   * rejected as unreadable has already been discarded; letting its snapped
   * glyphs also suppress a systolic and diastolic that were both read at full
   * confidence would throw away a good blood-pressure reading because of a row
   * the result no longer contains.
   */
  const contributed = (row: RowResult): boolean =>
    (row.kind === 'systolic' && systolic !== null) ||
    (row.kind === 'diastolic' && diastolic !== null) ||
    (row.kind === 'pulse' && pulse !== null);

  const correctedDigits = rows
    .filter(contributed)
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
    debug,
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
