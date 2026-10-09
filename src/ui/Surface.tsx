import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { Grain } from './Grain';
import { grainOpacity, radius, space, toneBackground, type Tone } from './theme';

interface SurfaceProps extends ViewProps {
  tone?: Tone;
  padded?: boolean | number;
  style?: StyleProp<ViewStyle>;
  /** Status surfaces are never grained; use for small status fills only. */
  grain?: boolean;
}

/** A grained surface. Cards are paper, panels are blueDeep/ink, screens are canvas. */
export function Surface({ tone = 'paper', padded, style, grain = true, children, ...rest }: SurfaceProps) {
  const pad = padded === true ? space.lg : typeof padded === 'number' ? padded : 0;
  return (
    <View
      {...rest}
      style={[styles.base, { backgroundColor: toneBackground[tone], padding: pad }, style]}
    >
      {grain ? <Grain opacity={grainOpacity[tone]} /> : null}
      {children}
    </View>
  );
}

export const Card = (props: SurfaceProps) => <Surface tone="paper" padded {...props} style={[styles.card, props.style]} />;

const styles = StyleSheet.create({
  base: { overflow: 'hidden', borderRadius: radius.card, position: 'relative' },
  card: { gap: space.md },
});
