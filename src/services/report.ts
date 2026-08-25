import { Directory, File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import type { DateRange } from '@/domain/statistics';
import type { ThresholdSet } from '@/domain/classification';
import type { Profile, Reading } from '@/domain/types';
import type { Dictionary } from '@/i18n';
import { toISODate } from '@/lib/format';

import { buildReportHtml } from './reportHtml';

export { buildReportHtml };

export async function exportReport(
  readings: Reading[],
  profile: Profile,
  range: DateRange,
  thresholds: ThresholdSet,
  t: Dictionary,
): Promise<void> {
  const html = buildReportHtml(readings, profile, range, thresholds, t);
  const { uri } = await Print.printToFileAsync({ html, base64: false });

  /*
   * Rename before sharing.
   *
   * `printToFileAsync` writes to a temporary file named after a UUID, and that
   * name is what the share sheet offers and what lands in the recipient's inbox
   * or downloads folder. Someone taking a blood-pressure report to an
   * appointment should not have to hunt for `e73cc414-c51c-4ad2.pdf`.
   */
  let shareUri = uri;
  try {
    const dir = new Directory(Paths.cache, 'exports');
    if (!dir.exists) dir.create({ intermediates: true });
    const named = new File(dir, `heart-history-${toISODate(Date.now())}.pdf`);
    if (named.exists) named.delete();
    new File(uri).move(named);
    shareUri = named.uri;
  } catch {
    // A rename is a nicety; sharing the temporary file still works.
  }

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(shareUri, {
      mimeType: 'application/pdf',
      dialogTitle: t.backup.reportDialog,
      UTI: 'com.adobe.pdf',
    });
  }
}
