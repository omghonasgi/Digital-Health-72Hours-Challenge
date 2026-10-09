import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Glyph } from './Icons';
import { Body, Meta } from './Text';
import { colors, radius, space, tapMin } from './theme';

export type StatusTone = 'neutral' | 'good' | 'caution' | 'urgent' | 'blue';

export const statusColor: Record<StatusTone, string> = {
  neutral: colors.inkMuted,
  good: colors.good,
  caution: colors.caution,
  urgent: colors.urgent,
  blue: colors.blue,
};

interface ChipProps {
  label: string;
  icon?: LucideIcon;
  /** Status tone colors the glyph/dot only; text stays ink for contrast. */
  tone?: StatusTone;
  selected?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  meta?: string;
  dense?: boolean;
  accessibilityLabel?: string;
}

/**
 * Glanceable chip: glyph first, text second. If a chip can be a glyph, it
 * becomes a glyph (pass no label). Tap target is kept at 44px via hitSlop.
 */
export function Chip({ label, icon, tone = 'neutral', selected, onPress, style, meta, dense, accessibilityLabel }: ChipProps) {
  const bg = selected ? colors.blue : colors.paper;
  const fg = selected ? colors.canvas : colors.ink;
  const inner = (
    <View style={[styles.chip, dense && styles.dense, { backgroundColor: bg }, style]}>
      {icon ? <Glyph icon={icon} size={18} color={selected ? colors.canvas : tone === 'neutral' ? colors.ink : statusColor[tone]} /> : null}
      {!icon && tone !== 'neutral' ? <View style={[styles.dot, { backgroundColor: statusColor[tone] }]} /> : null}
      <Body color={fg} numberOfLines={1} style={styles.label}>
        {label}
      </Body>
      {meta ? <Meta color={selected ? colors.canvasMuted : colors.inkMuted}>{meta}</Meta> : null}
    </View>
  );
  if (!onPress) return inner;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      {inner}
    </Pressable>
  );
}

export function StatusDot({ tone, size = 10 }: { tone: StatusTone; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: statusColor[tone] }} />;
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    minHeight: tapMin - 8,
    borderRadius: radius.chip,
    alignSelf: 'flex-start',
  },
  dense: { minHeight: 32, paddingHorizontal: space.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: { flexShrink: 1 },
  pressed: { opacity: 0.8 },
});
