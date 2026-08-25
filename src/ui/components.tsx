import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { elevation } from './theme';
import { useTheme } from './ThemeProvider';

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function Card({
  children,
  style,
  padded = true,
  level = 1,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  level?: 0 | 1 | 2 | 3;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          padding: padded ? theme.spacing.lg : 0,
        },
        elevation(theme, level),
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <Text
        style={{
          ...theme.typography.heading,
          color: theme.colors.text,
        }}
      >
        {title}
      </Text>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={{ ...theme.typography.label, color: theme.colors.accent }}>
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View
      style={[{ height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border }, style]}
    />
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

export interface ButtonProps extends Omit<PressableProps, 'style'> {
  title: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  title,
  variant = 'primary',
  icon,
  loading,
  fullWidth,
  style,
  onPress,
  disabled,
  ...rest
}: ButtonProps) {
  const theme = useTheme();

  const palette = {
    primary: { bg: theme.colors.accent, fg: theme.colors.onAccent, border: 'transparent' },
    secondary: {
      bg: theme.colors.accentSoft,
      fg: theme.colors.accent,
      border: 'transparent',
    },
    ghost: { bg: 'transparent', fg: theme.colors.text, border: theme.colors.borderStrong },
    danger: { bg: theme.colors.dangerSoft, fg: theme.colors.danger, border: 'transparent' },
  }[variant];

  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      onPress={(e) => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.(e);
      }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderWidth: variant === 'ghost' ? StyleSheet.hairlineWidth : 0,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={palette.fg} /> : null}
          <Text style={{ ...theme.typography.subheading, color: palette.fg }}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  colour,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  colour?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const theme = useTheme();
  const active = colour ?? theme.colors.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={
        onPress
          ? () => {
              Haptics.selectionAsync().catch(() => {});
              onPress();
            }
          : undefined
      }
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? active : theme.colors.surfaceSunken,
          borderColor: selected ? active : theme.colors.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={14}
          color={selected ? theme.colors.onAccent : theme.colors.textMuted}
        />
      ) : null}
      <Text
        style={{
          ...theme.typography.label,
          color: selected ? theme.colors.onAccent : theme.colors.textMuted,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Horizontally scrolling row of chips that behaves as a single-select. */
export function SegmentedChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
    >
      {options.map((o) => (
        <Chip
          key={o.key}
          label={o.label}
          selected={o.key === value}
          onPress={() => onChange(o.key)}
        />
      ))}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

export function StatTile({
  label,
  value,
  unit,
  hint,
  colour,
  style,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  colour?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surfaceSunken,
          borderRadius: theme.radius.md,
          padding: theme.spacing.md,
          flex: 1,
        },
        style,
      ]}
    >
      <Text style={{ ...theme.typography.micro, color: theme.colors.textFaint }}>
        {label.toUpperCase()}
      </Text>
      <View style={styles.statValueRow}>
        <Text
          style={{
            ...theme.typography.heading,
            color: colour ?? theme.colors.text,
          }}
        >
          {value}
        </Text>
        {unit ? (
          <Text style={{ ...theme.typography.caption, color: theme.colors.textFaint }}>
            {unit}
          </Text>
        ) : null}
      </View>
      {hint ? (
        <Text style={{ ...theme.typography.caption, color: theme.colors.textFaint }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      <View
        style={[
          styles.emptyIcon,
          { backgroundColor: theme.colors.surfaceSunken },
        ]}
      >
        <Ionicons name={icon} size={30} color={theme.colors.textFaint} />
      </View>
      <Text
        style={{
          ...theme.typography.heading,
          color: theme.colors.text,
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          ...theme.typography.body,
          color: theme.colors.textMuted,
          textAlign: 'center',
          maxWidth: 300,
        }}
      >
        {message}
      </Text>
      {action ? <View style={{ marginTop: 8 }}>{action}</View> : null}
    </View>
  );
}

export function Banner({
  tone,
  title,
  message,
  icon,
}: {
  tone: 'info' | 'warning' | 'danger' | 'success';
  title?: string;
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const theme = useTheme();
  const map = {
    info: { bg: theme.colors.accentSoft, fg: theme.colors.accent, icon: 'information-circle' },
    warning: { bg: theme.category.highNormal.soft, fg: theme.category.highNormal.onSoft, icon: 'alert-circle' },
    danger: { bg: theme.colors.dangerSoft, fg: theme.colors.danger, icon: 'warning' },
    success: { bg: theme.category.optimal.soft, fg: theme.category.optimal.onSoft, icon: 'checkmark-circle' },
  }[tone];

  return (
    <View style={[styles.banner, { backgroundColor: map.bg }]}>
      <Ionicons
        name={(icon ?? map.icon) as keyof typeof Ionicons.glyphMap}
        size={18}
        color={map.fg}
        style={{ marginTop: 1 }}
      />
      <View style={{ flex: 1, gap: 2 }}>
        {title ? (
          <Text style={{ ...theme.typography.label, color: map.fg }}>{title}</Text>
        ) : null}
        <Text style={{ ...theme.typography.body, color: map.fg }}>{message}</Text>
      </View>
    </View>
  );
}

export function Row({
  children,
  gap = 12,
  style,
}: {
  children: React.ReactNode;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[{ flexDirection: 'row', gap }, style]}>{children}</View>;
}

/**
 * The photograph a reading was scanned from, shown whole.
 *
 * Cropping it to a fixed height is the obvious thing and it is wrong here. On a
 * monitor photographed upright the first thing a centre crop removes is the
 * systolic row -- the number the photo is being kept to corroborate. So the
 * natural size is measured and the image is rendered at its own aspect ratio,
 * which also avoids the letterbox bars a `contain` fit would leave.
 *
 * `fallbackHeight` is what shows while the measurement is in flight, and if it
 * fails: a URI that cannot be measured usually cannot be drawn either, and a
 * box of that height is a more honest placeholder than a collapsed one.
 */
export function ReadingPhoto({
  uri,
  label,
  fallbackHeight = 240,
}: {
  uri: string;
  label: string;
  fallbackHeight?: number;
}) {
  const theme = useTheme();
  // The measurement is stored *with* the uri it belongs to, and a mismatch is
  // read as "not measured yet". Clearing it in the effect instead would show
  // the previous photo's shape for a frame after the uri changes -- and is a
  // synchronous setState during an effect, which cascades a render.
  const [measured, setMeasured] = React.useState<{ uri: string; ratio: number } | null>(null);
  const ratio = measured?.uri === uri ? measured.ratio : null;

  React.useEffect(() => {
    let cancelled = false;
    Image.getSize(
      uri,
      (width, height) => {
        if (!cancelled && height > 0) setMeasured({ uri, ratio: width / height });
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [uri]);

  return (
    <Card padded={false} style={{ overflow: 'hidden' }}>
      <Image
        source={{ uri }}
        style={
          ratio
            ? { width: '100%', aspectRatio: ratio }
            : { width: '100%', height: fallbackHeight, backgroundColor: theme.colors.background }
        }
        resizeMode={ratio ? 'cover' : 'contain'}
        accessibilityLabel={label}
      />
    </Card>
  );
}

export function Muted({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const theme = useTheme();
  return (
    <Text style={[{ ...theme.typography.body, color: theme.colors.textMuted }, style]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    minHeight: 48,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipRow: { gap: 8, paddingRight: 16 },
  statValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 2 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 48, paddingHorizontal: 24 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  banner: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    alignItems: 'flex-start',
  },
});
