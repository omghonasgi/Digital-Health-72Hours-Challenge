import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { GapAction, RecoveryGap } from '@/core/types';
import { Body, Button, Chip, Glyph, Meta, Muted, Surface, gapIcon, colors, space } from '@/ui';
import { useFmt } from './format';
import { gapTone } from './status';

interface Props {
  gap: RecoveryGap;
  timezone: string;
  /** Inline handlers for actions that confirm something right here (equipment received, ride confirmed). */
  onConfirm?: (gap: RecoveryGap) => void;
  confirming?: boolean;
  /** Hide navigation actions (e.g. inside the coordinator view). */
  showActions?: boolean;
  children?: React.ReactNode;
}

const CONFIRM_KEYS = new Set(['actions.confirm_equipment_received', 'actions.confirm_medication_received', 'actions.confirm_ride', 'actions.plan_ground_floor']);

/** A gap never ends in a dead end: every open gap carries a next step. */
export function GapCard({ gap, timezone, onConfirm, confirming, showActions = true, children }: Props) {
  const { t } = useTranslation();
  const f = useFmt(timezone);
  const router = useRouter();
  const Icon = gapIcon[gap.gapType];
  const resolved = gap.status === 'verified_resolved';
  const text = t(gap.descriptionKey, { ...gap.descriptionParams, defaultValue: gap.description });
  const actions = resolved ? [] : gap.actions;

  const act = (a: GapAction) => {
    if (CONFIRM_KEYS.has(a.key) && onConfirm) return onConfirm(gap);
    if (a.route) router.push(a.route as Href);
  };

  return (
    <Surface tone="paper" padded style={[styles.card, resolved && styles.resolved]}>
      <View style={styles.row}>
        <Glyph icon={Icon} size={22} color={resolved ? colors.good : colors.ink} />
        <View style={{ flex: 1, gap: 2 }}>
          <Body>{text}</Body>
          <Meta>
            {t(`resources.groups.${gap.gapType}`)}
            {gap.windowStart && gap.windowEnd ? ` · ${f.range(gap.windowStart, gap.windowEnd)}` : ''}
            {gap.estimatedCost && !resolved ? ` · ${f.money(gap.estimatedCost)} ${t('common.hypothetical')}` : ''}
          </Meta>
        </View>
        <Chip label={t(`gapStatus.${gap.status}`)} tone={gapTone(gap.status)} dense />
      </View>
      {gap.resolutionNotes ? <Muted>{gap.resolutionNotes}</Muted> : null}
      {showActions && actions.length ? (
        <View style={styles.actions}>
          {actions.map((a) => (
            <Button
              key={a.key}
              label={t(a.key)}
              variant={CONFIRM_KEYS.has(a.key) && onConfirm ? 'hero' : 'ghost'}
              compact
              loading={confirming && CONFIRM_KEYS.has(a.key)}
              onPress={() => act(a)}
            />
          ))}
        </View>
      ) : null}
      {children}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  resolved: { opacity: 0.8 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
