import React, { useMemo, useSyncExternalStore } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TrendChart } from '@/charts/TrendChart';
import { classify } from '@/domain/classification';
import {
  bucketise,
  chooseBucket,
  DAY_MS,
  presetRange,
  sevenDayAverage,
  summarise,
  trendOf,
} from '@/domain/statistics';
import { useTranslation } from '@/i18n';
import { formatRelative } from '@/lib/format';
import { useAppState } from '@/state/AppState';
import { getScanJob, subscribeToScan } from '@/state/scanBuffer';
import { Banner, Button, Card, EmptyState, Row, SectionHeader, StatTile } from '@/ui/components';
import { CategoryPill, ReadingListItem, ReadingValue } from '@/ui/reading';
import { useTheme } from '@/ui/ThemeProvider';

export default function DashboardScreen() {
  const theme = useTheme();
  const t = useTranslation();
  const insets = useSafeAreaInsets();
  const { readings, thresholds, profile, profiles, refresh } = useAppState();
  const [refreshing, setRefreshing] = React.useState(false);
  // A scan started from the camera keeps running after that screen closes,
  // so it needs somewhere to be visible. See state/scanBuffer.
  const scan = useSyncExternalStore(subscribeToScan, getScanJob, getScanJob);

  const latest = readings[0] ?? null;

  const month = useMemo(() => {
    const range = presetRange('30d');
    const inWindow = readings.filter(
      (r) => range.since === null || r.measuredAt >= range.since,
    );
    return {
      readings: inWindow,
      summary: summarise(inWindow, thresholds),
      trend: trendOf(inWindow),
    };
  }, [readings, thresholds]);

  const weekAverage = useMemo(() => sevenDayAverage(readings), [readings]);

  const buckets = useMemo(() => {
    if (month.readings.length === 0) return [];
    const span = 30 * DAY_MS;
    return bucketise(month.readings, chooseBucket(span, 30));
  }, [month.readings]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.colors.accent}
        />
      }
    >
      {profiles.length > 1 ? (
        <Text style={{ ...theme.typography.label, color: theme.colors.textMuted }}>
          {profile.name}
        </Text>
      ) : null}

      {scan ? (
        <Pressable onPress={() => router.push('/review')}>
          <Card>
            <Row style={{ alignItems: 'center', gap: 12 }}>
              {scan.status === 'running' ? (
                <ActivityIndicator color={theme.colors.accent} />
              ) : (
                <Ionicons
                  name={scan.status === 'done' ? 'checkmark-circle' : 'alert-circle'}
                  size={22}
                  color={scan.status === 'done' ? theme.colors.accent : theme.colors.danger}
                />
              )}
              <Text style={{ ...theme.typography.subheading, color: theme.colors.text, flex: 1 }}>
                {scan.status === 'running'
                  ? t.home.scanRunning
                  : scan.status === 'done'
                    ? t.home.scanReady
                    : t.home.scanFailed}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textFaint} />
            </Row>
          </Card>
        </Pressable>
      ) : null}

      {latest ? (
        <Card level={2}>
          <View style={styles.latestHeader}>
            <Text style={{ ...theme.typography.micro, color: theme.colors.textFaint }}>
              {t.home.latestReading}
            </Text>
            <Text style={{ ...theme.typography.caption, color: theme.colors.textFaint }}>
              {formatRelative(latest.measuredAt, t)}
            </Text>
          </View>

          <View style={{ marginVertical: 10 }}>
            <ReadingValue
              systolic={latest.systolic}
              diastolic={latest.diastolic}
              pulse={latest.pulse}
            />
          </View>

          <CategoryPill
            systolic={latest.systolic}
            diastolic={latest.diastolic}
            thresholds={thresholds}
          />

          <Text
            style={{
              ...theme.typography.body,
              color: theme.colors.textMuted,
              marginTop: 10,
            }}
          >
            {t.categoryDescriptions[classify(latest.systolic, latest.diastolic, thresholds).key]}
          </Text>
        </Card>
      ) : (
        <Card>
          <EmptyState
            icon="camera-outline"
            title={t.home.noReadingsTitle}
            message={t.home.noReadingsMessage}
          />
        </Card>
      )}

      <Row>
        <Button
          title={t.home.scanMonitor}
          icon="camera"
          fullWidth
          style={{ flex: 1 }}
          onPress={() => router.push('/scan')}
        />
        <Button
          title={t.common.add}
          icon="create-outline"
          variant="secondary"
          onPress={() => router.push('/entry')}
        />
      </Row>

      {weekAverage ? (
        <Card>
          <SectionHeader title={t.home.sevenDayAverage} />
          <Row>
            <StatTile
              label={t.common.systolic}
              value={String(weekAverage.systolic)}
              unit={t.common.mmHg}
              colour={theme.colors.systolic}
            />
            <StatTile
              label={t.common.diastolic}
              value={String(weekAverage.diastolic)}
              unit={t.common.mmHg}
              colour={theme.colors.diastolic}
            />
          </Row>
          <Text
            style={{
              ...theme.typography.caption,
              color: theme.colors.textFaint,
              marginTop: 10,
            }}
          >
            {t.home.sevenDayNote(weekAverage.days, weekAverage.count)}
          </Text>
        </Card>
      ) : null}

      {month.readings.length >= 2 ? (
        <Card>
          <SectionHeader
            title={t.home.last30Days}
            action={t.common.seeAll}
            onAction={() => router.push('/(tabs)/trends')}
          />
          <TrendChart
            buckets={buckets}
            targetSystolic={profile.targetSystolic}
            targetDiastolic={profile.targetDiastolic}
          />
          <Row style={{ marginTop: 12 }}>
            <StatTile
              label={t.common.average}
              value={`${Math.round(month.summary.systolic.mean)}/${Math.round(
                month.summary.diastolic.mean,
              )}`}
            />
            <StatTile label={t.common.readings} value={String(month.summary.count)} />
            {month.summary.pulse ? (
              <StatTile
                label={t.common.pulse}
                value={String(Math.round(month.summary.pulse.mean))}
                unit={t.common.bpm}
              />
            ) : null}
          </Row>
        </Card>
      ) : null}

      {month.trend && month.trend.direction !== 'steady' ? (
        <Banner
          tone={month.trend.direction === 'rising' ? 'warning' : 'success'}
          title={
            month.trend.direction === 'rising' ? t.home.trendingUp : t.home.trendingDown
          }
          message={t.home.trendMessage(Math.abs(month.trend.systolicPerWeek))}
          icon={month.trend.direction === 'rising' ? 'trending-up' : 'trending-down'}
        />
      ) : null}

      {readings.length > 0 ? (
        <View>
          <SectionHeader
            title={t.home.recent}
            action={t.common.seeAll}
            onAction={() => router.push('/(tabs)/history')}
          />
          <View style={{ gap: 8 }}>
            {readings.slice(0, 5).map((r) => (
              <ReadingListItem
                key={r.id}
                reading={r}
                thresholds={thresholds}
                onPress={() => router.push({ pathname: '/reading/[id]', params: { id: r.id } })}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.disclaimer}>
        <Ionicons name="information-circle-outline" size={15} color={theme.colors.textFaint} />
        <Text style={{ ...theme.typography.caption, color: theme.colors.textFaint, flex: 1 }}>
          {t.home.disclaimer}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  latestHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  disclaimer: { flexDirection: 'row', gap: 8, paddingHorizontal: 4, alignItems: 'flex-start' },
});
