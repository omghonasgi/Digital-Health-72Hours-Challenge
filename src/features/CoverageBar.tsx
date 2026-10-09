import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { CoverageSummary } from '@/core/engines/gaps';
import { Meta, Row, StatusDot, colors, space } from '@/ui';
import { hoursLabel, useFmt } from './format';

/** The required supervision window as a bar: covered (good), pending (blue), uncovered (caution). */
export function CoverageBar({ coverage, timezone }: { coverage: CoverageSummary; timezone: string }) {
  const { t } = useTranslation();
  const f = useFmt(timezone);
  if (!coverage.requiredWindows.length) return null;
  const start = Math.min(...coverage.requiredWindows.map((w) => w.start));
  const end = Math.max(...coverage.requiredWindows.map((w) => w.end));
  const span = end - start || 1;
  const seg = (s: number, e: number, color: string, key: string) => (
    <View key={key} style={[styles.seg, { left: `${((s - start) / span) * 100}%`, width: `${((e - s) / span) * 100}%`, backgroundColor: color }]} />
  );
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.bar}>
        {coverage.uncoveredIntervals.map((i, n) => seg(i.start, i.end, colors.caution, `u${n}`))}
        {coverage.pendingIntervals.map((i, n) => seg(i.start, i.end, colors.blueSoft, `p${n}`))}
        {coverage.coveredIntervals.map((i, n) => seg(i.start, i.end, colors.good, `c${n}`))}
      </View>
      <Row style={{ justifyContent: 'space-between' }}>
        <Meta>{f.dateTime(start)}</Meta>
        <Meta>{f.dateTime(end)}</Meta>
      </Row>
      <Row wrap style={{ gap: space.lg }}>
        <Row>
          <StatusDot tone="good" />
          <Meta>
            {t('report.coveredHours')} {hoursLabel(coverage.coveredHours)}
          </Meta>
        </Row>
        {coverage.pendingIntervals.length ? (
          <Row>
            <StatusDot tone="blue" />
            <Meta>{t('gapStatus.awaiting_confirmation')}</Meta>
          </Row>
        ) : null}
        <Row>
          <StatusDot tone="caution" />
          <Meta>
            {t('report.uncoveredHours')} {hoursLabel(coverage.uncoveredHours)}
          </Meta>
        </Row>
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: 14, backgroundColor: colors.inkFaint, borderRadius: 2, overflow: 'hidden', position: 'relative' },
  seg: { position: 'absolute', top: 0, bottom: 0 },
});
