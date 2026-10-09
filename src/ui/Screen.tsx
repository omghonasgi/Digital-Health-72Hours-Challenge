import React from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Grain } from './Grain';
import { Body, Display, Muted } from './Text';
import { colors, grainOpacity, layout, space } from './theme';

interface ScreenProps {
  title?: string;
  /** Fraunces display title: only for emotion (greeting, name). Otherwise `title` renders in mono. */
  displayTitle?: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Right-aligned header content (a stamp, a chip). */
  aside?: React.ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  /** Extra bottom padding for bottom tab bars. */
  bottomInset?: number;
  scrollRef?: React.RefObject<ScrollView | null>;
}

/** Canvas surface with subtle grain, safe areas, and a centered max-width column. */
export function Screen({ title, displayTitle, subtitle, children, aside, scroll = true, contentStyle, bottomInset = 0, scrollRef }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pad = width >= layout.wideBreakpoint ? space.xxl : space.lg;
  const header =
    title || displayTitle ? (
      <View style={styles.header}>
        <View style={{ flex: 1, gap: space.xs }}>
          {displayTitle ? <Display size={width >= layout.wideBreakpoint ? 'large' : 'default'}>{displayTitle}</Display> : null}
          {title ? <Body size="large" weight="medium">{title}</Body> : null}
          {subtitle ? <Muted>{subtitle}</Muted> : null}
        </View>
        {aside}
      </View>
    ) : null;
  const inner = (
    <View style={[styles.column, { paddingHorizontal: pad, paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + bottomInset + space.xxl }, contentStyle]}>
      {header}
      {children}
    </View>
  );
  return (
    <View style={styles.root}>
      <Grain opacity={grainOpacity.canvas} />
      {scroll ? (
        <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {inner}
        </ScrollView>
      ) : (
        <View style={styles.scroll}>{inner}</View>
      )}
    </View>
  );
}

export function Section({
  title,
  children,
  aside,
  style,
  onLayout,
}: {
  title?: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onLayout?: React.ComponentProps<typeof View>['onLayout'];
}) {
  return (
    <View style={[styles.section, style]} onLayout={onLayout}>
      {title ? (
        <View style={styles.sectionHeader}>
          <Body weight="medium" style={{ flex: 1 }}>
            {title}
          </Body>
          {aside}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Row({ children, style, wrap }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; wrap?: boolean }) {
  return <View style={[styles.row, wrap && styles.wrap, style]}>{children}</View>;
}

export function KeyValue({ k, v, meta }: { k: string; v: string; meta?: string }) {
  return (
    <View style={styles.kv}>
      <Muted style={{ flex: 1 }}>{k}</Muted>
      <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
        <Body style={{ textAlign: 'right' }}>{v}</Body>
        {meta ? <Muted style={{ fontSize: 14, lineHeight: 20, textAlign: 'right' }}>{meta}</Muted> : null}
      </View>
    </View>
  );
}

export function Hairline() {
  return <View style={styles.hairline} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  scroll: { flexGrow: 1, alignItems: 'center' },
  column: { width: '100%', maxWidth: layout.maxWidth, gap: space.xl },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: space.lg },
  section: { gap: space.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  wrap: { flexWrap: 'wrap' },
  kv: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', paddingVertical: space.xs },
  hairline: { height: 1, backgroundColor: colors.inkFaint, alignSelf: 'stretch' },
});
