import { Easing, Platform, type TextStyle } from 'react-native';

/**
 * CareBridge design tokens. Source of truth: design-system/tokens.json and
 * skills.md. Do not add accents or faces here; iterate on layout instead.
 */
export const colors = {
  ink: '#1F2A36',
  canvas: '#F2F4F7',
  paper: '#E8EDF3',
  blue: '#3F72AF',
  blueSoft: '#7FA3CF',
  blueDeep: '#284B75',
  // Status only. Never decorative, never grained. Text stays ink; these carry glyphs and fills.
  good: '#3E7D5A',
  caution: '#B7832F',
  urgent: '#B5483B',
  // Derived, documented: ink at reduced alpha for secondary text and hairlines.
  inkMuted: 'rgba(31, 42, 54, 0.72)',
  inkFaint: 'rgba(31, 42, 54, 0.14)',
  canvasMuted: 'rgba(242, 244, 247, 0.78)',
} as const;

export type Tone = 'canvas' | 'paper' | 'ink' | 'blueDeep' | 'blue' | 'blueSoft';

export const fonts = {
  display: 'Fraunces_400Regular_Italic',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
  monoSemi: 'IBMPlexMono_600SemiBold',
} as const;

export const type = {
  display: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, letterSpacing: -0.3 },
  displayLarge: { fontFamily: fonts.display, fontSize: 44, lineHeight: 48, letterSpacing: -0.6 },
  displayHero: { fontFamily: fonts.display, fontSize: 56, lineHeight: 58, letterSpacing: -0.8 },
  body: { fontFamily: fonts.mono, fontSize: 16, lineHeight: 24 },
  bodyMedium: { fontFamily: fonts.monoMedium, fontSize: 16, lineHeight: 24 },
  bodyLarge: { fontFamily: fonts.mono, fontSize: 18, lineHeight: 28 },
  // Provenance and stamp text only; everything a user reads as content is ≥16px.
  meta: { fontFamily: fonts.mono, fontSize: 14, lineHeight: 20 },
  stamp: { fontFamily: fonts.monoSemi, fontSize: 11, lineHeight: 13, letterSpacing: 0.8 },
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { chip: 4, card: 4, round: 999 } as const;

export const tapMin = 44;

export const easing = {
  ui: Easing.bezier(0.2, 0.7, 0.2, 1),
  spring: Easing.bezier(0.34, 1.56, 0.64, 1),
} as const;

export const duration = { fast: 160, ui: 260, spring: 420 } as const;

export const layout = { maxWidth: 1040, sideNavWidth: 232, wideBreakpoint: 900 } as const;

/** Tabular numerals wherever a number renders. RN-web maps fontVariant to font-variant-numeric. */
export const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

export const isWeb = Platform.OS === 'web';

export const toneBackground: Record<Tone, string> = {
  canvas: colors.canvas,
  paper: colors.paper,
  ink: colors.ink,
  blueDeep: colors.blueDeep,
  blue: colors.blue,
  blueSoft: colors.blueSoft,
};

export const toneForeground: Record<Tone, string> = {
  canvas: colors.ink,
  paper: colors.ink,
  ink: colors.canvas,
  blueDeep: colors.canvas,
  blue: colors.canvas,
  blueSoft: colors.ink,
};

/** Grain opacity per surface: subtle on canvas, stronger on inked surfaces. */
export const grainOpacity: Record<Tone, number> = {
  canvas: 0.12,
  paper: 0.14,
  ink: 0.26,
  blueDeep: 0.24,
  blue: 0.18,
  blueSoft: 0.14,
};
