import type {
  ClassificationScale,
  NewReading,
  Profile,
  Reading,
  Settings,
} from '@/domain/types';
import { newId } from '@/lib/id';

import { getDatabase } from './database';

/** Row shape as stored. SQLite has no boolean or array types. */
interface ReadingRow {
  id: string;
  profileId: string;
  measuredAt: number;
  systolic: number;
  diastolic: number;
  pulse: number | null;
  arm: string | null;
  posture: string | null;
  irregularHeartbeat: number;
  note: string | null;
  tags: string;
  source: string;
  imageUri: string | null;
  ocrConfidence: number | null;
  deviceDisplayHint: string | null;
  createdAt: number;
  updatedAt: number;
}

function toReading(row: ReadingRow): Reading {
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(row.tags);
    if (Array.isArray(parsed)) tags = parsed.filter((t) => typeof t === 'string');
  } catch {
    // A corrupt tag blob should cost the tags, not the reading.
  }
  return {
    id: row.id,
    profileId: row.profileId,
    measuredAt: row.measuredAt,
    systolic: row.systolic,
    diastolic: row.diastolic,
    pulse: row.pulse,
    arm: (row.arm as Reading['arm']) ?? null,
    posture: (row.posture as Reading['posture']) ?? null,
    irregularHeartbeat: row.irregularHeartbeat === 1,
    note: row.note,
    tags,
    source: (row.source as Reading['source']) ?? 'manual',
    imageUri: row.imageUri,
    ocrConfidence: row.ocrConfidence,
    deviceDisplayHint: row.deviceDisplayHint,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

const PROFILE_COLOURS = ['#3355E0', '#12B0A0', '#E0567A', '#B9741A', '#7A4FD6', '#2E8B57'];

export async function listProfiles(): Promise<Profile[]> {
  const db = await getDatabase();
  return db.getAllAsync<Profile>('SELECT * FROM profiles ORDER BY createdAt ASC');
}

export async function createProfile(
  name: string,
  options: Partial<Omit<Profile, 'id' | 'name' | 'createdAt'>> = {},
): Promise<Profile> {
  const db = await getDatabase();
  const existing = await listProfiles();
  const profile: Profile = {
    id: newId(),
    name: name.trim() || 'Me',
    colour: options.colour ?? PROFILE_COLOURS[existing.length % PROFILE_COLOURS.length],
    birthYear: options.birthYear ?? null,
    targetSystolic: options.targetSystolic ?? null,
    targetDiastolic: options.targetDiastolic ?? null,
    createdAt: Date.now(),
  };
  await db.runAsync(
    `INSERT INTO profiles (id, name, colour, birthYear, targetSystolic, targetDiastolic, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    profile.id,
    profile.name,
    profile.colour,
    profile.birthYear,
    profile.targetSystolic,
    profile.targetDiastolic,
    profile.createdAt,
  );
  return profile;
}

export async function updateProfile(profile: Profile): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE profiles SET name = ?, colour = ?, birthYear = ?, targetSystolic = ?, targetDiastolic = ?
     WHERE id = ?`,
    profile.name,
    profile.colour,
    profile.birthYear,
    profile.targetSystolic,
    profile.targetDiastolic,
    profile.id,
  );
}

export async function deleteProfile(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM profiles WHERE id = ?', id);
}

/**
 * Returns the active profile, creating a default one on first launch.
 *
 * The name is passed in rather than hard-coded so the first profile is created
 * in the user's language; they can rename it at any time.
 */
export async function ensureProfile(defaultName = 'Me'): Promise<Profile> {
  const profiles = await listProfiles();
  if (profiles.length > 0) {
    const activeId = await getSetting('activeProfileId');
    return profiles.find((p) => p.id === activeId) ?? profiles[0];
  }
  const created = await createProfile(defaultName);
  await setSetting('activeProfileId', created.id);
  return created;
}

// ---------------------------------------------------------------------------
// Readings
// ---------------------------------------------------------------------------

export async function insertReading(input: NewReading): Promise<Reading> {
  const db = await getDatabase();
  const now = Date.now();
  const reading: Reading = { ...input, id: newId(), createdAt: now, updatedAt: now };
  await db.runAsync(
    `INSERT INTO readings
       (id, profileId, measuredAt, systolic, diastolic, pulse, arm, posture,
        irregularHeartbeat, note, tags, source, imageUri, ocrConfidence,
        deviceDisplayHint, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    reading.id,
    reading.profileId,
    reading.measuredAt,
    reading.systolic,
    reading.diastolic,
    reading.pulse,
    reading.arm,
    reading.posture,
    reading.irregularHeartbeat ? 1 : 0,
    reading.note,
    JSON.stringify(reading.tags),
    reading.source,
    reading.imageUri,
    reading.ocrConfidence,
    reading.deviceDisplayHint,
    reading.createdAt,
    reading.updatedAt,
  );
  return reading;
}

export async function updateReading(reading: Reading): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE readings SET
       measuredAt = ?, systolic = ?, diastolic = ?, pulse = ?, arm = ?, posture = ?,
       irregularHeartbeat = ?, note = ?, tags = ?, imageUri = ?, updatedAt = ?
     WHERE id = ?`,
    reading.measuredAt,
    reading.systolic,
    reading.diastolic,
    reading.pulse,
    reading.arm,
    reading.posture,
    reading.irregularHeartbeat ? 1 : 0,
    reading.note,
    JSON.stringify(reading.tags),
    reading.imageUri,
    Date.now(),
    reading.id,
  );
}

export async function deleteReading(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM readings WHERE id = ?', id);
}

export async function getReading(id: string): Promise<Reading | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ReadingRow>('SELECT * FROM readings WHERE id = ?', id);
  return row ? toReading(row) : null;
}

