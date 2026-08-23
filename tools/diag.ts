import { connectedComponents, filterSegmentLike, rasterizeComponents } from '../src/ocr/components';
import { bandComponents, columnsOf, glyphColumns, toCandidate, selectValueBlock, type Band, type RowCandidate } from '../src/ocr/layout';
import { adaptiveThreshold, boxBlur, downscale, estimateStrokeWidth, grayFromRGBA, median, unionBox } from '../src/ocr/raster';
import { renderDisplay, type DisplaySpec } from './render-display';
import { applyAugmentations, makeRng } from './augment';
import { PRESETS } from './presets';

const a = Object.fromEntries(process.argv.slice(2).reduce<string[][]>((acc, v, i, arr) => {
  if (v.startsWith('--')) acc.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
  return acc;
}, []));

const spec: DisplaySpec = {
  sys: Number(a.sys ?? 111), dia: Number(a.dia ?? 71), pul: Number(a.pul ?? 61),
  header: a.header === 'average' ? { mode: 'average' } : { mode: 'date', month: 8, day: 23 },
  icons: { memory: true, cuffOk: true, traffic: 1 },
};
const base = renderDisplay(spec, { zoom: Number(a.zoom ?? 1) });
const photo = applyAugmentations(base, PRESETS[a.preset ?? 'clean'], makeRng(Number(a.seed ?? 7)));

const gray = grayFromRGBA(photo.data, photo.width, photo.height);
const { image: work } = downscale(gray, 1000);
const sm = boxBlur(work, 1);
const probe = adaptiveThreshold(sm, { window: Math.max(15, Math.round(Math.min(work.w, work.h) / 8) | 1), threshold: 0.14, minContrast: 10 });
const sw = estimateStrokeWidth(probe);
const win = Math.max(15, Math.round(sw * 2.6) | 1);
console.log(`strokeWidth=${sw} window=${win}`);
const ink = adaptiveThreshold(sm, { window: win, threshold: 0.14, minContrast: 10 });
const { labels, components } = connectedComponents(ink);
const kept = filterSegmentLike(components, { imageWidth: work.w, imageHeight: work.h });
const bands = bandComponents(kept, sw);

console.log('\nBANDS:');
bands.forEach((b, i) => {
  const g = glyphColumns(b, columnsOf(b));
  console.log(`  [${i}] y=${b.box.y.toFixed(0)}..${(b.box.y+b.box.h).toFixed(0)} h=${b.box.h.toFixed(0)} glyphCols=${g.length} xs=[${g.map(c=>`${c.box.x.toFixed(0)}-${(c.box.x+c.box.w).toFixed(0)}`).join(' ')}]`);
});

const candidates: RowCandidate[] = [];
bands.forEach((band, index) => {
  const c = toCandidate(band, glyphColumns(band, columnsOf(band)), 3, [index]);
  if (c) candidates.push(c);
});
for (let i = 0; i + 1 < bands.length; i++) {
  const x = bands[i], y = bands[i + 1];
  const gap = y.box.y - (x.box.y + x.box.h);
  if (gap > Math.max(x.box.h, y.box.h) * 0.6) { console.log(`  (pair ${i},${i+1} skipped: gap=${gap.toFixed(0)} > ${(Math.max(x.box.h,y.box.h)*0.6).toFixed(0)})`); continue; }
  const merged: Band = { box: unionBox(x.box, y.box), components: [...x.components, ...y.components] };
  const c = toCandidate(merged, glyphColumns(merged, columnsOf(merged)), 3, [i, i + 1]);
  if (c) candidates.push(c); else console.log(`  (pair ${i},${i+1} produced no candidate)`);
}

console.log('\nCANDIDATES:');
for (const c of candidates) console.log(`  src=[${c.sources}] y=${c.band.box.y.toFixed(0)} h=${c.height.toFixed(0)} right=${c.right.toFixed(0)} cols=${c.columns.length}`);
const block = selectValueBlock(candidates);
console.log('\nBLOCK:', block.map(r => `src=[${r.sources}] y=${r.band.box.y.toFixed(0)} h=${r.height.toFixed(0)} right=${r.right.toFixed(0)} cols=${r.columns.length}`));
