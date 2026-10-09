import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/state/SessionProvider';
import { roleHome } from '@/state/routes';
import { Body, Button, Card, Display, Glyph, Icons, Meta, Muted, Row, Screen, Section, Stamp, Surface, Thread, colors, grainOpacity, layout, space } from '@/ui';
import { Grain } from '@/ui/Grain';

export default function Landing() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { session } = useSession();
  const { width } = useWindowDimensions();
  const wide = width >= layout.wideBreakpoint;
  const steps = t('landing.steps', { returnObjects: true }) as { title: string; body: string }[];
  const features = t('landing.features', { returnObjects: true }) as { title: string; body: string }[];
  const featureIcons = [Icons.ClipboardList, Icons.HeartHandshake, Icons.Wallet, Icons.ShieldCheck];
  const scrollRef = useRef<ScrollView | null>(null);
  const [howY, setHowY] = useState(0);

  return (
    <Screen scrollRef={scrollRef}>
      <View style={styles.topBar}>
        <Display>{t('brand')}</Display>
        <Row>
          <Button label={i18n.language === 'es' ? 'EN' : 'ES'} variant="quiet" compact onPress={() => i18n.changeLanguage(i18n.language === 'es' ? 'en' : 'es')} />
          <Button
            label={session ? t('common.continue') : t('landing.signIn')}
            variant="ghost"
            compact
            onPress={() => router.push(session ? roleHome(session.profile.role) : '/sign-in')}
          />
        </Row>
      </View>

      <View style={[styles.hero, wide && styles.heroWide]}>
        <View style={{ flex: 1, gap: space.lg, maxWidth: 560 }}>
          <Display size={wide ? 'hero' : 'large'}>{t('landing.headline')}</Display>
          <Body size="large">{t('landing.sub')}</Body>
          <Meta>{t('tagline')}</Meta>
          <View style={{ gap: space.md, marginTop: space.sm }}>
            <Button label={t('landing.ctaPrimary')} variant="hero" icon={Icons.ChevronRight} onPress={() => router.push(session ? roleHome(session.profile.role) : '/sign-up')} />
            <Button label={t('landing.ctaSecondary')} variant="ghost" onPress={() => scrollRef.current?.scrollTo({ y: howY, animated: true })} />
          </View>
        </View>
        <CoverArt compact={!wide} />
      </View>

      <Section title={t('landing.howTitle')} onLayout={(e) => setHowY(e.nativeEvent.layout.y)}>
        <View style={[styles.grid, wide && styles.gridWide]}>
          {steps.map((s, i) => (
            <Card key={s.title} style={styles.gridItem}>
              <Row>
                <Stamp label={String(i + 1)} size={44} rotate={-6 + i * 4} />
                <Body weight="medium" style={{ flex: 1 }}>
                  {s.title}
                </Body>
              </Row>
              <Muted>{s.body}</Muted>
            </Card>
          ))}
        </View>
      </Section>

      <Section title={t('landing.featuresTitle')}>
        <View style={[styles.grid, wide && styles.gridWide]}>
          {features.map((f, i) => (
            <Card key={f.title} style={styles.gridItem}>
              <Glyph icon={featureIcons[i]} size={24} color={colors.blue} />
              <Body weight="medium">{f.title}</Body>
              <Muted>{f.body}</Muted>
            </Card>
          ))}
        </View>
      </Section>

      <View style={[styles.grid, wide && styles.gridWide]}>
        <Surface tone="blueDeep" padded style={[styles.gridItem, { gap: space.sm }]}>
          <Display color={colors.canvas}>{t('landing.forPatients')}</Display>
          <Body color={colors.canvas}>{t('landing.forPatientsBody')}</Body>
        </Surface>
        <Surface tone="ink" padded style={[styles.gridItem, { gap: space.sm }]}>
          <Display color={colors.canvas}>{t('landing.forCaregivers')}</Display>
          <Body color={colors.canvas}>{t('landing.forCaregiversBody')}</Body>
        </Surface>
      </View>

      <View style={{ gap: space.sm }}>
        <Meta>{t('landing.noAi')}</Meta>
        <Meta>{t('landing.footer')}</Meta>
      </View>
    </Screen>
  );
}

/** The brand cover: an inked slab with stamps, a blue disc, a soft block, an ink block, and one thread. */
function CoverArt({ compact }: { compact: boolean }) {
  const s = compact ? 0.72 : 1;
  return (
    <View style={[styles.art, { width: 480 * s, height: 288 * s }]} accessibilityElementsHidden>
      <View style={[styles.block, { backgroundColor: colors.blueDeep, left: 16 * s, top: -24 * s, width: 176 * s, height: 264 * s }]}>
        <Grain opacity={grainOpacity.blueDeep} />
        <View style={{ position: 'absolute', left: 24 * s, top: 174 * s }}>
          <Stamp label="report" variant="canvas" size={56 * s} rotate={-10} />
        </View>
        <View style={{ position: 'absolute', left: 102 * s, top: 112 * s }}>
          <Stamp label="covered" variant="canvas" size={48 * s} rotate={6} />
        </View>
      </View>
      <View style={[styles.block, { backgroundColor: colors.blueSoft, left: 208 * s, top: 24 * s, width: 120 * s, height: 80 * s }]}>
        <Grain opacity={grainOpacity.blueSoft} />
      </View>
      <View style={{ position: 'absolute', left: 208 * s, top: 120 * s }}>
        <Stamp label="scheduled" variant="filled" size={120 * s} rotate={-8} />
      </View>
      <View style={[styles.block, { backgroundColor: colors.ink, left: 344 * s, top: 40 * s, width: 136 * s, height: 200 * s }]}>
        <Grain opacity={grainOpacity.ink} />
        <View style={{ position: 'absolute', left: 36 * s, top: 44 * s }}>
          <Stamp label="ride" statusColor={colors.blueSoft} size={48 * s} rotate={4} />
        </View>
      </View>
      <View style={{ position: 'absolute', left: 312 * s, top: 118 * s, transform: [{ rotate: '-28deg' }] }}>
        <Thread length={72 * s} orientation="horizontal" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  hero: { gap: space.xxl, alignItems: 'flex-start' },
  heroWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  art: { position: 'relative', overflow: 'hidden', alignSelf: 'center' },
  block: { position: 'absolute', overflow: 'hidden' },
  grid: { gap: space.lg },
  gridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  gridItem: { flexGrow: 1, flexBasis: 220, minWidth: 220 },
});
