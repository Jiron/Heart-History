/**
 * Synthetic renderer for the Microlife BP B1 Classic display.
 *
 * This exists so the recogniser can be tested against ground truth. The layout
 * is modelled on the instruction manual's display diagram and the device photos:
 * a gray-green LCD carrying a small header row (date / time / "A"), three rows of
 * right-aligned seven-segment values, and a left-hand icon strip — surrounded by
 * a white body with printed SYS / DIA / PUL labels and three buttons.
 *
 * The point is not photographic fidelity. It is to reproduce the *structural*
 * traps the recogniser has to survive:
 *   - glyphs that are right-aligned in their cell, so a `1` sits far right
 *   - an icon strip that can vertically bridge two value rows
 *   - printed labels outside the panel that must not be read as digits
 *   - rows of two and three digits mixed together
 */

export interface Rgba {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type Header =
  | { mode: 'date'; month: number; day: number }
  | { mode: 'time'; hour: number; minute: number }
  | { mode: 'average' }
  | { mode: 'none' };

export interface DisplaySpec {
  sys: number | null;
  dia: number | null;
  pul: number | null;
  header: Header;
  icons?: {
    memory?: boolean;
    ihb?: boolean;
    cuffOk?: boolean;
    batteryLow?: boolean;
    /** 0 = top arrow … 2 = bottom arrow. */
    traffic?: 0 | 1 | 2 | null;
  };
  /** Renders every segment lit, like the power-on self test. */
  allSegments?: boolean;
  /** Renders "Err" plus a code in the value rows. */
  errorCode?: 1 | 2 | 3;
}

export interface RenderOptions {
  width?: number;
  height?: number;
  backdrop?: [number, number, number];
  body?: [number, number, number];
  panel?: [number, number, number];
  ink?: [number, number, number];
  /** Draw the printed bezel labels and buttons. */
  chrome?: boolean;
  /** Scales the LCD within the body, simulating how close the photo was taken. */
  zoom?: number;
}

const DEFAULTS: Required<RenderOptions> = {
  width: 1200,
  height: 1600,
  backdrop: [28, 28, 32],
  body: [244, 244, 242],
  panel: [138, 143, 132],
  ink: [46, 50, 48],
  chrome: true,
  zoom: 1,
};

// ---------------------------------------------------------------------------
// Minimal rasteriser
// ---------------------------------------------------------------------------

function createImage(w: number, h: number, colour: [number, number, number]): Rgba {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = colour[0];
    data[i * 4 + 1] = colour[1];
    data[i * 4 + 2] = colour[2];
    data[i * 4 + 3] = 255;
  }
  return { width: w, height: h, data };
}

function blend(img: Rgba, x: number, y: number, c: [number, number, number], a: number) {
  if (a <= 0 || x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const p = (y * img.width + x) * 4;
  const inv = 1 - a;
  img.data[p] = img.data[p] * inv + c[0] * a;
  img.data[p + 1] = img.data[p + 1] * inv + c[1] * a;
  img.data[p + 2] = img.data[p + 2] * inv + c[2] * a;
}

type Point = readonly [number, number];

/**
 * Antialiased polygon fill by scanline span accumulation.
 *
 * Four sub-scanlines per pixel row give vertical antialiasing; horizontal
 * antialiasing comes from the fractional coverage of the two end pixels of each
 * span. This is O(rows x edges + area) rather than the O(area x edges x samples)
 * of testing every subpixel for containment, which matters because the device
 * body is a ~60-vertex rounded rectangle covering most of the frame.
 */
const SUB_SCANLINES = 4;

function fillPolygon(img: Rgba, pts: Point[], colour: [number, number, number]) {
  if (pts.length < 3) return;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of pts) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(img.height - 1, Math.ceil(maxY));
  if (y1 < y0) return;

  // Coverage accumulator for one pixel row.
  const coverage = new Float32Array(img.width);
  const crossings: number[] = [];
  const weight = 1 / SUB_SCANLINES;

  for (let y = y0; y <= y1; y++) {
    coverage.fill(0);
    let touched = false;

    for (let s = 0; s < SUB_SCANLINES; s++) {
      const sy = y + (s + 0.5) / SUB_SCANLINES;
      crossings.length = 0;

      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if (yi > sy !== yj > sy) {
          crossings.push(((xj - xi) * (sy - yi)) / (yj - yi) + xi);
        }
      }
      if (crossings.length < 2) continue;
      crossings.sort((a, b) => a - b);

      for (let k = 0; k + 1 < crossings.length; k += 2) {
        const spanStart = Math.max(0, crossings[k]);
        const spanEnd = Math.min(img.width, crossings[k + 1]);
        if (spanEnd <= spanStart) continue;
        touched = true;

        const first = Math.floor(spanStart);
        const last = Math.ceil(spanEnd) - 1;
        if (first === last) {
          coverage[first] += (spanEnd - spanStart) * weight;
          continue;
        }
        coverage[first] += (first + 1 - spanStart) * weight;
        for (let x = first + 1; x < last; x++) coverage[x] += weight;
        coverage[last] += (spanEnd - last) * weight;
      }
    }

    if (!touched) continue;
    for (let x = 0; x < img.width; x++) {
      const a = coverage[x];
      if (a > 0.002) blend(img, x, y, colour, a > 1 ? 1 : a);
    }
  }
}

