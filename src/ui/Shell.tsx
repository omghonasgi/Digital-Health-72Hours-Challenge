import React from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, useRouter, type Href } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import { Glyph } from './Icons';
import { Surface } from './Surface';
import { Body, Display, Meta } from './Text';
import { colors, layout, space, tapMin } from './theme';

export interface NavItem {
  href: Href;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

interface ShellProps {
  items: NavItem[];
  children: React.ReactNode;
  /** Short line under the wordmark on the side nav: who is signed in. */
  who?: string;
  roleLabel?: string;
}

/**
 * Responsive chrome: an inked side nav on wide screens, a compact bottom
 * bar on narrow ones. Icons lead; labels follow.
 */
export function Shell({ items, children, who, roleLabel }: ShellProps) {
  const { width } = useWindowDimensions();
  const wide = width >= layout.wideBreakpoint;
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const isActive = (href: Href) => {
    const h = String(href);
    return pathname === h || (h.split('/').length > 2 && pathname.startsWith(h + '/'));
  };

  if (wide) {
    return (
      <View style={styles.wideRoot}>
        <Surface tone="blueDeep" style={[styles.side, { paddingTop: insets.top + space.xl }]}>
          <View style={styles.brand}>
            <Display color={colors.canvas}>CareBridge</Display>
            {who ? <Meta color={colors.canvasMuted}>{who}</Meta> : null}
            {roleLabel ? <Meta color={colors.canvasMuted}>{roleLabel}</Meta> : null}
          </View>
          <View style={styles.sideItems}>
            {items.map((it) => {
              const active = isActive(it.href);
              return (
                <Pressable
                  key={String(it.href)}
                  onPress={() => router.push(it.href)}
                  accessibilityRole="link"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [styles.sideItem, active && styles.sideItemActive, pressed && styles.pressed]}
                >
                  <Glyph icon={it.icon} size={20} color={colors.canvas} />
                  <Body color={colors.canvas} style={{ flex: 1 }}>
                    {it.label}
                  </Body>
                  {it.badge ? (
                    <View style={styles.badge}>
                      <Meta color={colors.canvas}>{String(it.badge)}</Meta>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </Surface>
        <View style={styles.wideContent}>{children}</View>
      </View>
    );
  }

  return (
    <View style={styles.narrowRoot}>
      <View style={styles.narrowContent}>{children}</View>
      <Surface tone="blueDeep" style={[styles.bottom, { paddingBottom: insets.bottom }]}>
        {items.map((it) => {
          const active = isActive(it.href);
          return (
            <Pressable
              key={String(it.href)}
              onPress={() => router.push(it.href)}
              accessibilityRole="link"
              accessibilityLabel={it.label}
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [styles.bottomItem, pressed && styles.pressed]}
            >
              <View style={[styles.bottomGlyph, active && styles.bottomGlyphActive]}>
                <Glyph icon={it.icon} size={22} color={colors.canvas} />
                {it.badge ? <View style={styles.bottomBadge} /> : null}
              </View>
              <Meta color={active ? colors.canvas : colors.canvasMuted} numberOfLines={1} style={{ fontSize: 12, lineHeight: 14 }}>
                {it.label}
              </Meta>
            </Pressable>
          );
        })}
      </Surface>
    </View>
  );
}

export const BOTTOM_BAR_HEIGHT = 64;

const styles = StyleSheet.create({
  wideRoot: { flex: 1, flexDirection: 'row', backgroundColor: colors.canvas },
  side: { width: layout.sideNavWidth, paddingHorizontal: space.lg, gap: space.xxl, borderRadius: 0 },
  brand: { gap: space.xs },
  sideItems: { gap: space.xs },
  sideItem: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: tapMin, paddingHorizontal: space.md, borderRadius: 4 },
  sideItemActive: { backgroundColor: 'rgba(242, 244, 247, 0.14)' },
  pressed: { opacity: 0.8 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  wideContent: { flex: 1 },
  narrowRoot: { flex: 1, backgroundColor: colors.canvas },
  narrowContent: { flex: 1 },
  bottom: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-start', paddingTop: space.sm, minHeight: BOTTOM_BAR_HEIGHT, borderRadius: 0 },
  bottomItem: { alignItems: 'center', gap: 2, minWidth: tapMin, minHeight: tapMin, paddingHorizontal: space.xs, flex: 1 },
  bottomGlyph: { width: 40, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 4 },
  bottomGlyphActive: { backgroundColor: 'rgba(242, 244, 247, 0.16)' },
  bottomBadge: { position: 'absolute', top: 2, right: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.blueSoft },
});
