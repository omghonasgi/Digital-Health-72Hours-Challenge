import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Glyph } from './Icons';
import { Grain } from './Grain';
import { Body } from './Text';
import { colors, grainOpacity, radius, space, tapMin } from './theme';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Hero = the one blue action on a screen. Ghost = outlined. Quiet = text only. */
  variant?: 'hero' | 'ghost' | 'quiet' | 'danger';
  compact?: boolean;
  accessibilityHint?: string;
}

export function Button({ label, onPress, icon, disabled, loading, style, variant = 'ghost', compact, accessibilityHint }: ButtonProps) {
  const hero = variant === 'hero';
  const danger = variant === 'danger';
  const fg = hero ? colors.canvas : danger ? colors.urgent : colors.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        hero && styles.hero,
        variant === 'ghost' && styles.ghost,
        danger && styles.danger,
        variant === 'quiet' && styles.quiet,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {hero ? <Grain opacity={grainOpacity.blue} /> : null}
      <View style={styles.row}>
        {loading ? <ActivityIndicator color={fg} /> : icon ? <Glyph icon={icon} size={20} color={fg} /> : null}
        <Body color={fg} weight={hero ? 'medium' : 'regular'} numberOfLines={1}>
          {label}
        </Body>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: tapMin + 4,
    paddingHorizontal: space.lg,
    borderRadius: radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    alignSelf: 'stretch',
  },
  compact: { alignSelf: 'flex-start', minHeight: tapMin },
  hero: { backgroundColor: colors.blue },
  ghost: { borderWidth: 1.5, borderColor: colors.ink },
  danger: { borderWidth: 1.5, borderColor: colors.urgent },
  quiet: { paddingHorizontal: space.sm },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.85 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
