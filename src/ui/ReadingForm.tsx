import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { RANGES } from '@/ocr/pipeline';
import type { Arm, Posture } from '@/domain/types';
import { useTranslation, type Dictionary } from '@/i18n';
import { formatDate, formatTime } from '@/lib/format';

import { Card, Chip, Row, SectionHeader } from './components';
import { DateTimePicker } from './DateTimePicker';
import { CategoryPill } from './reading';
import { useTheme } from './ThemeProvider';

export interface ReadingDraft {
  systolic: number | null;
  diastolic: number | null;
  pulse: number | null;
  measuredAt: number;
  arm: Arm | null;
  posture: Posture | null;
  irregularHeartbeat: boolean;
  note: string;
  tags: string[];
}

/**
 * Tag keys, stored language-independently.
 *
 * The stored value is the key, never the translated label, so a reading tagged
 * in German still reads correctly after switching the app to English.
 */
export const TAG_KEYS = [
  'beforeMedication',
  'afterMedication',
  'afterExercise',
  'stressed',
  'rested',
  'afterCoffee',
  'unwell',
] as const;

export type TagKey = (typeof TAG_KEYS)[number];

/** Label for a tag key, falling back to the raw value for free-text tags. */
export function tagLabel(tag: string, t: Dictionary): string {
  return (t.form.tags as Record<string, string>)[tag] ?? tag;
}

export function emptyDraft(now = Date.now()): ReadingDraft {
  return {
    systolic: null,
    diastolic: null,
    pulse: null,
    measuredAt: now,
    arm: null,
    posture: null,
    irregularHeartbeat: false,
    note: '',
    tags: [],
  };
}

export function isDraftValid(draft: ReadingDraft): boolean {
  if (draft.systolic === null || draft.diastolic === null) return false;
  if (draft.systolic < RANGES.systolic.min || draft.systolic > RANGES.systolic.max) return false;
  if (draft.diastolic < RANGES.diastolic.min || draft.diastolic > RANGES.diastolic.max) {
    return false;
  }
  return draft.systolic > draft.diastolic;
}

export function draftProblem(draft: ReadingDraft, t: Dictionary): string | null {
  if (draft.systolic === null || draft.diastolic === null) {
    return t.form.errors.needBoth;
  }
  if (draft.systolic <= draft.diastolic) {
    return t.form.errors.systolicNotHigher;
  }
  if (draft.systolic < RANGES.systolic.min || draft.systolic > RANGES.systolic.max) {
    return t.form.errors.systolicRange(draft.systolic);
  }
  if (draft.diastolic < RANGES.diastolic.min || draft.diastolic > RANGES.diastolic.max) {
    return t.form.errors.diastolicRange(draft.diastolic);
  }
  if (
    draft.pulse !== null &&
    (draft.pulse < RANGES.pulse.min || draft.pulse > RANGES.pulse.max)
  ) {
    return t.form.errors.pulseRange(draft.pulse);
  }
  return null;
}

export function ReadingForm({
  draft,
  onChange,
  scale,
}: {
  draft: ReadingDraft;
  onChange: (next: ReadingDraft) => void;
  scale: 'esh' | 'home';
}) {
  const theme = useTheme();
  const t = useTranslation();
  const [picking, setPicking] = useState(false);

  const patch = (part: Partial<ReadingDraft>) => onChange({ ...draft, ...part });

  return (
    <View style={{ gap: 16 }}>
      <Card>
        <SectionHeader title={t.form.measurement} />
        <View style={{ gap: 14 }}>
          <NumberField
            label={t.common.systolic}
            sublabel={t.common.upper}
            value={draft.systolic}
            onChange={(v) => patch({ systolic: v })}
            colour={theme.colors.systolic}
            min={RANGES.systolic.min}
            max={RANGES.systolic.max}
          />
          <NumberField
            label={t.common.diastolic}
            sublabel={t.common.lower}
            value={draft.diastolic}
            onChange={(v) => patch({ diastolic: v })}
            colour={theme.colors.diastolic}
            min={RANGES.diastolic.min}
            max={RANGES.diastolic.max}
          />
          <NumberField
            label={t.common.pulse}
            sublabel={t.common.optional}
            value={draft.pulse}
            onChange={(v) => patch({ pulse: v })}
            colour={theme.colors.pulse}
            min={RANGES.pulse.min}
            max={RANGES.pulse.max}
            unit={t.common.bpm}
          />
        </View>

        {draft.systolic !== null && draft.diastolic !== null && draft.systolic > draft.diastolic ? (
          <View style={{ marginTop: 16 }}>
            <CategoryPill
              systolic={draft.systolic}
              diastolic={draft.diastolic}
              scale={scale}
            />
          </View>
        ) : null}
      </Card>

      <Card>
        <SectionHeader title={t.form.when} />
        <Pressable
          onPress={() => setPicking(true)}
          accessibilityRole="button"
          style={[
            styles.dateButton,
            { backgroundColor: theme.colors.surfaceSunken },
          ]}
        >
          <Ionicons name="calendar-outline" size={18} color={theme.colors.accent} />
          <Text style={{ ...theme.typography.subheading, color: theme.colors.text, flex: 1 }}>
            {formatDate(draft.measuredAt)} · {formatTime(draft.measuredAt)}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.textFaint} />
        </Pressable>
      </Card>

      <Card>
        <SectionHeader title={t.form.context} />
        <Text style={{ ...theme.typography.caption, color: theme.colors.textFaint, marginBottom: 8 }}>
          {t.form.contextHint}
        </Text>

        <Text style={[styles.groupLabel, { color: theme.colors.textMuted }]}>{t.form.arm}</Text>
        <Row style={{ marginBottom: 14 }}>
          <Chip
            label={t.form.left}
            selected={draft.arm === 'left'}
            onPress={() => patch({ arm: draft.arm === 'left' ? null : 'left' })}
          />
          <Chip
            label={t.form.right}
            selected={draft.arm === 'right'}
            onPress={() => patch({ arm: draft.arm === 'right' ? null : 'right' })}
          />
        </Row>

        <Text style={[styles.groupLabel, { color: theme.colors.textMuted }]}>
          {t.form.position}
        </Text>
        <Row style={{ marginBottom: 14 }}>
          {(['sitting', 'lying', 'standing'] as Posture[]).map((p) => (
            <Chip
              key={p}
              label={t.form[p]}
              selected={draft.posture === p}
              onPress={() => patch({ posture: draft.posture === p ? null : p })}
            />
          ))}
        </Row>

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={{ ...theme.typography.subheading, color: theme.colors.text }}>
              {t.form.irregularHeartbeat}
            </Text>
            <Text style={{ ...theme.typography.caption, color: theme.colors.textFaint }}>
              {t.form.irregularHeartbeatHint}
            </Text>
          </View>
          <Switch
            value={draft.irregularHeartbeat}
            onValueChange={(v) => patch({ irregularHeartbeat: v })}
            trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
            thumbColor={theme.colors.surface}
          />
        </View>
      </Card>

      <Card>
        <SectionHeader title={t.form.tagsAndNotes} />
        <View style={styles.tagWrap}>
          {TAG_KEYS.map((tag) => (
            <Chip
              key={tag}
              label={t.form.tags[tag]}
              selected={draft.tags.includes(tag)}
              onPress={() =>
                patch({
                  tags: draft.tags.includes(tag)
                    ? draft.tags.filter((t) => t !== tag)
                    : [...draft.tags, tag],
                })
              }
            />
          ))}
        </View>

        <TextInput
          value={draft.note}
          onChangeText={(note) => patch({ note })}
          placeholder={t.form.notePlaceholder}
          placeholderTextColor={theme.colors.textFaint}
          multiline
          style={[
            styles.noteInput,
            {
              backgroundColor: theme.colors.surfaceSunken,
              color: theme.colors.text,
              borderColor: theme.colors.border,
            },
          ]}
        />
      </Card>

      <DateTimePicker
        visible={picking}
        value={draft.measuredAt}
        maximum={Date.now()}
        title={t.form.whenTitle}
        onCancel={() => setPicking(false)}
        onConfirm={(ts) => {
          patch({ measuredAt: ts });
          setPicking(false);
        }}
      />
    </View>
  );
}

