import type { Box, Component, Mask } from './types';

export interface LabelResult {
  /** Per-pixel component id, or 0 for background. Ids are 1-based and contiguous. */
  labels: Int32Array;
  components: Component[];
}

/**
 * 8-connected component labelling via an explicit stack flood fill.
 *
 * A recursive implementation blows the JS stack on large blobs, and a two-pass
 * union-find costs an extra full sweep; an iterative flood fill with a reusable
 * Int32Array stack is the cheapest thing that survives a megapixel image on
 * Hermes.
 */
export function connectedComponents(mask: Mask): LabelResult {
  const { w, h, data } = mask;
  const labels = new Int32Array(w * h);
  const components: Component[] = [];
  const stack = new Int32Array(w * h);

  let next = 1;
  for (let start = 0; start < data.length; start++) {
    if (!data[start] || labels[start]) continue;

    const id = next++;
    let sp = 0;
    stack[sp++] = start;
    labels[start] = id;

    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    let area = 0;
    let sumX = 0;
    let sumY = 0;

    while (sp > 0) {
      const idx = stack[--sp];
      const x = idx % w;
      const y = (idx / w) | 0;

      area++;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      const x0 = x > 0 ? x - 1 : 0;
      const x1 = x < w - 1 ? x + 1 : w - 1;
      const y0 = y > 0 ? y - 1 : 0;
      const y1 = y < h - 1 ? y + 1 : h - 1;
      for (let ny = y0; ny <= y1; ny++) {
        const row = ny * w;
        for (let nx = x0; nx <= x1; nx++) {
          const nIdx = row + nx;
          if (data[nIdx] && !labels[nIdx]) {
            labels[nIdx] = id;
            stack[sp++] = nIdx;
          }
        }
      }
    }

    const box: Box = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    components.push({
      id,
      box,
      area,
      fill: area / (box.w * box.h),
      cx: sumX / area,
      cy: sumY / area,
    });
  }

  return { labels, components };
}

export interface SegmentFilterOptions {
  imageWidth: number;
  imageHeight: number;
}

/**
 * Drop only what cannot possibly be part of a glyph: sensor speckle and
 * structures spanning most of the frame.
 *
 * This is deliberately permissive. An earlier version sized the threshold from a
 * single global stroke width, which is dominated by the large SYS/DIA/PUL
 * glyphs — and that silently deleted the much thinner date row, because a header
 * stroke has roughly a sixth of the area of a value stroke. Scale-dependent
 * judgements are therefore deferred to the layout stage, where each row's own
 * geometry is known.
 */
export function filterSegmentLike(
  components: Component[],
  opts: SegmentFilterOptions,
): Component[] {
  const { imageWidth, imageHeight } = opts;
  const maxW = imageWidth * 0.6;
  const maxH = imageHeight * 0.6;

  return components.filter((c) => {
    const { w, h } = c.box;
    if (c.area < 4) return false;
    if (w > maxW || h > maxH) return false;
    // A grainy, low-contrast photo can weld noise, glare edges and glyphs into
    // one sprawling web that spans the whole display. It passes the size test
    // because neither dimension alone is extreme, but its bounding box is mostly
    // empty — no real glyph, or even a row of merged glyphs, is that hollow.
    if (w > imageWidth * 0.45 && h > imageHeight * 0.3 && c.fill < 0.25) return false;
    return true;
  });
}

/**
 * Does this column of ink look like a seven-segment glyph, rather than a printed
 * label, a button outline or an icon?
 *
 * Three independent signals, each of which rules out a specific piece of the
 * device's chrome:
 *   - *aspect*: a glyph is never wider than it is tall, which discards the wide
 *     rounded-rectangle buttons along the bottom of the unit.
 *   - *solidity*: a glyph is strokes around a hollow centre, never a filled
 *     block, which discards the printed wordmark and the SYS/DIA/PUL labels.
 *   - *height*: a glyph fills its row, which discards small icons that merely
 *     happen to sit at the same height as a value.
 *
 * The narrow-glyph escape hatch matters: a `1` is two vertical strokes with a
 * hairline gap, so it is both very narrow *and* nearly solid, and would fail the
 * solidity test that every other digit passes.
 */
export function isGlyphLike(box: Box, fill: number, bandHeight: number): boolean {
  const aspect = box.w / Math.max(1, box.h);
  // A digit always fills most of its row. The shortest possible glyph is a `4`
  // or a `1`, which lack the top and bottom bars and still span ~0.81 of the
  // cell; printed text beside the display comes in well under that. The margin
  // between 0.81 and this threshold is what absorbs blur and perspective.
  if (box.h < bandHeight * 0.62) return false;
  if (aspect > 1.15) return false;
  // A `1` (or a lone `-`) is narrow enough that solidity says nothing useful.
  if (aspect > 0.3 && fill > 0.82) return false;
  if (fill < 0.1) return false;
  return true;
}

/** Union of every component's bounding box, or null when the list is empty. */
export function boundsOf(components: Component[]): Box | null {
  if (components.length === 0) return null;
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

/** Rasterise a set of components back into a fresh mask. */
export function rasterizeComponents(
  mask: Mask,
  labels: Int32Array,
  components: Component[],
): Mask {
  const keep = new Set<number>();
  for (const c of components) keep.add(c.id);

  const out = new Uint8Array(mask.w * mask.h);
  for (let i = 0; i < out.length; i++) {
    if (mask.data[i] && keep.has(labels[i])) out[i] = 1;
  }
  return { w: mask.w, h: mask.h, data: out };
}
