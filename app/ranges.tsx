import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  BOUNDED,
  isUsable,
  PRESETS,
  problemWith,
  spanOf,
  thresholdsFor,
  type BpCategory,
  type ThresholdSet,
} from '@/domain/classification';
import type { ClassificationScale } from '@/domain/types';
import { useTranslation, type Dictionary } from '@/i18n';
import { useAppState } from '@/state/AppState';
import { Banner, Button, Card, Chip, Row, SectionHeader } from '@/ui/components';
import { useTheme } from '@/ui/ThemeProvider';

const ORDER: BpCategory[] = [
  'low',
  'optimal',
  'normal',
  'highNormal',
  'grade1',
  'grade2',
  'grade3',
];

/**
 * What the colours on every reading actually mean, and where the lines are.
 *
 * The table is the explanation and the editor at once. Showing one set of
 * numbers and editing another on a different screen is how the two drift apart;
 * here the row that says "High normal starts at 130" is the row you change, and
 * the spans either side of it move as you type.
 */
export default function RangesScreen() {
  const theme = useTheme();
  const t = useTranslation();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useAppState();

  /**
   * Edited locally, saved on demand.
   *
   * Writing each keystroke through to settings would reclassify every reading
   * in the app on the way to a number the user has not finished typing -- "1"
   * on the way to "130" briefly makes every reading grade 3.
   */
  const [draft, setDraft] = useState<ThresholdSet>(() =>
    settings.customThresholds ?? PRESETS[settings.classificationScale === 'home' ? 'home' : 'esh'],
  );
  const [saved, setSaved] = useState(false);

  const scale = settings.classificationScale;
  const editing = scale === 'custom';
  const shown = editing ? draft : thresholdsFor(scale, settings.customThresholds);
  const problem = problemWith(draft);
  const dirty =
    editing && JSON.stringify(draft) !== JSON.stringify(settings.customThresholds ?? null);

  const pick = async (next: ClassificationScale) => {
    setSaved(false);
    if (next === 'custom' && !settings.customThresholds) {
      // Starting from what was on screen a moment ago, rather than from an
      // arbitrary preset: the first edit is nearly always a nudge to the scale
      // already in use, not a fresh set of seven boundaries.
      const from = thresholdsFor(scale, null);
      setDraft(from);
      await updateSettings({ classificationScale: next, customThresholds: from });
      return;
    }
    await updateSettings({ classificationScale: next });
  };

  const save = async () => {
    if (!isUsable(draft)) return;
    await updateSettings({ customThresholds: draft });
    setSaved(true);
  };

  const resetTo = (preset: 'esh' | 'home') => {
    setDraft(PRESETS[preset]);
    setSaved(false);
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Card>
        <SectionHeader title={t.bpRanges.whichScale} />
        <Row style={{ flexWrap: 'wrap' }}>
          <Chip
            label={t.settings.scaleStandard}
            selected={scale === 'esh'}
            onPress={() => pick('esh')}
          />
          <Chip
            label={t.settings.scaleHome}
            selected={scale === 'home'}
            onPress={() => pick('home')}
          />
          <Chip
            label={t.settings.scaleCustom}
            selected={scale === 'custom'}
            onPress={() => pick('custom')}
          />
        </Row>
        <Text style={[styles.hint, { color: theme.colors.textFaint }]}>
          {scale === 'esh'
            ? t.settings.scaleStandardHint
            : scale === 'home'
              ? t.settings.scaleHomeHint
              : t.settings.scaleCustomHint}
        </Text>
      </Card>

      <Card>
        <SectionHeader title={t.bpRanges.tableTitle} />
        <Text style={[styles.hint, { color: theme.colors.textMuted, marginBottom: 12 }]}>
          {t.bpRanges.worseWins}
        </Text>

        <Row style={styles.headRow}>
          <Text style={[styles.headCell, styles.nameCell, { color: theme.colors.textFaint }]}>
            {t.bpRanges.category}
          </Text>
          <Text style={[styles.headCell, styles.numberCell, { color: theme.colors.textFaint }]}>
            {t.common.systolic}
          </Text>
          <Text style={[styles.headCell, styles.numberCell, { color: theme.colors.textFaint }]}>
            {t.common.diastolic}
          </Text>
        </Row>

        {ORDER.map((key) => (
          <CategoryRow
            key={key}
            category={key}
            thresholds={shown}
            t={t}
          />
        ))}
      </Card>

      {editing ? (
        <Card>
          <SectionHeader title={t.bpRanges.boundaries} />
          <Text style={[styles.hint, { color: theme.colors.textMuted, marginBottom: 4 }]}>
            {t.bpRanges.boundariesHint}
          </Text>

          <BoundaryRow
            label={t.bpRanges.lowBelow}
            bound={draft.low}
            onChange={(next) => {
              setSaved(false);
              setDraft((d) => ({ ...d, low: next }));
            }}
          />
          {BOUNDED.map((key) => (
            <BoundaryRow
              key={key}
              label={t.bpRanges.startsAt(t.categories[nextAfter(key)].label)}
              bound={draft[key]}
              onChange={(next) => {
                setSaved(false);
                setDraft((d) => ({ ...d, [key]: next }));
              }}
            />
          ))}

          {problem ? (
            <Banner
              tone="danger"
              message={t.bpRanges.mustRise(
                t.categories[boundaryOwner(problem.field)].label,
                problem.column,
              )}
            />
          ) : saved ? (
            <Banner tone="success" message={t.bpRanges.savedMessage} />
          ) : null}

          <Row style={{ marginTop: 4 }}>
            <Button
              title={t.bpRanges.save}
              icon="checkmark"
              style={{ flex: 2 }}
              disabled={!!problem || !dirty}
              onPress={save}
            />
          </Row>
          <Row>
            <Button
              title={t.bpRanges.resetStandard}
              variant="ghost"
              style={{ flex: 1 }}
              onPress={() => resetTo('esh')}
            />
            <Button
              title={t.bpRanges.resetHome}
              variant="ghost"
              style={{ flex: 1 }}
              onPress={() => resetTo('home')}
            />
          </Row>
        </Card>
      ) : null}

      <Card>
        <SectionHeader title={t.bpRanges.whatItMeans} />
        {ORDER.map((key) => (
          <View key={key} style={{ marginBottom: 10 }}>
            <Row style={{ alignItems: 'center', gap: 8 }}>
              <View
                style={[styles.dot, { backgroundColor: theme.category[key].main }]}
              />
              <Text style={{ ...theme.typography.subheading, color: theme.colors.text }}>
                {t.categories[key].label}
              </Text>
            </Row>
            <Text
              style={{
                ...theme.typography.body,
                color: theme.colors.textMuted,
                marginLeft: 18,
              }}
            >
              {t.categoryDescriptions[key]}
            </Text>
          </View>
        ))}
      </Card>

      <Banner tone="info" message={t.bpRanges.disclaimer} />
    </ScrollView>
  );
}

