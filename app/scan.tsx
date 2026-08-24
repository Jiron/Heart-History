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

import { startScan } from '@/services/scanRunner';
import { useTranslation } from '@/i18n';
import { useAppState } from '@/state/AppState';
import { Button } from '@/ui/components';
import { useTheme } from '@/ui/ThemeProvider';

export default function ScanScreen() {
  const theme = useTheme();
  const t = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { settings } = useAppState();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [torch, setTorch] = useState(false);

  // The guide frame roughly matches the proportions of the monitor's LCD, so
  // filling it puts the digits at a size the recogniser handles comfortably.
  // Sized against the preview rather than the window, because the preview is
  // letterboxed to the capture aspect ratio -- see the note in the tree below.
  const previewWidth = width;
  const frameWidth = Math.min(previewWidth - 48, 420);
  const frameHeight = frameWidth * 0.82;

  /**
   * Hands the photo off and leaves. The reading continues in the background --
   * see services/scanRunner.ts for why it must not be awaited here.
   */
  const handOff = useCallback(
    (uri: string) => {
      startScan(uri, { serverUrl: settings.ocrServerUrl }, t);
      // A short buzz to confirm the shutter fired, since the viewfinder is about
      // to disappear and there is no other feedback that it worked.
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      router.replace('/review');
    },
    [settings.ocrServerUrl, t],
  );

  const capture = useCallback(async () => {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.95,
        skipProcessing: false,
      });
      if (photo?.uri) handOff(photo.uri);
      else setError(t.scan.noPicture);
    } catch {
      setError(t.scan.noPicture);
    } finally {
      // Only guards a double-press between the shutter firing and the screen
      // going away; it is no longer how long the reading takes.
      setBusy(false);
    }
  }, [busy, handOff, t]);

  const pickFromLibrary = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      handOff(result.assets[0].uri);
    }
  }, [handOff]);

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
          {settings.ocrServerUrl
            ? t.scan.permissionMessageAssisted
            : t.scan.permissionMessage}
        </Text>
        <Button title={t.scan.allowCamera} onPress={requestPermission} />
        <Button title={t.scan.choosePhoto} variant="ghost" onPress={pickFromLibrary} />
        <Button title={t.scan.goBack} variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/*
        The preview is deliberately letterboxed rather than filling the screen.

        By default expo-camera scales the preview to FILL its view, so a
        full-screen preview on a tall phone shows a centre crop of a 4:3 sensor
        while `takePictureAsync` returns the whole 4:3 frame. The viewfinder
        therefore looked zoomed in, and every photo came out wider than it was
        framed -- which for this app is not cosmetic: the monitor ends up smaller
        in the picture than the person aiming at it intended, and a panel that is
        small in frame is exactly what the recogniser cannot read.

        Passing `ratio` switches the preview to FIT, and the container below is
        the same 4:3, so what is on screen is what the camera captures. The
        guide frame sits inside that box for the same reason: a target drawn
        over screen area that is not in the photograph would be a lie.
      */}
      <View style={styles.previewBox}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          ratio={CAPTURE_RATIO}
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
          <View style={[styles.dim, { flex: 1 }]} />
        </View>
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

/**
 * Aspect ratio of both the preview and the still.
 *
 * 4:3 is the native shape of essentially every phone sensor; 16:9 is produced by
 * cropping it, which throws away vertical field of view for no benefit here.
 */
const CAPTURE_RATIO = '4:3' as const;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  // Portrait 4:3. Width drives it, so the box is as large as the screen allows.
  previewBox: { width: '100%', aspectRatio: 3 / 4, justifyContent: 'center' },
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
