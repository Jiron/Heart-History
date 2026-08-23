/**
 * Renders the doctor's report to an HTML file so its layout can be looked at.
 *
 * On the device the report goes straight into a PDF and then into the share
 * sheet, which makes "does it actually look right" surprisingly hard to answer.
 * `buildReportHtml` is pure, so it can be run here against generated history and
 * opened in a browser — the same markup `expo-print` turns into the PDF.
 *
 *   npx tsx tools/report-preview.ts            # 120 days of history
 *   npx tsx tools/report-preview.ts --days 30
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildReportHtml } from '../src/services/reportHtml';
import { presetRange } from '../src/domain/statistics';
import type { Profile, Reading } from '../src/domain/types';
import { de } from '../src/i18n/de';
import { generateHistory } from './seed-demo';

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      out[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const days = Number(args.days ?? '120');

  const profile: Profile = {
    id: 'preview',
    name: 'Demo',
    colour: '#4f46e5',
    birthYear: 1968,
    targetSystolic: 135,
    targetDiastolic: 85,
    createdAt: Date.now(),
  };

  const readings: Reading[] = generateHistory(profile.id, days);
  const html = buildReportHtml(readings, profile, presetRange('all'), 'esh', de);

  const outDir = join(process.cwd(), 'tools', 'out');
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, 'report.html');
  writeFileSync(out, html, 'utf8');

  console.log(`${readings.length} readings over ${days} days -> ${out}`);
}

main();
