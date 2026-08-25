import type { ThresholdSet } from './classification';

/** Where a reading came from. Drives what the UI offers to re-check. */
export type ReadingSource = 'scan' | 'manual' | 'import';

export type Arm = 'left' | 'right';
export type Posture = 'sitting' | 'lying' | 'standing';

export interface Reading {
  id: string;
  profileId: string;
  /**
   * Epoch milliseconds, and the **only** ordering key in the app.
   *
   * Deliberately not taken from the monitor's own display: that field alternates
   * between showing a date and showing a clock, so it cannot be relied on to say
   * when a measurement happened. It defaults to when the photo was taken (or
   * when the entry was made) and the user can correct it.
   */
  measuredAt: number;
  systolic: number;
  diastolic: number;
  pulse: number | null;
  arm: Arm | null;
  posture: Posture | null;
  /** The monitor's irregular-heartbeat symbol, if it was showing. */
  irregularHeartbeat: boolean;
  note: string | null;
  tags: string[];
  source: ReadingSource;
  /** Local copy of the photo the reading was scanned from, if kept. */
  imageUri: string | null;
  /** 0..1 from the recogniser, or null for manual entries. */
  ocrConfidence: number | null;
  /**
   * Whatever the monitor's top-right field showed, verbatim (e.g. "8-23" or
   * "8:15"). Informational only — never used for ordering or grouping.
   */
  deviceDisplayHint: string | null;
  createdAt: number;
  updatedAt: number;
}

/** A reading before it has been persisted. */
export type NewReading = Omit<Reading, 'id' | 'createdAt' | 'updatedAt'>;

export interface Profile {
  id: string;
  name: string;
  /** Accent colour, used to tell people apart in shared charts. */
  colour: string;
  birthYear: number | null;
  /** Personal targets, used for the goal line on charts. */
  targetSystolic: number | null;
  targetDiastolic: number | null;
  createdAt: number;
}

export interface Settings {
  activeProfileId: string;
  theme: 'system' | 'light' | 'dark';
  /** `system` follows the phone's language, falling back to German. */
  language: 'de' | 'en' | 'system';
  /**
   * Which threshold set to classify against.
   * `esh` matches the scale the Microlife monitor's own traffic-light bar uses.
   * `home` uses the lower thresholds recommended for self-measurement.
   * `custom` uses `customThresholds`.
   */
  classificationScale: ClassificationScale;
  /**
   * Hand-edited category boundaries, used only when the scale is `custom`.
   *
   * Null until someone edits them. Kept even while a preset is selected, so
   * switching away and back does not lose the work.
   */
  customThresholds: ThresholdSet | null;
  /** Keep the source photo alongside each scanned reading. */
  keepPhotos: boolean;
  /** Ask for confirmation before saving a scan, even at high confidence. */
  alwaysConfirmScans: boolean;
  /**
   * Address of a self-hosted assisted reader, or null to read on the device.
   *
   * Empty by default, and the app is perfectly usable that way. Setting it
   * sends the photo to that address instead; see services/remoteOcr.ts for
   * what that trades away.
   */
  ocrServerUrl: string | null;
  /**
   * Bearer token for the assisted reader. Required by the server; a wrong or
   * missing one is refused the same way an unknown caller is.
   *
   * Kept out of exported backups by construction: `exportBackup` writes only
   * profiles and readings, so a backup file shared with someone never carries
   * a credential for a machine at home.
   */
  ocrServerToken: string | null;
}

export type ClassificationScale = 'esh' | 'home' | 'custom';
