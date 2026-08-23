/**
 * Generates a realistic backup file that can be imported into the app to
 * exercise the history and trends screens without months of real measurements.
 *
 *   npx tsx tools/seed-demo.ts > demo-backup.json
 *
 * `generateHistory` is exported so other tools can use the same data — see
 * report-preview.ts.
 */
import { newId } from '../src/lib/id';
import type { Reading } from '../src/domain/types';

const DEFAULT_DAYS = 120;

/**
 * A gentle downward drift with daily rhythm and realistic scatter, so the charts
 * show something a person would actually recognise.
 *
 * Seeded, so the same history comes back every run and a screenshot taken today
 * can be compared with one taken next week.
 */
export function generateHistory(profileId: string, days = DEFAULT_DAYS): Reading[] {
  const start = Date.now() - days * 86_400_000;

  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const gauss = () => {
    const u = Math.max(1e-6, rand());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };

  const readings: Reading[] = [];
  for (let day = 0; day < days; day++) {
    const dayStart = start + day * 86_400_000;
    if (rand() < 0.15) continue; // some days get missed, as they do
    for (const hour of [7, 20]) {
      if (rand() < 0.2) continue;
      const drift = -6 * (day / days);
      const morning = hour < 12 ? 4 : 0;
      const at = dayStart + hour * 3_600_000 + Math.round(rand() * 40) * 60_000;
      readings.push({
        id: newId(),
        profileId,
        measuredAt: at,
        systolic: Math.round(134 + drift + morning + gauss() * 7),
        diastolic: Math.round(85 + drift * 0.6 + morning * 0.5 + gauss() * 5),
        pulse: Math.round(70 + gauss() * 8),
        arm: 'left',
        posture: 'sitting',
        irregularHeartbeat: rand() < 0.04,
        note: null,
        // The canonical tag key, not its English label: tags are stored
        // language-independently and translated at the point of display.
        tags: hour < 12 ? ['beforeMedication'] : [],
        source: 'import',
        imageUri: null,
        ocrConfidence: null,
        deviceDisplayHint: null,
        createdAt: at,
        updatedAt: at,
      });
    }
  }
  return readings;
}

function main() {
  const profileId = newId();
  const readings = generateHistory(profileId);

  console.log(
    JSON.stringify(
      {
        format: 'heart-history-backup',
        version: 1,
        exportedAt: Date.now(),
        profiles: [
          {
            id: profileId,
            name: 'Demo',
            colour: '#3355E0',
            birthYear: null,
            targetSystolic: 130,
            targetDiastolic: 80,
            createdAt: Date.now() - DEFAULT_DAYS * 86_400_000,
          },
        ],
        readings,
      },
      null,
      2,
    ),
  );
}

// Only when run directly, so `generateHistory` can be imported by other tools.
if (process.argv[1]?.endsWith('seed-demo.ts')) main();
