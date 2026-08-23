/**
 * Generates a realistic backup file that can be imported into the app to
 * exercise the history and trends screens without months of real measurements.
 *
 *   npx tsx tools/seed-demo.ts > demo-backup.json
 */
import { newId } from '../src/lib/id';

const DAYS = 120;
const start = Date.now() - DAYS * 86_400_000;
const profileId = newId();

// A gentle downward drift with daily rhythm and realistic scatter, so the charts
// show something a person would actually recognise.
let seed = 42;
const rand = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const gauss = () => {
  const u = Math.max(1e-6, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
};

const readings = [];
for (let day = 0; day < DAYS; day++) {
  const dayStart = start + day * 86_400_000;
  if (rand() < 0.15) continue; // some days get missed, as they do
  for (const hour of [7, 20]) {
    if (rand() < 0.2) continue;
    const drift = -6 * (day / DAYS);
    const morning = hour < 12 ? 4 : 0;
    const sys = Math.round(134 + drift + morning + gauss() * 7);
    const dia = Math.round(85 + drift * 0.6 + morning * 0.5 + gauss() * 5);
    const at = dayStart + hour * 3_600_000 + Math.round(rand() * 40) * 60_000;
    readings.push({
      id: newId(),
      profileId,
      measuredAt: at,
      systolic: sys,
      diastolic: dia,
      pulse: Math.round(70 + gauss() * 8),
      arm: 'left',
      posture: 'sitting',
      irregularHeartbeat: rand() < 0.04,
      note: null,
      tags: hour < 12 ? ['Before medication'] : [],
      source: 'import',
      imageUri: null,
      ocrConfidence: null,
      deviceDisplayHint: null,
      createdAt: at,
      updatedAt: at,
    });
  }
}

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
          createdAt: start,
        },
      ],
      readings,
    },
    null,
    2,
  ),
);
