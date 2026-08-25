import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, SectionList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { classify } from '@/domain/classification';
import {
  customRange,
  groupByDay,
  inRange,
  presetRange,
  RANGE_PRESETS,
  summarise,
  type DateRange,
  type RangeKey,
} from '@/domain/statistics';
import { useTranslation, type Dictionary } from '@/i18n';
import { formatDate, formatDayLabel } from '@/lib/format';
import { useAppState } from '@/state/AppState';
import { Button, Card, Chip, EmptyState, Row, StatTile } from '@/ui/components';
import { DateTimePicker } from '@/ui/DateTimePicker';
import { ReadingListItem } from '@/ui/reading';
import { useTheme } from '@/ui/ThemeProvider';

type BandFilter = 'all' | 'green' | 'amber' | 'red';

/** Preset range labels, in the active language. */
const rangeLabel = (key: string, t: Dictionary): string =>
  ({
    '7d': t.ranges.week,
    '30d': t.ranges.month,
    '90d': t.ranges.threeMonths,
    '1y': t.ranges.year,
    all: t.ranges.all,
  })[key] ?? key;

const bandFilters = (t: Dictionary): { key: BandFilter; label: string }[] => [
  { key: 'all', label: t.history.allLevels },
  { key: 'green', label: t.history.normal },
  { key: 'amber', label: t.history.highNormal },
  { key: 'red', label: t.history.raised },
];

export default function HistoryScreen() {
  const theme = useTheme();
  const t = useTranslation();
  const insets = useSafeAreaInsets();
  const { readings, thresholds } = useAppState();

  const [rangeKey, setRangeKey] = useState<RangeKey>('30d');
  const [custom, setCustom] = useState<{ from: number; to: number }>(() => ({
    from: Date.now() - 30 * 86_400_000,
    to: Date.now(),
  }));
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const [band, setBand] = useState<BandFilter>('all');

  const range: DateRange = useMemo(
    () =>
      rangeKey === 'custom'
        ? customRange(custom.from, custom.to)
        : presetRange(rangeKey as Exclude<RangeKey, 'custom'>),
    [rangeKey, custom],
  );

  const filtered = useMemo(() => {
    return readings.filter((r) => {
      if (!inRange(r, range)) return false;
      if (band === 'all') return true;
      return classify(r.systolic, r.diastolic, thresholds).band === band;
    });
  }, [readings, range, band, thresholds]);

  const summary = useMemo(() => summarise(filtered, thresholds), [filtered, thresholds]);

  const sections = useMemo(
    () =>
      groupByDay(filtered).map((group) => ({
        title: formatDayLabel(group.day, t),
        data: group.readings,
      })),
    [filtered, t],
  );

  return (
    <>
      <SectionList
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 8 }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {RANGE_PRESETS.map((p) => (
                <Chip
                  key={p.key}
                  label={rangeLabel(p.key, t)}
                  selected={rangeKey === p.key}
                  onPress={() => setRangeKey(p.key)}
                />
              ))}
              <Chip
                label={t.history.custom}
                icon="calendar-outline"
                selected={rangeKey === 'custom'}
                onPress={() => setRangeKey('custom')}
              />
            </ScrollView>

            {rangeKey === 'custom' ? (
              <Card padded={false} style={{ padding: 12 }}>
                <View style={styles.customRow}>
                  <DateField
                    label={t.history.from}
                    value={custom.from}
                    onPress={() => setPicking('from')}
                  />
                  <Ionicons name="arrow-forward" size={16} color={theme.colors.textFaint} />
                  <DateField
                    label={t.history.to}
                    value={custom.to}
                    onPress={() => setPicking('to')}
                  />
                </View>
              </Card>
            ) : null}

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {bandFilters(t).map((b) => (
                <Chip
                  key={b.key}
                  label={b.label}
                  selected={band === b.key}
                  onPress={() => setBand(b.key)}
                />
              ))}
            </ScrollView>

            {filtered.length > 0 ? (
              <Row>
                <StatTile label={t.common.readings} value={String(summary.count)} />
                <StatTile
                  label={t.common.average}
                  value={`${Math.round(summary.systolic.mean)}/${Math.round(
                    summary.diastolic.mean,
                  )}`}
                />
                <StatTile
                  label={t.history.range}
                  value={`${summary.systolic.min}–${summary.systolic.max}`}
                  hint={t.history.systolicShort}
                />
              </Row>
            ) : null}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text
            style={{
              ...theme.typography.label,
              color: theme.colors.textMuted,
              marginTop: 16,
              marginBottom: 8,
            }}
          >
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => (
          <View style={{ marginBottom: 8 }}>
            <ReadingListItem
              reading={item}
              thresholds={thresholds}
              onPress={() =>
                router.push({ pathname: '/reading/[id]', params: { id: item.id } })
              }
            />
          </View>
        )}
        ListEmptyComponent={
          <Card>
            <EmptyState
              icon="calendar-outline"
              title={
                readings.length === 0 ? t.history.emptyTitle : t.history.emptyPeriodTitle
              }
              message={
                readings.length === 0
                  ? t.history.emptyMessage
                  : t.history.emptyPeriodMessage
              }
              action={
                readings.length === 0 ? (
                  <Button
                    title={t.history.addReading}
                    onPress={() => router.push('/entry')}
                  />
                ) : null
              }
            />
          </Card>
        }
      />

      <DateTimePicker
        visible={picking !== null}
        mode="date"
        title={picking === 'from' ? t.history.from : t.history.to}
        value={picking === 'to' ? custom.to : custom.from}
        maximum={Date.now()}
        onCancel={() => setPicking(null)}
        onConfirm={(ts) => {
          setCustom((prev) =>
            picking === 'from' ? { ...prev, from: ts } : { ...prev, to: ts },
          );
          setPicking(null);
        }}
      />
    </>
  );
}

function DateField({
  label,
  value,
  onPress,
}: {
  label: string;
  value: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={{ flex: 1 }} accessibilityRole="button">
      <Text style={{ ...theme.typography.micro, color: theme.colors.textFaint }}>
        {label}
      </Text>
      <Text style={{ ...theme.typography.subheading, color: theme.colors.text }}>
        {formatDate(value)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingTop: 8 },
  chipRow: { gap: 8, paddingRight: 16 },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
