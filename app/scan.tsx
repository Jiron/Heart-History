import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { scanImage } from '@/services/scan';
import { useTranslation } from '@/i18n';
import { setPendingScan } from '@/state/scanBuffer';
import { Button } from '@/ui/components';
import { useTheme } from '@/ui/ThemeProvider';

export default function ScanScreen() {
  const theme = useTheme();
  const t = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [torch, setTorch] = useState(false);

  // The guide frame roughly matches the proportions of the monitor's LCD, so
  // filling it puts the digits at a size the recogniser handles comfortably.
  const frameWidth = Math.min(width - 48, 420);
  const frameHeight = frameWidth * 0.82;

  const process = useCallback(async (uri: string) => {
    setBusy(true);
    setError(null);
    try {
      const outcome = await scanImage(uri);
      setPendingScan(outcome);
      Haptics.notificationAsync(
        outcome.result.ok
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning,
      ).catch(() => {});
      router.replace('/review');
    } catch (e) {
      setError(
        e instanceof Error
          ? t.scan.couldNotRead(e.message)
          : t.scan.couldNotReadGeneric,
      );
    } finally {
      setBusy(false);
    }
  }, [t]);

  const capture = useCallback(async () => {
    if (!cameraRef.current || busy) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.95,
        skipProcessing: false,
      });
      if (photo?.uri) await process(photo.uri);
    } catch {
      setError(t.scan.noPicture);
    }
  }, [busy, process, t]);

  const pickFromLibrary = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      await process(result.assets[0].uri);
    }
  }, [process]);

  if (!permission) {
    return (
      <View style={[styles.centre, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View
        style={[
          styles.centre,
          { backgroundColor: theme.colors.background, padding: 24, gap: 16 },
        ]}
      >
        <Ionicons name="camera-outline" size={44} color={theme.colors.textFaint} />
        <Text
          style={{ ...theme.typography.heading, color: theme.colors.text, textAlign: 'center' }}
        >
          {t.scan.permissionTitle}
        </Text>
        <Text
          style={{
            ...theme.typography.body,
            color: theme.colors.textMuted,
            textAlign: 'center',
          }}
        >
          {t.scan.permissionMessage}
        </Text>
        <Button title={t.scan.allowCamera} onPress={requestPermission} />
        <Button title={t.scan.choosePhoto} variant="ghost" onPress={pickFromLibrary} />
        <Button title={t.scan.goBack} variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        animateShutter={false}
      />

      {/* Dimmed surround with a clear cut-out, so the frame reads as a target */}
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.dim} />
        <View style={{ flexDirection: 'row' }}>
          <View style={[styles.dim, { flex: 1 }]} />
          <View style={{ width: frameWidth, height: frameHeight }}>
            <Corner style={{ top: 0, left: 0 }} rotate="0deg" />
            <Corner style={{ top: 0, right: 0 }} rotate="90deg" />
            <Corner style={{ bottom: 0, right: 0 }} rotate="180deg" />
            <Corner style={{ bottom: 0, left: 0 }} rotate="270deg" />
          </View>
          <View style={[styles.dim, { flex: 1 }]} />
        </View>
        <View style={[styles.dim, { flex: 1.3 }]} />
      </View>

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel={t.scan.close}>
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>
        <Pressable
          onPress={() => setTorch((t) => !t)}
          hitSlop={12}
          accessibilityLabel={t.scan.torch}
        >
          <Ionicons name={torch ? 'flashlight' : 'flashlight-outline'} size={24} color="#fff" />
        </Pressable>
      </View>

      <View style={styles.hintWrap} pointerEvents="none">
        <Text style={styles.hint}>
          {t.scan.hint}
        </Text>
      </View>

      {error ? (
        <View style={[styles.errorWrap, { backgroundColor: theme.colors.danger }]}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={[styles.controls, { paddingBottom: insets.bottom + 24 }]}>
        <Pressable
          onPress={pickFromLibrary}
          disabled={busy}
          hitSlop={10}
          accessibilityLabel={t.scan.fromGallery}
          style={styles.sideButton}
        >
          <Ionicons name="images-outline" size={24} color="#fff" />
        </Pressable>

        <Pressable
          onPress={capture}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={t.scan.takePicture}
          style={({ pressed }) => [styles.shutter, { opacity: pressed || busy ? 0.6 : 1 }]}
        >
          {busy ? (
            <ActivityIndicator color="#111" />
          ) : (
            <View style={styles.shutterInner} />
          )}
        </Pressable>

        <Pressable
          onPress={() => router.replace('/entry')}
          disabled={busy}
          hitSlop={10}
          accessibilityLabel={t.scan.typeInstead}
          style={styles.sideButton}
        >
          <Ionicons name="create-outline" size={24} color="#fff" />
        </Pressable>
      </View>

      {busy ? (
        <View style={styles.busyOverlay} pointerEvents="none">
          <View style={styles.busyPill}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.busyText}>{t.scan.reading}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Corner({
  style,
  rotate,
}: {
  style: object;
  rotate: string;
}) {
  return (
    <View style={[styles.corner, style, { transform: [{ rotate }] }]}>
      <View style={styles.cornerH} />
      <View style={styles.cornerV} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'column' },
  dim: { backgroundColor: 'rgba(0,0,0,0.55)', flex: 1 },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  corner: { position: 'absolute', width: 30, height: 30 },
  cornerH: { position: 'absolute', top: 0, left: 0, width: 30, height: 3, backgroundColor: '#fff', borderRadius: 2 },
  cornerV: { position: 'absolute', top: 0, left: 0, width: 3, height: 30, backgroundColor: '#fff', borderRadius: 2 },
  hintWrap: { position: 'absolute', bottom: 170, left: 0, right: 0, alignItems: 'center' },
  hint: {
    color: '#fff',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 40,
    opacity: 0.9,
  },
  controls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  shutter: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
  sideButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  busyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  busyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 999,
  },
  busyText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  errorWrap: {
    position: 'absolute',
    bottom: 240,
    left: 20,
    right: 20,
    padding: 12,
    borderRadius: 12,
  },
  errorText: { color: '#fff', fontSize: 14, textAlign: 'center' },
});
