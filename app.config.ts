import type { ExpoConfig } from 'expo/config';

/**
 * Heart History never talks to a network, and this config is where that stops
 * being a promise and becomes something Android enforces.
 *
 * Expo's default Android manifest template grants `INTERNET` to every app. It is
 * blocked here, so a released build is *incapable* of sending a photo or a
 * reading anywhere — the guarantee holds even if a future dependency tries.
 *
 * There are two exceptions, both opt-in and neither on by default:
 *
 *   development    has to reach the Metro bundler on your machine to load
 *                  JavaScript at all.
 *   assisted-apk   is the build for people using a self-hosted reading server.
 *                  See services/remoteOcr.ts for what that trades away and why
 *                  it is a separate build rather than a setting: a permission
 *                  the binary does not have cannot be turned on by a bug.
 *
 * `preview`, `production` and `production-apk` still come out with no network
 * access whatsoever. Day-to-day development in Expo Go is unaffected, because
 * Expo Go runs under its own manifest.
 */
const isDevelopmentBuild = process.env.EAS_BUILD_PROFILE === 'development';
const allowsNetwork = isDevelopmentBuild || process.env.HH_ALLOW_NETWORK === '1';

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
    permissions: [
      'android.permission.CAMERA',
      'android.permission.VIBRATE',
      // Android 16 split local-network access out of INTERNET. Without it a
      // request to a machine on the same LAN fails as though the host were
      // down. Only declared for the builds that have INTERNET at all.
      ...(allowsNetwork ? ['android.permission.ACCESS_LOCAL_NETWORK'] : []),
    ],
    blockedPermissions: [
      // See the note above: released builds have no network access at all.
      ...(allowsNetwork ? [] : ['android.permission.INTERNET']),
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
    [
      // A reading server on your own network is reached over plain HTTP: it has
      // no certificate a phone would trust, and issuing one for a house is not
      // something anybody is going to do. Android blocks cleartext by default,
      // so without this the assisted build fails every request with no useful
      // error. It stays false for every build that has no network anyway.
      'expo-build-properties',
      { android: { usesCleartextTraffic: allowsNetwork } },
    ],
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
