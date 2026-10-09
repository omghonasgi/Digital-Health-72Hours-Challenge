import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { GapCategory } from '@/core/types';
import { PlanState } from '@/features/PlanScreen';
import { ReadinessStamp } from '@/features/ReadinessStamp';
import { useFmt } from '@/features/format';
import { readinessTone } from '@/features/status';
import { useCoordinatorPatients, type PatientSummary } from '@/state/useCoordinator';
import { useNow } from '@/state/usePlan';
import { BOTTOM_BAR_HEIGHT, Body, Card, Chip, Glyph, Icons, Meta, Muted, Row, Screen, Section, StatusDot, Surface, colors, gapIcon, layout, space } from '@/ui';

type Filter = 'all' | 'awaitingReview' | 'openGaps' | 'coverageConflicts' | 'pendingRequests' | 'financialBarriers' | 'missedBlocked' | 'dueSoon';
const FILTERS: Filter[] = ['all', 'awaitingReview', 'openGaps', 'coverageConflicts', 'pendingRequests', 'financialBarriers', 'missedBlocked', 'dueSoon'];
const CATEGORIES: GapCategory[] = ['equipment', 'caregiving', 'transportation', 'financial', 'language', 'medication_access', 'scheduling', 'home_accessibility'];
const DUE_SOON_HOURS = 48;

export default function CoordinatorHome() {
  const { t } = useTranslation();
  const router = useRouter();
  const { patients, loading, error, reload } = useCoordinatorPatients();
  const [filter, setFilter] = useState<Filter>('all');
  const [category, setCategory] = useState<GapCategory | null>(null);
  const { width } = useWindowDimensions();
  const wide = width >= layout.wideBreakpoint;
  const nowIso = useNow();

  const filtered = useMemo(() => {
    if (!patients) return [];
    const now = Date.parse(nowIso);
    return patients.filter((s) => {
      if (category && !s.plan.gaps.some((g) => g.gapType === category && g.status !== 'verified_resolved')) return false;
      switch (filter) {
        case 'awaitingReview':
          return s.awaitingReview > 0;
        case 'openGaps':
          return s.openGaps > 0;
        case 'coverageConflicts':
          return s.conflicts > 0 || s.plan.coverage.uncoveredHours > 0;
        case 'pendingRequests':
          return s.pendingRequests > 0;
        case 'financialBarriers':
          return s.financialGap > 0;
        case 'missedBlocked':
          return s.missedBlocked > 0;
        case 'dueSoon':
          return s.nextDeadline !== undefined && s.nextDeadline - now < DUE_SOON_HOURS * 3600_000;
        default:
          return true;
      }
    });
  }, [patients, filter, category, nowIso]);

  const totals = useMemo(
    () =>
      (patients ?? []).reduce(
        (acc, s) => ({ awaiting: acc.awaiting + s.awaitingReview, gaps: acc.gaps + s.openGaps, conflicts: acc.conflicts + s.conflicts, blocked: acc.blocked + s.missedBlocked }),
        { awaiting: 0, gaps: 0, conflicts: 0, blocked: 0 },
      ),
    [patients],
  );

  return (
    <PlanState loading={loading && !patients} error={error} onRetry={reload}>
      <Screen title={t('coordinator.title')} subtitle={`${patients?.length ?? 0} · ${t('coordinator.patients')}`} bottomInset={BOTTOM_BAR_HEIGHT}>
        <Surface tone="blueDeep" padded style={{ gap: space.sm }}>
          <Row wrap style={{ gap: space.lg }}>
            <Meta color={colors.canvas}>{t('coordinator.summary.awaiting', { count: totals.awaiting })}</Meta>
            <Meta color={colors.canvas}>{t('coordinator.summary.gaps', { count: totals.gaps })}</Meta>
            <Meta color={colors.canvas}>{t('coordinator.summary.conflicts', { count: totals.conflicts })}</Meta>
            <Meta color={colors.canvas}>{t('coordinator.summary.blocked', { count: totals.blocked })}</Meta>
          </Row>
        </Surface>

        <Section title={t('coordinator.filters')}>
          <Row wrap>
            {FILTERS.map((f) => (
              <Chip key={f} label={f === 'dueSoon' ? t('coordinator.dueSoon', { hours: DUE_SOON_HOURS }) : t(`coordinator.${f}`)} selected={filter === f} onPress={() => setFilter(f)} dense />
            ))}
          </Row>
          <Meta>{t('coordinator.gapCategory')}</Meta>
          <Row wrap>
            {CATEGORIES.map((c) => (
              <Chip key={c} label={t(`resources.groups.${c}`)} icon={gapIcon[c]} selected={category === c} onPress={() => setCategory(category === c ? null : c)} dense />
            ))}
          </Row>
        </Section>

        <Section title={t('coordinator.patients')} aside={<Meta>{t('coordinator.surgeryDate')} ↑</Meta>}>
          {filtered.length === 0 ? (
            <Card>
              <Muted>{t('coordinator.noPatients')}</Muted>
            </Card>
          ) : null}
          <View style={[styles.grid, wide && styles.gridWide]}>
            {filtered.map((s) => (
              <PatientRow key={s.plan.patient.id} summary={s} onPress={() => router.push({ pathname: '/coordinator/patient/[id]', params: { id: s.plan.patient.id } })} wide={wide} />
            ))}
          </View>
        </Section>
      </Screen>
    </PlanState>
  );
}

