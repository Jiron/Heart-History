import { writeFileSync, mkdirSync } from 'node:fs';
import jpeg from 'jpeg-js';
import { renderDisplay } from './render-display';
import { applyAugmentations, makeRng } from './augment';
import { PRESETS } from './presets';
import { recognise } from '../src/ocr/pipeline';

mkdirSync('tools/out', { recursive: true });
const cases = [
  { sys: 128, dia: 84, pul: 72, preset: 'typical' as const, name: 'sample-1' },
  { sys: 107, dia: 78, pul: 98, preset: 'angled' as const, name: 'sample-2' },
];
for (const c of cases) {
  const base = renderDisplay(
    { sys: c.sys, dia: c.dia, pul: c.pul, header: { mode: 'date', month: 8, day: 23 }, icons: { memory: true, cuffOk: true, traffic: 1 } },
    { width: 1500, height: 2000 },
  );
  const photo = applyAugmentations(base, PRESETS[c.preset], makeRng(2026));
  const enc = jpeg.encode({ data: Buffer.from(photo.data.buffer, photo.data.byteOffset, photo.data.length), width: photo.width, height: photo.height }, 90);
  writeFileSync(`tools/out/${c.name}.jpg`, enc.data);
  const r = recognise({ width: photo.width, height: photo.height, data: photo.data });
  console.log(`${c.name}.jpg  expect ${c.sys}/${c.dia}/${c.pul}  node-says ${r.systolic}/${r.diastolic}/${r.pulse} ok=${r.ok}`);
}
