import { isGlyphLike } from './components';
import { median } from './raster';
import { decodeCell } from './sevenSegment';
import type { Box, Component, DigitResult, Mask, RowResult } from './types';

/**
 * Fallback width/height of one glyph cell, used only until the real aspect can
 * be measured from the image.
 */
export const GLYPH_ASPECT = 0.62;

export interface Band {
  box: Box;
  components: Component[];
}

export interface Column {
  box: Box;
  components: Component[];
  /** Total ink pixels in the column. */
  area: number;
  /** area / bounding-box area — how solidly the ink fills the column. */
  fill: number;
}

/**
 * Merge components into horizontal bands by union of their vertical extents.
 *
 * This works because a seven-segment glyph's strokes tile its full height with
 * no vertical gap: `a` covers the top, `b`/`f` the upper half, `g` the middle,
 * `c`/`e` the lower half and `d` the bottom. So one row of glyphs collapses to a
 * single continuous interval, while the genuine blank space between rows keeps
 * neighbouring rows apart.
 */
export function bandComponents(
  components: Component[],
  strokeWidth = 0,
): Band[] {
  if (components.length === 0) return [];
  const n = components.length;

  // Union-find over "belongs to the same row".
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r];
    while (parent[i] !== r) {
      const next = parent[i];
      parent[i] = r;
      i = next;
    }
    return r;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  /*
   * A `1` is the one digit with nothing on its centre line: it lights only `b`
   * and `c`, which are separated by the hairline where `g` would be. Every other
   * digit has some stroke spanning the middle, so plain vertical-interval union
   * groups it correctly — but a row reading "111" splits into an upper half and
   * a lower half, and both then fail the row tests, shifting every value up a
   * row.
   *
   * Bridging is therefore deliberately narrow: two components join across a gap
   * only when they sit in the same vertical channel *and* the gap is a fraction
   * of a stroke. The blank space between two display rows is far wider than that
   * even on a tightly laid-out panel, so rows cannot be welded together — and if
   * an unusual layout ever did, `splitTallBand` puts it right afterwards.
   */
  const bridge = strokeWidth * 0.4;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = components[i].box;
      const b = components[j].box;
      const top = Math.max(a.y, b.y);
      const bottom = Math.min(a.y + a.h, b.y + b.h);
      if (bottom > top) {
        union(i, j);
        continue;
      }
      if (bridge <= 0) continue;
      if (top - bottom > bridge) continue;
      const left = Math.max(a.x, b.x);
      const right = Math.min(a.x + a.w, b.x + b.w);
      const overlap = (right - left) / Math.max(1, Math.min(a.w, b.w));
      if (overlap > 0.55) union(i, j);
    }
  }

  const groups = new Map<number, Component[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const list = groups.get(root);
    if (list) list.push(components[i]);
    else groups.set(root, [components[i]]);
  }

  return [...groups.values()]
    .map(makeBand)
    .sort((a, b) => a.box.y - b.box.y);
}

function makeBand(components: Component[]): Band {
  return { box: boundsOfComponents(components), components };
}

