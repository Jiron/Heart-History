/**
 * Magnifies a region of a photo or a debug mask, so it can be looked at.
 *
 * Segment-level bugs are invisible at page scale — whether the upper-right bar
 * of a `9` survived thresholding is a question about twenty pixels. This crops a
 * fraction of an image and scales it up with nearest-neighbour, which keeps the
 * mask's hard edges hard instead of smoothing away the thing being inspected.
 *
 *   npx tsx tools/crop.ts <file> <x> <y> <w> <h> [zoom]
 *
 * Coordinates are fractions of the image, so the same numbers work on a photo
 * and on a mask rendered at a different resolution:
 *
 *   npx tsx tools/crop.ts tools/fixtures/IMG_x.jpg 0.45 0.4 0.4 0.3 2.5
 *   npx tsx tools/crop.ts tools/out/real/IMG_x-mask.png 0.45 0.4 0.4 0.3 2.5
 *
 * Writes tools/out/crop.png.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

interface Rgba {
  width: number;
  height: number;
  data: Uint8Array | Buffer;
}

function load(file: string): Rgba {
  if (file.toLowerCase().endsWith('.png')) {
    const png = PNG.sync.read(readFileSync(file));
    return { width: png.width, height: png.height, data: png.data };
  }
  const decoded = jpeg.decode(readFileSync(file), { useTArray: true, formatAsRGBA: true });
  return { width: decoded.width, height: decoded.height, data: decoded.data };
}

function main() {
  const [file, xs, ys, ws, hs, zoomArg] = process.argv.slice(2);
  if (!file || xs === undefined || ys === undefined || ws === undefined || hs === undefined) {
    console.error('usage: tsx tools/crop.ts <file> <x> <y> <w> <h> [zoom]   (x/y/w/h are 0..1)');
    process.exit(1);
  }

  const source = load(file);
  const x0 = Math.round(Number(xs) * source.width);
  const y0 = Math.round(Number(ys) * source.height);
  const w = Math.max(1, Math.round(Number(ws) * source.width));
  const h = Math.max(1, Math.round(Number(hs) * source.height));
  const zoom = Number(zoomArg ?? '1') || 1;

  const outW = Math.max(1, Math.round(w * zoom));
  const outH = Math.max(1, Math.round(h * zoom));
  const png = new PNG({ width: outW, height: outH });

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const sx = Math.min(source.width - 1, x0 + Math.floor(x / zoom));
      const sy = Math.min(source.height - 1, y0 + Math.floor(y / zoom));
      const s = (sy * source.width + sx) * 4;
      const d = (y * outW + x) * 4;
      png.data[d] = source.data[s];
      png.data[d + 1] = source.data[s + 1];
      png.data[d + 2] = source.data[s + 2];
      png.data[d + 3] = 255;
    }
  }

  const outDir = join(process.cwd(), 'tools', 'out');
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, 'crop.png');
  writeFileSync(out, PNG.sync.write(png));
  console.log(`${source.width}x${source.height} -> ${out} (${outW}x${outH})`);
}

main();
