import * as SQLite from 'expo-sqlite';

export const DATABASE_NAME = 'heart-history.db';

/**
 * Ordered migrations. Each entry moves the schema forward by exactly one
 * version; `user_version` records where a device has got to, so an app update
 * only ever runs the steps it is missing.
 *
 * Never edit a migration that has shipped — add another one.
 */
const MIGRATIONS: ((db: SQLite.SQLiteDatabase) => Promise<void>)[] = [
  // v1 — initial schema
  async (db) => {
    await db.execAsync(`
      CREATE TABLE profiles (
        id           TEXT PRIMARY KEY NOT NULL,
        name         TEXT NOT NULL,
        colour       TEXT NOT NULL,
        birthYear    INTEGER,
        targetSystolic  INTEGER,
        targetDiastolic INTEGER,
        createdAt    INTEGER NOT NULL
      );

      CREATE TABLE readings (
        id            TEXT PRIMARY KEY NOT NULL,
        profileId     TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        measuredAt    INTEGER NOT NULL,
        systolic      INTEGER NOT NULL,
        diastolic     INTEGER NOT NULL,
        pulse         INTEGER,
        arm           TEXT,
        posture       TEXT,
        irregularHeartbeat INTEGER NOT NULL DEFAULT 0,
        note          TEXT,
        tags          TEXT NOT NULL DEFAULT '[]',
        source        TEXT NOT NULL DEFAULT 'manual',
        imageUri      TEXT,
        ocrConfidence REAL,
        deviceDisplayHint TEXT,
        createdAt     INTEGER NOT NULL,
        updatedAt     INTEGER NOT NULL
      );

      -- Every list, chart and statistic reads readings for one profile ordered
      -- by time, so this is the index that matters.
      CREATE INDEX idx_readings_profile_time ON readings(profileId, measuredAt DESC);

      CREATE TABLE settings (
        key   TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);
  },
];

let instance: SQLite.SQLiteDatabase | null = null;
let opening: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Opens the database, applying any outstanding migrations.
 *
 * Concurrent callers share one in-flight open, so the first render of several
 * screens cannot race into running migrations twice.
 */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (instance) return instance;
  if (opening) return opening;

  opening = (async () => {
    const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
    // WAL keeps reads from blocking on writes; foreign keys enforce the cascade
    // from profiles to readings.
    await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    await migrate(db);
    instance = db;
    return db;
  })();

  try {
    return await opening;
  } finally {
    opening = null;
  }
}

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  for (let i = version; i < MIGRATIONS.length; i++) {
    await db.withTransactionAsync(async () => {
      await MIGRATIONS[i](db);
    });
    version = i + 1;
    // PRAGMA does not accept bound parameters, and `version` is a loop counter,
    // never user input.
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }
}

/**
 * Drops every row while keeping the schema. Used by "replace" restores, where
 * the incoming backup is meant to become the whole database.
 */
export async function wipeAllData(): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM readings');
    await db.runAsync('DELETE FROM profiles');
    await db.runAsync('DELETE FROM settings');
  });
}

/** Closes the handle. Only needed by tests and by a full restore. */
export async function closeDatabase(): Promise<void> {
  if (instance) {
    await instance.closeAsync();
    instance = null;
  }
}
