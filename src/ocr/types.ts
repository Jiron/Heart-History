/**
 * Core types for the seven-segment OCR engine.
 *
 * IMPORTANT: this module (and everything under `src/ocr/`) must stay free of any
 * React Native / Expo / Node imports. It is pure TypeScript operating on typed
 * arrays so that the *exact same code* runs:
 *   - on device (Hermes), fed by expo-image-manipulator + jpeg-js
 *   - in Node (vitest / tsx), fed by the synthetic fixture renderer
 * That property is what makes the recogniser testable at all.
 */

/** 8-bit single channel image, row-major, `data.length === w * h`. */
export interface Gray {
  readonly w: number;
  readonly h: number;
  readonly data: Uint8Array;
}

/** Binary image. Values are strictly 0 or 1. `data.length === w * h`. */
export interface Mask {
  readonly w: number;
  readonly h: number;
  readonly data: Uint8Array;
}

/** Axis-aligned rectangle in pixel coordinates. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A connected component of the ink mask (usually one lit seven-segment stroke). */
export interface Component {
  /** 1-based label id, matching the value stored in `LabelResult.labels`. */
  id: number;
  box: Box;
  /** Number of ink pixels. */
  area: number;
  /** area / (box.w * box.h) — how solidly the component fills its bounding box. */
  fill: number;
  /** Ink-weighted centroid. */
  cx: number;
  cy: number;
}

/** Which of the seven segments are lit, in the canonical `a b c d e f g` order. */
export type SegmentMask = readonly [
  boolean, // a — top
  boolean, // b — top right
  boolean, // c — bottom right
  boolean, // d — bottom
  boolean, // e — bottom left
  boolean, // f — top left
  boolean, // g — middle
];

export interface DigitResult {
  /** Recognised character: '0'..'9', 'A', '-', ':', or '?' when undecidable. */
  char: string;
  /** Numeric value when `char` is a digit, otherwise null. */
  value: number | null;
  /** The normalised digit cell that was probed. */
  cell: Box;
  /** Per-segment ink coverage ratios (0..1), same order as SegmentMask. */
  coverage: number[];
  /** Segments considered lit. */
  segments: boolean[];
  /** 0..1. Driven by how far each segment probe sat from the undecided band. */
  confidence: number;
  /** True when the pattern was not an exact match and we snapped to the nearest glyph. */
  corrected: boolean;
}

export type RowKind = 'systolic' | 'diastolic' | 'pulse' | 'header' | 'unknown';

export interface RowResult {
  kind: RowKind;
  band: Box;
  digits: DigitResult[];
  /** Concatenated characters, e.g. "122". */
  text: string;
  /** Parsed integer when the row is all digits, otherwise null. */
  value: number | null;
  confidence: number;
  /** Median glyph height for this row — used to tell big value rows from the tiny header row. */
  glyphHeight: number;
}

/** Best-effort icon detections. All are nullable: `null` means "could not tell". */
export interface IconFlags {
  /** "A" shown where the date normally is → the reading is a stored average, not a single measurement. */
  average: boolean | null;
  /** Circled M → a value recalled from device memory. */
  memory: boolean | null;
  /** Irregular-heartbeat symbol (manual item 19). */
  irregularHeartbeat: boolean | null;
  /** Cuff-fit-check tick (manual item 17). */
  cuffFitOk: boolean | null;
  /** Battery-low indicator (manual item 13). */
  batteryLow: boolean | null;
  /**
   * Traffic-light indicator (manual item 14): which of the three arrow positions
   * is marked, 0 = top … 2 = bottom, or null when undetermined.
   */
  trafficLight: number | null;
}

export interface OcrDebugArtifacts {
  /** Working resolution actually used. */
  width: number;
  height: number;
  /** Estimated stroke thickness in working pixels. */
  strokeWidth: number;
  /** Estimated glyph cell height of the main value rows. */
  glyphHeight: number;
  /** All ink components that survived filtering. */
  components: Component[];
  /** Detected horizontal bands before classification. */
  bands: Box[];
  /** PNG-able overlay data is produced by tools, not here. */
  inkMask?: Mask;
  gray?: Gray;
}

/** Which value row a warning refers to. */
export type OcrField = 'systolic' | 'diastolic' | 'pulse';

/**
 * Warnings are returned as codes rather than sentences.
 *
 * The recogniser has no business knowing what language the user reads, and this
 * module deliberately has no dependencies to hand it one. The UI maps each code
 * onto a translated string.
 */
export type OcrWarning =
  | { code: 'noContent' }
  | { code: 'noDigits' }
  | { code: 'noValueRows' }
  | { code: 'noDigitsRead' }
  | { code: 'recognitionFailed' }
  | { code: 'errorCode' }
  | { code: 'systolicNotAbove' }
  | { code: 'implausibleGap'; gap: number }
  | { code: 'partialRow'; field: OcrField }
  | { code: 'implausibleValue'; field: OcrField; value: number; min: number; max: number }
  | { code: 'missingRows'; found: number }
  | { code: 'isAverage' };

export interface OcrResult {
  /** True when at least systolic + diastolic were read with usable confidence. */
  ok: boolean;
  systolic: number | null;
  diastolic: number | null;
  pulse: number | null;
  confidence: {
    overall: number;
    systolic: number;
    diastolic: number;
    pulse: number;
  };
  /** Month/day read from the tiny header row, when present. Year is never shown by the device. */
  detectedDate: { month: number; day: number } | null;
  /** Hour/minute read from the tiny header row, when the device is in clock mode. */
  detectedTime: { hour: number; minute: number } | null;
  icons: IconFlags;
  rows: RowResult[];
  /** Bounding box of the recognised value block, in *original image* coordinates. */
  panel: Box | null;
  /** Scale factor from working resolution back to the original image. */
  scale: number;
  warnings: OcrWarning[];
  /** Milliseconds spent in the recogniser. */
  elapsedMs: number;
  debug?: OcrDebugArtifacts;
}

export interface OcrOptions {
  /**
   * Longest side of the working image. Smaller = faster, less robust.
   * 1000 keeps a typical phone photo's digits ~100px tall, which is ample.
   */
  maxWorkingDim?: number;
  /** Restrict recognition to this rectangle of the *input* image (0..1 normalised). */
  roi?: { x: number; y: number; w: number; h: number };
  /** Bradley adaptive-threshold sensitivity. Higher = more ink. */
  threshold?: number;
  /** Minimum absolute gray delta below the local mean for a pixel to count as ink. */
  minContrast?: number;
  /** Segment probe coverage above which a segment counts as lit. */
  segmentOn?: number;
  /** Segment probe coverage below which a segment counts as unlit. */
  segmentOff?: number;
  /** Collect debug artifacts (costly). */
  debug?: boolean;
}

export const DEFAULT_OCR_OPTIONS: Required<Omit<OcrOptions, 'roi' | 'debug'>> = {
  maxWorkingDim: 1000,
  threshold: 0.14,
  minContrast: 10,
  segmentOn: 0.32,
  segmentOff: 0.17,
};
