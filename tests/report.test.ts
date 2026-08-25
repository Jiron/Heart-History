import { describe, expect, it } from 'vitest';

import { presetRange } from '../src/domain/statistics';
import type { Profile, Reading } from '../src/domain/types';
import { de } from '../src/i18n/de';
import { en } from '../src/i18n/en';
import { buildReportHtml } from '../src/services/reportHtml';
import { PRESETS } from '../src/domain/classification';

/**
 * The doctor's report is the one screen that leaves the phone, and it is the
 * hardest to eyeball: it exists as a PDF inside a share sheet. `buildReportHtml`
 * is deliberately free of React Native and Expo imports so its markup can be
 * checked here — and rendered to a file with `npx tsx tools/report-preview.ts`.
 */

const profile: Profile = {
  id: 'p1',
  name: 'Demo',
  colour: '#3355E0',
  birthYear: 1968,
  targetSystolic: 130,
  targetDiastolic: 80,
  createdAt: 0,
};

function reading(overrides: Partial<Reading> = {}): Reading {
  const at = Date.UTC(2026, 7, 23, 8, 15);
  return {
    id: 'r1',
    profileId: 'p1',
    measuredAt: at,
    systolic: 128,
    diastolic: 84,
    pulse: 71,
    arm: 'left',
    posture: 'sitting',
    irregularHeartbeat: false,
    note: null,
    tags: ['beforeMedication'],
    source: 'manual',
    imageUri: null,
    ocrConfidence: null,
    deviceDisplayHint: null,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

describe('doctor report', () => {
  it('translates the context column instead of printing storage keys', () => {
    const html = buildReportHtml([reading()], profile, presetRange('all'), PRESETS.esh, de);

    expect(html).toContain('Linker Arm');
    expect(html).toContain('Sitzend');
    expect(html).toContain('Vor Medikament');

    // These are how the values are stored, and must never reach the page.
    expect(html).not.toContain('beforeMedication');
    expect(html).not.toContain('left arm');
    expect(html).not.toContain('sitting');
  });

  it('translates the same reading into English', () => {
    const html = buildReportHtml([reading()], profile, presetRange('all'), PRESETS.esh, en);
    expect(html).toContain('Left arm');
    expect(html).toContain('Before medication');
    expect(html).not.toContain('beforeMedication');
  });

  it('forces a light page so a dark-mode device does not print dark on dark', () => {
    // expo-print renders through a WebView, which follows the system theme
    // unless the document says otherwise.
    const html = buildReportHtml([reading()], profile, presetRange('all'), PRESETS.esh, de);
    expect(html).toContain('color-scheme: light');
    expect(html).toMatch(/html, body \{ background: #ffffff/);
  });

  it('escapes anything the user typed', () => {
    const html = buildReportHtml(
      [reading({ note: '<script>alert(1)</script>' })],
      { ...profile, name: 'A & B <b>' },
      presetRange('all'),
      PRESETS.esh,
      de,
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A &amp; B');
  });

  it('survives a reading with nothing optional filled in', () => {
    const html = buildReportHtml(
      [reading({ pulse: null, arm: null, posture: null, tags: [], note: null })],
      profile,
      presetRange('all'),
      PRESETS.esh,
      de,
    );
    expect(html).toContain('128');
    expect(html).toContain('84');
  });
});
