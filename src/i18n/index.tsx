import React, { createContext, useContext, useMemo } from 'react';
import { getLocales } from 'expo-localization';

import { de, type Dictionary } from './de';
import { en } from './en';
import { LANGUAGES, LOCALES, setLocale } from './locale';
import type { Language, LanguagePreference } from './types';

/**
 * The locale itself lives in `./locale`, which imports nothing from React or
 * Expo. Formatting helpers read it from there, so pulling in a date format does
 * not pull in the whole provider — see the note in that file.
 */
export { getLocale, LANGUAGES } from './locale';
export type { Language, LanguagePreference } from './types';

const DICTIONARIES: Record<Language, Dictionary> = { de, en };

/** Resolves a preference against the phone's settings. German is the default. */
export function resolveLanguage(preference: LanguagePreference): Language {
  if (preference !== 'system') return preference;
  const tags = getLocales();
  for (const locale of tags) {
    const code = locale.languageCode?.toLowerCase();
    if (code && (LANGUAGES as string[]).includes(code)) return code as Language;
  }
  return 'de';
}

interface I18nValue {
  t: Dictionary;
  language: Language;
  locale: string;
}

const I18nContext = createContext<I18nValue>({
  t: de,
  language: 'de',
  locale: LOCALES.de,
});

export function I18nProvider({
  preference,
  children,
}: {
  preference: LanguagePreference;
  children: React.ReactNode;
}) {
  const value = useMemo<I18nValue>(() => {
    const language = resolveLanguage(preference);
    const locale = LOCALES[language];
    // Set before children render, so the first formatted date is already right.
    setLocale(language);
    return { t: DICTIONARIES[language], language, locale };
  }, [preference]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** The active dictionary. Access strings directly: `t.home.recent`. */
export function useTranslation(): Dictionary {
  return useContext(I18nContext).t;
}

export function useLanguage(): { language: Language; locale: string } {
  const { language, locale } = useContext(I18nContext);
  return { language, locale };
}

/** Dictionary for a language, for code that runs outside React (exports, reports). */
export function dictionaryFor(language: Language): Dictionary {
  return DICTIONARIES[language];
}

export function localeFor(language: Language): string {
  return LOCALES[language];
}

export type { Dictionary };