export function boundsOfComponents(components: Component[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of components) {
    minX = Math.min(minX, c.box.x);
    minY = Math.min(minY, c.box.y);
    maxX = Math.max(maxX, c.box.x + c.box.w);
    maxY = Math.max(maxY, c.box.y + c.box.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function makeColumn(components: Component[]): Column {
  const box = boundsOfComponents(components);
  const area = components.reduce((sum, c) => sum + c.area, 0);
  return { box, components, area, fill: area / Math.max(1, box.w * box.h) };
}

/** The same interval merge, but along x, applied to the members of one band. */
export function columnsOf(band: Band, gapTolerance = 0): Column[] {
  const sorted = [...band.components].sort((a, b) => a.box.x - b.box.x);
  const cols: Column[] = [];
  let current: Component[] = [sorted[0]];
  let right = sorted[0].box.x + sorted[0].box.w;

  for (let i = 1; i < sorted.length; i++) {
    const c = sorted[i];
    if (c.box.x <= right + gapTolerance) {
      current.push(c);
      right = Math.max(right, c.box.x + c.box.w);
    } else {
      cols.push(makeColumn(current));
      current = [c];
      right = c.box.x + c.box.w;
    }
  }
  cols.push(makeColumn(current));
  return cols;
}

/**
 * A short, wide bar sitting on the glyph centre line: the date separator in
 * "8-23". It fails the glyph test on every count, so it needs its own rule, and
 * it is only ever accepted in the small header row — a value row never has one,
 * and admitting it there would turn a stray tick mark into a parse failure.
 */
function isSeparatorLike(box: Box, bandHeight: number): boolean {
  const aspect = box.w / Math.max(1, box.h);
  return aspect > 1.5 && box.h > bandHeight * 0.06 && box.h < bandHeight * 0.42;
}

export function glyphColumns(
  band: Band,
  columns: Column[],
  opts: { allowSeparators?: boolean } = {},
): Column[] {
  return columns.filter((c) => {
    if (isGlyphLike(c.box, c.fill, band.box.h)) return true;
    if (opts.allowSeparators && isSeparatorLike(c.box, band.box.h)) return true;
    return false;
  });
}

/**
 * Keep only the columns belonging to the right-anchored run of glyphs.
 *
 * Shape tests alone cannot tell a `1` from the device's traffic-light
 * classification bar: both are narrow, solid, full-height verticals. The
 * difference is positional. Digits form a tightly pitched run ending at a common
 * right edge, whereas the indicator bar and the icon strip sit far off to the
 * left of it.
 *
 * Anchoring on the right is safe because every digit lights `b` or `c`, so the
 * rightmost glyph column really is the rightmost edge of the number — and
 * left-hand clutter, however much of it there is, cannot move that anchor.
 *
 * Without this, a single stray bar both prepends a phantom `1` to the value and
 * pushes the row over the "at most a few digits" guard, which then disqualifies
 * the entire three-row block.
 */
export function limitToRun(
  columns: Column[],
  bandHeight: number,
  aspect: number,
  maxGlyphs: number,
  /**
   * Right edge to anchor on. Once the value block is known, pass the block's
   * shared edge rather than letting each row pick its own: a stray mark to the
   * right of the digits would otherwise become that row's anchor and drag every
   * cell out of position.
   */
  anchorOverride?: number,
): Column[] {
  if (columns.length <= 1) return columns;
  const cellW = Math.max(1, bandHeight * aspect);
  const anchor =
    anchorOverride ?? Math.max(...columns.map((c) => c.box.x + c.box.w));
  // Drop anything sitting beyond the anchor entirely.
  columns = columns.filter((c) => c.box.x + c.box.w <= anchor + cellW * 0.35);
  if (columns.length <= 1) return columns;

  /*
   * Prefer the pitch the row actually exhibits over one derived from the cell
   * size.
   *
   * `cellW` comes from the band's height, and that height is only trustworthy
   * when some digit in the row lights the top or bottom bar. A row reading "111"
   * has neither, so its ink spans about 81% of the true cell and every derived
   * measurement shrinks with it — enough to pull the leading digit out of reach
   * and silently turn 111 into 11. The spacing between glyph columns is measured
   * directly and carries no such assumption.
   *
   * The *smallest* plausible spacing is the right one to take: real digits sit
   * one pitch apart, while anything strayed in from the icon strip is much
   * further away and would only inflate the estimate.
   */
  const rights = columns.map((c) => c.box.x + c.box.w).sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < rights.length; i++) {
    const d = rights[i] - rights[i - 1];
    if (d >= cellW * 0.5 && d <= cellW * 2.2) gaps.push(d);
  }
  const pitch = gaps.length > 0 ? Math.min(...gaps) : cellW * 1.25;
  const reach = pitch * (maxGlyphs - 1) + cellW * 0.4;

  const kept = columns
    .filter((c) => anchor - (c.box.x + c.box.w) <= reach)
    .sort((a, b) => a.box.x - b.box.x);

  return kept.length > maxGlyphs ? kept.slice(kept.length - maxGlyphs) : kept;
}

/**
 * Split a band that clearly contains more than one row of glyphs.
 *
 * The device's traffic-light classification bar runs down the left edge of the
 * LCD, tall enough to span the blank space between two value rows and glue their
 * bands together. When a band is far taller than its peers, cut it at the
 * emptiest scanline near the middle — which is exactly that blank space, since
 * the bar contributes only its own narrow width there.
 */
export function splitTallBand(band: Band, mask: Mask, expectedHeight: number): Band[] {
  if (band.box.h < expectedHeight * 1.7) return [band];

  const y0 = Math.floor(band.box.y);
  const y1 = Math.ceil(band.box.y + band.box.h);
  const x0 = Math.max(0, Math.floor(band.box.x));
  const x1 = Math.min(mask.w, Math.ceil(band.box.x + band.box.w));

  const profile: number[] = [];
  for (let y = y0; y < y1; y++) {
    let count = 0;
    if (y >= 0 && y < mask.h) {
      const row = y * mask.w;
      for (let x = x0; x < x1; x++) count += mask.data[row + x];
    }
    profile.push(count);
  }

  // Search only the middle half so we never shave a sliver off an end.
  const from = Math.floor(profile.length * 0.25);
  const to = Math.ceil(profile.length * 0.75);
  let cutIdx = -1;
  let cutVal = Infinity;
  for (let i = from; i < to; i++) {
    if (profile[i] < cutVal) {
      cutVal = profile[i];
      cutIdx = i;
    }
  }
  if (cutIdx < 0) return [band];

  const cutY = y0 + cutIdx;
  const above = band.components.filter((c) => c.box.y + c.box.h / 2 < cutY);
  const below = band.components.filter((c) => c.box.y + c.box.h / 2 >= cutY);
  if (above.length === 0 || below.length === 0) return [band];
  return [makeBand(above), makeBand(below)];
}

// ---------------------------------------------------------------------------
// Value-block selection
// ---------------------------------------------------------------------------

export interface RowCandidate {
  band: Band;
  columns: Column[];
  /** Rightmost edge of the glyph columns — the alignment anchor. */
  right: number;
  left: number;
  height: number;
  /**
   * Indices of the raw bands this candidate was built from.
   *
   * Some rows arrive split in half, because no digit in them happens to light a
   * stroke across the centre line — "71" is `a+b` above and `c` below, with a
   * hairline between. Rather than guess a gap threshold that separates that
   * hairline from the equally narrow space between two display rows, both the
   * halves *and* their merger are offered as candidates, and the block scorer
   * picks whichever forms a coherent three-row block. This records the
   * provenance so a group can never contain both a merged pair and one of its
   * own halves.
   */
  sources: number[];
}

export function toCandidate(
  band: Band,
  columns: Column[],
  maxGlyphs = 3,
  sources: number[] = [],
): RowCandidate | null {
  const run = limitToRun(columns, band.box.h, GLYPH_ASPECT, maxGlyphs);
  if (run.length === 0) return null;
  return {
    band,
    columns: run,
    right: Math.max(...run.map((c) => c.box.x + c.box.w)),
    left: Math.min(...run.map((c) => c.box.x)),
    height: band.box.h,
    sources,
  };
}

/**
 * Pick the systolic / diastolic / pulse block out of every candidate row.
 *
 * The device gives us three strong structural guarantees, and requiring all
 * three together is what keeps the printed bezel labels, the wordmark and the
 * button outlines from being read as values:
 *
 *   1. the three rows are **stacked consecutively** with no other row between,
 *   2. they use glyphs of **comparable height**, and
 *   3. they are **right-aligned to a common edge**, because the display pads
 *      short values with blanks on the left rather than with leading zeros.
 *
 * A two-row block is accepted as a fallback, since a photo can legitimately clip
 * the pulse row, but it always loses to a valid three-row block.
 */
export function selectValueBlock(candidates: RowCandidate[]): RowCandidate[] {
  const rows = [...candidates].sort((a, b) => a.band.box.y - b.band.box.y);
  if (rows.length === 0) return [];
  if (rows.length === 1) return rows;

  // Bound the search. With a lot of candidates only the taller ones can
  // plausibly be value rows, and C(14,3) is already trivial to enumerate.
  const pool =
    rows.length <= 14
      ? rows
      : [...rows]
          .sort((a, b) => b.height - a.height)
          .slice(0, 14)
          .sort((a, b) => a.band.box.y - b.band.box.y);

  let best: RowCandidate[] = [];
  let bestScore = -Infinity;

  // Every subset, not just consecutive windows. The device's icon strip puts
  // symbols — the cuff-fit tick, the battery, the irregular-heartbeat mark — at
  // heights that fall *between* the value rows, so each one becomes its own
  // candidate band. Requiring the three value rows to be adjacent in the
  // candidate list meant a single such icon split the trio and forced a fallback
  // to a two-row block, losing the pulse. The geometric constraints in
  // `scoreGroup` are what actually identify the block; adjacency was never doing
  // that work.
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const pair = [pool[i], pool[j]];
      const scorePair = scoreGroup(pair, 2);
      if (scorePair > bestScore) {
        bestScore = scorePair;
        best = pair;
      }
      for (let k = j + 1; k < pool.length; k++) {
        const trio = [pool[i], pool[j], pool[k]];
        const scoreTrio = scoreGroup(trio, 3);
        if (scoreTrio > bestScore) {
          bestScore = scoreTrio;
          best = trio;
        }
      }
    }
  }

  // Nothing formed a coherent block: fall back to the tallest row alone rather
  // than inventing a grouping the image does not support.
  if (best.length === 0 || bestScore <= 0) {
    const tallest = rows.reduce((a, b) => (b.height > a.height ? b : a));
    return [tallest];
  }
  return best;
}

