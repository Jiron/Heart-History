import type { ScanOutcome } from '@/services/scan';

/**
 * Hand-off slot between the scan screen and the review screen.
 *
 * Router params are URL-encoded strings, and a scan result carries a full
 * `OcrResult` plus image metadata — serialising that through the address bar
 * would be lossy and slow. A module-level slot keeps the object intact, and the
 * review screen clears it once consumed so a stale result can never be shown
 * against a later photo.
 */
let pending: ScanOutcome | null = null;

export function setPendingScan(outcome: ScanOutcome | null): void {
  pending = outcome;
}

export function takePendingScan(): ScanOutcome | null {
  const value = pending;
  pending = null;
  return value;
}

export function peekPendingScan(): ScanOutcome | null {
  return pending;
}
