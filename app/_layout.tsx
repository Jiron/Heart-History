import React, { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { I18nProvider, useTranslation } from '@/i18n';
import {
  AppStateProvider,
  useBootstrap,
  useLanguagePreference,
  useThemePreference,
} from '@/state/AppState';
import { ThemeProvider, useTheme } from '@/ui/ThemeProvider';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden, or the module is unavailable. Not worth failing a launch over.
});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppStateProvider>
          <ThemedShell />
        </AppStateProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Sits inside the state provider so it can read the saved theme preference,
 * falling back to the system setting until the database has been read.
 */
function ThemedShell() {
  const theme = useThemePreference();
  const language = useLanguagePreference();
  return (
    <ThemeProvider preference={theme}>
      <I18nProvider preference={language}>
        <BootGate />
      </I18nProvider>
    </ThemeProvider>
  );
}

/**
 * Holds the splash screen until startup has resolved, then shows either the app
 * or a readable failure.
 *
 * This must live outside the part of the tree that depends on loaded state:
 * dismissing the splash is itself a render, so if the whole tree waited for the
 * database, a failure to open it would leave the splash up permanently with no
 * way to see what went wrong or to try again.
 */
function BootGate() {
  const theme = useTheme();
  const t = useTranslation();
  const { ready, error, retry } = useBootstrap();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) {
    return (
      <View style={[styles.centre, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.centre, { backgroundColor: theme.colors.background }]}>
        <Ionicons name="alert-circle-outline" size={44} color={theme.colors.danger} />
        <Text style={[styles.errorTitle, { color: theme.colors.text }]}>
          {t.boot.failedTitle}
        </Text>
        <Text style={[styles.errorBody, { color: theme.colors.textMuted }]}>{error}</Text>
        <Pressable
          onPress={retry}
          style={[styles.retry, { backgroundColor: theme.colors.accent }]}
          accessibilityRole="button"
        >
          <Text style={{ color: theme.colors.onAccent, fontWeight: '700' }}>
            {t.common.retry}
          </Text>
        </Pressable>
      </View>
    );
  }

  return <Navigation />;
}

function Navigation() {
  const theme = useTheme();
  const t = useTranslation();

  return (
    <>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.text,
          headerTitleStyle: { fontWeight: '700' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="scan"
          options={{ headerShown: false, animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="review" options={{ title: t.screens.review }} />
        <Stack.Screen name="entry" options={{ title: t.screens.entry }} />
        <Stack.Screen name="reading/[id]" options={{ title: t.screens.reading }} />
        <Stack.Screen name="profiles" options={{ title: t.screens.profiles }} />
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  errorTitle: { fontSize: 19, fontWeight: '700', textAlign: 'center' },
  errorBody: { fontSize: 15, textAlign: 'center', lineHeight: 21 },
  retry: { marginTop: 8, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 14 },
});
