import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { useTranslation, getLocale } from '@/i18n';
import { useTheme } from '@/ui/ThemeProvider';
import type { Bucket } from '@/domain/statistics';

import { linearScale, niceTicks, padDomain, smoothPath } from './scale';

export interface TrendChartProps {
  buckets: Bucket[];
  height?: number;
  /** Draws a horizontal goal line, e.g. a personal target systolic. */
  targetSystolic?: number | null;
  targetDiastolic?: number | null;
  showPulse?: boolean;
}

const PADDING = { top: 14, right: 12, bottom: 26, left: 34 };

/**
 * Systolic and diastolic over time.
 *
 * Both series share one axis because the clinically meaningful thing is the gap
 * between them; putting them on separate scales would make a widening pulse
 * pressure look like two unrelated lines drifting.
 */
export function TrendChart({
  buckets,
  height = 220,
  targetSystolic,
  targetDiastolic,
  showPulse = false,
}: TrendChartProps) {
  const theme = useTheme();
  const t = useTranslation();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const geometry = useMemo(() => {
    if (width <= 0 || buckets.length === 0) return null;

    const plotW = Math.max(1, width - PADDING.left - PADDING.right);
    const plotH = Math.max(1, height - PADDING.top - PADDING.bottom);

    const values: number[] = [];
    for (const b of buckets) {
      values.push(b.systolic, b.diastolic);
      if (showPulse && b.pulse !== null) values.push(b.pulse);
    }
    if (targetSystolic) values.push(targetSystolic);
    if (targetDiastolic) values.push(targetDiastolic);

    const [lo, hi] = padDomain(Math.min(...values), Math.max(...values), 0.14, 10);

    const first = buckets[0].start;
    const last = buckets[buckets.length - 1].start;
    // A single point, or several inside one bucket, would give a zero-width
    // domain; nudge it so the mark lands in the middle rather than on the axis.
    const xDomain: [number, number] =
      first === last ? [first - 1, last + 1] : [first, last];

    const x = linearScale(xDomain, [PADDING.left, PADDING.left + plotW]);
    const y = linearScale([lo, hi], [PADDING.top + plotH, PADDING.top]);

    const sysPoints = buckets.map((b) => ({ x: x(b.start), y: y(b.systolic) }));
    const diaPoints = buckets.map((b) => ({ x: x(b.start), y: y(b.diastolic) }));
    const pulsePoints = showPulse
      ? buckets
          .filter((b) => b.pulse !== null)
          .map((b) => ({ x: x(b.start), y: y(b.pulse as number) }))
      : [];

    const sysPath = smoothPath(sysPoints);
    const diaPath = smoothPath(diaPoints);
    const baseline = PADDING.top + plotH;
    const areaPath =
      sysPoints.length > 0
        ? `${sysPath} L ${sysPoints[sysPoints.length - 1].x} ${baseline} L ${sysPoints[0].x} ${baseline} Z`
        : '';
    const bandPath =
      sysPoints.length > 0
        ? `${sysPath} L ${diaPoints[diaPoints.length - 1].x} ${diaPoints[diaPoints.length - 1].y} ` +
          `${[...diaPoints].reverse().slice(1).map((p) => `L ${p.x} ${p.y}`).join(' ')} Z`
        : '';

    return {
      x,
      y,
      plotW,
      plotH,
      baseline,
      sysPoints,
      diaPoints,
      pulsePoints,
      sysPath,
      diaPath,
      areaPath,
      bandPath,
      yTicks: niceTicks(lo, hi, 4),
    };
  }, [buckets, width, height, showPulse, targetSystolic, targetDiastolic]);

  if (buckets.length === 0) {
    return (
      <View onLayout={onLayout} style={[styles.empty, { height }]}>
        <Text style={{ color: theme.colors.textFaint, ...theme.typography.body }}>
          {t.chart.notEnough}
        </Text>
      </View>
    );
  }

  const selectedBucket = selected !== null ? buckets[selected] : null;

  return (
    <View onLayout={onLayout}>
      {geometry && width > 0 && (
        <>
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="sysArea" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={theme.colors.systolic} stopOpacity={0.22} />
                <Stop offset="1" stopColor={theme.colors.systolic} stopOpacity={0.01} />
              </LinearGradient>
            </Defs>

            {/* Horizontal guides */}
            {geometry.yTicks.map((tick) => (
              <G key={tick}>
                <Line
                  x1={PADDING.left}
                  y1={geometry.y(tick)}
                  x2={PADDING.left + geometry.plotW}
                  y2={geometry.y(tick)}
                  stroke={theme.colors.border}
                  strokeWidth={1}
                />
                <SvgText
                  x={PADDING.left - 6}
                  y={geometry.y(tick) + 4}
                  fontSize={10}
                  fill={theme.colors.textFaint}
                  textAnchor="end"
                >
                  {String(Math.round(tick))}
                </SvgText>
              </G>
            ))}

            {/* Target lines */}
            {targetSystolic ? (
              <Line
                x1={PADDING.left}
                y1={geometry.y(targetSystolic)}
                x2={PADDING.left + geometry.plotW}
                y2={geometry.y(targetSystolic)}
                stroke={theme.colors.systolic}
                strokeWidth={1}
                strokeDasharray="4 4"
                opacity={0.6}
              />
            ) : null}
            {targetDiastolic ? (
              <Line
                x1={PADDING.left}
                y1={geometry.y(targetDiastolic)}
                x2={PADDING.left + geometry.plotW}
                y2={geometry.y(targetDiastolic)}
                stroke={theme.colors.diastolic}
                strokeWidth={1}
                strokeDasharray="4 4"
                opacity={0.6}
              />
            ) : null}

            {/* The gap between systolic and diastolic, shaded */}
            <Path d={geometry.bandPath} fill={theme.colors.systolic} opacity={0.07} />
            <Path d={geometry.areaPath} fill="url(#sysArea)" />

            {showPulse && geometry.pulsePoints.length > 1 && (
              <Path
                d={smoothPath(geometry.pulsePoints)}
                stroke={theme.colors.pulse}
                strokeWidth={1.5}
                strokeDasharray="3 3"
                fill="none"
                opacity={0.75}
              />
            )}

            <Path
              d={geometry.diaPath}
              stroke={theme.colors.diastolic}
              strokeWidth={2.5}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path
              d={geometry.sysPath}
              stroke={theme.colors.systolic}
              strokeWidth={2.5}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Individual marks, only when they will not crowd each other */}
            {buckets.length <= 40 &&
              geometry.sysPoints.map((p, i) => (
                <G key={`p${i}`}>
                  <Circle
                    cx={p.x}
                    cy={p.y}
                    r={selected === i ? 5 : 3}
                    fill={theme.colors.surface}
                    stroke={theme.colors.systolic}
                    strokeWidth={2}
                  />
                  <Circle
                    cx={geometry.diaPoints[i].x}
                    cy={geometry.diaPoints[i].y}
                    r={selected === i ? 5 : 3}
                    fill={theme.colors.surface}
                    stroke={theme.colors.diastolic}
                    strokeWidth={2}
                  />
                </G>
              ))}

            {selected !== null && geometry.sysPoints[selected] && (
              <Line
                x1={geometry.sysPoints[selected].x}
                y1={PADDING.top}
                x2={geometry.sysPoints[selected].x}
                y2={geometry.baseline}
                stroke={theme.colors.textFaint}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            )}

            {/* Touch targets, one column per bucket */}
            {buckets.map((_, i) => {
              const step = geometry.plotW / Math.max(1, buckets.length);
              return (
                <Rect
                  key={`hit${i}`}
                  x={PADDING.left + step * i}
                  y={PADDING.top}
                  width={step}
                  height={geometry.plotH}
                  fill="transparent"
                  onPress={() => setSelected(selected === i ? null : i)}
                />
              );
            })}
          </Svg>

          {selectedBucket && (
            <Pressable
              onPress={() => setSelected(null)}
              style={[
                styles.tooltip,
                {
                  backgroundColor: theme.colors.surfaceRaised,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Text style={[styles.tooltipDate, { color: theme.colors.textMuted }]}>
                {formatBucketDate(selectedBucket.start)}
                {selectedBucket.count > 1
                  ? ` · ${t.chart.averageOf(selectedBucket.count)}`
                  : ''}
              </Text>
              <Text style={[styles.tooltipValue, { color: theme.colors.text }]}>
                {Math.round(selectedBucket.systolic)}/{Math.round(selectedBucket.diastolic)}
                {selectedBucket.pulse !== null
                  ? `  ·  ${Math.round(selectedBucket.pulse)} bpm`
                  : ''}
              </Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

function formatBucketDate(ts: number): string {
  return new Date(ts).toLocaleDateString(getLocale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center' },
  tooltip: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'flex-start',
  },
  tooltipDate: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
  tooltipValue: { fontSize: 16, fontWeight: '700' },
});
