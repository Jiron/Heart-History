import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';

import { presetRange } from '@/domain/statistics';
import type { Settings } from '@/domain/types';
import { dictionaryFor, LANGUAGES, useTranslation } from '@/i18n';
import { exportBackup, exportCsv, importBackup, type ImportMode } from '@/services/backup';
import { exportReport } from '@/services/report';
import { useAppState } from '@/state/AppState';
import { Banner, Button, Card, Chip, Row, SectionHeader } from '@/ui/components';
import { useTheme } from '@/ui/ThemeProvider';

export default function SettingsScreen() {
  const theme = useTheme();
  const t = useTranslation();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings, readings, profile, profiles, refresh } = useAppState();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(
    null,
  );

  const run = async (key: string, action: () => Promise<string | null>) => {
    setBusy(key);
    setMessage(null);
    try {
      const text = await action();
      if (text) setMessage({ tone: 'success', text });
    } catch (e) {
      setMessage({
        tone: 'danger',
        text: e instanceof Error ? e.message : t.settings.somethingWrong,
      });
    } finally {
      setBusy(null);
    }
  };

  const confirmImport = (mode: ImportMode) => {
    const proceed = () =>
      run(`import-${mode}`, async () => {
        const result = await importBackup(mode, t);
        if (result.cancelled) return null;
        await refresh();
        return result.message;
      });

    if (mode === 'replace') {
      Alert.alert(t.settings.replaceTitle, t.settings.replaceMessage, [
        { text: t.common.cancel, style: 'cancel' },
        { text: t.settings.replaceConfirm, style: 'destructive', onPress: proceed },
      ]);
    } else {
      proceed();
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
    >
      {message ? <Banner tone={message.tone} message={message.text} /> : null}

      <Card>
        <SectionHeader
          title={t.settings.people}
          action={t.common.manage}
          onAction={() => router.push('/profiles')}
        />
        <Row style={{ flexWrap: 'wrap' }}>
          {profiles.map((p) => (
            <Chip
              key={p.id}
              label={p.name}
              colour={p.colour}
              selected={p.id === settings.activeProfileId}
              onPress={() => updateSettings({ activeProfileId: p.id })}
            />
          ))}
        </Row>
        <Text style={[styles.hint, { color: theme.colors.textFaint }]}>
          {t.settings.peopleHint}
        </Text>
      </Card>

      <Card>
        <SectionHeader title={t.settings.language} />
        <Row style={{ flexWrap: 'wrap' }}>
          <Chip
            label={t.settings.languageSystem}
            selected={settings.language === 'system'}
            onPress={() => updateSettings({ language: 'system' })}
          />
          {LANGUAGES.map((code) => (
            <Chip
              key={code}
              // Each language names itself in its own language, so someone who
              // cannot read the current one can still find their way out.
              label={dictionaryFor(code).languageName}
              selected={settings.language === code}
              onPress={() => updateSettings({ language: code })}
            />
          ))}
        </Row>
        <Text style={[styles.hint, { color: theme.colors.textFaint }]}>
          {t.settings.languageHint}
        </Text>
      </Card>

      <Card>
        <SectionHeader title={t.settings.appearance} />
        <Row>
          {(['system', 'light', 'dark'] as Settings['theme'][]).map((mode) => (
            <Chip
              key={mode}
              label={
                mode === 'system'
                  ? t.settings.themeSystem
                  : mode === 'light'
                    ? t.settings.themeLight
                    : t.settings.themeDark
              }
              selected={settings.theme === mode}
              onPress={() => updateSettings({ theme: mode })}
            />
          ))}
        </Row>
      </Card>

      <Card>
        <SectionHeader title={t.settings.classification} />
        <Row>
          <Chip
            label={t.settings.scaleStandard}
            selected={settings.classificationScale === 'esh'}
            onPress={() => updateSettings({ classificationScale: 'esh' })}
          />
          <Chip
            label={t.settings.scaleHome}
            selected={settings.classificationScale === 'home'}
            onPress={() => updateSettings({ classificationScale: 'home' })}
          />
        </Row>
        <Text style={[styles.hint, { color: theme.colors.textFaint }]}>
          {settings.classificationScale === 'esh'
            ? t.settings.scaleStandardHint
            : t.settings.scaleHomeHint}
        </Text>
      </Card>

      <Card>
        <SectionHeader title={t.settings.scanning} />
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={{ ...theme.typography.subheading, color: theme.colors.text }}>
              {t.settings.keepPhotos}
            </Text>
            <Text style={{ ...theme.typography.caption, color: theme.colors.textFaint }}>
              {t.settings.keepPhotosHint}
            </Text>
          </View>
          <Switch
            value={settings.keepPhotos}
            onValueChange={(keepPhotos) => updateSettings({ keepPhotos })}
            trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
            thumbColor={theme.colors.surface}
          />
        </View>
      </Card>

      <Card>
        <SectionHeader title={t.settings.export} />
        <View style={{ gap: 10 }}>
          <Button
            title={t.settings.reportPdf}
            icon="document-text-outline"
            variant="secondary"
            fullWidth
            loading={busy === 'report'}
            disabled={readings.length === 0}
            onPress={() =>
              run('report', async () => {
                await exportReport(
                  readings,
                  profile,
                  presetRange('all'),
                  settings.classificationScale,
                  t,
                );
                return null;
              })
            }
          />
          <Button
            title={t.settings.backupJson}
            icon="save-outline"
            variant="ghost"
            fullWidth
            loading={busy === 'backup'}
            disabled={readings.length === 0}
            onPress={() =>
              run('backup', async () => t.settings.backedUpCount(await exportBackup(t)))
            }
          />
          <Button
            title={t.settings.spreadsheetCsv}
            icon="grid-outline"
            variant="ghost"
            fullWidth
            loading={busy === 'csv'}
            disabled={readings.length === 0}
            onPress={() =>
              run('csv', async () =>
                t.settings.exportedCount(await exportCsv(t, settings.classificationScale)),
              )
            }
          />
        </View>
        <Text style={[styles.hint, { color: theme.colors.textFaint }]}>
          {t.settings.exportHint}
        </Text>
      </Card>

      <Card>
        <SectionHeader title={t.settings.restore} />
        <View style={{ gap: 10 }}>
          <Button
            title={t.settings.mergeBackup}
            icon="git-merge-outline"
            variant="ghost"
            fullWidth
            loading={busy === 'import-merge'}
            onPress={() => confirmImport('merge')}
          />
          <Button
            title={t.settings.replaceEverything}
            icon="refresh-outline"
            variant="danger"
            fullWidth
            loading={busy === 'import-replace'}
            onPress={() => confirmImport('replace')}
          />
        </View>
        <Text style={[styles.hint, { color: theme.colors.textFaint }]}>
          {t.settings.restoreHint}
        </Text>
      </Card>

      <Card>
        <SectionHeader title={t.settings.about} />
        <View style={{ gap: 8 }}>
          <View style={styles.infoRow}>
            <Text style={{ ...theme.typography.body, color: theme.colors.textMuted }}>
              {t.settings.version}
            </Text>
            <Text style={{ ...theme.typography.body, color: theme.colors.text }}>
              {Constants.expoConfig?.version ?? '1.0.0'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={{ ...theme.typography.body, color: theme.colors.textMuted }}>
              {t.settings.readingsStored}
            </Text>
            <Text style={{ ...theme.typography.body, color: theme.colors.text }}>
              {readings.length}
            </Text>
          </View>
        </View>
        <View style={{ marginTop: 14 }}>
          <Banner
            tone="info"
            title={t.settings.privacyTitle}
            message={t.settings.privacyMessage}
          />
        </View>
        <Text style={[styles.hint, { color: theme.colors.textFaint }]}>
          {t.settings.medicalDisclaimer}
        </Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  hint: { fontSize: 12, lineHeight: 17, marginTop: 12 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between' },
});
