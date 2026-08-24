import type { Dictionary } from '@/i18n/de';
import { newId } from '@/lib/id';
import { beginScan, failScan, finishScan } from '@/state/scanBuffer';
import { scanImage, type ScanConfig } from './scan';

/**
 * Starts reading a photo and returns immediately.
 *
 * The camera screen used to await `scanImage` and only then navigate, which
 * meant the viewfinder stayed live behind a spinner for as long as the read
 * took — several seconds with the assisted reader. People could not tell
 * whether the picture had been taken, and kept holding the phone over the
 * monitor. Now the shutter hands the file here and closes.
 *
 * Deliberately not a hook and deliberately not awaited: the work has to survive
 * the screen that started it being unmounted, which is the one thing a promise
 * owned by a component cannot do. Progress and result go to the scan store, and
 * whichever screen is on top picks them up from there.
 */
export function startScan(uri: string, config: ScanConfig, t: Dictionary): string {
  const id = newId();
  beginScan(id, uri);

  scanImage(uri, config)
    .then((outcome) => finishScan(id, outcome))
    .catch((error) => {
      failScan(
        id,
        error instanceof Error ? t.scan.couldNotRead(error.message) : t.scan.couldNotReadGeneric,
      );
    });

  return id;
}
