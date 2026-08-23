/**
 * Grades the recogniser against real photographs.
 *
 * The synthetic benchmark (`ocr:bench`) measures the failure modes the renderer
 * knows how to draw. This one measures the ones it does not.
 *
 *   npm run ocr:real
 *   npm run ocr:real -- --verbose        per-variant detail
 *   npm run ocr:real -- --write-debug    annotated PNGs into tools/out/real/
 *
 * ## Why every photo is read several times
 *
 * A phone does not hand the recogniser the file on disk. It hands it a resized,
 * re-encoded copy produced by a native image pipeline whose resampling filter and
 * JPEG encoder this benchmark cannot reproduce exactly.
 *
 * That is not a detail. Measured on these photographs, a difference of a grey
 * level or two in preprocessing is enough to flip a marginal segment and turn
 * `79` into `75` — same algorithm, same photo, different answer. A benchmark that
 * fixed one preprocessing chain and reported its score would be measuring that
 * chain's luck as much as the recogniser, and it would disagree with the phone.
 *
 * So each photo is read through several plausible chains and what gets reported
 * is the distribution: how often the reading was accepted at all, and — the
 * number that actually matters — whether any chain accepted a value that was
 * wrong. The accept rate is a quality measure and is allowed to be imperfect.
 * A wrong acceptance is a defect and must stay at zero.
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { recognise } from '../src/ocr/pipeline';
import type { OcrResult } from '../src/ocr/types';
import { LOAD_VARIANTS, loadAsDeviceWould, type PhotoExpectation } from './fixture-photo';
import { drawBox, grayToRgba, maskToRgba, writePng } from './ocr-debug-helpers';

const FIXTURE_DIR = join(process.cwd(), 'tools', 'fixtures');
const OUT_DIR = join(process.cwd(), 'tools', 'out', 'real');

function fmt(v: number | null | undefined): string {
  return v === null || v === undefined ? '--' : String(v);
}

function main() {
  const argv = process.argv.slice(2);
  const verbose = argv.includes('--verbose');
  const writeDebug = argv.includes('--write-debug');

  const manifestPath = join(FIXTURE_DIR, 'expected.json');
  if (!existsSync(manifestPath)) {
    console.error(`No ${manifestPath}. Nothing to grade.`);
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    photos: PhotoExpectation[];
  };

  if (writeDebug) mkdirSync(OUT_DIR, { recursive: true });

  let wrongAcceptances = 0;
  let acceptedTotal = 0;
  let runsTotal = 0;
  const notes: string[] = [];

  console.log('');
  console.log('  photo                           expected      accepted  readings');
  console.log(`  ${'-'.repeat(76)}`);

  for (const expected of manifest.photos) {
    const path = join(FIXTURE_DIR, expected.file);
    if (!existsSync(path)) {
      console.log(`  ${expected.file.slice(0, 30).padEnd(30)}  MISSING`);
      continue;
    }

    const shouldAccept = expected.accept !== false;
    const want = shouldAccept
      ? `${fmt(expected.sys)}/${fmt(expected.dia)}/${fmt(expected.pul)}`
      : 'refuse';

    const seen = new Map<string, number>();
    let accepted = 0;

    for (const variant of LOAD_VARIANTS) {
      const isPrimary = variant.label === LOAD_VARIANTS[0].label;
      const image = loadAsDeviceWould(path, variant.options);
      const result: OcrResult = recognise(image, { debug: writeDebug && isPrimary });
      runsTotal++;

      const got = `${fmt(result.systolic)}/${fmt(result.diastolic)}/${fmt(result.pulse)}`;
      if (result.ok) {
        accepted++;
        acceptedTotal++;
        seen.set(
          `${fmt(result.systolic)}/${fmt(result.diastolic)}`,
          (seen.get(`${fmt(result.systolic)}/${fmt(result.diastolic)}`) ?? 0) + 1,
        );

        const bpRight =
          shouldAccept &&
          result.systolic === expected.sys &&
          result.diastolic === expected.dia;
        if (!bpRight) {
          wrongAcceptances++;
          notes.push(`${expected.file} [${variant.label}]: ACCEPTED ${got}, truth is ${want}`);
        } else if (result.pulse !== null && result.pulse !== expected.pul) {
          wrongAcceptances++;
          notes.push(
            `${expected.file} [${variant.label}]: ACCEPTED pulse ${result.pulse}, truth is ${fmt(expected.pul)}`,
          );
        }
      }

      if (verbose) {
        console.log(
          `      ${variant.label.padEnd(10)} ${got.padEnd(12)} ok=${String(result.ok).padEnd(5)} ` +
            `conf=${result.confidence.overall.toFixed(2)} ${String(result.elapsedMs).padStart(4)}ms` +
            (result.warnings.length
              ? `  [${result.warnings.map((w) => w.code).join(', ')}]`
              : ''),
        );
      }

      if (writeDebug && isPrimary && result.debug?.inkMask) {
        const base = expected.file.replace(/\.[^.]+$/, '');
        const maskImg = maskToRgba(result.debug.inkMask);
        for (const band of result.debug.bands) drawBox(maskImg, band, [255, 0, 0], 1);
        for (const row of result.rows) {
          for (const d of row.digits) drawBox(maskImg, d.cell, [0, 140, 255], 1);
        }
        writePng(maskImg, join(OUT_DIR, `${base}-mask.png`));
        if (result.debug.gray) {
          writePng(grayToRgba(result.debug.gray), join(OUT_DIR, `${base}-gray.png`));
        }
      }
    }

    const readings =
      seen.size === 0
        ? '(none accepted)'
        : [...seen.entries()].map(([k, n]) => (n > 1 ? `${k} x${n}` : k)).join(', ');

    console.log(
      `  ${expected.file.slice(0, 30).padEnd(30)}  ${want.padEnd(12)}  ` +
        `${accepted}/${LOAD_VARIANTS.length}       ${readings}`,
    );
  }

  console.log(`  ${'-'.repeat(76)}`);
  console.log('');
  console.log(`  preprocessing chains per photo   ${LOAD_VARIANTS.length}`);
  console.log(`  readings accepted                ${acceptedTotal}/${runsTotal}`);
  console.log(`  wrongly accepted                 ${wrongAcceptances}      <- must stay 0`);

  if (notes.length) {
    console.log('');
    console.log('  wrong acceptances:');
    for (const n of notes) console.log(`    - ${n}`);
  }
  console.log('');
  if (writeDebug) console.log(`  annotated PNGs in ${OUT_DIR}\n`);

  // Accept rate is a quality measure. A wrong number the app would have saved is
  // a defect, and the only thing that fails this run.
  process.exit(wrongAcceptances > 0 ? 1 : 0);
}

main();
