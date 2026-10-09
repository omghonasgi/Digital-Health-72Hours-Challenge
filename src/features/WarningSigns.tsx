import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ClinicalInstruction } from '@/core/types';
import { Body, Card, Glyph, Icons, Meta, Muted, Row, Section, StatusDot, colors } from '@/ui';

/** "When to call": warning signs copied verbatim from the discharge document. Shown to every role. */
export function WarningSigns({ instructions }: { instructions: ClinicalInstruction[] }) {
  const { t } = useTranslation();
  const ws = instructions.filter((i) => i.category === 'warning_signs' && i.reviewStatus === 'approved');
  if (!ws.length) return null;
  return (
    <Section title={t('resources.warningSigns')} aside={<Glyph icon={Icons.AlertTriangle} size={20} color={colors.urgent} />}>
      {ws.map((i) => (
        <Card key={i.id}>
          {i.structured.kind === 'warning_signs'
            ? i.structured.signs.map((s) => (
                <Row key={s} style={{ alignItems: 'flex-start' }}>
                  <StatusDot tone="urgent" />
                  <Body style={{ flex: 1 }}>{s}</Body>
                </Row>
              ))
            : null}
          {i.structured.kind === 'warning_signs' && i.structured.emergencyInstruction ? <Body weight="medium">{i.structured.emergencyInstruction}</Body> : null}
          <Meta>{i.sourcePage ? t('provenance.reportPage', { page: i.sourcePage }) : t('provenance.report')}</Meta>
        </Card>
      ))}
    </Section>
  );
}

/** Primary-care / follow-up contact from the approved follow-up instruction. */
export function PrimaryCare({ instructions, facility }: { instructions: ClinicalInstruction[]; facility?: string }) {
  const { t } = useTranslation();
  const fu = instructions.filter((i) => i.category === 'follow_up' && i.reviewStatus === 'approved');
  if (!fu.length && !facility) return null;
  return (
    <Section title={t('instructions.categories.follow_up')} aside={<Glyph icon={Icons.Stethoscope} size={20} color={colors.blue} />}>
      <Card>
        {facility ? <Body weight="medium">{facility}</Body> : null}
        {fu.map((i) => (
          <View key={i.id} style={{ gap: 2 }}>
            {i.structured.kind === 'follow_up' ? <Body>{[i.structured.withWhom, i.structured.location].filter(Boolean).join(' · ')}</Body> : null}
            <Muted>{i.originalText}</Muted>
          </View>
        ))}
      </Card>
    </Section>
  );
}
