import type { Language } from './types';

/**
 * The active locale, held in a module variable.
 *
 * Date and number formatting happens in plain functions all over the app, far
 * from any React context. Threading a locale through every one of them would add
 * a parameter to code that is otherwise pure formatting, so the language
 * provider publishes it here instead and `lib/format.ts` reads it.
 *
 * This lives in its own file, separate from the provider, so that the modules
 * which only need to *read* the locale do not have to import React Native along
 * with it. `services/reportHtml.ts` is the reason: keeping this import chain
 * platform-free is what lets the doctor's report be generated in Node and
 * inspected in a browser.
 */

export const LOCALES: Record<Language, string> = {
  de: 'de-CH',
  en: 'en-GB',
};

export const LANGUAGES: Language[] = ['de', 'en'];

let activeLocale: string = LOCALES.de;

export function getLocale(): string {
  return activeLocale;
}

/** Called by the language provider when the user changes language. */
export function setLocale(language: Language): void {
  activeLocale = LOCALES[language];
}
