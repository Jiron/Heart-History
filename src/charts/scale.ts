/** Shared scaling helpers for the SVG charts. */

export interface LinearScale {
  (value: number): number;
  domain: [number, number];
  range: [number, number];
  invert(pixel: number): number;
}

export function linearScale(
  domain: [number, number],
  range: [number, number],
): LinearScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;

  const scale = ((value: number) => r0 + ((value - d0) / span) * (r1 - r0)) as LinearScale;
  scale.domain = domain;
  scale.range = range;
  scale.invert = (pixel: number) => d0 + ((pixel - r0) / (r1 - r0 || 1)) * span;
  return scale;
}

/**
 * Round tick values at a human-friendly interval (1, 2, 5, 10, 20, 50 ...).
 *
 * Axis labels are read at a glance, so they should land on numbers a person
 * would choose — 80, 100, 120 — rather than wherever an even division of the
 * data happens to fall.
 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!isFinite(min) || !isFinite(max) || min === max) return [min];
  const rawStep = (max - min) / Math.max(1, count);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalised = rawStep / magnitude;
  const step =
    (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10) * magnitude;

  const first = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = first; v <= max + step * 0.001; v += step) {
    // Guard against binary drift producing values like 99.99999999.
    ticks.push(Math.round(v * 1000) / 1000);
  }
  return ticks;
}

/** Pads a domain outwards to the next round number so marks are not clipped. */
export function padDomain(
  min: number,
  max: number,
  padding = 0.12,
  snap = 10,
): [number, number] {
  if (!isFinite(min) || !isFinite(max)) return [0, 1];
  const span = max - min || snap;
  const lo = Math.floor((min - span * padding) / snap) * snap;
  const hi = Math.ceil((max + span * padding) / snap) * snap;
  return [lo, hi];
}

/**
 * Catmull-Rom to cubic Bézier, for a line that curves through its points.
 *
 * `tension` of 0 gives straight segments. Kept low by default: a heavily
 * smoothed line through blood-pressure readings would invent values between
 * measurements that were never taken.
 */
export function smoothPath(
  points: { x: number; y: number }[],
  tension = 0.2,
): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (tension <= 0) {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  }

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;

    const c1x = p1.x + ((p2.x - p0.x) / 6) * tension * 3;
    const c1y = p1.y + ((p2.y - p0.y) / 6) * tension * 3;
    const c2x = p2.x - ((p3.x - p1.x) / 6) * tension * 3;
    const c2y = p2.y - ((p3.y - p1.y) / 6) * tension * 3;
    path += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return path;
}
