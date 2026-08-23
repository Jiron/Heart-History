import React, { createContext, useContext, useMemo } from 'react';
import { getLocales } from 'expo-localization';

import { de, type Dictionary } from './de';
import { en } from './en';

export type Language = 'de' | 'en';
/** What the user picked. `system` follows the phone, falling back to German. */
export type LanguagePreference = Language | 'system';

const DICTIONARIES: Record<Language, Dictionary> = { de, en };

/**
 * BCP-47 tags used for date and number formatting.
 *
 * Swiss German rather than plain `de`, because it gets the date order and
 * separators right for where this app is used.
 */
const LOCALES: Record<Language, string> = {
  de: 'de-CH',
  en: 'en-GB',
};

export const LANGUAGES: Language[] = ['de', 'en'];

/**
 * The active locale, held in a module variable.
 *
 * Date and number formatting happens in plain functions all over the app, far
 * from any React context. Threading a locale through every one of them would add
 * a parameter to code that is otherwise pure formatting, so the language
 * provider publishes it here instead and `lib/format.ts` reads it.
 */
let activeLocale: string = LOCALES.de;

export function getLocale(): string {
  return activeLocale;
}

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
    activeLocale = locale;
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
