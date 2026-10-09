import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { colors, duration, easing, type } from './theme';

interface StampProps {
  label: string;
  /** Outline is the default; filled is for the one hero state on a screen. */
  variant?: 'outline' | 'filled' | 'canvas';
  size?: number;
  rotate?: number;
  /** Status stamps use the status color for the ring/glyph; text stays legible. */
  statusColor?: string;
}

/**
 * Signature decorative primitive: a rotated warm-blue ring with a short
 * uppercase label (SCHEDULED, COVERED, § REPORT). Lands with the spring curve.
 */
export function Stamp({ label, variant = 'outline', size = 64, rotate = -8, statusColor }: StampProps) {
  const [anim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: duration.spring, easing: easing.spring, useNativeDriver: true }).start();
  }, [anim]);
  const ring = statusColor ?? (variant === 'canvas' ? colors.canvas : colors.blue);
  const fill = variant === 'filled' ? ring : 'transparent';
  const text = variant === 'filled' ? colors.canvas : statusColor ?? (variant === 'canvas' ? colors.canvas : colors.blue);
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  const rot = anim.interpolate({ inputRange: [0, 1], outputRange: [`${rotate - 18}deg`, `${rotate}deg`] });
  // Type scales with the ring so a word never breaks mid-letter on small stamps.
  const fontSize = Math.max(7, Math.min(11, Math.round(size * 0.16)));
  const fontStyle = { fontSize, lineHeight: fontSize + 2, letterSpacing: fontSize >= 10 ? 0.8 : 0.3 };
  return (
    <Animated.View
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[
        styles.ring,
        { width: size, height: size, borderRadius: size / 2, borderColor: ring, backgroundColor: fill, opacity: anim, transform: [{ scale }, { rotate: rot }] },
      ]}
    >
      <Text numberOfLines={2} style={[type.stamp, fontStyle, styles.text, { color: text, maxWidth: size - 8 }]}>
        {label.toUpperCase()}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ring: { borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  text: { textAlign: 'center' },
});
