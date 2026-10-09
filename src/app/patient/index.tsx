import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { nextTasks } from '@/core/engines/calendar';
import { openGaps } from '@/core/engines/gaps';
import { hoursBetween } from '@/core/time';
import { CoverageBar } from '@/features/CoverageBar';
import { NotificationsPanel } from '@/features/NotificationsPanel';
import { PlanState } from '@/features/PlanScreen';
import { ReadinessStamp } from '@/features/ReadinessStamp';
import { TaskCard } from '@/features/TaskCard';
import { hoursLabel, useFmt } from '@/features/format';
import { readinessTone } from '@/features/status';
import { useSession } from '@/state/SessionProvider';
import { useNow, usePlan } from '@/state/usePlan';
import { BOTTOM_BAR_HEIGHT, Body, Button, Card, Chip, Glyph, Hairline, Icons, KeyValue, Meta, Muted, Num, Row, Screen, Section, StatusDot, Surface, colors, layout, space } from '@/ui';

export default function PatientHome() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session } = useSession();
  const { plan, loading, error, reload } = usePlan(session?.patientId);
  const now = useNow();
  const { width } = useWindowDimensions();
  const wide = width >= layout.wideBreakpoint;

  if (!session?.patientId) {
    return (
      <Screen displayTitle={t('home.greeting', { name: session?.profile.displayName ?? '' })} bottomInset={BOTTOM_BAR_HEIGHT}>
        <Surface tone="blueDeep" padded={space.xl} style={{ gap: space.lg }}>
          <Body size="large" color={colors.canvas}>
            {t('home.startIntake')}
          </Body>
          <Body color={colors.canvasMuted}>{t('home.intakeBody')}</Body>
          <Button label={t('landing.ctaPrimary')} variant="hero" icon={Icons.ChevronRight} onPress={() => router.push('/patient/intake')} />
        </Surface>
        <Meta>{t('landing.noAi')}</Meta>
      </Screen>
    );
  }

  return (
    <PlanState loading={loading && !plan} error={error} onRetry={reload}>
      {plan ? <Dashboard plan={plan} now={now} wide={wide} /> : null}
    </PlanState>
  );
}

