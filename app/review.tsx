import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { newId } from '@/lib/id';
import { useTranslation } from '@/i18n';
import { formatOcrWarning } from '@/i18n/ocr';
import { formatDate } from '@/lib/format';
import { persistPhoto } from '@/services/scan';
import { useAppState } from '@/state/AppState';
import { clearScan, getScanJob, subscribeToScan } from '@/state/scanBuffer';
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

  // Watched rather than consumed: the reading is still running when this screen
  // mounts, and it keeps running if the screen is closed. See state/scanBuffer.
  const job = useSyncExternalStore(subscribeToScan, getScanJob, getScanJob);
  const outcome = job?.status === 'done' ? job.outcome : null;
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

  /**
   * Still reading.
   *
   * The photo is shown at once so it is obvious the shutter worked and *which*
   * shot is being read -- that was the whole complaint about the old flow. The
   * two escapes matter as much as the spinner: a slow or unreachable assisted
   * reader must never be a dead end, so typing the numbers and taking another
   * photo are both available without waiting for it to finish.
   */
  if (job?.status === 'running') {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, padding: 16, gap: 16 }}>
        <Card padded={false} style={{ overflow: 'hidden' }}>
          <Image
            source={{ uri: job.sourceUri }}
            style={{ width: '100%', height: 260 }}
            resizeMode="cover"
            accessibilityLabel={t.review.photoAlt}
          />
        </Card>
        <Card>
          <Row style={{ alignItems: 'center', gap: 12 }}>
            <ActivityIndicator color={theme.colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={{ ...theme.typography.subheading, color: theme.colors.text }}>
                {t.review.readingTitle}
              </Text>
              <Text style={{ ...theme.typography.caption, color: theme.colors.textFaint }}>
                {settings.ocrServerUrl ? t.review.readingAssisted : t.review.readingOnDevice}
              </Text>
            </View>
          </Row>
        </Card>
        <Row>
          <Button
            title={t.review.retake}
            variant="ghost"
            icon="camera-outline"
            style={{ flex: 1 }}
            onPress={() => {
              clearScan();
              router.replace('/scan');
            }}
          />
          <Button
            title={t.review.typeInstead}
            variant="secondary"
            icon="create-outline"
            style={{ flex: 1 }}
            onPress={() => {
              clearScan();
              router.replace('/entry');
            }}
          />
        </Row>
      </View>
    );
  }

  if (!outcome) {
    const failure = job?.status === 'failed' ? job.error : null;
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background, padding: 16, gap: 16 }}>
        {failure ? <Banner tone="danger" title={t.review.failTitle} message={failure} /> : null}
        <Card>
          <EmptyState
            icon="camera-outline"
            title={failure ? t.review.failTitle : t.review.nothingTitle}
            message={failure ? t.review.failMessage : t.review.nothingMessage}
            action={
              <Button
                title={t.review.scanAgain}
                onPress={() => {
                  clearScan();
                  router.replace('/scan');
                }}
              />
            }
          />
        </Card>
        <Button
          title={t.review.typeInstead}
          variant="ghost"
          icon="create-outline"
          onPress={() => {
            clearScan();
            router.replace('/entry');
          }}
        />
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
      clearScan();
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
      {outcome.assistedError ? (
        <Banner
          tone="warning"
          message={
            // A rejected token is a setting to correct, not an outage to wait
            // out, and the two look identical from the review screen otherwise.
            outcome.assistedError === 'unauthorised'
              ? t.review.assistedUnauthorised
              : outcome.assistedError === 'noNetworkPermission'
                ? t.review.assistedNoPermission
                : t.review.assistedFellBack
          }
        />
      ) : null}

      {result.ok ? (
        <Banner
          tone="success"
          title={t.review.okTitle}
          message={
            outcome.reader === 'assisted'
              ? `${t.review.readByAssisted}. ${t.review.okMessage}`
              : t.review.okMessage
          }
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

      {/*
        Announced rather than left as a silently pre-ticked switch further down
        the form. The app is setting a cardiac finding on the user's behalf, off
        a symbol a few pixels wide, so it says so -- next to the photograph it
        came from, and above the switch that turns it off.
      */}
      {result.icons.irregularHeartbeat === true ? (
        <Banner
          tone="info"
          title={t.review.irregularTitle}
          message={t.review.irregularMessage}
        />
      ) : null}

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
          onPress={() => {
            clearScan();
            router.replace('/scan');
          }}
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
