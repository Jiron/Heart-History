import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { DAY_MS, startOfDay } from '@/domain/statistics';
import { getLocale, useTranslation } from '@/i18n';
import { formatDate, formatTime } from '@/lib/format';

import { Button } from './components';
import { useTheme } from './ThemeProvider';

/**
 * A month grid plus optional time steppers.
 *
 * Written by hand rather than pulled from a native picker library so it works
 * identically in Expo Go and in a production build, and so the calendar matches
 * the rest of the app's styling instead of the OS dialog.
 */
export function DateTimePicker({
  visible,
  value,
  mode = 'datetime',
  minimum,
  maximum,
  onCancel,
  onConfirm,
  title,
}: {
  visible: boolean;
  value: number;
  mode?: 'date' | 'datetime';
  minimum?: number;
  maximum?: number;
  onCancel: () => void;
  onConfirm: (ts: number) => void;
  title?: string;
}) {
  const theme = useTheme();
  const t = useTranslation();
  const [draft, setDraft] = useState(value);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(value));

  // Re-seed whenever the sheet is reopened with a different value. Done during
  // render rather than in an effect, so the sheet never opens on a stale month.
  const [seededFrom, setSeededFrom] = useState({ visible, value });
  if (seededFrom.visible !== visible || seededFrom.value !== value) {
    setSeededFrom({ visible, value });
    if (visible) {
      setDraft(value);
      setViewMonth(startOfMonth(value));
    }
  }

  const grid = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);
  const draftDay = startOfDay(draft);

  const isDisabled = (day: number) =>
    (minimum !== undefined && day < startOfDay(minimum)) ||
    (maximum !== undefined && day > startOfDay(maximum));

  const setTimePart = (hours: number, minutes: number) => {
    const d = new Date(draft);
    d.setHours(hours, minutes, 0, 0);
    setDraft(d.getTime());
  };

  const current = new Date(draft);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]} onPress={onCancel}>
        <Pressable
          style={[
            styles.sheet,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={{ ...theme.typography.heading, color: theme.colors.text }}>
            {title ?? t.picker.pickDate}
          </Text>

          <View style={styles.monthHeader}>
            <Pressable
              onPress={() => setViewMonth(addMonths(viewMonth, -1))}
              hitSlop={10}
              accessibilityLabel={t.picker.previousMonth}
            >
              <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
            </Pressable>
            <Text style={{ ...theme.typography.subheading, color: theme.colors.text }}>
              {new Date(viewMonth).toLocaleDateString(getLocale(), {
                month: 'long',
                year: 'numeric',
              })}
            </Text>
            <Pressable
              onPress={() => setViewMonth(addMonths(viewMonth, 1))}
              hitSlop={10}
              accessibilityLabel={t.picker.nextMonth}
            >
              <Ionicons name="chevron-forward" size={20} color={theme.colors.text} />
            </Pressable>
          </View>

          <View style={styles.weekdayRow}>
            {weekdayLabels().map((d, index) => (
              <Text
                key={index}
                style={{
                  ...theme.typography.micro,
                  color: theme.colors.textFaint,
                  width: CELL,
                  textAlign: 'center',
                }}
              >
                {d}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {grid.map((day, i) => {
              if (day === null) return <View key={`e${i}`} style={styles.cell} />;
              const selected = day === draftDay;
              const disabled = isDisabled(day);
              const inMonth = new Date(day).getMonth() === new Date(viewMonth).getMonth();
              return (
                <Pressable
                  key={day}
                  disabled={disabled}
                  onPress={() => {
                    const d = new Date(day);
                    d.setHours(current.getHours(), current.getMinutes(), 0, 0);
                    setDraft(d.getTime());
                  }}
                  style={[
                    styles.cell,
                    selected && {
                      backgroundColor: theme.colors.accent,
                      borderRadius: 10,
                    },
                  ]}
                >
                  <Text
                    style={{
                      ...theme.typography.body,
                      color: selected
                        ? theme.colors.onAccent
                        : disabled
                          ? theme.colors.textFaint
                          : inMonth
                            ? theme.colors.text
                            : theme.colors.textFaint,
                      opacity: disabled ? 0.4 : 1,
                      fontWeight: selected ? '700' : '400',
                    }}
                  >
                    {new Date(day).getDate()}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {mode === 'datetime' ? (
            <View style={styles.timeRow}>
              <Text style={{ ...theme.typography.label, color: theme.colors.textMuted }}>
                {t.picker.time}
              </Text>
              <View style={styles.steppers}>
                <Stepper
                  label={String(current.getHours()).padStart(2, '0')}
                  onUp={() => setTimePart((current.getHours() + 1) % 24, current.getMinutes())}
                  onDown={() =>
                    setTimePart((current.getHours() + 23) % 24, current.getMinutes())
                  }
                  accessibilityLabel={t.picker.hours}
                />
                <Text style={{ ...theme.typography.heading, color: theme.colors.textFaint }}>
                  :
                </Text>
                <Stepper
                  label={String(current.getMinutes()).padStart(2, '0')}
                  onUp={() =>
                    setTimePart(current.getHours(), (current.getMinutes() + 5) % 60)
                  }
                  onDown={() =>
                    setTimePart(current.getHours(), (current.getMinutes() + 55) % 60)
                  }
                  accessibilityLabel={t.picker.minutes}
                />
              </View>
            </View>
          ) : null}

          <Text
            style={{
              ...theme.typography.caption,
              color: theme.colors.textFaint,
              textAlign: 'center',
            }}
          >
            {formatDate(draft)}
            {mode === 'datetime' ? ` · ${formatTime(draft)}` : ''}
          </Text>

          <View style={styles.actions}>
            <Button
              title={t.common.cancel}
              variant="ghost"
              style={{ flex: 1 }}
              onPress={onCancel}
            />
            <Button
              title={t.common.done}
              style={{ flex: 1 }}
              onPress={() => onConfirm(draft)}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Stepper({
  label,
  onUp,
  onDown,
  accessibilityLabel,
}: {
  label: string;
  onUp: () => void;
  onDown: () => void;
  accessibilityLabel: string;
}) {
  const theme = useTheme();
  const t = useTranslation();
  return (
    <View style={{ alignItems: 'center' }}>
      <Pressable
        onPress={onUp}
        hitSlop={8}
        accessibilityLabel={`${accessibilityLabel} ${t.picker.up}`}
      >
        <Ionicons name="chevron-up" size={18} color={theme.colors.textMuted} />
      </Pressable>
      <Text style={{ ...theme.typography.title, color: theme.colors.text }}>{label}</Text>
      <Pressable
        onPress={onDown}
        hitSlop={8}
        accessibilityLabel={`${accessibilityLabel} ${t.picker.down}`}
      >
        <Ionicons name="chevron-down" size={18} color={theme.colors.textMuted} />
      </Pressable>
    </View>
  );
}

/**
 * Weekday initials for the active locale, Monday first.
 *
 * Derived from `Intl` rather than hard-coded, so a new language needs no new
 * list — and the abbreviations match what the rest of the system shows.
 */
function weekdayLabels(): string[] {
  // 2024-01-01 was a Monday; seven consecutive days give the full week in order.
  const monday = new Date(2024, 0, 1);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday.getTime() + i * DAY_MS);
    return day.toLocaleDateString(getLocale(), { weekday: 'short' }).slice(0, 2);
  });
}
const CELL = 40;

function startOfMonth(ts: number): number {
  const d = new Date(ts);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function addMonths(ts: number, delta: number): number {
  const d = new Date(ts);
  d.setMonth(d.getMonth() + delta);
  return d.getTime();
}

/** Six weeks of day timestamps, Monday-first, padded with nulls at the start. */
function buildMonthGrid(monthStart: number): (number | null)[] {
  const first = new Date(monthStart);
  // getDay() is Sunday-first; shift so Monday is column 0.
  const leading = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(
    first.getFullYear(),
    first.getMonth() + 1,
    0,
  ).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < leading; i++) cells.push(null);
  for (let d = 0; d < daysInMonth; d++) cells.push(monthStart + d * DAY_MS);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    gap: 12,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weekdayRow: { flexDirection: 'row', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: CELL, height: CELL, alignItems: 'center', justifyContent: 'center' },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  steppers: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
});
