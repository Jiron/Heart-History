import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { classify } from '@/domain/classification';
import { formatDate, formatTime } from '@/lib/format';
import { useTranslation } from '@/i18n';
import { useAppState } from '@/state/AppState';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  ReadingPhoto,
  Row,
  SectionHeader,
} from '@/ui/components';
import {
  draftProblem,
  emptyDraft,
  isDraftValid,
  ReadingForm,
  tagLabel,
  type ReadingDraft,
} from '@/ui/ReadingForm';
import { CategoryPill, ReadingValue } from '@/ui/reading';
import { useTheme } from '@/ui/ThemeProvider';

export default function ReadingDetailScreen() {
  const theme = useTheme();
  const t = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { readings, editReading, removeReading, thresholds } = useAppState();

  const reading = useMemo(() => readings.find((r) => r.id === id) ?? null, [readings, id]);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ReadingDraft>(() => emptyDraft());
  const [saving, setSaving] = useState(false);

  // Load the form from the stored reading, and again whenever it changes. Done
  // during render rather than in an effect; starts at null so the first render
  // fills it too.
  const [loadedFrom, setLoadedFrom] = useState<typeof reading>(null);
  if (reading && reading !== loadedFrom) {
    setLoadedFrom(reading);
    setDraft({
      systolic: reading.systolic,
      diastolic: reading.diastolic,
      pulse: reading.pulse,
      measuredAt: reading.measuredAt,
      arm: reading.arm,
      posture: reading.posture,
      irregularHeartbeat: reading.irregularHeartbeat,
      note: reading.note ?? '',
      tags: reading.tags,
    });
  }

  useEffect(() => {
    navigation.setOptions({
      title: editing ? t.screens.editReading : t.screens.reading,
    });
  }, [navigation, editing, t]);

  if (!reading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, padding: 16 }}>
        <Card>
          <EmptyState
            icon="help-circle-outline"
            title={t.detail.notFoundTitle}
            message={t.detail.notFoundMessage}
            action={
              <Button title={t.detail.backToHistory} onPress={() => router.back()} />
            }
          />
        </Card>
      </View>
    );
  }

  const category = classify(reading.systolic, reading.diastolic, thresholds);

  const save = async () => {
    if (!isDraftValid(draft) || draft.systolic === null || draft.diastolic === null) return;
    setSaving(true);
    try {
      await editReading({
        ...reading,
        systolic: draft.systolic,
        diastolic: draft.diastolic,
        pulse: draft.pulse,
        measuredAt: draft.measuredAt,
        arm: draft.arm,
        posture: draft.posture,
        irregularHeartbeat: draft.irregularHeartbeat,
        note: draft.note.trim() || null,
        tags: draft.tags,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      t.detail.deleteTitle,
      t.detail.deleteMessage,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.delete,
          style: 'destructive',
          onPress: async () => {
            await removeReading(reading.id);
            router.back();
          },
        },
      ],
    );
  };

  if (editing) {
    const problem = draftProblem(draft, t);
    return (
      <ScrollView
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        <ReadingForm draft={draft} onChange={setDraft} thresholds={thresholds} />
        {problem ? <Banner tone="danger" message={problem} /> : null}
        <Row>
          <Button
            title={t.common.cancel}
            variant="ghost"
            style={{ flex: 1 }}
            onPress={() => setEditing(false)}
          />
          <Button
            title={t.common.saveChanges}
            icon="checkmark"
            style={{ flex: 1 }}
            disabled={!isDraftValid(draft)}
            loading={saving}
            onPress={save}
          />
        </Row>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
    >
      <Card level={2}>
        <Text style={{ ...theme.typography.caption, color: theme.colors.textFaint }}>
          {formatDate(reading.measuredAt)} · {formatTime(reading.measuredAt)}
        </Text>
        <View style={{ marginVertical: 12 }}>
          <ReadingValue
            systolic={reading.systolic}
            diastolic={reading.diastolic}
            pulse={reading.pulse}
          />
        </View>
        <CategoryPill
          systolic={reading.systolic}
          diastolic={reading.diastolic}
          thresholds={thresholds}
        />
        <Text
          style={{ ...theme.typography.body, color: theme.colors.textMuted, marginTop: 10 }}
        >
          {t.categoryDescriptions[category.key]}
        </Text>
        {/*
          Here rather than only in Settings, because this is where the question
          gets asked: someone reading "grade 2" on their own measurement wants
          to know what that means now, not after finding a settings screen.
        */}
        <Pressable
          onPress={() => router.push('/ranges')}
          accessibilityRole="link"
          hitSlop={8}
          style={{ marginTop: 8, alignSelf: 'flex-start' }}
        >
          <Text style={{ ...theme.typography.label, color: theme.colors.accent }}>
            {t.bpRanges.whatDoesThisMean}
          </Text>
        </Pressable>
      </Card>

      {reading.imageUri ? (
        <ReadingPhoto uri={reading.imageUri} label={t.detail.photoAlt} />
      ) : null}

      <Card>
        <SectionHeader title={t.detail.details} />
        <View style={{ gap: 10 }}>
          <DetailRow
            icon="time-outline"
            label={t.detail.measured}
            value={`${formatDate(reading.measuredAt)} ${t.detail.at} ${formatTime(reading.measuredAt)}`}
          />
          {reading.arm ? (
            <DetailRow
              icon="body-outline"
              label={t.form.arm}
              value={reading.arm === 'left' ? t.form.left : t.form.right}
            />
          ) : null}
          {reading.posture ? (
            <DetailRow
              icon="accessibility-outline"
              label={t.form.position}
              value={t.form[reading.posture]}
            />
          ) : null}
          <DetailRow
            icon={reading.source === 'scan' ? 'camera-outline' : 'create-outline'}
            label={t.detail.source}
            value={
              reading.source === 'scan'
                ? reading.ocrConfidence !== null
                  ? t.detail.scannedWith(Math.round(reading.ocrConfidence * 100))
                  : t.detail.scanned
                : reading.source === 'import'
                  ? t.detail.imported
                  : t.detail.manual
            }
          />
          {reading.deviceDisplayHint ? (
            <DetailRow
              icon="tv-outline"
              label={t.detail.monitorShowed}
              value={reading.deviceDisplayHint}
            />
          ) : null}
          {reading.irregularHeartbeat ? (
            <DetailRow
              icon="alert-circle-outline"
              label={t.detail.flag}
              value={t.form.irregularHeartbeat}
            />
          ) : null}
        </View>

        {reading.tags.length > 0 ? (
          <View style={styles.tagWrap}>
            {reading.tags.map((tag) => (
              <View
                key={tag}
                style={[styles.tag, { backgroundColor: theme.colors.surfaceSunken }]}
              >
                <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>
                  {tagLabel(tag, t)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {reading.note ? (
          <View style={{ marginTop: 14 }}>
            <Text style={{ ...theme.typography.label, color: theme.colors.textMuted }}>
              {t.detail.note}
            </Text>
            <Text style={{ ...theme.typography.body, color: theme.colors.text, marginTop: 4 }}>
              {reading.note}
            </Text>
          </View>
        ) : null}
      </Card>

      <Row>
        <Button
          title={t.common.edit}
          icon="pencil"
          variant="secondary"
          style={{ flex: 1 }}
          onPress={() => setEditing(true)}
        />
        <Button
          title={t.common.delete}
          icon="trash-outline"
          variant="danger"
          style={{ flex: 1 }}
          onPress={confirmDelete}
        />
      </Row>
    </ScrollView>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={16} color={theme.colors.textFaint} />
      <Text style={{ ...theme.typography.body, color: theme.colors.textMuted, flex: 1 }}>
        {label}
      </Text>
      <Text style={{ ...theme.typography.body, color: theme.colors.text }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
  tag: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999 },
});
