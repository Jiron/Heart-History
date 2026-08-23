import React, { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { newId } from '@/lib/id';
import { useTranslation } from '@/i18n';
import { formatOcrWarning } from '@/i18n/ocr';
import { formatDate } from '@/lib/format';
import { persistPhoto } from '@/services/scan';
import { useAppState } from '@/state/AppState';
import { takePendingScan } from '@/state/scanBuffer';
import type { ScanOutcome } from '@/services/scan';
import { Banner, Button, Card, EmptyState, Row } from '@/ui/components';
import {
  draftProblem,
  emptyDraft,
  isDraftValid,
  ReadingForm,
  type ReadingDraft,
} from '@/ui/ReadingForm';
import { useTheme } from '@/ui/ThemeProvider';

export default function ReviewScreen() {
  const theme = useTheme();
  const t = useTranslation();
  const insets = useSafeAreaInsets();
  const { addReading, settings, profile } = useAppState();

  // Consumed once, on mount, so a back-navigation cannot re-apply a stale scan.
  const [outcome] = useState<ScanOutcome | null>(() => takePendingScan());
  const [draft, setDraft] = useState<ReadingDraft>(() => emptyDraft());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!outcome) return;
    const r = outcome.result;
    setDraft((prev) => ({
      ...prev,
      systolic: r.systolic,
      diastolic: r.diastolic,
      pulse: r.pulse,
      irregularHeartbeat: r.icons.irregularHeartbeat === true,
    }));
  }, [outcome]);

  const deviceHint = useMemo(() => {
    if (!outcome) return null;
    const { detectedDate, detectedTime } = outcome.result;
    if (detectedDate) {
      return {
        text: `${detectedDate.month}-${detectedDate.day}`,
        apply: () => {
          // The monitor never shows a year. Assume the most recent occurrence:
          // a date that would be in the future must belong to last year.
          const now = new Date();
          let year = now.getFullYear();
          const candidate = new Date(year, detectedDate.month - 1, detectedDate.day, 9, 0);
          if (candidate.getTime() > Date.now() + 86_400_000) year -= 1;
          const applied = new Date(year, detectedDate.month - 1, detectedDate.day);
          const current = new Date(draft.measuredAt);
          applied.setHours(current.getHours(), current.getMinutes(), 0, 0);
          setDraft((p) => ({ ...p, measuredAt: applied.getTime() }));
        },
      };
    }
    if (detectedTime) {
      return {
        text: `${detectedTime.hour}:${String(detectedTime.minute).padStart(2, '0')}`,
        apply: () => {
          const applied = new Date(draft.measuredAt);
          applied.setHours(detectedTime.hour, detectedTime.minute, 0, 0);
          setDraft((p) => ({ ...p, measuredAt: applied.getTime() }));
        },
      };
    }
    return null;
  }, [outcome, draft.measuredAt]);

  if (!outcome) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, padding: 16 }}>
        <Card>
          <EmptyState
            icon="camera-outline"
            title={t.review.nothingTitle}
            message={t.review.nothingMessage}
            action={
              <Button title={t.review.scanAgain} onPress={() => router.replace('/scan')} />
            }
          />
        </Card>
      </View>
    );
  }

  const result = outcome.result;
  const problem = draftProblem(draft, t);
  const valid = isDraftValid(draft);

  const save = async () => {
    if (!valid || draft.systolic === null || draft.diastolic === null) return;
    setSaving(true);
    try {
      const id = newId();
      const storedUri = settings.keepPhotos
        ? await persistPhoto(outcome.previewUri, id)
        : null;

      await addReading({
        profileId: profile.id,
        measuredAt: draft.measuredAt,
        systolic: draft.systolic,
        diastolic: draft.diastolic,
        pulse: draft.pulse,
        arm: draft.arm,
        posture: draft.posture,
        irregularHeartbeat: draft.irregularHeartbeat,
        note: draft.note.trim() || null,
        tags: draft.tags,
        source: 'scan',
        imageUri: storedUri,
        ocrConfidence: result.confidence.overall,
        deviceDisplayHint: deviceHint?.text ?? null,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.dismissAll();
      router.replace('/(tabs)');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
      keyboardShouldPersistTaps="handled"
    >
      {result.ok ? (
        <Banner
          tone="success"
          title={t.review.okTitle}
          message={t.review.okMessage}
        />
      ) : (
        <Banner
          tone="warning"
          title={result.systolic !== null ? t.review.checkTitle : t.review.failTitle}
          message={
            result.warnings.length > 0
              ? formatOcrWarning(result.warnings[0], t)
              : t.review.failMessage
          }
        />
      )}

      <Card padded={false} style={{ overflow: 'hidden' }}>
        <Image
          source={{ uri: outcome.previewUri }}
          style={{ width: '100%', aspectRatio: outcome.previewWidth / outcome.previewHeight }}
          resizeMode="cover"
          accessibilityLabel={t.review.photoAlt}
        />
      </Card>

      {deviceHint ? (
        <Card>
          <Row style={{ alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ ...theme.typography.subheading, color: theme.colors.text }}>
                {t.review.deviceShowed(deviceHint.text)}
              </Text>
              <Text style={{ ...theme.typography.caption, color: theme.colors.textFaint }}>
                {t.review.deviceHintNote(formatDate(draft.measuredAt))}
              </Text>
            </View>
            <Button title={t.review.useIt} variant="secondary" onPress={deviceHint.apply} />
          </Row>
        </Card>
      ) : null}

      <ReadingForm
        draft={draft}
        onChange={setDraft}
        scale={settings.classificationScale}
      />

      {problem ? <Banner tone="danger" message={problem} /> : null}

      <Row>
        <Button
          title={t.review.retake}
          variant="ghost"
          icon="camera-outline"
          style={{ flex: 1 }}
          onPress={() => router.replace('/scan')}
        />
        <Button
          title={t.review.saveReading}
          icon="checkmark"
          style={{ flex: 2 }}
          disabled={!valid}
          loading={saving}
          onPress={save}
        />
      </Row>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
});
