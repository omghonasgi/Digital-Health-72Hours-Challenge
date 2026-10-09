import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { PlanView } from '@/core/usecases';
import type { RecoveryGap } from '@/core/types';
import { Body, Button, Card, Chip, Hairline, Icons, KeyValue, Meta, Muted, Provenance, Row, Section, StatusDot, colors, space } from '@/ui';
import { CoverageBar } from './CoverageBar';
import { FinanceTable } from './FinanceTable';
import { GapCard } from './GapCard';
import { InstructionCard } from './InstructionCard';
import { hoursLabel, useFmt } from './format';
import { requirementTone, readinessTone } from './status';
import { buildReportHtml, exportReport } from './report';

interface Props {
  plan: PlanView;
  onConfirm?: (gap: RecoveryGap) => void;
  confirming?: boolean;
  /** Coordinator view: hide patient-facing navigation actions. */
  showActions?: boolean;
  gapExtra?: (gap: RecoveryGap) => React.ReactNode;
}

/** The readiness report: requirements vs. resources, side by side. Logistics only; never medical readiness. */
export function ReadinessReport({ plan, onConfirm, confirming, showActions = true, gapExtra }: Props) {
  const { t, i18n } = useTranslation();
  const f = useFmt(plan.patient.timezone);
  const [exportState, setExportState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const open = plan.gaps.filter((g) => g.status !== 'verified_resolved');
  const resolved = plan.gaps.filter((g) => g.status === 'verified_resolved');
  const approved = plan.instructions.filter((i) => i.reviewStatus === 'approved');
  const p = plan.patient;

  const doExport = async () => {
    setExportState('busy');
    try {
      await exportReport(buildReportHtml(plan, t, f.lang), `CareBridge-${p.displayName.replace(/\s+/g, '-')}-readiness`);
      setExportState('done');
    } catch {
      setExportState('error');
    }
  };

  return (
    <View style={{ gap: space.xl }}>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Chip label={t(`readinessStatus.${plan.readiness}`)} tone={readinessTone(plan.readiness)} />
          <Button label={exportState === 'done' ? t('report.exported') : t('report.export')} variant="ghost" compact icon={Icons.FileText} loading={exportState === 'busy'} onPress={() => void doExport()} />
        </Row>
        {exportState === 'error' ? <Body color={colors.urgent}>{t('common.errorTitle')}</Body> : null}
        <Meta>{t('report.generatedAt', { when: f.dateTime(new Date().toISOString()) })}</Meta>
        <Muted>{t('report.disclaimer')}</Muted>
      </Card>

      <Section title={t('report.overview')}>
        <Card>
          <KeyValue k={t('intake.a.displayName')} v={p.displayName} />
          <KeyValue k={t('home.procedure')} v={p.procedureName} meta={p.facility} />
          <KeyValue k={t('home.surgery')} v={f.dateTime(p.surgeryDate)} />
          <KeyValue k={t('home.expectedDischarge')} v={f.dateTime(p.dischargeAt)} meta={p.timezone} />
          <KeyValue k={t('intake.a.preferredLanguage')} v={i18n.language === 'es' ? t('common.spanish') : t('common.english')} meta={p.preferredLanguage !== (i18n.language === 'es' ? 'es' : 'en') ? t('report.originalLanguage') : undefined} />
          <KeyValue k={t('intake.a.zip')} v={[p.zip, p.city].filter(Boolean).join(' · ')} />
          <KeyValue k={t('intake.b.insurance')} v={t(`insurance.${p.insuranceType}`)} />
          <KeyValue k={t('report.budget')} v={f.money(p.recoveryBudget)} />
        </Card>
      </Section>

      <Section title={t('report.requirements')}>
        {approved.length === 0 ? (
          <Card>
            <Muted>{t('calendar.notActive')}</Muted>
          </Card>
        ) : null}
        {plan.requirements.map((r) => {
          const ins = plan.instructions.find((i) => i.id === r.instructionId);
          return (
            <Card key={r.id}>
              <Row style={{ alignItems: 'flex-start' }}>
                <StatusDot tone={requirementTone(r.status)} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Body>{r.description}</Body>
                  <Meta>
                    {t(`resources.groups.${r.requirementType}`)} · {t(`report.requirementStatus.${r.status}`)}
                    {r.requiredStart && r.requiredEnd ? ` · ${f.range(r.requiredStart, r.requiredEnd)}` : ''}
                  </Meta>
                </View>
              </Row>
              {ins ? (
                <View style={styles.orig}>
                  <Meta>{t('common.original')}</Meta>
                  <Body>{ins.originalText}</Body>
                  <Provenance>{ins.sourcePage ? t('provenance.reportPage', { page: ins.sourcePage }) : t('provenance.report')}</Provenance>
                </View>
              ) : null}
            </Card>
          );
        })}
        {plan.instructions.filter((i) => i.reviewStatus !== 'approved').length ? (
          <>
            <Meta>{t('review.queue')}</Meta>
            {plan.instructions
              .filter((i) => i.reviewStatus !== 'approved')
              .map((i) => (
                <InstructionCard key={i.id} instruction={i} />
              ))}
          </>
        ) : null}
      </Section>

      <Section title={t('report.available')}>
        <Card>
          {resolved.length === 0 && plan.equipment.filter((e) => e.availabilityStatus === 'available').length === 0 ? <Muted>{t('common.noItems')}</Muted> : null}
          {plan.equipment
            .filter((e) => e.availabilityStatus === 'available')
            .map((e) => (
              <Row key={e.id}>
                <StatusDot tone="good" />
                <Body>{e.equipmentName === 'other' && e.otherLabel ? e.otherLabel : t(`equipment.${e.equipmentName}`)}</Body>
                <Meta>{e.receivedAt ? t('resources.confirmedNote', { when: f.dateTime(e.receivedAt) }) : t('equipmentStatus.available')}</Meta>
              </Row>
            ))}
          {resolved.map((g) => (
            <Row key={g.id} style={{ alignItems: 'flex-start' }}>
              <StatusDot tone="good" />
              <View style={{ flex: 1 }}>
                <Body>{t(g.descriptionKey, { ...g.descriptionParams, defaultValue: g.description })}</Body>
                {g.resolutionNotes ? <Meta>{g.resolutionNotes}</Meta> : null}
              </View>
            </Row>
          ))}
        </Card>
      </Section>

      <Section title={t('report.missing')}>
        {open.length === 0 ? (
          <Card>
            <Row>
              <StatusDot tone="good" />
              <Muted>{t('resources.noGaps')}</Muted>
            </Row>
          </Card>
        ) : null}
        {open.map((g) => (
          <GapCard key={g.id} gap={g} timezone={p.timezone} onConfirm={onConfirm} confirming={confirming} showActions={showActions}>
            {gapExtra?.(g)}
          </GapCard>
        ))}
      </Section>

      <Section title={t('report.coverage')}>
        <Card>
          {plan.coverage.requiredWindows.length ? (
            <>
              <CoverageBar coverage={plan.coverage} timezone={p.timezone} />
              <Hairline />
            </>
          ) : (
            <Muted>{t('common.noItems')}</Muted>
          )}
          <KeyValue k={t('report.requiredHours')} v={hoursLabel(plan.coverage.requiredHours)} />
          <KeyValue k={t('report.coveredHours')} v={hoursLabel(plan.coverage.coveredHours)} />
          <KeyValue k={t('report.uncoveredHours')} v={hoursLabel(plan.coverage.uncoveredHours)} />
          {plan.caregivers.map((c) => (
            <KeyValue key={c.id} k={c.name} v={c.acceptedInvitation ? t('caregivers.accepted') : t('caregivers.pending')} meta={`${c.relationship} · ${c.languages.map((l) => (l === 'es' ? t('common.spanish') : t('common.english'))).join('/')}`} />
          ))}
        </Card>
      </Section>

      <Section title={t('report.financial')}>
        <FinanceTable summary={plan.finance} timezone={p.timezone} />
      </Section>

      <Section title={t('report.actions')}>
        <Card>
          {open.length === 0 ? <Muted>{t('common.noItems')}</Muted> : null}
          {open.flatMap((g) =>
            g.actions.slice(0, 1).map((a) => (
              <Row key={`${g.id}-${a.key}`} style={{ alignItems: 'flex-start' }}>
                <StatusDot tone="caution" />
                <View style={{ flex: 1 }}>
                  <Body>{t(a.key)}</Body>
                  <Meta>{t(g.descriptionKey, { ...g.descriptionParams, defaultValue: g.description })}</Meta>
                </View>
              </Row>
            )),
          )}
        </Card>
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({ orig: { gap: space.xs, padding: space.md, backgroundColor: colors.canvas, borderRadius: 4 } });
