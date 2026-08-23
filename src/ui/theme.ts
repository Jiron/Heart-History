import type { BpCategory } from '@/domain/classification';

/**
 * Design tokens.
 *
 * Two complete palettes rather than one palette with opacity tricks, so dark
 * mode is designed rather than derived. Category colours are shared between the
 * two themes but given separate `on`/`soft` pairs, because a tint that reads as
 * "gently raised" on white reads as "alarming" on near-black.
 */

export interface Palette {
  background: string;
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  systolic: string;
  diastolic: string;
  pulse: string;
  danger: string;
  dangerSoft: string;
  success: string;
  warning: string;
  shadow: string;
  overlay: string;
}

const light: Palette = {
  background: '#F4F6FA',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceSunken: '#EDF0F6',
  border: '#E2E7F0',
  borderStrong: '#CBD3E1',
  text: '#111827',
  textMuted: '#5B6577',
  textFaint: '#8E97A8',
  accent: '#3355E0',
  accentSoft: '#E6EBFF',
  onAccent: '#FFFFFF',
  systolic: '#3355E0',
  diastolic: '#12B0A0',
  pulse: '#E0567A',
  danger: '#D6303C',
  dangerSoft: '#FDE8EA',
  success: '#12915F',
  warning: '#B9741A',
  shadow: 'rgba(17, 24, 39, 0.10)',
  overlay: 'rgba(9, 14, 26, 0.55)',
};

const dark: Palette = {
  background: '#0B1220',
  surface: '#141C2C',
  surfaceRaised: '#1B2436',
  surfaceSunken: '#0F1726',
  border: '#25304A',
  borderStrong: '#36435F',
  text: '#F2F5FA',
  textMuted: '#A3AFC4',
  textFaint: '#6F7C93',
  accent: '#6F8CFF',
  accentSoft: '#1E2A4D',
  onAccent: '#0B1220',
  systolic: '#6F8CFF',
  diastolic: '#2ED3BE',
  pulse: '#FF7D9E',
  danger: '#FF6B76',
  dangerSoft: '#3A1A20',
  success: '#3BD68C',
  warning: '#E0A34A',
  shadow: 'rgba(0, 0, 0, 0.45)',
  overlay: 'rgba(3, 6, 12, 0.7)',
};

export interface CategoryColours {
  /** Strong colour for text, dots and chart marks. */
  main: string;
  /** Tinted background for chips and banners. */
  soft: string;
  /** Text colour that sits on `soft`. */
  onSoft: string;
}

const categoryLight: Record<BpCategory, CategoryColours> = {
  low: { main: '#5B8DEF', soft: '#E7EFFF', onSoft: '#2A4F9E' },
  optimal: { main: '#12915F', soft: '#DFF5EA', onSoft: '#0B6543' },
  normal: { main: '#4F9B36', soft: '#E7F4DE', onSoft: '#376D25' },
  highNormal: { main: '#B9741A', soft: '#FBEEDA', onSoft: '#7E4E10' },
  grade1: { main: '#DB7016', soft: '#FCE9D8', onSoft: '#8F480C' },
  grade2: { main: '#D6303C', soft: '#FBE0E2', onSoft: '#8E1F27' },
  grade3: { main: '#9B1B44', soft: '#F7DCE5', onSoft: '#6A1230' },
};

const categoryDark: Record<BpCategory, CategoryColours> = {
  low: { main: '#7FA8FF', soft: '#1B2947', onSoft: '#BBD0FF' },
  optimal: { main: '#3BD68C', soft: '#123227', onSoft: '#8FEDC2' },
  normal: { main: '#8BD65F', soft: '#1B2E17', onSoft: '#C4EBA6' },
  highNormal: { main: '#E0A34A', soft: '#332512', onSoft: '#F3D19B' },
  grade1: { main: '#F08A3C', soft: '#3A2413', onSoft: '#F8C295' },
  grade2: { main: '#FF6B76', soft: '#3A1A20', onSoft: '#FFB3B8' },
  grade3: { main: '#FF5C93', soft: '#3B1526', onSoft: '#FFAFC9' },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 26,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 48, lineHeight: 52, fontWeight: '700' as const, letterSpacing: -1.2 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: '700' as const, letterSpacing: -0.5 },
  heading: { fontSize: 19, lineHeight: 25, fontWeight: '700' as const, letterSpacing: -0.2 },
  subheading: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' as const },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
  micro: { fontSize: 11, lineHeight: 14, fontWeight: '600' as const, letterSpacing: 0.4 },
} as const;

export interface Theme {
  dark: boolean;
  colors: Palette;
  category: Record<BpCategory, CategoryColours>;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
}

export const lightTheme: Theme = {
  dark: false,
  colors: light,
  category: categoryLight,
  spacing,
  radius,
  typography,
};

export const darkTheme: Theme = {
  dark: true,
  colors: dark,
  category: categoryDark,
  spacing,
  radius,
  typography,
};

/** Shadow presets. Android honours `elevation`; the rest is for iOS parity. */
export function elevation(theme: Theme, level: 0 | 1 | 2 | 3) {
  if (level === 0) return {};
  const map = {
    1: { elevation: 2, shadowOpacity: 0.1, shadowRadius: 6, offset: 2 },
    2: { elevation: 5, shadowOpacity: 0.14, shadowRadius: 12, offset: 4 },
    3: { elevation: 10, shadowOpacity: 0.2, shadowRadius: 22, offset: 8 },
  }[level];
  return {
    elevation: map.elevation,
    shadowColor: theme.colors.shadow,
    shadowOpacity: 1,
    shadowRadius: map.shadowRadius,
    shadowOffset: { width: 0, height: map.offset },
  };
}
