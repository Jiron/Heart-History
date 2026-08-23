import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { darkTheme, lightTheme, type Theme } from './theme';

const ThemeContext = createContext<Theme>(lightTheme);

export function ThemeProvider({
  preference,
  children,
}: {
  preference: 'system' | 'light' | 'dark';
  children: React.ReactNode;
}) {
  const system = useColorScheme();
  const theme = useMemo(() => {
    const resolved = preference === 'system' ? (system ?? 'light') : preference;
    return resolved === 'dark' ? darkTheme : lightTheme;
  }, [preference, system]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * Builds styles from the current theme, memoised per theme object.
 *
 * React Native's `StyleSheet.create` cannot see theme values, so styles either
 * get inlined (losing the optimisation and cluttering render code) or built in a
 * factory like this one.
 */
export function useThemedStyles<T>(factory: (theme: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => factory(theme), [theme, factory]);
}