function fillRect(
  img: Rgba,
  x: number,
  y: number,
  w: number,
  h: number,
  colour: [number, number, number],
) {
  fillPolygon(
    img,
    [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ],
    colour,
  );
}

function fillRoundRect(
  img: Rgba,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  colour: [number, number, number],
) {
  const radius = Math.min(r, w / 2, h / 2);
  const pts: Point[] = [];
  const corners: [number, number, number, number][] = [
    [x + w - radius, y + radius, -90, 0],
    [x + w - radius, y + h - radius, 0, 90],
    [x + radius, y + h - radius, 90, 180],
    [x + radius, y + radius, 180, 270],
  ];
  for (const [cx, cy, a0, a1] of corners) {
    for (let a = a0; a <= a1; a += 6) {
      const rad = (a * Math.PI) / 180;
      pts.push([cx + Math.cos(rad) * radius, cy + Math.sin(rad) * radius]);
    }
  }
  fillPolygon(img, pts, colour);
}

function strokeRoundRect(
  img: Rgba,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  thickness: number,
  colour: [number, number, number],
  fillWith: [number, number, number],
) {
  fillRoundRect(img, x, y, w, h, r, colour);
  fillRoundRect(
    img,
    x + thickness,
    y + thickness,
    w - thickness * 2,
    h - thickness * 2,
    Math.max(0, r - thickness),
    fillWith,
  );
}

function fillEllipse(
  img: Rgba,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  colour: [number, number, number],
) {
  const pts: Point[] = [];
  for (let a = 0; a < 360; a += 6) {
    const rad = (a * Math.PI) / 180;
    pts.push([cx + Math.cos(rad) * rx, cy + Math.sin(rad) * ry]);
  }
  fillPolygon(img, pts, colour);
}

// ---------------------------------------------------------------------------
// Seven-segment glyphs
// ---------------------------------------------------------------------------

/** Cell width as a fraction of cell height, matching the device's proportions. */
export const CELL_ASPECT = 0.62;
/** Stroke thickness as a fraction of cell height. */
export const STROKE_RATIO = 0.155;

const SEGMENT_BITS: Record<string, number> = {
  '0': 0b0111111,
  '1': 0b0000110,
  '2': 0b1011011,
  '3': 0b1001111,
  '4': 0b1100110,
  '5': 0b1101101,
  '6': 0b1111101,
  '7': 0b0000111,
  '8': 0b1111111,
  '9': 0b1101111,
  A: 0b1110111,
  E: 0b1111001,
  r: 0b1010000,
  '-': 0b1000000,
  ' ': 0,
};

/** Draws one glyph into the cell whose top-left corner is (x, y). */
export function drawGlyph(
  img: Rgba,
  char: string,
  x: number,
  y: number,
  h: number,
  colour: [number, number, number],
  forceAll = false,
) {
  const bits = forceAll ? 0b1111111 : (SEGMENT_BITS[char] ?? 0);
  if (bits === 0) return;
  const w = h * CELL_ASPECT;
  const t = h * STROKE_RATIO;
  const half = t / 2;
  const inset = t * 0.6;
  const gap = t * 0.1;

  const hBar = (cy: number) =>
    [
      [x + inset, y + cy],
      [x + inset + half, y + cy - half],
      [x + w - inset - half, y + cy - half],
      [x + w - inset, y + cy],
      [x + w - inset - half, y + cy + half],
      [x + inset + half, y + cy + half],
    ] as Point[];

  const vBar = (cx: number, y0: number, y1: number) =>
    [
      [x + cx, y + y0],
      [x + cx + half, y + y0 + half],
      [x + cx + half, y + y1 - half],
      [x + cx, y + y1],
      [x + cx - half, y + y1 - half],
      [x + cx - half, y + y0 + half],
    ] as Point[];

  if (bits & 0b0000001) fillPolygon(img, hBar(half), colour); // a
  if (bits & 0b1000000) fillPolygon(img, hBar(h / 2), colour); // g
  if (bits & 0b0001000) fillPolygon(img, hBar(h - half), colour); // d
  if (bits & 0b0100000) fillPolygon(img, vBar(half, inset, h / 2 - gap), colour); // f
  if (bits & 0b0000010) fillPolygon(img, vBar(w - half, inset, h / 2 - gap), colour); // b
  if (bits & 0b0010000) fillPolygon(img, vBar(half, h / 2 + gap, h - inset), colour); // e
  if (bits & 0b0000100) fillPolygon(img, vBar(w - half, h / 2 + gap, h - inset), colour); // c
}