/**
 * How far the value rows' right edges may drift apart, as a fraction of cell
 * width.
 *
 * This is the block's strongest signature. The three values are the only things
 * on the display that share an exact right edge, so keeping this tight is what
 * separates the real block from a plausible-looking trio that has swallowed the
 * moulded logo or the date row. It cannot go to zero: photographing a curved
 * panel off-axis moves the edges by a few percent of a glyph.
 */
const RIGHT_EDGE_TOLERANCE = 0.4;

/**
 * The pulse row is drawn *smaller* than the two pressure rows — about two
 * thirds the height on the BP B1 Classic. Bounds are generous because other
 * models in the family vary.
 */
const PULSE_HEIGHT_RANGE = { min: 0.45, max: 1.2 } as const;

/** How far the systolic and diastolic rows may differ in height from each other. */
const PRESSURE_HEIGHT_RATIO = 1.35;

function scoreGroup(group: RowCandidate[], size: number): number {
  // A merged pair and either of its halves describe the same pixels; a group
  // containing both would be reading one row twice.
  const seen = new Set<number>();
  for (const r of group) {
    for (const s of r.sources) {
      if (seen.has(s)) return -Infinity;
      seen.add(s);
    }
  }

  const ordered = [...group].sort((a, b) => a.band.box.y - b.band.box.y);
  const heights = ordered.map((r) => r.height);
  if (Math.min(...heights) <= 0) return -Infinity;

  /*
   * Height is judged against the device's actual layout, not against a hope
   * that all three rows match.
   *
   * They do not: systolic and diastolic are the same size, and pulse is roughly
   * two thirds of them. Scoring "all three heights equal" as the ideal punishes
   * the correct block for a property the hardware guarantees — measured on real
   * photographs the true trio scored *worse* than one that had swallowed the
   * moulded logo, because the logo happened to be closer in height to the
   * pressure rows than the pulse row is.
   */
  let uniformity: number;
  let scaleH: number;
  if (size >= 3) {
    const ratio = Math.max(heights[0], heights[1]) / Math.min(heights[0], heights[1]);
    if (ratio > PRESSURE_HEIGHT_RATIO) return -Infinity;
    scaleH = (heights[0] + heights[1]) / 2;
    const relative = heights[2] / scaleH;
    if (relative < PULSE_HEIGHT_RANGE.min || relative > PULSE_HEIGHT_RANGE.max) {
      return -Infinity;
    }
    uniformity = 1 - Math.min(1, (ratio - 1) / (PRESSURE_HEIGHT_RATIO - 1));
  } else {
    // A two-row block could be either pair, so it has to tolerate the drop to
    // the pulse row. It can never be accepted as a reading on its own — see the
    // three-row requirement in pipeline.ts — but it still has to be ranked.
    const ratio = Math.max(...heights) / Math.min(...heights);
    if (ratio > 1.9) return -Infinity;
    scaleH = median(heights);
    uniformity = 1 - Math.min(1, (ratio - 1) / 0.9);
  }

  const cellW = scaleH * GLYPH_ASPECT;

  // Right edges must line up.
  const rights = ordered.map((r) => r.right);
  const medRight = median(rights);
  const rightSpread = Math.max(...rights.map((r) => Math.abs(r - medRight)));
  if (rightSpread > cellW * RIGHT_EDGE_TOLERANCE) return -Infinity;

  // Rows must be genuinely adjacent, not separated by a gulf of blank display.
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1].band.box;
    const cur = ordered[i].band.box;
    const gap = cur.y - (prev.y + prev.h);
    if (gap > scaleH * 1.3) return -Infinity;
    if (gap < -scaleH * 0.2) return -Infinity;
  }

  // A blood-pressure row is two or three digits. More than that is not a value.
  let glyphCount = 0;
  for (const r of ordered) {
    if (r.columns.length < 1 || r.columns.length > 3) return -Infinity;
    glyphCount += r.columns.length;
  }

  const alignment = 1 - Math.min(1, rightSpread / (cellW * RIGHT_EDGE_TOLERANCE));

  // Prefer a complete three-row block, then tight alignment — the one property
  // no accidental grouping reproduces — then even pressure rows, then digits.
  return size * 100 + alignment * 70 + uniformity * 25 + glyphCount + scaleH * 0.05;
}

