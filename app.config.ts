import type { ExpoConfig } from 'expo/config';

/**
 * Heart History never talks to a network, and this config is where that stops
 * being a promise and becomes something Android enforces.
 *
 * Expo's default Android manifest template grants `INTERNET` to every app. It is
 * blocked here, so a released build is *incapable* of sending a photo or a
 * reading anywhere — the guarantee holds even if a future dependency tries.
 *
 * The one exception is a development build, which has to reach the Metro bundler
 * on your machine to load JavaScript at all. That is opt-in and never shipped:
 * `preview`, `production` and `production-apk` all come out with no network
 * access whatsoever. Day-to-day development in Expo Go is unaffected, because
 * Expo Go runs under its own manifest.
 */
const isDevelopmentBuild = process.env.EAS_BUILD_PROFILE === 'development';

const config: ExpoConfig = {
  name: 'Heart History',
  slug: 'heart-history',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'hearthistory',
  userInterfaceStyle: 'automatic',
  assetBundlePatterns: ['**/*'],
  extra: {
    eas: {
      projectId: "c1d8ffae-513c-4927-8607-967279d89248"
    }
  },
  updates: {
    url: "https://u.expo.dev/c1d8ffae-513c-4927-8607-967279d89248"
  },
  runtimeVersion: {
    policy: "appVersion"
  },
  android: {
    package: 'ch.opten.hearthistory',
    adaptiveIcon: {
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    permissions: ['android.permission.CAMERA', 'android.permission.VIBRATE'],
    blockedPermissions: [
      // See the note above: released builds have no network access at all.
      ...(isDevelopmentBuild ? [] : ['android.permission.INTERNET']),
      'android.permission.RECORD_AUDIO',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ],
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'ch.opten.hearthistory',
  },
  plugins: [
    'expo-router',
    'expo-sqlite',
    'expo-sharing',
    'expo-localization',
    [
      'expo-camera',
      {
        cameraPermission:
          'Heart History uses the camera to read the numbers off your blood-pressure monitor. Photos stay on this device.',
        recordAudioAndroid: false,
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission:
          'Heart History reads blood-pressure readings from photos you choose. They are analysed on this device.',
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        imageWidth: 180,
        resizeMode: 'contain',
        backgroundColor: '#F7F8FB',
        dark: { backgroundColor: '#0B1220' },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