export interface ReadingQuery {
  profileId: string;
  /** Inclusive lower bound on `measuredAt`. */
  since?: number;
  /** Exclusive upper bound on `measuredAt`. */
  until?: number;
  limit?: number;
}

export async function listReadings(query: ReadingQuery): Promise<Reading[]> {
  const db = await getDatabase();
  const clauses = ['profileId = ?'];
  const params: (string | number)[] = [query.profileId];

  if (query.since !== undefined) {
    clauses.push('measuredAt >= ?');
    params.push(query.since);
  }
  if (query.until !== undefined) {
    clauses.push('measuredAt < ?');
    params.push(query.until);
  }

  let sql = `SELECT * FROM readings WHERE ${clauses.join(' AND ')} ORDER BY measuredAt DESC`;
  if (query.limit !== undefined) {
    sql += ' LIMIT ?';
    params.push(query.limit);
  }

  const rows = await db.getAllAsync<ReadingRow>(sql, params);
  return rows.map(toReading);
}

export async function countReadings(profileId: string): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM readings WHERE profileId = ?',
    profileId,
  );
  return row?.n ?? 0;
}

/** Every reading across every profile — used by backup export. */
export async function listAllReadings(): Promise<Reading[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ReadingRow>(
    'SELECT * FROM readings ORDER BY measuredAt ASC',
  );
  return rows.map(toReading);
}

/**
 * Bulk insert used by import. Existing ids are skipped rather than overwritten,
 * so importing the same backup twice cannot duplicate or clobber anything.
 */
export async function importReadings(readings: Reading[]): Promise<number> {
  const db = await getDatabase();
  let inserted = 0;
  await db.withTransactionAsync(async () => {
    for (const r of readings) {
      const result = await db.runAsync(
        `INSERT OR IGNORE INTO readings
           (id, profileId, measuredAt, systolic, diastolic, pulse, arm, posture,
            irregularHeartbeat, note, tags, source, imageUri, ocrConfidence,
            deviceDisplayHint, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        r.id,
        r.profileId,
        r.measuredAt,
        r.systolic,
        r.diastolic,
        r.pulse,
        r.arm,
        r.posture,
        r.irregularHeartbeat ? 1 : 0,
        r.note,
        JSON.stringify(r.tags ?? []),
        r.source,
        r.imageUri,
        r.ocrConfidence,
        r.deviceDisplayHint,
        r.createdAt,
        r.updatedAt,
      );
      if (result.changes > 0) inserted++;
    }
  });
  return inserted;
}

export async function importProfiles(profiles: Profile[]): Promise<number> {
  const db = await getDatabase();
  let inserted = 0;
  await db.withTransactionAsync(async () => {
    for (const p of profiles) {
      const result = await db.runAsync(
        `INSERT OR IGNORE INTO profiles
           (id, name, colour, birthYear, targetSystolic, targetDiastolic, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        p.id,
        p.name,
        p.colour,
        p.birthYear,
        p.targetSystolic,
        p.targetDiastolic,
        p.createdAt,
      );
      if (result.changes > 0) inserted++;
    }
  });
  return inserted;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}

export const DEFAULT_SETTINGS: Omit<Settings, 'activeProfileId'> = {
  theme: 'system',
  language: 'de',
  classificationScale: 'esh',
  keepPhotos: true,
  alwaysConfirmScans: false,
  // Off unless the user sets it: the app reads on the device by default, and
  // released builds have no network permission to reach a server with anyway.
  ocrServerUrl: null,
};

export async function loadSettings(defaultProfileName = 'Me'): Promise<Settings> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT * FROM settings');
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const profile = await ensureProfile(defaultProfileName);
  return {
    activeProfileId: map.get('activeProfileId') ?? profile.id,
    theme: (map.get('theme') as Settings['theme']) ?? DEFAULT_SETTINGS.theme,
    language: (map.get('language') as Settings['language']) ?? DEFAULT_SETTINGS.language,
    classificationScale:
      (map.get('classificationScale') as ClassificationScale) ??
      DEFAULT_SETTINGS.classificationScale,
    keepPhotos: map.get('keepPhotos') !== 'false',
    alwaysConfirmScans: map.get('alwaysConfirmScans') === 'true',
    ocrServerUrl: map.get('ocrServerUrl') || null,
  };
}