/**
 * Draws a string right-aligned so its rightmost cell ends at `right`.
 * The device pads with blanks on the left, never with leading zeros.
 */
function drawRightAligned(
  img: Rgba,
  text: string,
  right: number,
  y: number,
  h: number,
  colour: [number, number, number],
  forceAll = false,
) {
  const w = h * CELL_ASPECT;
  const pitch = w * 1.18;
  for (let i = text.length - 1, k = 0; i >= 0; i--, k++) {
    const cellRight = right - k * pitch;
    drawGlyph(img, text[i], cellRight - w, y, h, colour, forceAll);
  }
}

// ---------------------------------------------------------------------------
// Full device
// ---------------------------------------------------------------------------

export function renderDisplay(spec: DisplaySpec, options: RenderOptions = {}): Rgba {
  const o = { ...DEFAULTS, ...options };
  const img = createImage(o.width, o.height, o.backdrop);

  // Device body.
  const bodyW = o.width * 0.9;
  const bodyH = o.height * 0.86;
  const bodyX = (o.width - bodyW) / 2;
  const bodyY = (o.height - bodyH) / 2;
  fillRoundRect(img, bodyX, bodyY, bodyW, bodyH, bodyW * 0.06, o.body);

  // Brand mark: a few blocky strokes standing in for the "microlife" wordmark.
  const logoY = bodyY + bodyH * 0.05;
  for (let i = 0; i < 9; i++) {
    fillRect(
      img,
      bodyX + bodyW * 0.3 + i * bodyW * 0.045,
      logoY,
      bodyW * 0.025,
      bodyH * 0.028,
      [70, 70, 74],
    );
  }

  // LCD panel.
  const panelW = bodyW * 0.74 * o.zoom;
  const panelH = bodyH * 0.5 * o.zoom;
  const panelX = bodyX + bodyW * 0.1;
  const panelY = bodyY + bodyH * 0.14;
  fillRoundRect(img, panelX, panelY, panelW, panelH, panelW * 0.03, o.panel);

  const ink = o.ink;
  const contentX = panelX + panelW * 0.05;
  const contentW = panelW * 0.9;
  const valueRight = panelX + panelW * 0.9;

  // Header row: memory mark, calendar mark, then the date / time / average.
  const headerH = panelH * 0.1;
  const headerY = panelY + panelH * 0.04;
  if (spec.header.mode !== 'none' || spec.allSegments) {
    if (spec.icons?.memory || spec.allSegments) {
      strokeRoundRect(
        img,
        contentX + contentW * 0.28,
        headerY,
        headerH * 0.95,
        headerH,
        headerH * 0.45,
        headerH * 0.12,
        ink,
        o.panel,
      );
    }
    let text = '';
    if (spec.allSegments) text = '88:88';
    else if (spec.header.mode === 'date') text = `${spec.header.month}-${spec.header.day}`;
    else if (spec.header.mode === 'time') {
      text = `${spec.header.hour}:${String(spec.header.minute).padStart(2, '0')}`;
    } else if (spec.header.mode === 'average') text = 'A';

    // A colon is two dots, not a segment glyph, so it is drawn separately.
    const parts = text.split(':');
    if (parts.length === 2) {
      drawRightAligned(img, parts[1], valueRight, headerY, headerH, ink, spec.allSegments);
      const colonX = valueRight - headerH * CELL_ASPECT * 1.18 * 2 - headerH * 0.14;
      fillEllipse(img, colonX, headerY + headerH * 0.33, headerH * 0.07, headerH * 0.07, ink);
      fillEllipse(img, colonX, headerY + headerH * 0.67, headerH * 0.07, headerH * 0.07, ink);
      drawRightAligned(
        img,
        parts[0],
        colonX - headerH * 0.14,
        headerY,
        headerH,
        ink,
        spec.allSegments,
      );
    } else {
      drawRightAligned(img, text, valueRight, headerY, headerH, ink, spec.allSegments);
    }
  }

  // Three value rows.
  const rowH = panelH * 0.235;
  const rowTops = [panelY + panelH * 0.18, panelY + panelH * 0.44, panelY + panelH * 0.70];
  const pulseScale = 0.88;

  const texts: string[] = spec.errorCode
    ? ['Err', String(spec.errorCode), '']
    : [
        spec.allSegments ? '888' : spec.sys === null ? '' : String(spec.sys),
        spec.allSegments ? '888' : spec.dia === null ? '' : String(spec.dia),
        spec.allSegments ? '888' : spec.pul === null ? '' : String(spec.pul),
      ];

  for (let i = 0; i < 3; i++) {
    if (!texts[i]) continue;
    const h = i === 2 ? rowH * pulseScale : rowH;
    const y = i === 2 ? rowTops[i] + rowH * (1 - pulseScale) : rowTops[i];
    drawRightAligned(img, texts[i], valueRight, y, h, ink, spec.allSegments && !spec.errorCode);
  }

  // Left-hand icon strip.
  const iconX = panelX + panelW * 0.07;
  const barX = panelX + panelW * 0.025;
  const barTop = panelY + panelH * 0.2;
  const barH = panelH * 0.42;
  const barW = panelW * 0.028;

  // Traffic-light classification bar: solid, hatched, hollow.
  fillRect(img, barX, barTop, barW, barH * 0.3, ink);
  for (let i = 0; i < 5; i++) {
    fillRect(img, barX, barTop + barH * (0.35 + i * 0.026), barW, barH * 0.013, ink);
  }
  strokeRoundRect(
    img,
    barX,
    barTop + barH * 0.7,
    barW,
    barH * 0.3,
    0,
    barW * 0.18,
    ink,
    o.panel,
  );

  const traffic = spec.allSegments ? null : spec.icons?.traffic;
  const arrowYs = [barTop + barH * 0.15, barTop + barH * 0.5, barTop + barH * 0.85];
  for (let i = 0; i < 3; i++) {
    if (!spec.allSegments && traffic !== i) continue;
    const ax = barX + barW * 2.1;
    const ay = arrowYs[i];
    const s = panelH * 0.035;
    fillPolygon(
      img,
      [
        [ax + s, ay - s * 0.7],
        [ax + s, ay + s * 0.7],
        [ax, ay],
      ],
      ink,
    );
  }

  const iconR = panelH * 0.045;
  if (spec.icons?.ihb || spec.allSegments) {
    strokeRoundRect(
      img,
      iconX + panelW * 0.03,
      panelY + panelH * 0.42,
      iconR * 2.2,
      iconR * 1.8,
      iconR * 0.5,
      iconR * 0.22,
      ink,
      o.panel,
    );
  }
  if (spec.icons?.cuffOk || spec.allSegments) {
    const cy = panelY + panelH * 0.6;
    fillEllipse(img, iconX + panelW * 0.055, cy, iconR, iconR, ink);
    fillEllipse(img, iconX + panelW * 0.055, cy, iconR * 0.74, iconR * 0.74, o.panel);
  }
  if (spec.icons?.batteryLow || spec.allSegments) {
    strokeRoundRect(
      img,
      iconX + panelW * 0.02,
      panelY + panelH * 0.78,
      iconR * 2.4,
      iconR * 1.2,
      iconR * 0.2,
      iconR * 0.2,
      ink,
      o.panel,
    );
  }

  if (o.chrome) {
    // Printed bezel labels to the right of the panel. These are deliberately
    // close in y to the value rows: the recogniser must reject them by size.
    const labelX = panelX + panelW * 1.04;
    const labelInk: [number, number, number] = [58, 58, 62];
    for (let i = 0; i < 3; i++) {
      const y = rowTops[i] + rowH * 0.18;
      for (let k = 0; k < 3; k++) {
        fillRect(img, labelX + k * bodyW * 0.045, y, bodyW * 0.03, rowH * 0.22, labelInk);
      }
      for (let k = 0; k < 4; k++) {
        fillRect(
          img,
          labelX + k * bodyW * 0.028,
          y + rowH * 0.32,
          bodyW * 0.018,
          rowH * 0.12,
          labelInk,
        );
      }
    }

    // Three buttons along the bottom.
    const btnY = bodyY + bodyH * 0.78;
    const btnH = bodyH * 0.11;
    const btnW = bodyW * 0.26;
    for (let i = 0; i < 3; i++) {
      const bx = bodyX + bodyW * 0.1 + i * (btnW + bodyW * 0.02);
      strokeRoundRect(img, bx, btnY, btnW, btnH, btnH * 0.25, bodyW * 0.004, [90, 90, 94], o.body);
      fillEllipse(
        img,
        bx + btnW / 2,
        btnY + btnH / 2,
        btnH * 0.24,
        btnH * 0.24,
        [120, 120, 124],
      );
    }
  }

  return img;
}
