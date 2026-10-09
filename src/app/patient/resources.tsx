import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { GapCategory, RecoveryGap } from '@/core/types';
import { confirmResource } from '@/core/usecases';
import { GapCard } from '@/features/GapCard';
import { PlanState } from '@/features/PlanScreen';
import { PrimaryCare, WarningSigns } from '@/features/WarningSigns';
import { useFmt } from '@/features/format';
import { useSession } from '@/state/SessionProvider';
import { useAction, usePlan } from '@/state/usePlan';
import { BOTTOM_BAR_HEIGHT, Body, Button, Card, Chip, Glyph, Icons, Meta, Muted, Row, Screen, Section, StatusDot, gapIcon, colors, space } from '@/ui';

const GROUPS: GapCategory[] = ['equipment', 'medication_access', 'caregiving', 'transportation', 'financial', 'language', 'home_accessibility', 'scheduling'];

/** Six resource areas as chips. Each area is either covered or shows the next thing to fill. */
export default function Resources() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session, repo } = useSession();
  const { plan, loading, error, reload } = usePlan(session?.patientId);
  const { busy, error: actionError, run } = useAction();
  const [filter, setFilter] = useState<GapCategory | null>(null);
  const f = useFmt(plan?.patient.timezone ?? 'UTC');
  if (!session?.patientId) return <Redirect href="/patient" />;

  const confirm = (gap: RecoveryGap) =>
    void run(async () => {
      await confirmResource(repo, session, gap);
      await reload();
    });

  return (
    <PlanState loading={loading && !plan} error={error} onRetry={reload}>
      {plan ? (
        <Screen title={t('resources.title')} subtitle={t('resources.intro')} bottomInset={BOTTOM_BAR_HEIGHT}>
          <View style={styles.chips}>
            {GROUPS.map((g) => {
              const open = plan.gaps.filter((x) => x.gapType === g && x.status !== 'verified_resolved');
              const any = plan.gaps.some((x) => x.gapType === g);
              if (!any && g === 'scheduling') return null;
              return (
                <Chip
                  key={g}
                  label={t(`resources.groups.${g}`)}
                  icon={gapIcon[g]}
                  tone={open.length ? 'caution' : 'good'}
                  meta={open.length ? String(open.length) : undefined}
                  selected={filter === g}
                  onPress={() => setFilter(filter === g ? null : g)}
                />
              );
            })}
          </View>
          {actionError ? <Body color={colors.urgent}>{actionError}</Body> : null}

          {GROUPS.filter((g) => !filter || g === filter).map((g) => {
            const gaps = plan.gaps.filter((x) => x.gapType === g);
            if (!gaps.length && (filter !== g)) return null;
            return (
              <Section key={g} title={t(`resources.groups.${g}`)} aside={<Glyph icon={gapIcon[g]} size={20} color={colors.blue} />}>
                {gaps.length === 0 ? (
                  <Card>
                    <Row>
                      <StatusDot tone="good" />
                      <Muted>{t('resources.noGaps')}</Muted>
                    </Row>
                  </Card>
                ) : null}
                {gaps.map((gap) => (
                  <GapCard key={gap.id} gap={gap} timezone={plan.patient.timezone} onConfirm={confirm} confirming={busy} />
                ))}
                {g === 'equipment'
                  ? plan.equipment
                      .filter((e) => e.availabilityStatus === 'available')
                      .map((e) => (
                        <Row key={e.id} style={{ paddingHorizontal: space.sm }}>
                          <StatusDot tone="good" />
                          <Body>{e.equipmentName === 'other' && e.otherLabel ? e.otherLabel : t(`equipment.${e.equipmentName}`)}</Body>
                          {e.receivedAt ? <Meta>{t('resources.confirmedNote', { when: f.dateTime(e.receivedAt) })}</Meta> : null}
                        </Row>
                      ))
                  : null}
                {g === 'financial' ? <Button label={t('finance.title')} variant="ghost" compact icon={Icons.ChevronRight} onPress={() => router.push('/patient/finance')} /> : null}
                {g === 'caregiving' ? <Button label={t('caregivers.title')} variant="ghost" compact icon={Icons.ChevronRight} onPress={() => router.push('/patient/caregivers')} /> : null}
              </Section>
            );
          })}

          <WarningSigns instructions={plan.instructions} />
          <PrimaryCare instructions={plan.instructions} facility={plan.patient.facility} />
        </Screen>
      ) : null}
    </PlanState>
  );
}

const styles = StyleSheet.create({ chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm } });
