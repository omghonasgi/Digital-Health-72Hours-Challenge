import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { FinancialSummary } from '@/core/types';
import { Body, Card, Chip, Hairline, Meta, Muted, Num, Row, StatusDot, colors, space } from '@/ui';
import { useFmt } from './format';

const toneFor = (s: FinancialSummary['lines'][number]['status']) =>
  s === 'owned' || s === 'covered' ? 'good' : s === 'arranged' ? 'blue' : s === 'needs_verification' ? 'caution' : 'caution';

/** Cost lines plus a quiet bar that shows estimate vs confirmed funding. Numbers line up; estimates are labelled. */
export function FinanceTable({ summary, timezone, compact }: { summary: FinancialSummary; timezone: string; compact?: boolean }) {
  const { t } = useTranslation();
  const f = useFmt(timezone);
  const max = Math.max(summary.totalEstimatedCost, summary.confirmedFunding, 1);
  const pct = (n: number): `${number}%` => `${Math.min(100, (n / max) * 100)}%`;
  return (
    <View style={{ gap: space.lg }}>
      <Card>
        <View style={{ gap: space.sm }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Muted>{t('finance.total')}</Muted>
            <Num weight="medium">{f.money(summary.totalEstimatedCost)}</Num>
          </Row>
          <View style={styles.bar}>
            <View style={[styles.fill, { width: pct(summary.totalEstimatedCost), backgroundColor: colors.caution }]} />
          </View>
          <Row style={{ justifyContent: 'space-between' }}>
            <Muted>{t('finance.confirmedFunding')}</Muted>
            <Num weight="medium">{f.money(summary.confirmedFunding)}</Num>
          </Row>
          <View style={styles.bar}>
            <View style={[styles.fill, { width: pct(summary.confirmedFunding), backgroundColor: colors.good }]} />
          </View>
        </View>
        <Hairline />
        <Row style={{ justifyContent: 'space-between' }}>
          <Muted>{t('finance.budget')}</Muted>
          <Num>{f.money(summary.budget)}</Num>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Muted>{t('finance.confirmedAssistance')}</Muted>
          <Num>{f.money(summary.confirmedAssistance)}</Num>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Muted>{t('finance.potentialAssistance')}</Muted>
          <Num color={colors.inkMuted}>{f.money(summary.potentialAssistance)}</Num>
        </Row>
        <Hairline />
        <Row style={{ justifyContent: 'space-between' }}>
          <Body weight="medium">{t('finance.gap')}</Body>
          <Row>
            <StatusDot tone={summary.remainingGap > 0 ? 'urgent' : 'good'} />
            <Num weight="medium">{f.money(summary.remainingGap)}</Num>
          </Row>
        </Row>
      </Card>

      {!compact ? (
        <Card>
          <View style={styles.head}>
            <Meta style={{ flex: 2 }}>{t('finance.resource')}</Meta>
            <Meta style={styles.num}>{t('finance.estimated')}</Meta>
            <Meta style={styles.num}>{t('finance.remaining')}</Meta>
          </View>
          <Hairline />
          {summary.lines.length === 0 ? <Muted>{t('common.noItems')}</Muted> : null}
          {summary.lines.map((l) => (
            <View key={l.id} style={styles.line}>
              <View style={{ flex: 2, gap: 2 }}>
                <Body>{t(l.labelKey, { defaultValue: l.label })}</Body>
                <Row wrap>
                  <Chip label={t(`finance.lineStatus.${l.status}`)} tone={toneFor(l.status)} dense />
                  {l.hypothetical && l.estimatedCost > 0 ? <Meta>{t('common.hypothetical')}</Meta> : null}
                  {l.kind === 'medication' ? <Meta>{t(`finance.insurance.${l.insuranceCoverage}`)}</Meta> : null}
                  {l.assistanceStatus ? <Meta>{t(`assistanceStatus.${l.assistanceStatus}`)}</Meta> : null}
                </Row>
              </View>
              <Num style={styles.num}>{f.money(l.estimatedCost)}</Num>
              <Num style={styles.num} weight="medium">
                {f.money(l.remaining)}
              </Num>
            </View>
          ))}
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: 10, backgroundColor: colors.inkFaint, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%' },
  head: { flexDirection: 'row', gap: space.md },
  line: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', paddingVertical: space.sm },
  num: { width: 84, textAlign: 'right' },
});
