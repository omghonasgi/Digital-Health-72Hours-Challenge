import React, { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { colors } from './theme';

interface ThreadProps {
  /** Length in px along the axis. */
  length: number;
  orientation?: 'vertical' | 'horizontal';
  /** Animate a soft pulse travelling along the thread. */
  live?: boolean;
  color?: string;
}

/**
 * Signature kinetic primitive: a 1.5px hairline with a soft blue glow that
 * connects a calendar event to the resource behind it. The pulse travels
 * with the UI curve; nothing bounces.
 */
export function Thread({ length, orientation = 'vertical', live = true, color = colors.blueSoft }: ThreadProps) {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!live) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 2400, easing: Easing.bezier(0.2, 0.7, 0.2, 1), useNativeDriver: true }),
        Animated.delay(900),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [live, t]);
  const vertical = orientation === 'vertical';
  const travel = t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(0, length - 10)] });
  const opacity = t.interpolate({ inputRange: [0, 0.1, 0.9, 1], outputRange: [0, 1, 1, 0] });
  return (
    <View
      pointerEvents="none"
      style={[
        vertical ? { width: 10, height: length } : { height: 10, width: length },
        styles.wrap,
      ]}
    >
      <View style={[styles.line, vertical ? { width: 1.5, height: length } : { height: 1.5, width: length }, { backgroundColor: color, shadowColor: color }]} />
      <View style={[styles.knot, { backgroundColor: color }]} />
      <View style={[styles.knot, { backgroundColor: color }, vertical ? { top: length - 4 } : { left: length - 4 }]} />
      {live ? (
        <Animated.View
          style={[
            styles.pulse,
            { backgroundColor: color, shadowColor: color, opacity },
            vertical ? { transform: [{ translateY: travel }] } : { transform: [{ translateX: travel }] },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  line: { position: 'absolute', shadowOpacity: 0.7, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
  knot: { position: 'absolute', width: 4, height: 4, borderRadius: 2, top: 0, left: 3 },
  pulse: { position: 'absolute', top: 0, left: 1, width: 8, height: 8, borderRadius: 4, shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
});
