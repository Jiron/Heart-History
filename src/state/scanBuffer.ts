import type { ScanOutcome } from '@/services/scan';

/**
 * The scan that is currently being read, or the one that just finished.
 *
 * ## Why this is a job and not a hand-off slot
 *
 * It used to be a slot: the camera screen ran the recogniser, waited, and then
 * pushed the finished result to the review screen. That put the wait *inside*
 * the camera, which stayed live behind a spinner — so the shutter had fired but
 * the viewfinder was still showing the monitor, and there was no way to tell
 * whether you were meant to keep holding the phone steady. Every tester read it
 * as "still taking the picture".
 *
 * Now the camera closes the moment the shutter returns a file, and the reading
 * continues here, outside the screen that started it. The review screen watches
 * this store; if it is not mounted, the work carries on regardless and the
 * dashboard shows it. Nothing is blocked on a screen staying open.
 *
 * A plain module-level store rather than context: a scan outlives the screen
 * that started it, which is exactly the lifetime a React tree does not have.
 */

export type ScanStatus = 'running' | 'done' | 'failed';

export interface ScanJob {
  id: string;
  status: ScanStatus;
  /** The photo being read, so the review screen can show it immediately. */
  sourceUri: string;
  startedAt: number;
  outcome: ScanOutcome | null;
  /** Already translated, ready to show. */
  error: string | null;
}

let current: ScanJob | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeToScan(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Stable snapshot for `useSyncExternalStore`. */
export function getScanJob(): ScanJob | null {
  return current;
}

export function beginScan(id: string, sourceUri: string): void {
  current = {
    id,
    status: 'running',
    sourceUri,
    startedAt: Date.now(),
    outcome: null,
    error: null,
  };
  emit();
}

export function finishScan(id: string, outcome: ScanOutcome): void {
  // A second shutter press before the first read finished supersedes it. The
  // older job must not be allowed to overwrite the newer one when it lands.
  if (!current || current.id !== id) return;
  current = { ...current, status: 'done', outcome };
  emit();
}

export function failScan(id: string, error: string): void {
  if (!current || current.id !== id) return;
  current = { ...current, status: 'failed', error };
  emit();
}

/**
 * Clears the job once the review screen has taken it, so backing out and
 * returning cannot show a finished scan against a photo you have moved on from.
 */
export function clearScan(): void {
  if (!current) return;
  current = null;
  emit();
}
