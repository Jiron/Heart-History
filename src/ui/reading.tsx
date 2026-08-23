import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { classify } from '@/domain/classification';
import type { ClassificationScale, Reading } from '@/domain/types';
import { useTranslation } from '@/i18n';
import { formatTime } from '@/lib/format';

import { useTheme } from './ThemeProvider';

export function CategoryPill({
  systolic,
  diastolic,
  scale,
  compact,
}: {
  systolic: number;
  diastolic: number;
  scale: ClassificationScale;
  compact?: boolean;
}) {
  const theme = useTheme();
  const t = useTranslation();
  const category = classify(systolic, diastolic, scale);
  const colours = theme.category[category.key];
  const names = t.categories[category.key];

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: colours.soft,
          paddingVertical: compact ? 3 : 5,
          paddingHorizontal: compact ? 8 : 11,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: colours.main }]} />
      <Text
        style={{
          ...(compact ? theme.typography.micro : theme.typography.label),
          color: colours.onSoft,
        }}
      >
        {compact ? names.short : names.label}
      </Text>
    </View>
  );
}

/** The big "122/79" pair, with the unit and pulse alongside. */
export function ReadingValue({
  systolic,
  diastolic,
  pulse,
  size = 'large',
}: {
  systolic: number;
  diastolic: number;
  pulse?: number | null;
  size?: 'large' | 'medium';
}) {
  const theme = useTheme();
  const t = useTranslation();
  const big = size === 'large';

  return (
    <View style={styles.valueRow}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text
          style={{
            fontSize: big ? 46 : 26,
            lineHeight: big ? 50 : 30,
            fontWeight: '700',
            letterSpacing: big ? -1.4 : -0.6,
            color: theme.colors.systolic,
          }}
        >
          {systolic}
        </Text>
        <Text
          style={{
            fontSize: big ? 30 : 18,
            fontWeight: '400',
            color: theme.colors.textFaint,
            marginHorizontal: big ? 4 : 2,
          }}
        >
          /
        </Text>
        <Text
          style={{
            fontSize: big ? 46 : 26,
            lineHeight: big ? 50 : 30,
            fontWeight: '700',
            letterSpacing: big ? -1.4 : -0.6,
            color: theme.colors.diastolic,
          }}
        >
          {diastolic}
        </Text>
        <Text
          style={{
            ...theme.typography.caption,
            color: theme.colors.textFaint,
            marginLeft: 6,
          }}
        >
          {t.common.mmHg}
        </Text>
      </View>

      {pulse != null ? (
        <View style={styles.pulseRow}>
          <Ionicons name="pulse" size={big ? 16 : 13} color={theme.colors.pulse} />
          <Text
            style={{
              ...(big ? theme.typography.subheading : theme.typography.caption),
              color: theme.colors.pulse,
            }}
          >
            {pulse}
          </Text>
          <Text style={{ ...theme.typography.caption, color: theme.colors.textFaint }}>
            {t.common.bpm}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** One row in the history list. */
export function ReadingListItem({
  reading,
  scale,
  onPress,
}: {
  reading: Reading;
  scale: ClassificationScale;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const t = useTranslation();
  const category = classify(reading.systolic, reading.diastolic, scale);
  const colours = theme.category[category.key];
  const names = t.categories[category.key];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${reading.systolic}/${reading.diastolic}, ${names.label}, ${formatTime(reading.measuredAt)}`}
      style={({ pressed }) => [
        styles.item,
        {
          backgroundColor: pressed ? theme.colors.surfaceSunken : theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <View style={[styles.itemStripe, { backgroundColor: colours.main }]} />

      <View style={{ flex: 1, gap: 3 }}>
        <View style={styles.itemTop}>
          <Text style={{ ...theme.typography.heading, color: theme.colors.text }}>
            {reading.systolic}
            <Text style={{ color: theme.colors.textFaint, fontWeight: '400' }}> / </Text>
            {reading.diastolic}
          </Text>
          {reading.pulse != null ? (
            <View style={styles.pulseRow}>
              <Ionicons name="pulse" size={12} color={theme.colors.pulse} />
              <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>
                {reading.pulse}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.itemMeta}>
          <Text style={{ ...theme.typography.caption, color: theme.colors.textFaint }}>
            {formatTime(reading.measuredAt)}
          </Text>
          <Text style={{ ...theme.typography.caption, color: colours.main }}>
            {names.short}
          </Text>
          {reading.irregularHeartbeat ? (
            <Ionicons name="alert-circle" size={13} color={theme.colors.warning} />
          ) : null}
          {reading.source === 'scan' ? (
            <Ionicons name="camera" size={12} color={theme.colors.textFaint} />
          ) : null}
          {reading.note ? (
            <Ionicons name="document-text-outline" size={12} color={theme.colors.textFaint} />
          ) : null}
        </View>
      </View>

      <Ionicons name="chevron-forward" size={18} color={theme.colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  pulseRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  itemStripe: { width: 4, height: 38, borderRadius: 2 },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