function Dashboard({ plan, now, wide }: { plan: NonNullable<ReturnType<typeof usePlan>['plan']>; now: string; wide: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const f = useFmt(plan.patient.timezone);
  const p = plan.patient;
  const open = openGaps(plan.gaps);
  const resolved = plan.gaps.length - open.length;
  const pending = open.filter((g) => g.status === 'awaiting_confirmation' || g.status === 'assistance_requested' || g.status === 'assigned').length;
  const unresolved = open.length - pending;
  const hoursToDischarge = hoursBetween(now, p.dischargeAt);
  const windowLine = hoursToDischarge > 0 ? t('home.hoursUntil', { hours: Math.ceil(hoursToDischarge) }) : hoursToDischarge > -72 ? t('home.hoursSince', { hours: Math.floor(-hoursToDischarge) }) : t('home.windowOver');
  const upcoming = nextTasks(plan.tasks, now, 3);
  const accepted = plan.caregivers.filter((c) => c.acceptedInvitation);
  const attention = plan.tasks.filter((x) => x.status === 'missed' || x.status === 'blocked' || x.status === 'escalated');

  return (
    <Screen displayTitle={t('home.greeting', { name: p.displayName.split(' ')[0] })} subtitle={windowLine} aside={<ReadinessStamp status={plan.readiness} />} bottomInset={BOTTOM_BAR_HEIGHT}>
      <Card>
        <KeyValue k={t('home.procedure')} v={p.procedureName} meta={p.facility} />
        <KeyValue k={t('home.surgery')} v={f.dateTime(p.surgeryDate)} />
        <KeyValue k={t('home.expectedDischarge')} v={f.dateTime(p.dischargeAt)} meta={p.timezone} />
        <KeyValue k={t('home.language')} v={p.preferredLanguage === 'es' ? t('common.spanish') : t('common.english')} />
      </Card>

      <View style={[styles.grid, wide && styles.gridWide]}>
        <Card style={styles.gridItem}>
          <Row>
            <Glyph icon={Icons.ClipboardList} size={20} color={colors.blue} />
            <Body weight="medium" style={{ flex: 1 }}>
              {t('home.readiness')}
            </Body>
          </Row>
          <Chip label={t(`readinessStatus.${plan.readiness}`)} tone={readinessTone(plan.readiness)} />
          <Row wrap style={{ gap: space.lg }}>
            <Stat label={t('home.confirmed')} value={resolved} tone="good" />
            <Stat label={t('home.unresolved')} value={unresolved} tone="caution" />
            <Stat label={t('home.pending')} value={pending} tone="blue" />
          </Row>
          {plan.coverage.requiredWindows.length ? (
            <>
              <Hairline />
              <Meta>{t('home.coverage')}</Meta>
              <CoverageBar coverage={plan.coverage} timezone={p.timezone} />
            </>
          ) : null}
          <Button label={t('report.title')} variant="ghost" compact icon={Icons.ChevronRight} onPress={() => router.push('/patient/readiness')} />
        </Card>

        <Card style={styles.gridItem}>
          <Row>
            <Glyph icon={Icons.Wallet} size={20} color={colors.blue} />
            <Body weight="medium" style={{ flex: 1 }}>
              {t('home.finance')}
            </Body>
          </Row>
          <KeyValue k={t('home.estimated')} v={f.money(plan.finance.totalEstimatedCost)} meta={t('common.hypothetical')} />
          <KeyValue k={t('home.assistance')} v={f.money(plan.finance.confirmedAssistance)} />
          <KeyValue k={t('home.outOfPocket')} v={f.money(Math.max(0, plan.finance.totalEstimatedCost - plan.finance.confirmedAssistance))} />
          <Row>
            <StatusDot tone={plan.finance.remainingGap > 0 ? 'urgent' : 'good'} />
            <Muted>
              {t('finance.gap')}: {f.money(plan.finance.remainingGap)}
            </Muted>
          </Row>
          <Button label={t('finance.title')} variant="ghost" compact icon={Icons.ChevronRight} onPress={() => router.push('/patient/finance')} />
        </Card>
      </View>

      <Card>
        <Row>
          <Glyph icon={Icons.HeartHandshake} size={20} color={colors.blue} />
          <Body weight="medium" style={{ flex: 1 }}>
            {t('home.caregiverSupport')}
          </Body>
        </Row>
        {plan.caregivers.length === 0 ? <Muted>{t('home.noCaregiver')}</Muted> : null}
        {plan.caregivers.map((c) => (
          <Row key={c.id} style={{ justifyContent: 'space-between' }}>
            <View>
              <Body>{c.name}</Body>
              <Meta>{c.relationship}</Meta>
            </View>
            <Chip label={c.acceptedInvitation ? t('caregivers.accepted') : t('caregivers.pending')} tone={c.acceptedInvitation ? 'good' : 'caution'} dense />
          </Row>
        ))}
        {plan.serviceRequests
          .filter((r) => r.status !== 'cancelled' && r.status !== 'declined')
          .map((r) => (
            <Row key={r.id} style={{ justifyContent: 'space-between' }}>
              <Body>{t('tasks.assignedRole.professional_caregiver')}</Body>
              <Chip label={r.status === 'provider_confirmed' ? t('caregivers.confirmed') : t('caregivers.requested')} tone={r.status === 'provider_confirmed' ? 'good' : 'caution'} dense />
            </Row>
          ))}
        {plan.coverage.requiredHours > 0 ? (
          <Row>
            <StatusDot tone={plan.coverage.uncoveredHours > 0 ? 'caution' : 'good'} />
            <Muted>
              {t('home.uncovered')}: {hoursLabel(plan.coverage.uncoveredHours)} / {hoursLabel(plan.coverage.requiredHours)}
            </Muted>
          </Row>
        ) : null}
        <Button label={accepted.length || plan.coverage.uncoveredHours === 0 ? t('caregivers.title') : t('actions.find_caregiver')} variant={plan.coverage.uncoveredHours > 0 ? 'hero' : 'ghost'} compact icon={Icons.ChevronRight} onPress={() => router.push('/patient/caregivers')} />
      </Card>

      <Section title={t('home.nextTasks')} aside={<Button label={t('common.viewAll')} variant="quiet" compact onPress={() => router.push('/patient/calendar')} />}>
        {upcoming.length === 0 ? (
          <Card>
            <Muted>{plan.instructions.some((i) => i.reviewStatus === 'approved') ? t('calendar.noTasks') : t('calendar.notActive')}</Muted>
            {plan.instructions.length === 0 ? <Button label={t('instructions.title')} variant="hero" compact onPress={() => router.push('/patient/instructions')} /> : null}
          </Card>
        ) : (
          upcoming.map((task) => <TaskCard key={task.id} task={task} timezone={p.timezone} caregivers={plan.caregivers} href={{ pathname: '/patient/task/[id]', params: { id: task.id } }} />)
        )}
      </Section>

      <Section title={t('home.alerts')}>
        <NotificationsPanel timezone={p.timezone} taskHref={(id) => ({ pathname: '/patient/task/[id]', params: { id } })} />
        {plan.conflicts.length === 0 && attention.length === 0 ? (
          <Card>
            <Row>
              <StatusDot tone="good" />
              <Muted>{t('home.noAlerts')}</Muted>
            </Row>
          </Card>
        ) : null}
        {plan.conflicts.slice(0, 4).map((c) => (
          <Card key={c.id}>
            <Row style={{ alignItems: 'flex-start' }}>
              <Glyph icon={Icons.AlertTriangle} size={20} color={colors.caution} />
              <View style={{ flex: 1, gap: 2 }}>
                <Body>{t(c.messageKey, { ...c.messageParams, defaultValue: c.message })}</Body>
                <Meta>{f.range(c.windowStart, c.windowEnd)}</Meta>
              </View>
            </Row>
            <Row wrap>
              {c.actions.slice(0, 2).map((a) => (
                <Button key={a.key} label={t(a.key)} variant="ghost" compact onPress={() => router.push((a.route ?? '/patient/resources') as never)} />
              ))}
            </Row>
          </Card>
        ))}
        {attention.slice(0, 3).map((task) => (
          <TaskCard key={task.id} task={task} timezone={p.timezone} caregivers={plan.caregivers} compact href={{ pathname: '/patient/task/[id]', params: { id: task.id } }} />
        ))}
      </Section>
    </Screen>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'good' | 'caution' | 'blue' }) {
  return (
    <Row>
      <StatusDot tone={tone} />
      <Num weight="medium">{String(value)}</Num>
      <Muted>{label}</Muted>
    </Row>
  );
}

const styles = StyleSheet.create({
  grid: { gap: space.lg },
  gridWide: { flexDirection: 'row', alignItems: 'stretch' },
  gridItem: { flex: 1 },
});
