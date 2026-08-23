import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTranslation, type Dictionary } from '@/i18n';
import { useAppState } from '@/state/AppState';
import type { Profile } from '@/domain/types';
import { Button, Card, Row, SectionHeader } from '@/ui/components';
import { useTheme } from '@/ui/ThemeProvider';

export default function ProfilesScreen() {
  const theme = useTheme();
  const t = useTranslation();
  const insets = useSafeAreaInsets();
  const { profiles, settings, addProfile, editProfile, removeProfile, selectProfile } =
    useAppState();
  const [newName, setNewName] = useState('');

  const confirmRemove = (profile: Profile) => {
    if (profiles.length <= 1) {
      Alert.alert(t.profiles.cannotRemoveTitle, t.profiles.cannotRemoveMessage);
      return;
    }
    Alert.alert(
      t.profiles.removeTitle(profile.name),
      t.profiles.removeMessage,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.remove,
          style: 'destructive',
          onPress: () => removeProfile(profile.id),
        },
      ],
    );
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ ...theme.typography.body, color: theme.colors.textMuted }}>
        {t.profiles.intro}
      </Text>

      {profiles.map((profile) => (
        <ProfileCard
          key={profile.id}
          profile={profile}
          active={profile.id === settings.activeProfileId}
          onSelect={() => selectProfile(profile.id)}
          onSave={editProfile}
          t={t}
          onRemove={() => confirmRemove(profile)}
        />
      ))}

      <Card>
        <SectionHeader title={t.profiles.addSomeone} />
        <Row>
          <TextInput
            value={newName}
            onChangeText={setNewName}
            placeholder={t.profiles.name}
            placeholderTextColor={theme.colors.textFaint}
            style={[
              styles.input,
              {
                flex: 1,
                backgroundColor: theme.colors.surfaceSunken,
                color: theme.colors.text,
                borderColor: theme.colors.border,
              },
            ]}
          />
          <Button
            title={t.common.add}
            disabled={newName.trim().length === 0}
            onPress={async () => {
              await addProfile(newName.trim());
              setNewName('');
            }}
          />
        </Row>
      </Card>
    </ScrollView>
  );
}

function ProfileCard({
  profile,
  active,
  onSelect,
  onSave,
  onRemove,
  t,
}: {
  profile: Profile;
  active: boolean;
  onSelect: () => void;
  onSave: (profile: Profile) => Promise<void>;
  onRemove: () => void;
  t: Dictionary;
}) {
  const theme = useTheme();
  const [draft, setDraft] = useState(profile);
  const dirty =
    draft.name !== profile.name ||
    draft.targetSystolic !== profile.targetSystolic ||
    draft.targetDiastolic !== profile.targetDiastolic;

  const numberOrNull = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '');
    return digits === '' ? null : Number(digits);
  };

  return (
    <Card style={active ? { borderColor: profile.colour, borderWidth: 1.5 } : undefined}>
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: profile.colour }]}>
          <Text style={styles.avatarText}>{profile.name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <TextInput
          value={draft.name}
          onChangeText={(name) => setDraft({ ...draft, name })}
          style={{
            ...theme.typography.heading,
            color: theme.colors.text,
            flex: 1,
            padding: 0,
          }}
        />
        {active ? (
          <View style={[styles.activeTag, { backgroundColor: theme.colors.accentSoft }]}>
            <Ionicons name="checkmark" size={13} color={theme.colors.accent} />
            <Text style={{ ...theme.typography.micro, color: theme.colors.accent }}>
              {t.profiles.active}
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={[styles.label, { color: theme.colors.textMuted }]}>
        {t.profiles.personalTarget}
      </Text>
      <Text style={{ ...theme.typography.caption, color: theme.colors.textFaint, marginBottom: 8 }}>
        {t.profiles.personalTargetHint}
      </Text>
      <Row>
        <TextInput
          value={draft.targetSystolic === null ? '' : String(draft.targetSystolic)}
          onChangeText={(value) => setDraft({ ...draft, targetSystolic: numberOrNull(value) })}
          keyboardType="number-pad"
          maxLength={3}
          placeholder={t.common.systolic}
          placeholderTextColor={theme.colors.textFaint}
          style={[
            styles.input,
            {
              flex: 1,
              backgroundColor: theme.colors.surfaceSunken,
              color: theme.colors.systolic,
              borderColor: theme.colors.border,
            },
          ]}
        />
        <TextInput
          value={draft.targetDiastolic === null ? '' : String(draft.targetDiastolic)}
          onChangeText={(value) => setDraft({ ...draft, targetDiastolic: numberOrNull(value) })}
          keyboardType="number-pad"
          maxLength={3}
          placeholder={t.common.diastolic}
          placeholderTextColor={theme.colors.textFaint}
          style={[
            styles.input,
            {
              flex: 1,
              backgroundColor: theme.colors.surfaceSunken,
              color: theme.colors.diastolic,
              borderColor: theme.colors.border,
            },
          ]}
        />
      </Row>

      <Row style={{ marginTop: 14 }}>
        {!active ? (
          <Button
            title={t.profiles.useThisPerson}
            variant="secondary"
            style={{ flex: 1 }}
            onPress={onSelect}
          />
        ) : null}
        {dirty ? (
          <Button
            title={t.common.save}
            icon="checkmark"
            style={{ flex: 1 }}
            onPress={() => onSave(draft)}
          />
        ) : null}
        <Button
          title={t.common.remove}
          variant="danger"
          icon="trash-outline"
          onPress={onRemove}
        />
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  activeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  label: { fontSize: 13, fontWeight: '600' },
  input: {
    height: 46,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    fontSize: 16,
  },
});
