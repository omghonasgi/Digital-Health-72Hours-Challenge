import React from 'react';
import { Text as RNText, StyleSheet, type TextProps, type TextStyle, type StyleProp } from 'react-native';
import { colors, tabular, type } from './theme';

interface P extends TextProps {
  color?: string;
  style?: StyleProp<TextStyle>;
  /** Centers text. */
  center?: boolean;
}

/** Fraunces italic. Emotion only: greetings, names, milestones. Never below 30px. */
export function Display({ color = colors.ink, style, center, ...rest }: P & { size?: 'default' | 'large' | 'hero' }) {
  const size = rest.size ?? 'default';
  const base = size === 'hero' ? type.displayHero : size === 'large' ? type.displayLarge : type.display;
  return <RNText {...rest} style={[base, { color }, center && styles.center, style]} />;
}

/** IBM Plex Mono 16. Body, labels, numerals. Tabular figures always on. */
export function Body({ color = colors.ink, style, center, ...rest }: P & { weight?: 'regular' | 'medium'; size?: 'default' | 'large' }) {
  const base = rest.size === 'large' ? type.bodyLarge : rest.weight === 'medium' ? type.bodyMedium : type.body;
  return <RNText {...rest} style={[base, tabular, { color }, center && styles.center, style]} />;
}

/** Secondary body text (ink at 72%). */
export function Muted(props: P & { size?: 'default' | 'large' }) {
  return <Body {...props} color={props.color ?? colors.inkMuted} />;
}

/** 14px mono, only for provenance and meta lines. */
export function Meta({ color = colors.inkMuted, style, center, ...rest }: P) {
  return <RNText {...rest} style={[type.meta, tabular, { color }, center && styles.center, style]} />;
}

/** Numerals that must line up. Same as Body but semantically explicit. */
export const Num = Body;

const styles = StyleSheet.create({ center: { textAlign: 'center' } });
