import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CATEGORIES, type BpCategory } from '@/domain/classification';
import type { DayPartAverage } from '@/domain/statistics';
import { useTranslation } from '@/i18n';
import { useTheme } from '@/ui/ThemeProvider';

/**
 * How readings in a period split across the categories, as one stacked bar.
 *
 * A stacked bar rather than a pie: the useful comparison is "how much of my
 * record sits in the raised bands", which is a length judgement, and lengths are
 * read far more accurately than angles.
 */
export function DistributionBar({
  distribution,
}: {
  distribution: { category: BpCategory; count: number; share: number }[];
}) {
  const theme = useTheme();
  const t = useTranslation();
  if (distribution.length === 0) return null;

  const ordered = [...distribution].sort(
    (a, b) => CATEGORIES[a.category].severity - CATEGORIES[b.category].severity,
  );

  return (
    <View style={{ gap: 12 }}>
      <View style={[styles.bar, { backgroundColor: theme.colors.surfaceSunken }]}>
        {ordered.map((slice) => (
          <View
            key={slice.category}
            style={{
              flex: slice.share,
              backgroundColor: theme.category[slice.category].main,
            }}
          />
        ))}
      </View>

      <View style={styles.legend}>
        {ordered.map((slice) => (
          <View key={slice.category} style={styles.legendItem}>
            <View
              style={[styles.swatch, { backgroundColor: theme.category[slice.category].main }]}
            />
            <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>
              {t.categories[slice.category].short}
            </Text>
            <Text style={{ ...theme.typography.caption, color: theme.colors.textFaint }}>
              {Math.round(slice.share * 100)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Average systolic/diastolic by time of day.
 *
 * Blood pressure follows a daily rhythm, so comparing a morning reading against
 * an evening one is comparing different things. Splitting them out makes the
 * pattern visible instead of averaging it away.
 */
export function DayPartChart({ data }: { data: DayPartAverage[] }) {
  const theme = useTheme();
  const t = useTranslation();
  if (data.length === 0) return null;

  const max = Math.max(...data.map((d) => d.systolic), 140);

  return (
    <View style={{ gap: 12 }}>
      {data.map((d) => (
        <View key={d.part} style={{ gap: 5 }}>
          <View style={styles.partHeader}>
            <Text style={{ ...theme.typography.label, color: theme.colors.text }}>
              {t.dayParts[d.part]}
            </Text>
            <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>
              {d.systolic}/{d.diastolic}
              <Text style={{ color: theme.colors.textFaint }}>
                {'  '}·{'  '}
                {t.common.readingCount(d.count)}
              </Text>
            </Text>
          </View>

          <View style={[styles.track, { backgroundColor: theme.colors.surfaceSunken }]}>
            <View
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${(d.systolic / max) * 100}%`,
                backgroundColor: theme.colors.systolic,
                borderRadius: 5,
                opacity: 0.85,
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${(d.diastolic / max) * 100}%`,
                backgroundColor: theme.colors.diastolic,
                borderRadius: 5,
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatch: { width: 9, height: 9, borderRadius: 3 },
  partHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  track: { height: 10, borderRadius: 5, overflow: 'hidden' },
});