function PatientRow({ summary: s, onPress, wide }: { summary: PatientSummary; onPress: () => void; wide: boolean }) {
  const { t } = useTranslation();
  const p = s.plan.patient;
  const f = useFmt(p.timezone);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.gridItem, wide && styles.gridItemWide, pressed && { opacity: 0.85 }]}>
      <Card style={{ flex: 1 }}>
        <Row style={{ alignItems: 'flex-start' }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Body weight="medium">{p.displayName}</Body>
            <Meta>
              {p.procedureName} · {p.preferredLanguage.toUpperCase()}
            </Meta>
            <Meta>
              {t('coordinator.surgeryDate')} {f.dateTime(p.surgeryDate)}
            </Meta>
            <Meta>
              {t('home.discharge')} {f.dateTime(p.dischargeAt)}
            </Meta>
          </View>
          <ReadinessStamp status={s.plan.readiness} size={60} />
        </Row>
        <Chip label={t(`readinessStatus.${s.plan.readiness}`)} tone={readinessTone(s.plan.readiness)} dense />
        <Row wrap style={{ gap: space.md }}>
          <Count icon={Icons.FileText} n={s.awaitingReview} label={t('coordinator.awaitingReview')} tone={s.awaitingReview ? 'urgent' : 'good'} />
          <Count icon={Icons.ClipboardList} n={s.openGaps} label={t('coordinator.openGaps')} tone={s.openGaps ? 'caution' : 'good'} />
          <Count icon={Icons.AlertTriangle} n={s.conflicts} label={t('coordinator.coverageConflicts')} tone={s.conflicts ? 'caution' : 'good'} />
          <Count icon={Icons.Bell} n={s.missedBlocked} label={t('coordinator.missedBlocked')} tone={s.missedBlocked ? 'urgent' : 'good'} />
        </Row>
        <Row wrap>
          {s.financialGap > 0 ? (
            <Row>
              <Glyph icon={Icons.Wallet} size={16} color={colors.caution} />
              <Meta>
                {t('finance.gap')} {f.money(s.financialGap)}
              </Meta>
            </Row>
          ) : null}
          {s.nextDeadline ? (
            <Meta>
              {t('coordinator.deadline')} {f.dateTime(s.nextDeadline)}
            </Meta>
          ) : null}
        </Row>
      </Card>
    </Pressable>
  );
}

function Count({ icon, n, label, tone }: { icon: typeof Icons.Bell; n: number; label: string; tone: 'good' | 'caution' | 'urgent' }) {
  return (
    <View accessibilityLabel={`${label}: ${n}`} style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
      <StatusDot tone={tone} size={8} />
      <Glyph icon={icon} size={16} color={colors.inkMuted} />
      <Body weight="medium">{String(n)}</Body>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: space.md },
  gridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  gridItem: {},
  gridItemWide: { width: '49%' },
});
