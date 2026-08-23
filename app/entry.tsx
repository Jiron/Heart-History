import React, { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTranslation } from '@/i18n';
import { useAppState } from '@/state/AppState';
import { Banner, Button, Row } from '@/ui/components';
import {
  draftProblem,
  emptyDraft,
  isDraftValid,
  ReadingForm,
  type ReadingDraft,
} from '@/ui/ReadingForm';
import { useTheme } from '@/ui/ThemeProvider';

/** Manual entry. No photo involved — everything typed in by hand. */
export default function EntryScreen() {
  const theme = useTheme();
  const t = useTranslation();
  const insets = useSafeAreaInsets();
  const { addReading, settings, profile } = useAppState();

  const [draft, setDraft] = useState<ReadingDraft>(() => emptyDraft());
  const [saving, setSaving] = useState(false);

  const problem = draftProblem(draft, t);
  const valid = isDraftValid(draft);
  const touched = draft.systolic !== null || draft.diastolic !== null;

  const save = async () => {
    if (!valid || draft.systolic === null || draft.diastolic === null) return;
    setSaving(true);
    try {
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
        source: 'manual',
        imageUri: null,
        ocrConfidence: null,
        deviceDisplayHint: null,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
      keyboardShouldPersistTaps="handled"
    >
      <ReadingForm draft={draft} onChange={setDraft} scale={settings.classificationScale} />

      {touched && problem ? <Banner tone="danger" message={problem} /> : null}

      <Row>
        <Button
          title={t.form.scanInstead}
          variant="ghost"
          icon="camera-outline"
          style={{ flex: 1 }}
          onPress={() => router.replace('/scan')}
        />
        <Button
          title={t.common.save}
          icon="checkmark"
          style={{ flex: 1 }}
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