/**
 * Cell width divided by cell height, measured from the widest glyph in the
 * block.
 *
 * Only glyphs that light a left-hand segment span their full cell, so the widest
 * column across three rows is the reliable measurement; rows made entirely of
 * `1`s and `7`s would under-report on their own.
 */
export function estimateAspect(rows: RowCandidate[]): number {
  const samples: number[] = [];
  for (const r of rows) {
    if (r.height <= 0) continue;
    const widest = Math.max(...r.columns.map((c) => c.box.w));
    const ratio = widest / r.height;
    if (ratio >= 0.45 && ratio <= 1.05) samples.push(ratio);
  }
  if (samples.length === 0) return GLYPH_ASPECT;
  return median(samples);
}

// ---------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------

export interface RowLayoutOptions {
  segmentOn: number;
  segmentOff: number;
  /** Cell width / cell height, measured across the whole value block. */
  aspect?: number;
}

/**
 * Turn one band into decoded characters.
 *
 * The critical trick is anchoring each glyph cell to its **right** edge. Every
 * digit 0-9 lights at least one of the two right-hand segments (`b` or `c`), so
 * a column's right edge always coincides with the right edge of the true cell.
 * The left edge does not: a `1` shows only `b`/`c`, and a `3` or `7` has nothing
 * on the left at all, so a left-anchored or centred cell would slide the probe
 * windows off the strokes and misread the glyph.
 */
