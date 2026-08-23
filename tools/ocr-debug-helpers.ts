import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import type { Box, Gray, Mask } from '../src/ocr/types';
import type { Rgba } from './render-display';

export function writePng(img: Rgba, path: string) {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length);
  writeFileSync(path, PNG.sync.write(png));
}

export function grayToRgba(gray: Gray): Rgba {
  const data = new Uint8ClampedArray(gray.w * gray.h * 4);
  for (let i = 0; i < gray.w * gray.h; i++) {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = gray.data[i];
    data[i * 4 + 3] = 255;
  }
  return { width: gray.w, height: gray.h, data };
}

export function maskToRgba(mask: Mask): Rgba {
  const data = new Uint8ClampedArray(mask.w * mask.h * 4);
  for (let i = 0; i < mask.w * mask.h; i++) {
    const v = mask.data[i] ? 0 : 255;
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  return { width: mask.w, height: mask.h, data };
}

export function drawBox(img: Rgba, box: Box, colour: [number, number, number], thickness = 2) {
  const x0 = Math.round(box.x), y0 = Math.round(box.y);
  const x1 = Math.round(box.x + box.w), y1 = Math.round(box.y + box.h);
  const put = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
    const p = (y * img.width + x) * 4;
    img.data[p] = colour[0]; img.data[p + 1] = colour[1]; img.data[p + 2] = colour[2];
  };
  for (let t = 0; t < thickness; t++) {
    for (let x = x0; x <= x1; x++) { put(x, y0 + t); put(x, y1 - t); }
    for (let y = y0; y <= y1; y++) { put(x0 + t, y); put(x1 - t, y); }
  }
}
