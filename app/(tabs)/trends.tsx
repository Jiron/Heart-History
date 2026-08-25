import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DayPartChart, DistributionBar } from '@/charts/Breakdown';
import { TrendChart } from '@/charts/TrendChart';
import { meanArterialPressure, pulsePressure } from '@/domain/classification';
import {
  averagesByDayPart,
  bucketise,
  chooseBucket,
  customRange,
  inRange,
  presetRange,
  RANGE_PRESETS,
  summarise,
  trendOf,
  type DateRange,
  type RangeKey,
} from '@/domain/statistics';
import { useTranslation, type Dictionary } from '@/i18n';
import { formatDate } from '@/lib/format';
import { useAppState } from '@/state/AppState';
import { Banner, Card, Chip, EmptyState, Row, SectionHeader, StatTile } from '@/ui/components';
import { DateTimePicker } from '@/ui/DateTimePicker';
import { CategoryPill } from '@/ui/reading';
import { useTheme } from '@/ui/ThemeProvider';

export default function TrendsScreen() {
  const theme = useTheme();
  const t = useTranslation();
  const insets = useSafeAreaInsets();
  const { readings, thresholds, profile } = useAppState();

  const [rangeKey, setRangeKey] = useState<RangeKey>('90d');
  const [custom, setCustom] = useState(() => ({
    from: Date.now() - 90 * 86_400_000,
    to: Date.now(),
  }));
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const [showPulse, setShowPulse] = useState(false);

  const range: DateRange = useMemo(
    () =>
      rangeKey === 'custom'
        ? customRange(custom.from, custom.to)
        : presetRange(rangeKey as Exclude<RangeKey, 'custom'>),
    [rangeKey, custom],
  );

  const filtered = useMemo(
    () => readings.filter((r) => inRange(r, range)),
    [readings, range],
  );

  const summary = useMemo(() => summarise(filtered, thresholds), [filtered, thresholds]);
  const trend = useMemo(() => trendOf(filtered), [filtered]);
  const dayParts = useMemo(() => averagesByDayPart(filtered), [filtered]);

  const buckets = useMemo(() => {
    if (filtered.length === 0) return [];
    const times = filtered.map((r) => r.measuredAt);
    const span = Math.max(1, Math.max(...times) - Math.min(...times));
    return bucketise(filtered, chooseBucket(span, 45));
  }, [filtered]);

  return (
    <>
      <ScrollView
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      >
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
              <Pressable onPress={() => setPicking('from')} style={{ flex: 1 }}>
                <Text style={{ ...theme.typography.micro, color: theme.colors.textFaint }}>
                  {t.history.from}
                </Text>
                <Text style={{ ...theme.typography.subheading, color: theme.colors.text }}>
                  {formatDate(custom.from)}
                </Text>
              </Pressable>
              <Ionicons name="arrow-forward" size={16} color={theme.colors.textFaint} />
              <Pressable onPress={() => setPicking('to')} style={{ flex: 1 }}>
                <Text style={{ ...theme.typography.micro, color: theme.colors.textFaint }}>
                  {t.history.to}
                </Text>
                <Text style={{ ...theme.typography.subheading, color: theme.colors.text }}>
                  {formatDate(custom.to)}
                </Text>
              </Pressable>
            </View>
          </Card>
        ) : null}

        {filtered.length < 2 ? (
          <Card>
            <EmptyState
              icon="analytics-outline"
              title={t.trends.notEnoughTitle}
              message={t.trends.notEnoughMessage}
            />
          </Card>
        ) : (
          <>
            <Card>
              <View style={styles.chartHeader}>
                <SectionHeader title={t.trends.bloodPressure} />
                <View style={styles.pulseToggle}>
                  <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>
                    {t.common.pulse}
                  </Text>
                  <Switch
                    value={showPulse}
                    onValueChange={setShowPulse}
                    trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
                    thumbColor={theme.colors.surface}
                  />
                </View>
              </View>

              <TrendChart
                buckets={buckets}
                height={250}
                showPulse={showPulse}
                targetSystolic={profile.targetSystolic}
                targetDiastolic={profile.targetDiastolic}
              />

              <View style={styles.legend}>
                <LegendDot colour={theme.colors.systolic} label={t.common.systolic} />
                <LegendDot colour={theme.colors.diastolic} label={t.common.diastolic} />
                {showPulse ? (
                  <LegendDot colour={theme.colors.pulse} label={t.common.pulse} />
                ) : null}
              </View>

              {buckets.length < filtered.length ? (
                <Text
                  style={{
                    ...theme.typography.caption,
                    color: theme.colors.textFaint,
                    marginTop: 8,
                  }}
                >
                  {t.trends.grouped(filtered.length, buckets.length)}
                </Text>
              ) : null}
            </Card>

            {trend ? (
              <Banner
                tone={
                  trend.direction === 'rising'
                    ? 'warning'
                    : trend.direction === 'falling'
                      ? 'success'
                      : 'info'
                }
                title={
                  trend.direction === 'steady'
                    ? t.trends.steady
                    : trend.direction === 'rising'
                      ? t.trends.driftingUp
                      : t.trends.driftingDown
                }
                message={
                  trend.direction === 'steady'
                    ? t.trends.steadyMessage
                    : t.trends.driftMessage(
                        Math.abs(trend.systolicPerWeek),
                        Math.abs(trend.diastolicPerWeek),
                      )
                }
              />
            ) : null}

            <Card>
              <SectionHeader title={t.trends.thisPeriod} />
              <Row>
                <StatTile
                  label={t.common.systolic}
                  value={String(Math.round(summary.systolic.mean))}
                  hint={`${summary.systolic.min}–${summary.systolic.max}`}
                  colour={theme.colors.systolic}
                />
                <StatTile
                  label={t.common.diastolic}
                  value={String(Math.round(summary.diastolic.mean))}
                  hint={`${summary.diastolic.min}–${summary.diastolic.max}`}
                  colour={theme.colors.diastolic}
                />
                {summary.pulse ? (
                  <StatTile
                    label={t.common.pulse}
                    value={String(Math.round(summary.pulse.mean))}
                    hint={`${summary.pulse.min}–${summary.pulse.max}`}
                    colour={theme.colors.pulse}
                  />
                ) : null}
              </Row>

              <Row style={{ marginTop: 10 }}>
                <StatTile
                  label={t.trends.pulsePressure}
                  value={String(
                    pulsePressure(
                      Math.round(summary.systolic.mean),
                      Math.round(summary.diastolic.mean),
                    ),
                  )}
                  unit={t.common.mmHg}
                  hint={t.trends.pulsePressureHint}
                />
                <StatTile
                  label={t.trends.meanArterial}
                  value={String(
                    meanArterialPressure(
                      Math.round(summary.systolic.mean),
                      Math.round(summary.diastolic.mean),
                    ),
                  )}
                  unit={t.common.mmHg}
                />
                <StatTile
                  label={t.trends.variation}
                  value={`±${summary.systolic.sd}`}
                  hint={t.trends.variationHint}
                />
              </Row>

              {summary.averageCategory ? (
                <View style={{ marginTop: 14, gap: 8 }}>
                  <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>
                    {t.trends.averageSitsAt}
                  </Text>
                  <CategoryPill
                    systolic={Math.round(summary.systolic.mean)}
                    diastolic={Math.round(summary.diastolic.mean)}
                    thresholds={thresholds}
                  />
                </View>
              ) : null}
            </Card>

            <Card>
              <SectionHeader title={t.trends.distribution} />
              <DistributionBar distribution={summary.distribution} />
            </Card>

            {dayParts.length > 1 ? (
              <Card>
                <SectionHeader title={t.trends.byTimeOfDay} />
                <DayPartChart data={dayParts} />
                <Text
                  style={{
                    ...theme.typography.caption,
                    color: theme.colors.textFaint,
                    marginTop: 12,
                  }}
                >
                  {t.trends.byTimeOfDayNote}
                </Text>
              </Card>
            ) : null}

            {summary.irregularCount > 0 ? (
              <Banner
                tone="warning"
                title={t.trends.irregularTitle}
                message={t.trends.irregularMessage(summary.irregularCount, summary.count)}
              />
            ) : null}
          </>
        )}
      </ScrollView>

      <DateTimePicker
        visible={picking !== null}
        mode="date"
        title={picking === 'from' ? t.history.from : t.history.to}
        value={picking === 'to' ? custom.to : custom.from}
        maximum={Date.now()}
        onCancel={() => setPicking(null)}
        onConfirm={(ts) => {
          setCustom((prev) => (picking === 'from' ? { ...prev, from: ts } : { ...prev, to: ts }));
          setPicking(null);
        }}
      />
    </>
  );
}

function LegendDot({ colour, label }: { colour: string; label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.legendItem}>
      <View style={{ width: 10, height: 3, borderRadius: 2, backgroundColor: colour }} />
      <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>{label}</Text>
    </View>
  );
}

/** Preset range labels, in the active language. */
const rangeLabel = (key: string, t: Dictionary): string =>
  ({
    '7d': t.ranges.week,
    '30d': t.ranges.month,
    '90d': t.ranges.threeMonths,
    '1y': t.ranges.year,
    all: t.ranges.all,
  })[key] ?? key;

const styles = StyleSheet.create({
  content: { padding: 16, paddingTop: 8, gap: 16 },
  chipRow: { gap: 8, paddingRight: 16 },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chartHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pulseToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  legend: { flexDirection: 'row', gap: 16, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
