/**
 * Accuracy benchmark for the seven-segment recogniser.
 *
 *   npm run ocr:bench
 *   npm run ocr:bench -- --preset dim --verbose
 *
 * The metric that matters most is **false positives**: a reading the app would
 * have accepted (`ok: true`) that is actually wrong. A health log that silently
 * records 70/40 instead of 122/79 is worse than one that asks for another photo,
 * so that column is expected to stay at zero even when the read rate drops.
 */

import { recognise } from '../src/ocr/pipeline';
import { applyAugmentations, makeRng } from './augment';
import { PRESETS } from './presets';
import { renderDisplay, type DisplaySpec } from './render-display';

interface Case {
  sys: number;
  dia: number;
  pul: number;
}

/** Chosen to cover every digit 0-9 in every position, plus the awkward shapes. */
const CASES: Case[] = [
  { sys: 122, dia: 79, pul: 98 },
  { sys: 107, dia: 78, pul: 98 },
  { sys: 117, dia: 81, pul: 72 },
  { sys: 135, dia: 88, pul: 64 },
  { sys: 90, dia: 60, pul: 55 },
  { sys: 148, dia: 93, pul: 101 },
  { sys: 160, dia: 100, pul: 88 },
  { sys: 111, dia: 71, pul: 61 },
  { sys: 128, dia: 80, pul: 68 },
  { sys: 145, dia: 95, pul: 77 },
  { sys: 99, dia: 66, pul: 59 },
  { sys: 173, dia: 104, pul: 83 },
  { sys: 154, dia: 92, pul: 70 },
  { sys: 138, dia: 85, pul: 106 },
  { sys: 100, dia: 70, pul: 100 },
  { sys: 189, dia: 110, pul: 47 },
];

const HEADERS: DisplaySpec['header'][] = [
  { mode: 'date', month: 8, day: 23 },
  { mode: 'time', hour: 8, minute: 15 },
  { mode: 'date', month: 12, day: 4 },
  { mode: 'none' },
];

interface Tally {
  total: number;
  exact: number;
  sysDia: number;
  sysOk: number;
  diaOk: number;
  pulOk: number;
  accepted: number;
  falsePositive: number;
  dateOk: number;
  dateAttempted: number;
  elapsed: number;
}

function newTally(): Tally {
  return {
    total: 0,
    exact: 0,
    sysDia: 0,
    sysOk: 0,
    diaOk: 0,
    pulOk: 0,
    accepted: 0,
    falsePositive: 0,
    dateOk: 0,
    dateAttempted: 0,
    elapsed: 0,
  };
}

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

function main() {
  const args = parseArgs(process.argv.slice(2));
  const verbose = args.verbose === 'true';
  const only = args.preset;
  const seedCount = args.seeds ? Number(args.seeds) : 2;

  const presetNames = only ? [only] : Object.keys(PRESETS);
  const tallies = new Map<string, Tally>();
  const failures: string[] = [];

  for (const presetName of presetNames) {
    const profile = PRESETS[presetName];
    if (!profile) throw new Error(`unknown preset: ${presetName}`);
    const tally = newTally();
    tallies.set(presetName, tally);

    for (let ci = 0; ci < CASES.length; ci++) {
      const c = CASES[ci];
      for (let s = 0; s < seedCount; s++) {
        const seed = 1000 + ci * 17 + s * 977;
        const header = HEADERS[(ci + s) % HEADERS.length];
        const spec: DisplaySpec = {
          sys: c.sys,
          dia: c.dia,
          pul: c.pul,
          header,
          icons: {
            memory: (ci + s) % 2 === 0,
            cuffOk: (ci + s) % 3 === 0,
            traffic: ((ci % 3) as 0 | 1 | 2),
          },
        };

        const base = renderDisplay(spec, { zoom: 0.92 + ((ci % 3) * 0.06) });
        const photo = applyAugmentations(base, profile, makeRng(seed));
        const t0 = Date.now();
        const r = recognise({ width: photo.width, height: photo.height, data: photo.data });
        tally.elapsed += Date.now() - t0;

        tally.total++;
        const sysOk = r.systolic === c.sys;
        const diaOk = r.diastolic === c.dia;
        const pulOk = r.pulse === c.pul;
        if (sysOk) tally.sysOk++;
        if (diaOk) tally.diaOk++;
        if (pulOk) tally.pulOk++;
        if (sysOk && diaOk) tally.sysDia++;
        if (sysOk && diaOk && pulOk) tally.exact++;
        if (r.ok) {
          tally.accepted++;
          if (!sysOk || !diaOk) tally.falsePositive++;
        }

        if (header.mode === 'date') {
          tally.dateAttempted++;
          if (
            r.detectedDate &&
            r.detectedDate.month === header.month &&
            r.detectedDate.day === header.day
          ) {
            tally.dateOk++;
          }
        }

        if (verbose && !(sysOk && diaOk && pulOk)) {
          failures.push(
            `${presetName} seed=${seed} want ${c.sys}/${c.dia}/${c.pul} ` +
              `got ${r.systolic}/${r.diastolic}/${r.pulse} ok=${r.ok} ` +
              `conf=${r.confidence.overall.toFixed(2)} rows=[${r.rows
                .map((x) => `${x.kind}:${x.text}`)
                .join(' ')}]`,
          );
        }
      }
    }
  }

  const pct = (n: number, d: number) => (d === 0 ? '  n/a' : `${((n / d) * 100).toFixed(1).padStart(5)}%`);

  console.log(
    '\npreset       n    exact   sys+dia    sys     dia     pul   accepted  FALSE+   date    ms/img',
  );
  console.log('-'.repeat(100));
  for (const [name, t] of tallies) {
    console.log(
      `${name.padEnd(11)} ${String(t.total).padStart(3)}  ` +
        `${pct(t.exact, t.total)}   ${pct(t.sysDia, t.total)}  ` +
        `${pct(t.sysOk, t.total)}  ${pct(t.diaOk, t.total)}  ${pct(t.pulOk, t.total)}  ` +
        `${pct(t.accepted, t.total)}   ${String(t.falsePositive).padStart(4)}  ` +
        `${pct(t.dateOk, t.dateAttempted)}   ${(t.elapsed / t.total).toFixed(0).padStart(5)}`,
    );
  }

  if (verbose && failures.length) {
    console.log(`\n${failures.length} imperfect reads:`);
    for (const f of failures.slice(0, 60)) console.log('  ' + f);
    if (failures.length > 60) console.log(`  ... and ${failures.length - 60} more`);
  }

  const readable = [...tallies].filter(([n]) => n !== 'unreadable');
  const totalFalse = readable.reduce((s, [, t]) => s + t.falsePositive, 0);
  const unreadable = tallies.get('unreadable');
  console.log(
    `\nfalse positives across readable presets: ${totalFalse}` +
      (unreadable ? ` | unreadable accepted: ${unreadable.accepted}/${unreadable.total}` : ''),
  );
}

main();
