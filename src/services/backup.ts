import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { Directory, File, Paths } from 'expo-file-system';
// Namespace import, and top-level: Metro bundles statically, so a dynamic
// import() of this subpath is not in the graph at all, and the named-import form
// resolves to undefined at runtime. See readPickedFile for why it is needed.
import * as LegacyFileSystem from 'expo-file-system/legacy';

import { importProfiles, importReadings, listAllReadings, listProfiles } from '@/db/repository';
import { wipeAllData } from '@/db/database';
import { classify, DEFAULT_THRESHOLDS, type ThresholdSet } from '@/domain/classification';
import type { Profile, Reading } from '@/domain/types';
import type { Dictionary } from '@/i18n';
import { toISODate, toISODateTime } from '@/lib/format';

export const BACKUP_FORMAT = 'heart-history-backup';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: number;
  profiles: Profile[];
  readings: Reading[];
}

/**
 * Writes a file into the cache directory and hands it to the OS share sheet.
 *
 * Exports go through the share sheet rather than being written somewhere in the
 * filesystem, so the user chooses where their health data ends up — and nothing
 * is written outside the app without that explicit action.
 */
async function writeAndShare(
  filename: string,
  contents: string,
  mimeType: string,
  dialogTitle: string,
): Promise<void> {
  const dir = new Directory(Paths.cache, 'exports');
  if (!dir.exists) dir.create({ intermediates: true });

  const file = new File(dir, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(contents);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle, UTI: mimeType });
  }
}

