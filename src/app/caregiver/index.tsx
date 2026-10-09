import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ms } from '@/core/time';
import { NotificationsPanel } from '@/features/NotificationsPanel';
import { PlanState } from '@/features/PlanScreen';
import { TaskCard } from '@/features/TaskCard';
import { useFmt } from '@/features/format';
import { useSession } from '@/state/SessionProvider';
import { useCaregiverView, useNow } from '@/state/usePlan';
import { BOTTOM_BAR_HEIGHT, Body, Button, Card, Chip, Icons, Meta, Muted, Row, Screen, Section, StatusDot, Surface, colors, space } from '@/ui';

/** Caregiver home: only tasks assigned to this person, grouped by patient. */
export default function CaregiverHome() {
  const { t } = useTranslation();
  const router = useRouter();
  const { session } = useSession();
  const { view, loading, error, reload } = useCaregiverView();
  const now = useNow();

  return (
    <PlanState loading={loading && !view} error={error} onRetry={reload}>
      {view ? (
        <Screen displayTitle={t('caregiverApp.greeting', { name: session?.profile.displayName.split(' ')[0] ?? '' })} title={t('caregiverApp.title')} bottomInset={BOTTOM_BAR_HEIGHT}>
          {view.patients.length === 0 ? (
            <Surface tone="blueDeep" padded={space.xl} style={{ gap: space.lg }}>
              <Body size="large" color={colors.canvas}>
                {t('caregiverApp.noPatients')}
              </Body>
              <Body color={colors.canvasMuted}>{t('auth.inviteBody')}</Body>
              <Button label={t('caregiverApp.enterCode')} variant="hero" icon={Icons.ChevronRight} onPress={() => router.push('/invite')} />
            </Surface>
          ) : null}

          {view.patients.map((p) => {
            const record = view.records.find((r) => r.patientId === p.id);
            const tasks = view.tasks.filter((x) => x.patientId === p.id);
            const open = tasks.filter((x) => !x.status.endsWith('complete'));
            const upcoming = open.filter((x) => ms(x.dueAt) >= ms(now));
            const past = tasks.filter((x) => !upcoming.includes(x));
            const blocks = view.availability.filter((a) => a.caregiverId === record?.id);
            const unconfirmed = blocks.some((b) => !b.confirmed);
            return (
              <View key={p.id} style={{ gap: space.lg }}>
                <PatientHeader name={p.displayName} procedure={p.procedureName} dischargeAt={p.dischargeAt} timezone={p.timezone} relationship={record?.relationship} />
                <NotificationsPanel timezone={p.timezone} taskHref={(id) => ({ pathname: '/caregiver/task/[id]', params: { id } })} />
                {unconfirmed ? (
                  <Card>
                    <Row>
                      <StatusDot tone="caution" />
                      <Body style={{ flex: 1 }}>{t('caregiverApp.availabilityIntro')}</Body>
                    </Row>
                    <Button label={t('caregiverApp.confirmHours')} variant="hero" compact onPress={() => router.push('/caregiver/availability')} />
                  </Card>
                ) : null}
                <Section title={t('home.nextTasks')} aside={<Chip label={String(open.length)} dense />}>
                  {upcoming.length === 0 ? (
                    <Card>
                      <Muted>{t('caregiverApp.noTasks')}</Muted>
                    </Card>
                  ) : null}
                  {upcoming.map((task) => (
                    <TaskCard key={task.id} task={task} timezone={p.timezone} caregivers={view.records} href={{ pathname: '/caregiver/task/[id]', params: { id: task.id } }} />
                  ))}
                </Section>
                {past.length ? (
                  <Section title={t('tasks.history')}>
                    {past.map((task) => (
                      <TaskCard key={task.id} task={task} timezone={p.timezone} caregivers={view.records} compact href={{ pathname: '/caregiver/task/[id]', params: { id: task.id } }} />
                    ))}
                  </Section>
                ) : null}
              </View>
            );
          })}
          {view.patients.length ? <Button label={t('caregiverApp.enterCode')} variant="quiet" compact onPress={() => router.push('/invite')} /> : null}
        </Screen>
      ) : null}
    </PlanState>
  );
}

function PatientHeader({ name, procedure, dischargeAt, timezone, relationship }: { name: string; procedure: string; dischargeAt: string; timezone: string; relationship?: string }) {
  const { t } = useTranslation();
  const f = useFmt(timezone);
  return (
    <Surface tone="blueDeep" padded style={{ gap: space.xs }}>
      <Body size="large" color={colors.canvas}>
        {t('caregiverApp.helping', { name })}
      </Body>
      <Meta color={colors.canvasMuted}>
        {procedure} · {t('home.discharge')} {f.dateTime(dischargeAt)}
        {relationship ? ` · ${relationship}` : ''}
      </Meta>
    </Surface>
  );
}
