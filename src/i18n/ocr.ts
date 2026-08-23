import type { OcrWarning } from '@/ocr/types';

import type { Dictionary } from './de';

/**
 * Turns a recogniser warning code into a sentence in the active language.
 *
 * The recogniser returns codes rather than text so that it can stay free of any
 * dependency on the UI — including which language the user reads.
 */
export function formatOcrWarning(warning: OcrWarning, t: Dictionary): string {
  switch (warning.code) {
    case 'implausibleGap':
      return t.ocr.implausibleGap(warning.gap);
    case 'partialRow':
      return t.ocr.partialRow(t.fields[warning.field]);
    case 'implausibleValue':
      return t.ocr.implausibleValue(
        t.fields[warning.field],
        warning.value,
        warning.min,
        warning.max,
      );
    case 'missingRows':
      return t.ocr.missingRows(warning.found);
    default:
      return t.ocr[warning.code];
  }
}