function stamp(): string {
  return toISODate(Date.now());
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function exportBackup(t: Dictionary): Promise<number> {
  const [profiles, readings] = await Promise.all([listProfiles(), listAllReadings()]);
  const payload: BackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    profiles,
    readings,
  };
  await writeAndShare(
    `heart-history-${stamp()}.json`,
    JSON.stringify(payload, null, 2),
    'application/json',
    t.backup.saveDialog,
  );
  return readings.length;
}

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  // Quote whenever the value could otherwise break the row apart.
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function exportCsv(
  t: Dictionary,
  thresholds: ThresholdSet = DEFAULT_THRESHOLDS,
): Promise<number> {
  const [profiles, readings] = await Promise.all([listProfiles(), listAllReadings()]);
  const names = new Map(profiles.map((p) => [p.id, p.name]));

  const header = [
    'date',
    'time',
    'person',
    'systolic',
    'diastolic',
    'pulse',
    'category',
    'arm',
    'position',
    'irregular_heartbeat',
    'tags',
    'note',
    'source',
  ];

  const rows = readings.map((r) => {
    const d = new Date(r.measuredAt);
    const pad = (n: number) => String(n).padStart(2, '0');
    return [
      toISODate(r.measuredAt),
      `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      names.get(r.profileId) ?? '',
      r.systolic,
      r.diastolic,
      r.pulse ?? '',
      t.categories[classify(r.systolic, r.diastolic, thresholds).key].label,
      r.arm ?? '',
      r.posture ?? '',
      r.irregularHeartbeat ? 'yes' : 'no',
      r.tags.join('; '),
      r.note ?? '',
      r.source,
    ]
      .map(csvCell)
      .join(',');
  });

  await writeAndShare(
    `heart-history-${stamp()}.csv`,
    [header.join(','), ...rows].join('\n'),
    'text/csv',
    t.backup.csvDialog,
  );
  return readings.length;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * Reads a file the user picked, whichever kind of URI Android hands back.
 *
 * Restoring a backup is the one place the app reads something it did not write,
 * and Android makes that awkward in two ways that rule out each other's fix:
 *
 * **A picked document is not a file.** The picker returns a Storage Access
 * Framework `content://` reference — a ContentResolver entry with no filesystem
 * path behind it. `File` rejects it with `Missing 'READ' permission`, and the
 * legacy reader rejects it with `Unsupported scheme`; SDK 57 dropped resolver
 * reads, and `StorageAccessFramework.readAsStringAsync` is only an alias for the
 * same function.
 *
 * **So the picker is asked to copy it**, which yields a real `file://` path and
 * works in a built app, where that path is inside the app's own cache.
 *
 * It does *not* work under Expo Go, where the copy lands in Expo Go's cache
 * rather than the sandbox granted to the experience running inside it, and both
 * readers refuse it. That is a limitation of the Expo Go host, not of this code
 * — restore is verified against a development build for exactly that reason.
 * Both readers are still tried, and both failures are reported, because a
 * silent fallback would have made that far harder to work out.
 */
async function readPickedFile(uri: string, t: Dictionary): Promise<string> {
  const failures: string[] = [];
  const describe = (e: unknown) => (e instanceof Error ? e.message : String(e));

  try {
    return await new File(uri).text();
  } catch (e) {
    failures.push(describe(e));
  }

  try {
    return await LegacyFileSystem.readAsStringAsync(uri, { encoding: 'utf8' });
  } catch (e) {
    failures.push(describe(e));
  }

  // Both readers are quoted, because which one failed and how is the only clue
  // to whether this is a sandbox restriction or a genuinely unreadable file.
  throw new Error(t.backup.couldNotRead(failures.join(' / ')));
}

export type ImportMode = 'merge' | 'replace';

export interface ImportResult {
  cancelled: boolean;
  profilesAdded: number;
  readingsAdded: number;
  readingsSkipped: number;
  message: string;
}

function isReading(value: unknown): value is Reading {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.profileId === 'string' &&
    typeof r.measuredAt === 'number' &&
    typeof r.systolic === 'number' &&
    typeof r.diastolic === 'number'
  );
}

function isProfile(value: unknown): value is Profile {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return typeof p.id === 'string' && typeof p.name === 'string';
}

/**
 * Restores a backup chosen by the user.
 *
 * The file is validated field by field rather than trusted: it may have been
 * hand-edited, produced by a different version, or simply be the wrong file.
 * Anything that does not look like a reading is skipped and reported, so a
 * partially corrupt backup still restores what it can.
 */
export async function importBackup(mode: ImportMode, t: Dictionary): Promise<ImportResult> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  });

  if (picked.canceled || !picked.assets?.[0]) {
    return {
      cancelled: true,
      profilesAdded: 0,
      readingsAdded: 0,
      readingsSkipped: 0,
      message: '',
    };
  }

  const text = await readPickedFile(picked.assets[0].uri, t);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(t.backup.notJson);
  }

  const data = parsed as Partial<BackupFile>;
  if (data.format !== BACKUP_FORMAT) {
    throw new Error(t.backup.notBackup);
  }
  if (typeof data.version === 'number' && data.version > BACKUP_VERSION) {
    throw new Error(t.backup.newerVersion);
  }

  const rawReadings = Array.isArray(data.readings) ? data.readings : [];
  const rawProfiles = Array.isArray(data.profiles) ? data.profiles : [];

  const validReadings = rawReadings.filter(isReading).map((r) => ({
    ...r,
    pulse: typeof r.pulse === 'number' ? r.pulse : null,
    tags: Array.isArray(r.tags) ? r.tags.filter((t) => typeof t === 'string') : [],
    irregularHeartbeat: r.irregularHeartbeat === true,
    source: r.source ?? 'import',
    note: typeof r.note === 'string' ? r.note : null,
    imageUri: null, // Photos are not carried in a backup; the reading is.
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : r.measuredAt,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : r.measuredAt,
  }));
  const validProfiles = rawProfiles.filter(isProfile).map((p) => ({
    ...p,
    colour: typeof p.colour === 'string' ? p.colour : '#3355E0',
    birthYear: typeof p.birthYear === 'number' ? p.birthYear : null,
    targetSystolic: typeof p.targetSystolic === 'number' ? p.targetSystolic : null,
    targetDiastolic: typeof p.targetDiastolic === 'number' ? p.targetDiastolic : null,
    createdAt: typeof p.createdAt === 'number' ? p.createdAt : Date.now(),
  }));

  if (validReadings.length === 0 && validProfiles.length === 0) {
    throw new Error(t.backup.nothingUnderstood);
  }

  if (mode === 'replace') await wipeAllData();

  const profilesAdded = await importProfiles(validProfiles);
  const readingsAdded = await importReadings(validReadings);
  const skipped = rawReadings.length - validReadings.length;

  return {
    cancelled: false,
    profilesAdded,
    readingsAdded,
    readingsSkipped: skipped + (validReadings.length - readingsAdded),
    message: t.backup.restored(readingsAdded, profilesAdded, skipped),
  };
}

export { toISODateTime };
