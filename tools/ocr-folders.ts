/**
 * Grades the current recogniser against the foldered fixture sets.
 * Each folder is named sys-dia-pul, and every photo in it shows that reading.
 *
 *   npx tsx tools/ocr-folders.ts
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { recognise } from '../src/ocr/pipeline';
import { LOAD_VARIANTS, loadAsDeviceWould } from './fixture-photo';

const FIXTURE_DIR = join(process.cwd(), 'tools', 'fixtures');

function fmt(v: number | null | undefined): string {
  return v === null || v === undefined ? '--' : String(v);
}

const folders = readdirSync(FIXTURE_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && /^\d+-\d+-\d+$/.test(d.name))
  .map((d) => d.name);

let accepted = 0;
let correct = 0;
let wrong = 0;
let runs = 0;

for (const folder of folders) {
  const [sys, dia, pul] = folder.split('-').map(Number);
  const dir = join(FIXTURE_DIR, folder);
  console.log(`\n=== ${folder} (expect ${sys}/${dia}/${pul}) ===`);
  for (const file of readdirSync(dir).filter((f) => /\.(jpe?g|png)$/i.test(f))) {
    const path = join(dir, file);
    const got: string[] = [];
    for (const variant of LOAD_VARIANTS) {
      const result = recognise(loadAsDeviceWould(path, variant.options));
      runs++;
      if (result.ok) {
        accepted++;
        const ok = result.systolic === sys && result.diastolic === dia;
        if (ok) correct++;
        else wrong++;
        got.push(`${variant.label}=${fmt(result.systolic)}/${fmt(result.diastolic)}/${fmt(result.pulse)}${ok ? '' : ' WRONG'}`);
      }
    }
    console.log(`  ${file.padEnd(26)} ${got.length ? got.join('  ') : '(all refused)'}`);
  }
}

console.log(`\n  runs ${runs}   accepted ${accepted}   correct ${correct}   WRONG ${wrong}`);
