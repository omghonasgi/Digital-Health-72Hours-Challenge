import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ClinicalInstruction, StructuredRequirement } from '@/core/types';
import { Body, Card, Chip, Meta, Muted, Provenance, Row, categoryIcon, Glyph, colors, space, Icons } from '@/ui';
import type { StatusTone } from '@/ui/Chip';

const reviewTone: Record<ClinicalInstruction['reviewStatus'], StatusTone> = { draft: 'caution', approved: 'good', needs_clarification: 'urgent', rejected: 'neutral' };

const iconFor = (c: ClinicalInstruction['category']) =>
  c === 'caregiver' ? Icons.HeartHandshake : c === 'warning_signs' ? Icons.AlertTriangle : c === 'diet' ? Icons.Utensils : categoryIcon[c === 'follow_up' ? 'follow_up' : c === 'check_in' ? 'check_in' : c === 'medication' ? 'medication' : c === 'mobility' ? 'mobility' : c === 'equipment' ? 'equipment' : c === 'transportation' ? 'transportation' : 'wound_care'];

/** Plain-language summary of the structured fields, with numbers passed through untouched. */
export function structuredSummary(s: StructuredRequirement, t: (k: string, o?: Record<string, unknown>) => string): string {
  switch (s.kind) {
    case 'medication':
      return [s.name, s.dose, s.route, s.asNeeded ? t('instructions.asNeeded') : s.frequencyHours ? `${t('instructions.frequencyHours')} ${s.frequencyHours}` : null, !s.timingExplicit && !s.asNeeded ? `· ${t('instructions.status.needs_clarification')}` : null]
        .filter(Boolean)
        .join(' · ');
    case 'mobility':
      return [s.restriction, s.requiredEquipment.map((e) => t(`equipment.${e}`)).join(', '), s.walkFrequencyHours ? `${t('instructions.walkFrequencyHours')} ${s.walkFrequencyHours}` : null, s.noStairs ? t('instructions.noStairs') : null].filter(Boolean).join(' · ');
    case 'equipment':
      return `${s.requiredEquipment.map((e) => t(`equipment.${e}`)).join(', ')} · ${t('instructions.neededByOffsetHours')} ${s.neededByOffsetHours}`;
    case 'caregiver':
      return `${t('instructions.supervisionStart')} ${s.supervisionStartOffsetHours} · ${t('instructions.supervisionDuration')} ${s.supervisionDurationHours}`;
    case 'transportation':
      return `${t(s.purpose === 'ride_home' ? 'instructions.ride_home' : 'instructions.follow_up_ride')} · ${t('instructions.offsetHours')} ${s.offsetHours}${s.escortRequired ? ` · ${t('instructions.escortRequired')}` : ''}`;
    case 'follow_up':
      return [s.withWhom, s.location, `${t('instructions.offsetHours')} ${Math.round(s.offsetHours * 10) / 10}`, s.transportRequired ? t('instructions.transportRequired') : null].filter(Boolean).join(' · ');
    case 'wound_care':
      return [s.label, s.frequencyHours ? `${t('instructions.frequencyHours')} ${s.frequencyHours}` : null, s.requiredEquipment.map((e) => t(`equipment.${e}`)).join(', ')].filter(Boolean).join(' · ');
    case 'diet':
      return [s.hydrationReminderHours ? `${t('instructions.hydrationHours')} ${s.hydrationReminderHours}` : null, s.mealReminderHours ? `${t('instructions.mealHours')} ${s.mealReminderHours}` : null].filter(Boolean).join(' · ');
    case 'warning_signs':
      return s.signs.join(' · ');
    case 'check_in':
      return `${t('instructions.offsets')}: ${s.offsetsHours.join(', ')}`;
  }
}

export function InstructionCard({ instruction, children, reviewerName }: { instruction: ClinicalInstruction; children?: React.ReactNode; reviewerName?: string }) {
  const { t } = useTranslation();
  const Icon = iconFor(instruction.category);
  return (
    <Card>
      <Row style={{ alignItems: 'flex-start' }}>
        <Glyph icon={Icon} size={22} color={colors.ink} />
        <View style={{ flex: 1, gap: space.xs }}>
          <Meta>{t(`instructions.categories.${instruction.category}`)}</Meta>
          <Body>{instruction.originalText}</Body>
        </View>
        <Chip label={t(`instructions.status.${instruction.reviewStatus}`)} tone={reviewTone[instruction.reviewStatus]} dense />
      </Row>
      <Muted>{structuredSummary(instruction.structured, t as never)}</Muted>
      <View style={styles.prov}>
        <Provenance>{instruction.sourcePage ? t('provenance.reportPage', { page: instruction.sourcePage }) : t('provenance.report')}</Provenance>
        {instruction.reviewedBy ? <Provenance>{t('provenance.reviewedBy', { name: reviewerName ?? t('common.coordinator') })}</Provenance> : null}
      </View>
      {instruction.reviewNotes ? <Muted>{instruction.reviewNotes}</Muted> : null}
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({ prov: { gap: 2 } });