export function decodeBand(
  mask: Mask,
  band: Band,
  columns: Column[],
  opts: RowLayoutOptions,
): { digits: DigitResult[]; glyphHeight: number } {
  if (columns.length === 0) return { digits: [], glyphHeight: band.box.h };

  const cellH = band.box.h;

  /*
   * Cell width comes from the aspect measured across the whole value block,
   * never from this row's own widest column.
   *
   * A glyph's ink only spans its full cell when it lights a left-hand segment.
   * A row reading "111" is three narrow bars occupying about a quarter of their
   * cells, so sizing cells from the ink would shrink them to a fraction of the
   * truth and slide every probe window off the strokes. Deriving the width from
   * the block-wide aspect keeps the grid correct no matter which digits happen
   * to be showing, and columns that turn out wider than one cell are split
   * below.
   */
  const cellW = cellH * (opts.aspect ?? GLYPH_ASPECT);

  // Split any column wide enough to hold more than one glyph, which happens when
  // a blurred photo bridges neighbouring digits.
  const cells: Box[] = [];
  for (const col of columns) {
    const count = Math.max(1, Math.round(col.box.w / cellW));
    if (count === 1 || col.box.w < cellW * 1.55) {
      cells.push({
        x: col.box.x + col.box.w - cellW,
        y: band.box.y,
        w: cellW,
        h: cellH,
      });
    } else {
      const step = col.box.w / count;
      for (let i = 0; i < count; i++) {
        const right = col.box.x + step * (i + 1);
        cells.push({ x: right - cellW, y: band.box.y, w: cellW, h: cellH });
      }
    }
  }
  cells.sort((a, b) => a.x - b.x);

  /*
   * No shear correction is applied.
   *
   * An earlier version estimated per-row italic/perspective shear by comparing
   * the horizontal centre of mass of ink in the top of the band against the
   * bottom. Measured against the fixture set it made accuracy consistently
   * *worse*: the centre of mass depends on which segments happen to be lit, so a
   * row reading "74" — ink high on the left, low on the right — looks strongly
   * sheared when it is perfectly upright, and the correction then drags the
   * probe windows off the strokes.
   *
   * The probe windows are inset well inside each segment, which already absorbs
   * the tilt a hand-held photo produces; removing the estimate took the angled
   * fixture set from 90% to 100% exact. Genuine off-axis distortion severe
   * enough to matter would need the panel rectified, not a per-row fudge factor.
   *
   * A second attempt measured the slant properly — globally, from the direction
   * of the long near-vertical strokes, which does not depend on which segments
   * happen to be lit — and rectified the whole image before recognition rather
   * than nudging probe windows. It was written because the digits *look* italic
   * in a photograph of the device. Measured, they are not: the correction came
   * out at zero on all four real fixtures, fired only on degraded synthetic ones
   * where it was tracking noise, and cost accuracy everywhere it did fire
   * (angled 100% to 97%, severe 97% to 88%) as well as a third of the runtime.
   * It was deleted. If a future device genuinely does slant, rectify the panel;
   * do not reintroduce this.
   */

  // First pass at unit gain, purely to learn how much ink a lit segment actually
  // carries in this photo. A soft-focus or low-contrast shot lights every
  // segment weakly, and without this normalisation the whole row reads as blank.
  const firstPass = cells.map((cell) =>
    decodeCell(mask, cell, {
      segmentOn: opts.segmentOn,
      segmentOff: opts.segmentOff,
    }),
  );

  const litSamples: number[] = [];
  for (const d of firstPass) {
    for (const c of d.coverage) if (c >= 0.25) litSamples.push(c);
  }
  const litLevel = median(litSamples);
  let gain = 1;
  if (litSamples.length >= 3 && litLevel > 0.2 && litLevel < 0.75) {
    gain = Math.min(2.2, Math.max(1, 0.82 / litLevel));
  }

  const digits =
    gain === 1
      ? firstPass
      : cells.map((cell) =>
          decodeCell(mask, cell, {
            segmentOn: opts.segmentOn,
            segmentOff: opts.segmentOff,
            gain,
          }),
        );

  return { digits, glyphHeight: cellH };
}

export function rowFromDigits(
  band: Band,
  digits: DigitResult[],
  glyphHeight: number,
): RowResult {
  const text = digits.map((d) => d.char).join('').trim();
  const numeric = /^[0-9]+$/.test(text);
  const confidence =
    digits.length === 0 ? 0 : Math.min(...digits.map((d) => d.confidence));
  return {
    kind: 'unknown',
    band: band.box,
    digits,
    text,
    value: numeric ? parseInt(text, 10) : null,
    confidence,
    glyphHeight,
  };
}
