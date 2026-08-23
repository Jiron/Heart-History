/**
 * Renders a synthetic display, runs the recogniser over it, and writes
 * annotated PNGs so the intermediate stages can be inspected by eye.
 *
 *   npm run ocr:debug
 *   npm run ocr:debug -- --sys 122 --dia 79 --pul 98 --preset hard
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

import { recognise } from '../src/ocr/pipeline';
import type { Box, Gray, Mask } from '../src/ocr/types';
import { applyAugmentations, makeRng } from './augment';
import { PRESETS } from './presets';
import { renderDisplay, type DisplaySpec, type Rgba } from './render-display';

const OUT_DIR = join(process.cwd(), 'tools', 'out');

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      out[key] = value;
    }
  }
  return out;
}

export function writePng(img: Rgba, path: string) {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length);
  writeFileSync(path, PNG.sync.write(png));
}

export function grayToRgba(gray: Gray): Rgba {
  const data = new Uint8ClampedArray(gray.w * gray.h * 4);
  for (let i = 0; i < gray.w * gray.h; i++) {
    data[i * 4] = gray.data[i];
    data[i * 4 + 1] = gray.data[i];
    data[i * 4 + 2] = gray.data[i];
    data[i * 4 + 3] = 255;
  }
  return { width: gray.w, height: gray.h, data };
}

export function maskToRgba(mask: Mask): Rgba {
  const data = new Uint8ClampedArray(mask.w * mask.h * 4);
  for (let i = 0; i < mask.w * mask.h; i++) {
    const v = mask.data[i] ? 0 : 255;
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  return { width: mask.w, height: mask.h, data };
}

export function drawBox(img: Rgba, box: Box, colour: [number, number, number], thickness = 2) {
  const x0 = Math.round(box.x);
  const y0 = Math.round(box.y);
  const x1 = Math.round(box.x + box.w);
  const y1 = Math.round(box.y + box.h);
  const put = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
    const p = (y * img.width + x) * 4;
    img.data[p] = colour[0];
    img.data[p + 1] = colour[1];
    img.data[p + 2] = colour[2];
  };
  for (let t = 0; t < thickness; t++) {
    for (let x = x0; x <= x1; x++) {
      put(x, y0 + t);
      put(x, y1 - t);
    }
    for (let y = y0; y <= y1; y++) {
      put(x0 + t, y);
      put(x1 - t, y);
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync(OUT_DIR, { recursive: true });

  const spec: DisplaySpec = {
    sys: args.sys ? Number(args.sys) : 122,
    dia: args.dia ? Number(args.dia) : 79,
    pul: args.pul ? Number(args.pul) : 98,
    header: { mode: 'date', month: 8, day: 23 },
    icons: { memory: true, cuffOk: true, traffic: 1 },
  };

  const presetName = args.preset ?? 'typical';
  const profile = PRESETS[presetName] ?? PRESETS.typical;
  const seed = args.seed ? Number(args.seed) : 12345;

  const base = renderDisplay(spec);
  const photo = applyAugmentations(base, profile, makeRng(seed));

  const result = recognise(
    { width: photo.width, height: photo.height, data: photo.data },
    { debug: true },
  );

  writePng(photo, join(OUT_DIR, 'photo.png'));

  if (result.debug?.gray) {
    writePng(grayToRgba(result.debug.gray), join(OUT_DIR, 'gray.png'));
  }
  if (result.debug?.inkMask) {
    const maskImg = maskToRgba(result.debug.inkMask);
    for (const band of result.debug.bands) drawBox(maskImg, band, [255, 0, 0], 1);
    for (const row of result.rows) {
      for (const d of row.digits) drawBox(maskImg, d.cell, [0, 140, 255], 1);
    }
    writePng(maskImg, join(OUT_DIR, 'mask.png'));
  }

  console.log(`preset=${presetName} seed=${seed}`);
  console.log(`expected  SYS=${spec.sys} DIA=${spec.dia} PUL=${spec.pul}`);
  console.log(
    `got       SYS=${result.systolic} DIA=${result.diastolic} PUL=${result.pulse}`,
  );
  console.log(`ok=${result.ok} elapsed=${result.elapsedMs}ms`);
  console.log(
    `confidence overall=${result.confidence.overall.toFixed(2)} ` +
      `sys=${result.confidence.systolic.toFixed(2)} ` +
      `dia=${result.confidence.diastolic.toFixed(2)} ` +
      `pul=${result.confidence.pulse.toFixed(2)}`,
  );
  console.log(`date=${JSON.stringify(result.detectedDate)}`);
  if (result.debug) {
    console.log(
      `strokeWidth=${result.debug.strokeWidth} working=${result.debug.width}x${result.debug.height} ` +
        `components=${result.debug.components.length} bands=${result.debug.bands.length}`,
    );
  }
  console.log('rows:');
  for (const row of result.rows) {
    console.log(
      `  ${row.kind.padEnd(10)} text="${row.text}" h=${row.glyphHeight.toFixed(0)} ` +
        `conf=${row.confidence.toFixed(2)} digits=${row.digits.length}`,
    );
  }
  if (result.warnings.length) {
    console.log('warnings:');
    for (const w of result.warnings) console.log(`  - ${JSON.stringify(w)}`);
  }
  console.log(`\nwrote PNGs to ${OUT_DIR}`);
}

main();
