/**
 * Language identifiers, in their own module so that both the React provider and
 * the platform-free locale holder can depend on them without depending on each
 * other.
 */

export type Language = 'de' | 'en';

export type LanguagePreference = Language | 'system';