function NumberField({
  label,
  sublabel,
  value,
  onChange,
  colour,
  min,
  max,
  unit,
}: {
  label: string;
  sublabel?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  colour: string;
  min: number;
  max: number;
  unit?: string;
}) {
  const theme = useTheme();
  const t = useTranslation();
  // Kept as text so the field can be empty mid-edit rather than snapping to 0.
  const [text, setText] = useState(value === null ? '' : String(value));

  React.useEffect(() => {
    setText(value === null ? '' : String(value));
  }, [value]);

  const step = (delta: number) => {
    Haptics.selectionAsync().catch(() => {});
    const base = value ?? Math.round((min + max) / 2);
    const next = Math.max(min, Math.min(max, base + delta));
    onChange(next);
  };

  const commit = (raw: string) => {
    setText(raw);
    const digits = raw.replace(/[^0-9]/g, '');
    if (digits === '') {
      onChange(null);
      return;
    }
    onChange(Number(digits));
  };

  const outOfRange = value !== null && (value < min || value > max);

  return (
    <View style={styles.numberRow}>
      <View style={{ flex: 1 }}>
        <Text style={{ ...theme.typography.subheading, color: theme.colors.text }}>
          {label}
        </Text>
        {sublabel ? (
          <Text style={{ ...theme.typography.caption, color: theme.colors.textFaint }}>
            {sublabel}
          </Text>
        ) : null}
      </View>

      <Pressable
        onPress={() => step(-1)}
        hitSlop={6}
        accessibilityLabel={t.form.decrease(label)}
        style={[styles.stepButton, { backgroundColor: theme.colors.surfaceSunken }]}
      >
        <Ionicons name="remove" size={18} color={theme.colors.textMuted} />
      </Pressable>

      <TextInput
        value={text}
        onChangeText={commit}
        keyboardType="number-pad"
        maxLength={3}
        selectTextOnFocus
        accessibilityLabel={label}
        placeholder="—"
        placeholderTextColor={theme.colors.textFaint}
        style={[
          styles.numberInput,
          {
            color: outOfRange ? theme.colors.danger : colour,
            backgroundColor: theme.colors.surfaceSunken,
            borderColor: outOfRange ? theme.colors.danger : 'transparent',
          },
        ]}
      />

      <Pressable
        onPress={() => step(1)}
        hitSlop={6}
        accessibilityLabel={t.form.increase(label)}
        style={[styles.stepButton, { backgroundColor: theme.colors.surfaceSunken }]}
      >
        <Ionicons name="add" size={18} color={theme.colors.textMuted} />
      </Pressable>

      <Text
        numberOfLines={1}
        style={{
          ...theme.typography.caption,
          color: theme.colors.textFaint,
          width: 42,
        }}
      >
        {unit ?? t.common.mmHg}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  numberRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberInput: {
    width: 76,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '700',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 12,
  },
  groupLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  noteInput: {
    minHeight: 84,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    fontSize: 15,
    textAlignVertical: 'top',
  },
});