/** The category that begins where `key`'s span ends. */
function nextAfter(key: (typeof BOUNDED)[number]): BpCategory {
  const index = BOUNDED.indexOf(key);
  return index === BOUNDED.length - 1 ? 'grade3' : BOUNDED[index + 1];
}

/** The category a boundary belongs to, for naming it in an error. */
function boundaryOwner(field: keyof ThresholdSet): BpCategory {
  return field === 'low' ? 'low' : nextAfter(field as (typeof BOUNDED)[number]);
}

function CategoryRow({
  category,
  thresholds,
  t,
}: {
  category: BpCategory;
  thresholds: ThresholdSet;
  t: Dictionary;
}) {
  const theme = useTheme();
  const colours = theme.category[category];
  const systolic = spanOf(category, thresholds, 'systolic');
  const diastolic = spanOf(category, thresholds, 'diastolic');

  return (
    <Row style={[styles.bodyRow, { borderTopColor: theme.colors.border }]}>
      <View style={[styles.nameCell, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
        <View style={[styles.dot, { backgroundColor: colours.main }]} />
        <Text style={{ ...theme.typography.label, color: theme.colors.text }} numberOfLines={2}>
          {t.categories[category].short}
        </Text>
      </View>
      <Text style={[styles.numberCell, { ...theme.typography.body, color: theme.colors.textMuted }]}>
        {span(systolic, t)}
      </Text>
      <Text style={[styles.numberCell, { ...theme.typography.body, color: theme.colors.textMuted }]}>
        {span(diastolic, t)}
      </Text>
    </Row>
  );
}

function span(range: { from: number | null; to: number | null }, t: Dictionary): string {
  if (range.from === null) return t.bpRanges.under(range.to! + 1);
  if (range.to === null) return t.bpRanges.orMore(range.from);
  if (range.to < range.from) return '—';
  return `${range.from}–${range.to}`;
}

/**
 * One editable boundary.
 *
 * Held as text while it is being typed, because a controlled numeric field that
 * coerces on every keystroke cannot be cleared: deleting the last digit gives
 * an empty string, which becomes 0, which is immediately rendered back as "0"
 * in front of the cursor.
 */
function BoundaryRow({
  label,
  bound,
  onChange,
}: {
  label: string;
  bound: { systolic: number; diastolic: number };
  onChange: (next: { systolic: number; diastolic: number }) => void;
}) {
  const theme = useTheme();

  return (
    <View style={styles.boundaryRow}>
      <Text
        style={{ ...theme.typography.body, color: theme.colors.text, flex: 1 }}
        numberOfLines={2}
      >
        {label}
      </Text>
      <NumberField
        value={bound.systolic}
        onChange={(systolic) => onChange({ ...bound, systolic })}
      />
      <Text style={{ ...theme.typography.body, color: theme.colors.textFaint }}>/</Text>
      <NumberField
        value={bound.diastolic}
        onChange={(diastolic) => onChange({ ...bound, diastolic })}
      />
    </View>
  );
}

function NumberField({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  const theme = useTheme();
  const [text, setText] = useState(String(value));

  // Follows the value when it changes from outside -- a preset reset -- without
  // fighting what is being typed.
  const shown = useMemo(() => {
    if (Number(text) === value) return text;
    return String(value);
  }, [text, value]);

  return (
    <TextInput
      value={shown}
      onChangeText={(next) => {
        const digits = next.replace(/[^0-9]/g, '').slice(0, 3);
        setText(digits);
        onChange(digits === '' ? Number.NaN : Number(digits));
      }}
      keyboardType="number-pad"
      maxLength={3}
      selectTextOnFocus
      style={[
        styles.field,
        {
          backgroundColor: theme.colors.background,
          borderColor: theme.colors.border,
          color: theme.colors.text,
          ...theme.typography.subheading,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  hint: { fontSize: 13, lineHeight: 18, marginTop: 8 },
  headRow: { paddingBottom: 6 },
  headCell: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  bodyRow: { paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  nameCell: { flex: 1.5 },
  numberCell: { flex: 1, textAlign: 'right' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  boundaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  field: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    minWidth: 60,
    textAlign: 'center',
  },
});
